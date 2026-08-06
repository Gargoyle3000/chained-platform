-- Structured CV categories and entries.
-- Presentation-backed entries remain linked to profile_activities
-- instead of duplicating their public content.

create table public.cv_categories (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.public_profiles (id)
    on delete cascade,

  category_type varchar(40) not null,
  label varchar(160) not null,
  display_order integer not null default 0,
  is_visible boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cv_categories_type_allowed
    check (
      category_type in (
        'exhibition',
        'education',
        'residency',
        'grant',
        'award',
        'collection',
        'teaching',
        'publication',
        'other'
      )
    ),

  constraint cv_categories_label_required
    check (char_length(trim(label)) between 1 and 160),

  constraint cv_categories_order_nonnegative
    check (display_order >= 0),

  constraint cv_categories_profile_type_unique
    unique (profile_id, category_type)
);


create table public.cv_entries (
  id uuid primary key default gen_random_uuid(),

  category_id uuid not null
    references public.cv_categories (id)
    on delete cascade,

  source_activity_id uuid
    references public.profile_activities (id)
    on delete cascade,

  year_label varchar(40),
  title varchar(300),
  organization varchar(300),
  location_text varchar(300),
  url text,

  display_order integer not null default 0,
  is_visible boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cv_entries_source_activity_unique
    unique (source_activity_id),

  constraint cv_entries_year_length
    check (
      year_label is null
      or char_length(trim(year_label)) between 1 and 40
    ),

  constraint cv_entries_title_length
    check (
      title is null
      or char_length(trim(title)) between 1 and 300
    ),

  constraint cv_entries_organization_length
    check (
      organization is null
      or char_length(trim(organization)) between 1 and 300
    ),

  constraint cv_entries_location_length
    check (
      location_text is null
      or char_length(trim(location_text)) between 1 and 300
    ),

  constraint cv_entries_url_http
    check (
      url is null
      or url ~* '^https?://'
    ),

  constraint cv_entries_order_nonnegative
    check (display_order >= 0),

  constraint cv_entries_manual_title_required
    check (
      source_activity_id is not null
      or title is not null
    )
);


create index cv_categories_profile_order
  on public.cv_categories (
    profile_id,
    display_order,
    id
  );


create index cv_entries_category_order
  on public.cv_entries (
    category_id,
    display_order,
    id
  );


create index cv_entries_public_lookup
  on public.cv_entries (
    category_id,
    display_order,
    id
  )
  where is_visible;


create function private.can_manage_cv_owner(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.public_profiles as p
       where p.id = target_profile_id
         and p.profile_type = 'artist'
         and p.deleted_at is null
    )
    and private.has_active_profile_membership(
      target_profile_id,
      'editor'
    );
$$;


create function private.can_manage_cv_category(
  target_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.cv_categories as c
     where c.id = target_category_id
       and private.can_manage_cv_owner(c.profile_id)
  );
$$;


create function private.is_public_cv_category(
  target_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.cv_categories as c
     where c.id = target_category_id
       and c.is_visible
       and private.is_published_profile(c.profile_id)
  );
$$;


create function private.is_public_cv_source(
  target_activity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profile_activities as pa
     where pa.id = target_activity_id
       and pa.include_in_cv
       and pa.deleted_at is null
       and private.is_published_activity(pa.id)
  );
$$;


create function private.prepare_cv_category_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_type public.profile_type;
begin
  select p.profile_type
    into owner_type
    from public.public_profiles as p
   where p.id = new.profile_id
     and p.deleted_at is null;

  if owner_type is distinct from 'artist' then
    raise exception
      'CV categories require an active artist profile.'
      using errcode = '23514';
  end if;

  new.label := trim(new.label);

  if tg_op = 'UPDATE' then
    if new.profile_id is distinct from old.profile_id then
      raise exception
        'CV category ownership cannot be changed.'
        using errcode = '42501';
    end if;

    if new.category_type is distinct from old.category_type then
      raise exception
        'CV category type cannot be changed.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


create function private.prepare_cv_entry_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_profile_id uuid;
  old_category_profile_id uuid;
  category_kind varchar(40);
  activity_profile_id uuid;
  activity_in_cv boolean;
  activity_deleted_at timestamptz;
