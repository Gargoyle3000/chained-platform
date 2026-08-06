-- Fixed one-page CV structure.
-- Existing CV entries and Presentation links are preserved.

alter table public.cv_categories
  drop constraint cv_categories_type_allowed;

-- The old generic Exhibitions category becomes the general
-- Group Exhibitions / Presentations category.
alter table public.cv_categories
  disable trigger cv_categories_prepare_row;

update public.cv_categories
   set category_type = 'group_presentation',
       label = 'GROUP EXHIBITIONS / PRESENTATIONS',
       display_order = 3
 where category_type = 'exhibition';

alter table public.cv_categories
  enable trigger cv_categories_prepare_row;


alter table public.cv_categories
  add constraint cv_categories_type_allowed
  check (
    category_type in (
      'education',
      'solo_exhibition',
      'duo_exhibition',
      'group_presentation',
      'award',
      'grant',
      'collection',
      'residency',
      'teaching',
      'curatorial',

      -- Retained for backward compatibility with any
      -- earlier experimental records.
      'publication',
      'other'
    )
  );


create or replace function private.cv_category_type_for_activity(
  target_activity_type varchar
)
returns varchar(40)
language sql
immutable
set search_path = ''
as $$
  select case trim(coalesce(target_activity_type, ''))
    when 'solo-exhibition' then 'solo_exhibition'
    when 'duo-exhibition' then 'duo_exhibition'
    when 'residency' then 'residency'
    else 'group_presentation'
  end;
$$;


create or replace function private.ensure_fixed_cv_categories(
  target_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.public_profiles as p
     where p.id = target_profile_id
       and p.profile_type = 'artist'
       and p.deleted_at is null
  ) then
    return;
  end if;

  insert into public.cv_categories (
    profile_id,
    category_type,
    label,
    display_order,
    is_visible
  )
  select
    target_profile_id,
    fixed.category_type,
    fixed.label,
    fixed.display_order,
    true
  from (
    values
      ('education'::varchar, 'EDUCATION'::varchar, 0),
      ('solo_exhibition', 'SOLO EXHIBITIONS', 1),
      ('duo_exhibition', 'DUO EXHIBITIONS', 2),
      (
        'group_presentation',
        'GROUP EXHIBITIONS / PRESENTATIONS',
        3
      ),
      ('award', 'NOMINATIONS & PRIZES', 4),
      ('grant', 'SCHOLARSHIPS & FUNDING', 5),
      ('collection', 'COLLECTIONS', 6),
      ('residency', 'RESIDENCIES', 7),
      ('teaching', 'TEACHING', 8),
      ('curatorial', 'CURATORIAL PROJECTS', 9)
  ) as fixed (
    category_type,
    label,
    display_order
  )
  on conflict (profile_id, category_type)
  do update
    set label = excluded.label,
        display_order = excluded.display_order;
end;
$$;


create or replace function private.seed_artist_cv_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_type = 'artist'
     and new.deleted_at is null then
    perform private.ensure_fixed_cv_categories(new.id);
  end if;

  return null;
end;
$$;


drop trigger if exists public_profiles_seed_cv_categories
  on public.public_profiles;

create trigger public_profiles_seed_cv_categories
after insert or update of profile_type, deleted_at
on public.public_profiles
for each row
execute function private.seed_artist_cv_categories();


-- Backfill every existing active artist profile.
select private.ensure_fixed_cv_categories(p.id)
  from public.public_profiles as p
 where p.profile_type = 'artist'
   and p.deleted_at is null;


create or replace function private.prepare_cv_entry_row()
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
  activity_kind varchar(80);

  expected_category_kind varchar(40);
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
      pa.deleted_at,
      pa.activity_type
      into
        activity_profile_id,
        activity_in_cv,
        activity_deleted_at,
        activity_kind
      from public.profile_activities as pa
     where pa.id = new.source_activity_id;

    if activity_profile_id is null
       or activity_deleted_at is not null
       or not activity_in_cv then
      raise exception
        'A linked CV entry requires an active included Presentation.'
        using errcode = '23514';
    end if;

    if activity_profile_id
       is distinct from category_profile_id then
      raise exception
        'CV entry and Presentation must have the same owner.'
        using errcode = '23514';
    end if;

    expected_category_kind :=
      private.cv_category_type_for_activity(activity_kind);

    if category_kind is distinct from expected_category_kind then
      raise exception
        'Presentation-backed CV entry is in the wrong CV category.'
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


create or replace function private.sync_profile_activity_cv_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_category_type varchar(40);
  target_category_id uuid;
  next_order integer;
begin
  if new.include_in_cv
     and new.deleted_at is null then

    perform private.ensure_fixed_cv_categories(
      new.owner_profile_id
    );

    target_category_type :=
      private.cv_category_type_for_activity(
        new.activity_type
      );

    select c.id
      into target_category_id
      from public.cv_categories as c
     where c.profile_id = new.owner_profile_id
       and c.category_type = target_category_type;

    select coalesce(max(e.display_order) + 1, 0)
      into next_order
      from public.cv_entries as e
     where e.category_id = target_category_id;

    insert into public.cv_entries (
      category_id,
      source_activity_id,
      display_order,
      is_visible
    )
    values (
      target_category_id,
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


-- Move existing automatic entries into their correct fixed category.
update public.cv_entries as e
   set category_id = category.id
  from public.profile_activities as activity
  join public.cv_categories as category
    on category.profile_id = activity.owner_profile_id
   and category.category_type =
       private.cv_category_type_for_activity(
         activity.activity_type
       )
 where e.source_activity_id = activity.id
   and e.category_id is distinct from category.id;


comment on function private.ensure_fixed_cv_categories(uuid) is
  'Creates or normalises the ten fixed CV categories for an artist profile.';

comment on function private.cv_category_type_for_activity(varchar) is
  'Maps a Presentation type to its automatic fixed CV category.';