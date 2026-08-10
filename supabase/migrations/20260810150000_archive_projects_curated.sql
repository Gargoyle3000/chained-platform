-- Private Archive Projects and their separately authorized public CURATED projection.

create table public.archive_projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid()
    references public.accounts(id) on delete cascade,
  title varchar(160) not null,
  description text,
  publisher_profile_id uuid
    references public.public_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint archive_projects_account_id_id_key unique (account_id, id),
  constraint archive_projects_title_not_blank
    check (char_length(btrim(title)) between 1 and 160),
  constraint archive_projects_description_length
    check (description is null or char_length(btrim(description)) <= 2000)
);

create index archive_projects_account_updated_idx
  on public.archive_projects (account_id, updated_at desc, id);

create function private.normalize_archive_project_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  return new;
end;
$$;

create trigger archive_projects_normalize_row
before insert or update of title, description on public.archive_projects
for each row execute function private.normalize_archive_project_row();

create trigger archive_projects_set_updated_at
before update on public.archive_projects
for each row execute function private.set_updated_at();

create table public.archive_project_items (
  account_id uuid not null default auth.uid(),
  project_id uuid not null,
  work_id uuid not null,
  position integer not null,
  added_at timestamptz not null default now(),
  constraint archive_project_items_pkey primary key (project_id, work_id),
  constraint archive_project_items_project_fkey
    foreign key (account_id, project_id)
    references public.archive_projects(account_id, id) on delete cascade,
  constraint archive_project_items_archive_item_fkey
    foreign key (account_id, work_id)
    references public.archive_items(account_id, work_id) on delete cascade,
  constraint archive_project_items_position_nonnegative check (position >= 0),
  constraint archive_project_items_project_position_key unique (project_id, position)
);

create index archive_project_items_account_project_position_idx
  on public.archive_project_items (account_id, project_id, position, work_id);

create table public.curated_collections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique
    references public.archive_projects(id) on delete cascade,
  publisher_profile_id uuid not null
    references public.public_profiles(id) on delete restrict,
  title varchar(160) not null,
  description text,
  status public.publication_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curated_collections_title_not_blank
    check (char_length(btrim(title)) between 1 and 160),
  constraint curated_collections_description_length
    check (description is null or char_length(btrim(description)) <= 2000),
  constraint curated_collections_publication_consistent
    check (
      (status = 'draft' and published_at is null)
      or (status = 'published' and published_at is not null)
    )
);

create index curated_collections_published_idx
  on public.curated_collections (published_at desc, id)
  where status = 'published';

create trigger curated_collections_set_updated_at
before update on public.curated_collections
for each row execute function private.set_updated_at();

create function private.sync_curated_collection_from_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.curated_collections
     set title = new.title,
         description = new.description
   where project_id = new.id;
  return new;
end;
$$;

create trigger archive_projects_sync_curated_collection
after update of title, description on public.archive_projects
for each row execute function private.sync_curated_collection_from_project();

create function private.can_manage_archive_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.archive_projects as project_row
       where project_row.id = target_project_id
         and project_row.account_id = auth.uid()
    );
$$;

create function private.is_eligible_curated_publisher_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_published_profile(target_profile_id)
    and exists (
      select 1
        from public.public_profiles as profile_row
       where profile_row.id = target_profile_id
         and profile_row.profile_type in ('curator', 'institution')
    )
;
$$;