begin
  select
    c.profile_id,
    c.category_type
    into
      category_profile_id,
      category_kind
    from public.cv_categories as c
   where c.id = new.category_id;

  if category_profile_id is null then
    raise exception
      'CV entries require an active category.'
      using errcode = '23514';
  end if;

  new.year_label :=
    nullif(trim(new.year_label), '');

  new.title :=
    nullif(trim(new.title), '');

  new.organization :=
    nullif(trim(new.organization), '');

  new.location_text :=
    nullif(trim(new.location_text), '');

  new.url :=
    nullif(trim(new.url), '');

  if tg_op = 'UPDATE'
     and new.category_id is distinct from old.category_id then
    select c.profile_id
      into old_category_profile_id
      from public.cv_categories as c
     where c.id = old.category_id;

    if category_profile_id
       is distinct from old_category_profile_id then
      raise exception
        'CV entries cannot be moved between artist profiles.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.source_activity_id
         is distinct from old.source_activity_id then
    raise exception
      'CV source linkage cannot be changed.'
      using errcode = '42501';
  end if;

  if new.source_activity_id is not null then
    select
      pa.owner_profile_id,
      pa.include_in_cv,
      pa.deleted_at
      into
        activity_profile_id,
        activity_in_cv,
        activity_deleted_at
      from public.profile_activities as pa
     where pa.id = new.source_activity_id;

    if activity_profile_id is null
       or activity_deleted_at is not null
       or not activity_in_cv then
      raise exception
        'A linked CV entry requires an active included Presentation.'
        using errcode = '23514';
    end if;

    if activity_profile_id is distinct from category_profile_id then
      raise exception
        'CV entry and Presentation must have the same owner.'
        using errcode = '23514';
    end if;

    if category_kind <> 'exhibition' then
      raise exception
        'Presentation-backed CV entries belong in Exhibitions.'
        using errcode = '23514';
    end if;

    -- Linked entries derive their public text from the Presentation.
    new.year_label := null;
    new.title := null;
    new.organization := null;
    new.location_text := null;
    new.url := null;
  elsif new.title is null then
    raise exception
      'Manual CV entries require a title.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


create trigger cv_categories_set_updated_at
before update on public.cv_categories
for each row execute function private.set_updated_at();


create trigger cv_categories_prepare_row
before insert or update on public.cv_categories
for each row execute function private.prepare_cv_category_row();


create trigger cv_entries_set_updated_at
before update on public.cv_entries
for each row execute function private.set_updated_at();


create trigger cv_entries_prepare_row
before insert or update on public.cv_entries
for each row execute function private.prepare_cv_entry_row();


create function private.sync_profile_activity_cv_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  exhibitions_category_id uuid;
  next_order integer;
begin
  if new.include_in_cv
     and new.deleted_at is null then

    insert into public.cv_categories (
      profile_id,
      category_type,
      label,
      display_order,
      is_visible
    )
    values (
      new.owner_profile_id,
      'exhibition',
      'EXHIBITIONS',
      0,
      true
    )
    on conflict (profile_id, category_type)
    do nothing;

    select c.id
      into exhibitions_category_id
      from public.cv_categories as c
     where c.profile_id = new.owner_profile_id
       and c.category_type = 'exhibition';

    select coalesce(max(e.display_order) + 1, 0)
      into next_order
      from public.cv_entries as e
     where e.category_id = exhibitions_category_id;

    insert into public.cv_entries (
      category_id,
      source_activity_id,
      display_order,
      is_visible
    )
    values (
      exhibitions_category_id,
      new.id,
      next_order,
      true
    )
    on conflict (source_activity_id)
    do update
      set category_id = excluded.category_id;

  else
    delete from public.cv_entries
     where source_activity_id = new.id;
  end if;

  return null;
end;
$$;


create trigger profile_activities_sync_cv_entry
after insert or update on public.profile_activities
for each row execute function private.sync_profile_activity_cv_entry();


-- Backfill existing Presentation selections.

insert into public.cv_categories (
  profile_id,
  category_type,
  label,
  display_order,
  is_visible
)
select distinct
  pa.owner_profile_id,
  'exhibition',
  'EXHIBITIONS',
  0,
  true
from public.profile_activities as pa
where pa.include_in_cv
  and pa.deleted_at is null
on conflict (profile_id, category_type)
do nothing;


insert into public.cv_entries (
  category_id,
  source_activity_id,
  display_order,
  is_visible
)
select
  c.id,
  pa.id,
  (
    row_number() over (
      partition by pa.owner_profile_id
      order by
        pa.start_date desc nulls last,
        pa.updated_at desc,
        pa.id
    ) - 1
  )::integer,
  true
