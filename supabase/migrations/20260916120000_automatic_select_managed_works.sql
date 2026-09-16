-- SELECT contains automatic managed Works and explicit saved public Works.

create type public.archive_item_origin as enum ('saved', 'managed');

alter table public.archive_items
  add column origin public.archive_item_origin not null default 'saved';

comment on table public.archive_items is
  'Private SELECT membership for automatic directly managed Artist Works and explicitly saved public Works.';
comment on column public.archive_items.origin is
  'managed is maintained by trusted lifecycle triggers; saved is created explicitly by the account.';

create index archive_items_account_origin_created
  on public.archive_items (account_id, origin, created_at desc, work_id);

create function private.account_directly_manages_artist_profile(
  actor_account_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profile_members as member_row
      join public.public_profiles as profile_row
        on profile_row.id = member_row.profile_id
       and profile_row.profile_type = 'artist'
       and profile_row.deleted_at is null
     where member_row.account_id = actor_account_id
       and member_row.profile_id = target_profile_id
       and member_row.status = 'active'
       and member_row.revoked_at is null
  );
$$;

create function private.sync_managed_select_items_for_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.owner_profile_id is not distinct from new.owner_profile_id
     and old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;

  delete from public.archive_items
   where work_id = new.id
     and origin = 'managed';

  if new.deleted_at is null then
    insert into public.archive_items (account_id, work_id, origin, created_at)
    select member_row.account_id, new.id, 'managed', coalesce(new.created_at, now())
      from public.profile_members as member_row
     where member_row.profile_id = new.owner_profile_id
       and member_row.status = 'active'
       and member_row.revoked_at is null
       and private.account_directly_manages_artist_profile(
         member_row.account_id,
         new.owner_profile_id
       )
    on conflict (account_id, work_id) do update
      set origin = 'managed';
  end if;

  return new;
end;
$$;

create trigger works_sync_managed_select_items
after insert or update of owner_profile_id, deleted_at on public.works
for each row execute function private.sync_managed_select_items_for_work();

create function private.sync_managed_select_items_for_profile_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_was_active boolean := false;
  new_is_active boolean := false;
  remove_old_items boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_was_active := old.status = 'active' and old.revoked_at is null;
  end if;
  if tg_op <> 'DELETE' then
    new_is_active := new.status = 'active' and new.revoked_at is null;
  end if;

  if old_was_active then
    if tg_op = 'DELETE' then
      remove_old_items := true;
    else
      remove_old_items := not new_is_active
        or old.account_id is distinct from new.account_id
        or old.profile_id is distinct from new.profile_id;
    end if;
    if remove_old_items then
      delete from public.archive_items as item_row
       using public.works as work_row
       where item_row.account_id = old.account_id
         and item_row.work_id = work_row.id
         and item_row.origin = 'managed'
         and work_row.owner_profile_id = old.profile_id;
    end if;
  end if;

  if tg_op <> 'DELETE' then
    if new_is_active
       and private.account_directly_manages_artist_profile(new.account_id, new.profile_id) then
      insert into public.archive_items (account_id, work_id, origin, created_at)
      select new.account_id, work_row.id, 'managed', work_row.created_at
        from public.works as work_row
       where work_row.owner_profile_id = new.profile_id
         and work_row.deleted_at is null
      on conflict (account_id, work_id) do update
        set origin = 'managed';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profile_members_sync_managed_select_items
after insert or delete or update of account_id, profile_id, membership_level, status, revoked_at
on public.profile_members
for each row execute function private.sync_managed_select_items_for_profile_member();

create function private.sync_managed_select_items_for_artist_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.profile_type = 'artist'
     and old.deleted_at is null
     and (new.profile_type <> 'artist' or new.deleted_at is not null) then
    delete from public.archive_items as item_row
     using public.works as work_row
     where item_row.work_id = work_row.id
       and item_row.origin = 'managed'
       and work_row.owner_profile_id = old.id;
  end if;

  if new.profile_type = 'artist' and new.deleted_at is null then
    insert into public.archive_items (account_id, work_id, origin, created_at)
    select member_row.account_id, work_row.id, 'managed', work_row.created_at
      from public.profile_members as member_row
      join public.works as work_row
        on work_row.owner_profile_id = new.id
       and work_row.deleted_at is null
     where member_row.profile_id = new.id
       and member_row.status = 'active'
       and member_row.revoked_at is null
       and private.account_directly_manages_artist_profile(member_row.account_id, new.id)
    on conflict (account_id, work_id) do update
      set origin = 'managed';
  end if;

  return new;