create function private.can_publish_curated(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and private.is_eligible_curated_publisher_profile(target_profile_id)
    and private.has_active_profile_membership(target_profile_id, 'editor');
$$;

create function private.next_archive_project_item_position(target_project_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(position) + 1, 0)
    from public.archive_project_items
   where project_id = target_project_id;
$$;

create function private.add_archive_project_item(
  target_project_id uuid,
  target_work_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.can_manage_archive_project(target_project_id) then
    raise exception 'The Project is unavailable.' using errcode = '42501';
  end if;

  perform 1
    from public.archive_projects
   where id = target_project_id
   for update;

  insert into public.archive_project_items (project_id, work_id, position)
  values (
    target_project_id,
    target_work_id,
    private.next_archive_project_item_position(target_project_id)
  );

  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'archive_project_item.added', 'archive_project', target_project_id,
    jsonb_build_object('work_id', target_work_id));
  return true;
end;
$$;

create function private.remove_archive_project_item(
  target_project_id uuid,
  target_work_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_position integer;
begin
  if auth.uid() is null
     or not private.can_manage_archive_project(target_project_id) then
    raise exception 'The Project is unavailable.' using errcode = '42501';
  end if;

  select position into removed_position
    from public.archive_project_items
   where project_id = target_project_id
     and work_id = target_work_id
   for update;

  if not found then
    raise exception 'The Project Work is unavailable.' using errcode = '22023';
  end if;

  delete from public.archive_project_items
   where project_id = target_project_id
     and work_id = target_work_id;

  update public.archive_project_items
     set position = position - 1
   where project_id = target_project_id
     and position > removed_position;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'archive_project_item.removed', 'archive_project', target_project_id,
    jsonb_build_object('work_id', target_work_id));
  return true;
end;
$$;

create function private.reorder_archive_project_items(
  target_project_id uuid,
  ordered_work_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_count integer;
  listed_count integer;
begin
  if auth.uid() is null
     or not private.can_manage_archive_project(target_project_id) then
    raise exception 'The Project is unavailable.' using errcode = '42501';
  end if;

  perform 1 from public.archive_projects
   where id = target_project_id for update;

  select count(*) into item_count
    from public.archive_project_items
   where project_id = target_project_id;

  select count(distinct work_id) into listed_count
    from unnest(coalesce(ordered_work_ids, array[]::uuid[])) as listed(work_id)
   where work_id is not null;

  if coalesce(array_length(ordered_work_ids, 1), 0) <> item_count
     or listed_count <> item_count
     or exists (
       select 1
         from unnest(coalesce(ordered_work_ids, array[]::uuid[])) as listed(work_id)
         left join public.archive_project_items as item_row
           on item_row.project_id = target_project_id
          and item_row.work_id = listed.work_id
        where item_row.work_id is null
     ) then
    raise exception 'The complete Project order is required.' using errcode = '23514';
  end if;

  update public.archive_project_items
     set position = position + item_count + 1
   where project_id = target_project_id;

  update public.archive_project_items as item_row
     set position = ordered.ordinality - 1
    from unnest(ordered_work_ids) with ordinality as ordered(work_id, ordinality)
   where item_row.project_id = target_project_id
     and item_row.work_id = ordered.work_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'archive_project_items.reordered', 'archive_project', target_project_id,
    jsonb_build_object('item_count', item_count));
  return true;
end;
$$;

create function private.list_manageable_curated_publisher_profiles()
returns table (
  id uuid,
  display_name varchar(160),
  slug varchar(100),
  profile_type public.profile_type
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile_row.id, profile_row.display_name, profile_row.slug, profile_row.profile_type
   from public.public_profiles as profile_row
   where private.can_publish_curated(profile_row.id)
   order by lower(profile_row.display_name), profile_row.id;
$$;

create function private.publish_archive_project(
  target_project_id uuid,
  target_publisher_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row public.archive_projects%rowtype;
  collection_id uuid;
begin
  if auth.uid() is null
     or not private.can_manage_archive_project(target_project_id)
     or not private.can_publish_curated(target_publisher_profile_id) then
    raise exception 'The Project cannot be published by this profile.' using errcode = '42501';
  end if;

  select * into project_row
    from public.archive_projects
   where id = target_project_id
   for update;

  if not found then
    raise exception 'The Project is unavailable.' using errcode = '22023';
  end if;

  update public.archive_projects
     set publisher_profile_id = target_publisher_profile_id
   where id = target_project_id;

  insert into public.curated_collections (
    project_id,
    publisher_profile_id,
    title,
    description,
    status,
    published_at
  ) values (
    target_project_id,
    target_publisher_profile_id,
    project_row.title,
    project_row.description,
    'published',
    now()
  )
  on conflict (project_id) do update
    set publisher_profile_id = excluded.publisher_profile_id,
        title = excluded.title,
        description = excluded.description,
        status = 'published',
        published_at = now()
  returning id into collection_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'curated_collection.published', 'curated_collection', collection_id,
    jsonb_build_object('project_id', target_project_id, 'publisher_profile_id', target_publisher_profile_id));
  return collection_id;
end;
$$;

create function private.depublish_archive_project(target_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_row public.curated_collections%rowtype;
begin
  if auth.uid() is null
     or not private.can_manage_archive_project(target_project_id) then
    raise exception 'The Project is unavailable.' using errcode = '42501';
  end if;

  select * into collection_row
    from public.curated_collections
   where project_id = target_project_id
   for update;

  if not found then
    raise exception 'The CURATED collection is unavailable.' using errcode = '42501';
  end if;

  update public.curated_collections
     set status = 'draft',
         published_at = null
   where id = collection_row.id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'curated_collection.depublished', 'curated_collection', collection_row.id,
    jsonb_build_object('project_id', target_project_id));
  return true;
end;
$$;

create function public.add_archive_project_item(target_project_id uuid, target_work_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.add_archive_project_item(target_project_id, target_work_id); $$;

create function public.remove_archive_project_item(target_project_id uuid, target_work_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.remove_archive_project_item(target_project_id, target_work_id); $$;

create function public.reorder_archive_project_items(target_project_id uuid, ordered_work_ids uuid[])
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.reorder_archive_project_items(target_project_id, ordered_work_ids); $$;

create function public.list_manageable_curated_publisher_profiles()
returns table (id uuid, display_name varchar(160), slug varchar(100), profile_type public.profile_type)
language sql
security invoker
set search_path = ''
as $$ select * from private.list_manageable_curated_publisher_profiles(); $$;

create function public.publish_archive_project(target_project_id uuid, target_publisher_profile_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.publish_archive_project(target_project_id, target_publisher_profile_id); $$;

create function public.depublish_archive_project(target_project_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.depublish_archive_project(target_project_id); $$;

create function public.list_published_curated_collection_items(target_collection_ids uuid[])
returns table (
  collection_id uuid,
  work_id uuid,
  item_position integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select collection_row.id, item_row.work_id, item_row.position
    from public.curated_collections as collection_row
    join public.archive_project_items as item_row
      on item_row.project_id = collection_row.project_id
   where collection_row.id = any(coalesce(target_collection_ids, array[]::uuid[]))
     and collection_row.status = 'published'
     and collection_row.published_at is not null
     and private.is_eligible_curated_publisher_profile(collection_row.publisher_profile_id)
     and private.is_published_work(item_row.work_id)
   order by collection_row.id, item_row.position, item_row.work_id;
$$;

alter table public.archive_projects enable row level security;
alter table public.archive_projects force row level security;
alter table public.archive_project_items enable row level security;
alter table public.archive_project_items force row level security;
alter table public.curated_collections enable row level security;
alter table public.curated_collections force row level security;

revoke all on table public.archive_projects from public, anon, authenticated;
revoke all on table public.archive_project_items from public, anon, authenticated;
revoke all on table public.curated_collections from public, anon, authenticated;

grant select (id, account_id, title, description, publisher_profile_id, created_at, updated_at)
  on public.archive_projects to authenticated;
grant insert (title, description) on public.archive_projects to authenticated;
grant update (title, description) on public.archive_projects to authenticated;
grant delete on public.archive_projects to authenticated;

grant select (account_id, project_id, work_id, position, added_at)
  on public.archive_project_items to authenticated;

grant select (id, publisher_profile_id, title, description, status, published_at)
  on public.curated_collections to anon;
grant select on public.curated_collections to authenticated;

create policy archive_projects_select_own_active_account
  on public.archive_projects for select to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());

create policy archive_projects_insert_own_active_account
  on public.archive_projects for insert to authenticated
  with check (account_id = auth.uid() and private.current_account_is_active());

create policy archive_projects_update_own_active_account
  on public.archive_projects for update to authenticated
  using (account_id = auth.uid() and private.current_account_is_active())
  with check (account_id = auth.uid() and private.current_account_is_active());

create policy archive_projects_delete_own_active_account
  on public.archive_projects for delete to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());

create policy archive_project_items_select_own_active_account
  on public.archive_project_items for select to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());

create policy curated_collections_select_published
  on public.curated_collections for select to anon, authenticated
  using (
    status = 'published'
    and published_at is not null
    and private.is_eligible_curated_publisher_profile(publisher_profile_id)
  );

create policy curated_collections_select_own_project
  on public.curated_collections for select to authenticated
  using (private.can_manage_archive_project(project_id));

revoke all on function private.normalize_archive_project_row() from public;
revoke all on function private.sync_curated_collection_from_project() from public;
revoke all on function private.can_manage_archive_project(uuid) from public, anon;
revoke all on function private.is_eligible_curated_publisher_profile(uuid) from public;
revoke all on function private.can_publish_curated(uuid) from public, anon;
revoke all on function private.next_archive_project_item_position(uuid) from public, anon, authenticated;
revoke all on function private.add_archive_project_item(uuid, uuid) from public, anon;
revoke all on function private.remove_archive_project_item(uuid, uuid) from public, anon;
revoke all on function private.reorder_archive_project_items(uuid, uuid[]) from public, anon;
revoke all on function private.list_manageable_curated_publisher_profiles() from public, anon;
revoke all on function private.publish_archive_project(uuid, uuid) from public, anon;
revoke all on function private.depublish_archive_project(uuid) from public, anon;

revoke all on function public.add_archive_project_item(uuid, uuid) from public, anon;
revoke all on function public.remove_archive_project_item(uuid, uuid) from public, anon;
revoke all on function public.reorder_archive_project_items(uuid, uuid[]) from public, anon;
revoke all on function public.list_manageable_curated_publisher_profiles() from public, anon;
revoke all on function public.publish_archive_project(uuid, uuid) from public, anon;
revoke all on function public.depublish_archive_project(uuid) from public, anon;
revoke all on function public.list_published_curated_collection_items(uuid[]) from public;

grant execute on function private.can_manage_archive_project(uuid) to authenticated;
grant execute on function private.is_eligible_curated_publisher_profile(uuid) to anon, authenticated;
grant execute on function private.can_publish_curated(uuid) to authenticated;
grant execute on function private.add_archive_project_item(uuid, uuid) to authenticated;
grant execute on function private.remove_archive_project_item(uuid, uuid) to authenticated;
grant execute on function private.reorder_archive_project_items(uuid, uuid[]) to authenticated;
grant execute on function private.list_manageable_curated_publisher_profiles() to authenticated;
grant execute on function private.publish_archive_project(uuid, uuid) to authenticated;
grant execute on function private.depublish_archive_project(uuid) to authenticated;

grant execute on function public.add_archive_project_item(uuid, uuid) to authenticated;
grant execute on function public.remove_archive_project_item(uuid, uuid) to authenticated;
grant execute on function public.reorder_archive_project_items(uuid, uuid[]) to authenticated;
grant execute on function public.list_manageable_curated_publisher_profiles() to authenticated;
grant execute on function public.publish_archive_project(uuid, uuid) to authenticated;
grant execute on function public.depublish_archive_project(uuid) to authenticated;
grant execute on function public.list_published_curated_collection_items(uuid[]) to anon, authenticated;