from public.profile_activities as pa
join public.cv_categories as c
  on c.profile_id = pa.owner_profile_id
 and c.category_type = 'exhibition'
where pa.include_in_cv
  and pa.deleted_at is null
on conflict (source_activity_id)
do nothing;


alter table public.cv_categories
  enable row level security;

alter table public.cv_categories
  force row level security;

alter table public.cv_entries
  enable row level security;

alter table public.cv_entries
  force row level security;


create policy cv_categories_guest_read
on public.cv_categories
for select
to anon
using (
  is_visible
  and private.is_published_profile(profile_id)
);


create policy cv_categories_authenticated_read
on public.cv_categories
for select
to authenticated
using (
  (
    is_visible
    and private.is_published_profile(profile_id)
  )
  or private.can_manage_cv_owner(profile_id)
);


create policy cv_categories_authenticated_insert
on public.cv_categories
for insert
to authenticated
with check (
  private.can_manage_cv_owner(profile_id)
);


create policy cv_categories_authenticated_update
on public.cv_categories
for update
to authenticated
using (
  private.can_manage_cv_owner(profile_id)
)
with check (
  private.can_manage_cv_owner(profile_id)
);


create policy cv_entries_guest_read
on public.cv_entries
for select
to anon
using (
  is_visible
  and private.is_public_cv_category(category_id)
  and (
    source_activity_id is null
    or private.is_public_cv_source(source_activity_id)
  )
);


create policy cv_entries_authenticated_read
on public.cv_entries
for select
to authenticated
using (
  (
    is_visible
    and private.is_public_cv_category(category_id)
    and (
      source_activity_id is null
      or private.is_public_cv_source(source_activity_id)
    )
  )
  or private.can_manage_cv_category(category_id)
);


create policy cv_entries_authenticated_insert
on public.cv_entries
for insert
to authenticated
with check (
  source_activity_id is null
  and private.can_manage_cv_category(category_id)
);


create policy cv_entries_authenticated_update
on public.cv_entries
for update
to authenticated
using (
  private.can_manage_cv_category(category_id)
)
with check (
  private.can_manage_cv_category(category_id)
);


create policy cv_entries_authenticated_delete
on public.cv_entries
for delete
to authenticated
using (
  source_activity_id is null
  and private.can_manage_cv_category(category_id)
);


revoke all on table public.cv_categories
  from public, anon, authenticated;

revoke all on table public.cv_entries
  from public, anon, authenticated;


grant select on table public.cv_categories
  to anon, authenticated;

grant select on table public.cv_entries
  to anon, authenticated;


grant insert (
  profile_id,
  category_type,
  label,
  display_order,
  is_visible
) on public.cv_categories
to authenticated;


grant update (
  label,
  display_order,
  is_visible
) on public.cv_categories
to authenticated;


grant insert (
  category_id,
  year_label,
  title,
  organization,
  location_text,
  url,
  display_order,
  is_visible
) on public.cv_entries
to authenticated;


grant update (
  category_id,
  year_label,
  title,
  organization,
  location_text,
  url,
  display_order,
  is_visible
) on public.cv_entries
to authenticated;


grant delete on table public.cv_entries
  to authenticated;


revoke all on function
  private.can_manage_cv_owner(uuid)
  from public, anon;

revoke all on function
  private.can_manage_cv_category(uuid)
  from public, anon;

revoke all on function
  private.is_public_cv_category(uuid)
  from public;

revoke all on function
  private.is_public_cv_source(uuid)
  from public;

revoke all on function
  private.prepare_cv_category_row()
  from public, anon, authenticated;

revoke all on function
  private.prepare_cv_entry_row()
  from public, anon, authenticated;

revoke all on function
  private.sync_profile_activity_cv_entry()
  from public, anon, authenticated;


grant execute on function
  private.can_manage_cv_owner(uuid)
  to authenticated;

grant execute on function
  private.can_manage_cv_category(uuid)
  to authenticated;

grant execute on function
  private.is_public_cv_category(uuid)
  to anon, authenticated;

grant execute on function
  private.is_public_cv_source(uuid)
  to anon, authenticated;


comment on table public.cv_categories is
  'Ordered CV sections belonging to an artist profile.';

comment on table public.cv_entries is
  'Manual or Presentation-backed ordered CV lines.';

comment on column public.cv_entries.source_activity_id is
  'Optional Presentation source; linked public text is derived rather than duplicated.';