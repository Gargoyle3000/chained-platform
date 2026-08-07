-- Independent Press items belonging to artist profiles.

create table public.profile_press_items (
  id uuid primary key default gen_random_uuid(),

  owner_profile_id uuid not null
    references public.public_profiles (id)
    on delete cascade,

  year_label varchar(40) not null,
  title varchar(300) not null,
  author varchar(300),
  body text,
  url text,

  is_visible boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profile_press_year_length
    check (
      char_length(trim(year_label))
      between 1 and 40
    ),

  constraint profile_press_title_length
    check (
      char_length(trim(title))
      between 1 and 300
    ),

  constraint profile_press_author_length
    check (
      author is null
      or char_length(trim(author))
         between 1 and 300
    ),

  constraint profile_press_url_http
    check (
      url is null
      or url ~* '^https?://'
    )
);


create index profile_press_owner_lookup
  on public.profile_press_items (
    owner_profile_id,
    created_at desc,
    id
  );


create index profile_press_public_lookup
  on public.profile_press_items (
    owner_profile_id,
    created_at desc,
    id
  )
  where is_visible;


create function private.can_manage_press_owner(
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


create function private.prepare_press_item_row()
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
   where p.id = new.owner_profile_id
     and p.deleted_at is null;

  if owner_type is distinct from 'artist' then
    raise exception
      'Press items require an active artist profile.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.owner_profile_id
         is distinct from old.owner_profile_id then
    raise exception
      'Press item ownership cannot be changed.'
      using errcode = '42501';
  end if;

  new.year_label :=
    nullif(trim(new.year_label), '');

  new.title :=
    nullif(trim(new.title), '');

  new.author :=
    nullif(trim(new.author), '');

  new.body :=
    nullif(trim(new.body), '');

  new.url :=
    nullif(trim(new.url), '');

  if new.year_label is null then
    raise exception
      'Press items require a year.'
      using errcode = '23514';
  end if;

  if new.title is null then
    raise exception
      'Press items require a title.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


create trigger profile_press_items_set_updated_at
before update on public.profile_press_items
for each row
execute function private.set_updated_at();


create trigger profile_press_items_prepare_row
before insert or update on public.profile_press_items
for each row
execute function private.prepare_press_item_row();


alter table public.profile_press_items
  enable row level security;

alter table public.profile_press_items
  force row level security;


create policy profile_press_guest_read
on public.profile_press_items
for select
to anon
using (
  is_visible
  and private.is_published_profile(
    owner_profile_id
  )
);


create policy profile_press_authenticated_read
on public.profile_press_items
for select
to authenticated
using (
  (
    is_visible
    and private.is_published_profile(
      owner_profile_id
    )
  )
  or private.can_manage_press_owner(
    owner_profile_id
  )
);


create policy profile_press_authenticated_insert
on public.profile_press_items
for insert
to authenticated
with check (
  private.can_manage_press_owner(
    owner_profile_id
  )
);


create policy profile_press_authenticated_update
on public.profile_press_items
for update
to authenticated
using (
  private.can_manage_press_owner(
    owner_profile_id
  )
)
with check (
  private.can_manage_press_owner(
    owner_profile_id
  )
);


create policy profile_press_authenticated_delete
on public.profile_press_items
for delete
to authenticated
using (
  private.can_manage_press_owner(
    owner_profile_id
  )
);


revoke all on table public.profile_press_items
  from public, anon, authenticated;


grant select on table public.profile_press_items
  to anon, authenticated;


grant insert (
  owner_profile_id,
  year_label,
  title,
  author,
  body,
  url,
  is_visible
) on public.profile_press_items
to authenticated;


grant update (
  year_label,
  title,
  author,
  body,
  url,
  is_visible
) on public.profile_press_items
to authenticated;


grant delete on table public.profile_press_items
  to authenticated;


revoke all on function
  private.can_manage_press_owner(uuid)
  from public, anon;

revoke all on function
  private.prepare_press_item_row()
  from public, anon, authenticated;


grant execute on function
  private.can_manage_press_owner(uuid)
  to authenticated;


comment on table public.profile_press_items is
  'Chronological Press entries belonging directly to an artist profile.';

comment on column public.profile_press_items.is_visible is
  'Controls whether the Press entry appears on the public artist profile.';