end;
$$;

create trigger artist_profiles_sync_managed_select_items
after update of profile_type, deleted_at on public.public_profiles
for each row execute function private.sync_managed_select_items_for_artist_profile();

-- Existing own saves become automatic managed membership without duplication.
update public.archive_items as item_row
   set origin = 'managed'
  from public.works as work_row
 where work_row.id = item_row.work_id
   and work_row.deleted_at is null
   and private.account_directly_manages_artist_profile(
     item_row.account_id,
     work_row.owner_profile_id
   );

-- Backfill every non-deleted Work for every active direct Artist-profile manager.
insert into public.archive_items (account_id, work_id, origin, created_at)
select member_row.account_id, work_row.id, 'managed', work_row.created_at
  from public.profile_members as member_row
  join public.works as work_row
    on work_row.owner_profile_id = member_row.profile_id
   and work_row.deleted_at is null
 where member_row.status = 'active'
   and member_row.revoked_at is null
   and private.account_directly_manages_artist_profile(
     member_row.account_id,
     member_row.profile_id
   )
on conflict (account_id, work_id) do update
  set origin = 'managed';

create function private.list_managed_select_works()
returns table (
  id uuid,
  owner_profile_id uuid,
  title varchar(300),
  year_sort integer,
  profile_order integer,
  year_label varchar(32),
  work_type varchar(80),
  format_discipline varchar(120),
  primary_medium text,
  support_base text,
  additional_materials text[],
  height numeric(12, 3),
  width numeric(12, 3),
  depth numeric(12, 3),
  dimension_unit varchar(8),
  duration_text varchar(160),
  edition_text varchar(160),
  description text,
  collaborator_name varchar(300),
  collaborator_url text,
  photo_credit_name varchar(300),
  photo_credit_url text,
  visibility public.publication_status,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select work_row.id, work_row.owner_profile_id, work_row.title,
         work_row.year_sort, work_row.profile_order, work_row.year_label,
         work_row.work_type, work_row.format_discipline,
         work_row.primary_medium, work_row.support_base,
         work_row.additional_materials, work_row.height, work_row.width,
         work_row.depth, work_row.dimension_unit, work_row.duration_text,
         work_row.edition_text, work_row.description,
         work_row.collaborator_name, work_row.collaborator_url,
         work_row.photo_credit_name, work_row.photo_credit_url,
         work_row.visibility, work_row.published_at, work_row.created_at,
         work_row.updated_at
    from public.archive_items as item_row
    join public.works as work_row on work_row.id = item_row.work_id
   where auth.uid() is not null
     and private.current_account_is_active()
     and item_row.account_id = auth.uid()
     and item_row.origin = 'managed'
     and work_row.deleted_at is null
     and private.account_directly_manages_artist_profile(
       auth.uid(),
       work_row.owner_profile_id
     )
   order by item_row.created_at desc, work_row.id;
$$;

create function private.list_managed_select_work_images()
returns table (
  id uuid,
  work_id uuid,
  public_object_path text,
  original_filename varchar(512),
  mime_type varchar(80),
  file_size bigint,
  pixel_width integer,
  pixel_height integer,
  sort_order integer,
  is_cover boolean,
  upload_status public.work_image_upload_status,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select image_row.id, image_row.work_id, image_row.public_object_path,
         image_row.original_filename, image_row.mime_type,
         image_row.file_size, image_row.pixel_width, image_row.pixel_height,
         image_row.sort_order, image_row.is_cover, image_row.upload_status,
         image_row.created_at, image_row.updated_at
    from public.archive_items as item_row
    join public.works as work_row on work_row.id = item_row.work_id
    join public.work_images as image_row on image_row.work_id = work_row.id
   where auth.uid() is not null
     and private.current_account_is_active()
     and item_row.account_id = auth.uid()
     and item_row.origin = 'managed'
     and work_row.deleted_at is null
     and image_row.deleted_at is null
     and private.account_directly_manages_artist_profile(
       auth.uid(),
       work_row.owner_profile_id
     )
   order by item_row.created_at desc, image_row.sort_order, image_row.id;
$$;

create function public.list_managed_select_works()
returns table (
  id uuid,
  owner_profile_id uuid,
  title varchar(300),
  year_sort integer,
  profile_order integer,
  year_label varchar(32),
  work_type varchar(80),
  format_discipline varchar(120),
  primary_medium text,
  support_base text,
  additional_materials text[],
  height numeric(12, 3),
  width numeric(12, 3),
  depth numeric(12, 3),
  dimension_unit varchar(8),
  duration_text varchar(160),
  edition_text varchar(160),
  description text,
  collaborator_name varchar(300),
  collaborator_url text,
  photo_credit_name varchar(300),
  photo_credit_url text,
  visibility public.publication_status,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_managed_select_works(); $$;

create function public.list_managed_select_work_images()
returns table (
  id uuid,
  work_id uuid,
  public_object_path text,
  original_filename varchar(512),
  mime_type varchar(80),
  file_size bigint,
  pixel_width integer,
  pixel_height integer,
  sort_order integer,
  is_cover boolean,
  upload_status public.work_image_upload_status,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_managed_select_work_images(); $$;

-- SELECT preview authorization is deliberately narrower than Work editing:
-- delegated Work capability never grants access to private SELECT media.
create or replace function private.service_resolve_authorized_private_work_images(
  actor_account_id uuid, image_ids uuid[], media_purpose text
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare normalized_image_ids uuid[]; requested_count integer; resolved_count integer; image_payload jsonb;
begin
  if media_purpose not in ('preview', 'select_preview', 'pdf_export') then
    raise exception 'Private media purpose is unavailable.' using errcode = '22023';
  end if;
  select coalesce(array_agg(requested.image_id order by requested.first_position), array[]::uuid[])
    into normalized_image_ids from (
      select supplied.image_id, min(supplied.position) as first_position
      from unnest(coalesce(image_ids, array[]::uuid[])) with ordinality as supplied(image_id, position)
      where supplied.image_id is not null group by supplied.image_id
    ) as requested;
  requested_count := cardinality(normalized_image_ids);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'A private-media request must contain between 1 and 100 unique image IDs.' using errcode = '22023';
  end if;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
    'work_image_id', wi.id,
    'object_path', case when media_purpose in ('preview', 'select_preview') and wi.preview_object_path is not null then wi.preview_object_path else wi.private_object_path end,
    'mime_type', case when media_purpose in ('preview', 'select_preview') and wi.preview_object_path is not null then 'image/webp' else wi.mime_type end,
    'file_size', case when media_purpose in ('preview', 'select_preview') and wi.preview_object_path is not null then wi.preview_file_size else wi.file_size end
  ) order by requested.position), '[]'::jsonb)
    into resolved_count, image_payload
    from unnest(normalized_image_ids) with ordinality as requested(image_id, position)
    join public.work_images as wi on wi.id = requested.image_id
    join public.works as w on w.id = wi.work_id
   where wi.deleted_at is null and wi.upload_status = 'ready' and wi.original_verified_at is not null
     and wi.file_size is not null and w.deleted_at is null
     and (
       (media_purpose = 'select_preview'
        and exists (select 1 from public.accounts a where a.id = actor_account_id and a.status = 'active')
        and private.account_directly_manages_artist_profile(actor_account_id, w.owner_profile_id))
       or (media_purpose <> 'select_preview' and private.account_can_manage_work(actor_account_id, w.id))
     )
     and (media_purpose not in ('preview', 'select_preview') or wi.preview_object_path is null or (wi.preview_verified_at is not null and wi.preview_file_size is not null));
  if resolved_count <> requested_count then
    raise exception 'Private media is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object('images', image_payload);
end;
$$;

revoke all on table public.archive_items from authenticated;
grant select (account_id, work_id, origin, created_at)
  on public.archive_items to authenticated;
grant insert (work_id)
  on public.archive_items to authenticated;
grant delete
  on public.archive_items to authenticated;

drop policy archive_items_delete_own on public.archive_items;
create policy archive_items_delete_saved_own
on public.archive_items
for delete
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
  and origin = 'saved'
);

revoke all on function private.account_directly_manages_artist_profile(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.sync_managed_select_items_for_work()
  from public, anon, authenticated;
revoke all on function private.sync_managed_select_items_for_profile_member()
  from public, anon, authenticated;
revoke all on function private.sync_managed_select_items_for_artist_profile()
  from public, anon, authenticated;
revoke all on function private.list_managed_select_works()
  from public, anon;
revoke all on function private.list_managed_select_work_images()
  from public, anon;
revoke all on function public.list_managed_select_works()
  from public, anon;
revoke all on function public.list_managed_select_work_images()
  from public, anon;

grant execute on function private.account_directly_manages_artist_profile(uuid, uuid)
  to service_role;
grant execute on function private.list_managed_select_works()
  to authenticated;
grant execute on function private.list_managed_select_work_images()
  to authenticated;
grant execute on function public.list_managed_select_works()
  to authenticated;
grant execute on function public.list_managed_select_work_images()
  to authenticated;
