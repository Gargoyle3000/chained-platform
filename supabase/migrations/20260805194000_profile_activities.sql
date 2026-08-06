-- Presentations are stored as profile activities.
-- Concrete Agenda moments are stored as activity occurrences.

create table public.profile_activities (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  updated_by_account_id uuid references public.accounts (id) on delete set null,
  deleted_by_account_id uuid references public.accounts (id) on delete set null,

  title varchar(300) not null default '',
  activity_type varchar(80) not null default '',
  venue_name varchar(300) not null default '',
  city varchar(160) not null default '',
  country varchar(160),
  start_date date,
  end_date date,
  description text,
  external_url text,

  show_in_presentations boolean not null default true,
  include_in_cv boolean not null default false,

  visibility public.publication_status not null default 'draft',
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_after timestamptz,

  constraint profile_activities_title_length
    check (char_length(trim(title)) <= 300),
  constraint profile_activities_type_length
    check (char_length(trim(activity_type)) <= 80),
  constraint profile_activities_venue_length
    check (char_length(trim(venue_name)) <= 300),
  constraint profile_activities_city_length
    check (char_length(trim(city)) <= 160),
  constraint profile_activities_country_length
    check (country is null or char_length(trim(country)) <= 160),
  constraint profile_activities_dates_ordered
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint profile_activities_description_length
    check (description is null or char_length(description) <= 50000),
  constraint profile_activities_external_url_length
    check (external_url is null or char_length(external_url) <= 2048),
  constraint profile_activities_publication_consistent
    check (
      (
        visibility = 'draft'
        and published_at is null
      )
      or (
        visibility = 'published'
        and published_at is not null
        and char_length(trim(title)) between 1 and 300
        and char_length(trim(activity_type)) between 1 and 80
        and char_length(trim(venue_name)) between 1 and 300
        and char_length(trim(city)) between 1 and 160
        and start_date is not null
      )
    ),
  constraint profile_activities_deletion_consistent
    check (
      (
        deleted_at is null
        and purge_after is null
        and deleted_by_account_id is null
      )
      or (
        deleted_at is not null
        and purge_after = deleted_at + interval '30 days'
        and deleted_by_account_id is not null
        and visibility = 'draft'
        and published_at is null
      )
    )
);

create table public.activity_occurrences (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.profile_activities (id) on delete cascade,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  updated_by_account_id uuid references public.accounts (id) on delete set null,
  deleted_by_account_id uuid references public.accounts (id) on delete set null,

  occurrence_type varchar(80) not null default '',
  title_override varchar(300),
  start_date date,
  end_date date,
  start_time time without time zone,
  end_time time without time zone,
  time_zone varchar(80),
  venue_name_override varchar(300),
  city_override varchar(160),

  show_in_agenda boolean not null default true,
  visibility public.publication_status not null default 'draft',
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_after timestamptz,

  constraint activity_occurrences_type_length
    check (char_length(trim(occurrence_type)) <= 80),
  constraint activity_occurrences_title_length
    check (title_override is null or char_length(trim(title_override)) <= 300),
  constraint activity_occurrences_dates_ordered
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint activity_occurrences_same_day_times_ordered
    check (
      end_time is null
      or start_time is null
      or end_date is distinct from start_date
      or end_time >= start_time
    ),
  constraint activity_occurrences_timezone_length
    check (time_zone is null or char_length(trim(time_zone)) between 1 and 80),
  constraint activity_occurrences_venue_length
    check (
      venue_name_override is null
      or char_length(trim(venue_name_override)) <= 300
    ),
  constraint activity_occurrences_city_length
    check (
      city_override is null
      or char_length(trim(city_override)) <= 160
    ),
  constraint activity_occurrences_publication_consistent
    check (
      (
        visibility = 'draft'
        and published_at is null
      )
      or (
        visibility = 'published'
        and published_at is not null
        and char_length(trim(occurrence_type)) between 1 and 80
        and start_date is not null
      )
    ),
  constraint activity_occurrences_deletion_consistent
    check (
      (
        deleted_at is null
        and purge_after is null
        and deleted_by_account_id is null
      )
      or (
        deleted_at is not null
        and purge_after = deleted_at + interval '30 days'
        and deleted_by_account_id is not null
        and visibility = 'draft'
        and published_at is null
      )
    )
);

create index profile_activities_owner_updated
  on public.profile_activities (owner_profile_id, updated_at desc, id)
  where deleted_at is null;

create index profile_activities_public_presentations
  on public.profile_activities (start_date desc, id)
  where visibility = 'published'
    and show_in_presentations
    and deleted_at is null;

create index profile_activities_public_cv
  on public.profile_activities (start_date desc, id)
  where visibility = 'published'
    and include_in_cv
    and deleted_at is null;

create index activity_occurrences_activity
  on public.activity_occurrences (activity_id, start_date, start_time, id)
  where deleted_at is null;

create index activity_occurrences_public_agenda
  on public.activity_occurrences (start_date, start_time, id)
  where visibility = 'published'
    and show_in_agenda
    and deleted_at is null;


create function private.can_manage_activity_owner(target_artist_profile_id uuid)
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
       where p.id = target_artist_profile_id
         and p.profile_type = 'artist'
         and p.deleted_at is null
    )
    and (
      private.has_active_profile_membership(target_artist_profile_id, 'editor')
      or private.has_delegated_scope(target_artist_profile_id, 'presentations_editor')
    );
$$;

create function private.can_manage_event_owner(target_artist_profile_id uuid)
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
       where p.id = target_artist_profile_id
         and p.profile_type = 'artist'
         and p.deleted_at is null
    )
    and (
      private.has_active_profile_membership(target_artist_profile_id, 'editor')
      or private.has_delegated_scope(target_artist_profile_id, 'events_editor')
    );
$$;

create function private.can_manage_activity(target_activity_id uuid)
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
       and pa.deleted_at is null
       and private.can_manage_activity_owner(pa.owner_profile_id)
  );
$$;

create function private.can_manage_occurrence(target_occurrence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.activity_occurrences as ao
      join public.profile_activities as pa
        on pa.id = ao.activity_id
       and pa.deleted_at is null
     where ao.id = target_occurrence_id
       and ao.deleted_at is null
       and private.can_manage_event_owner(pa.owner_profile_id)
  );
$$;

create function private.is_published_activity(target_activity_id uuid)
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
       and pa.visibility = 'published'
       and pa.deleted_at is null
       and private.is_published_profile(pa.owner_profile_id)
  );
$$;


create function private.prepare_profile_activity_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  owner_type public.profile_type;
begin
  select p.profile_type
    into owner_type
    from public.public_profiles as p
   where p.id = new.owner_profile_id
     and p.deleted_at is null;

  if owner_type <> 'artist' then
    raise exception 'Activities must be owned by an active artist profile.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.created_by_account_id := actor_id;
      new.updated_by_account_id := actor_id;
      new.deleted_by_account_id := null;
      new.deleted_at := null;
      new.purge_after := null;
      new.visibility := 'draft';
      new.published_at := null;
    end if;
  else
    if new.owner_profile_id is distinct from old.owner_profile_id then
      raise exception 'Activity ownership cannot be changed by an ordinary update.'
        using errcode = '42501';
    end if;

    if actor_id is not null then
      new.created_by_account_id := old.created_by_account_id;
      new.updated_by_account_id := actor_id;

      if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_at := now();
        new.purge_after := new.deleted_at + interval '30 days';
        new.deleted_by_account_id := actor_id;
        new.visibility := 'draft';
        new.published_at := null;

        update public.activity_occurrences
           set deleted_at = now()
         where activity_id = old.id
           and deleted_at is null;
      elsif old.deleted_at is not null then
        if new.deleted_at is distinct from old.deleted_at
           or new.purge_after is distinct from old.purge_after
           or new.deleted_by_account_id is distinct from old.deleted_by_account_id then
          raise exception 'Deleted Activities require a trusted restore or purge workflow.'
            using errcode = '42501';
        end if;
      else
        new.deleted_at := null;
        new.purge_after := null;
        new.deleted_by_account_id := null;

        if new.visibility = 'published' and old.visibility <> 'published' then
          new.published_at := now();
        elsif new.visibility = 'draft' then
          new.published_at := null;
        else
          new.published_at := old.published_at;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create function private.prepare_activity_occurrence_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  parent_visibility public.publication_status;
begin
  select pa.visibility
    into parent_visibility
    from public.profile_activities as pa
   where pa.id = new.activity_id
     and pa.deleted_at is null;

  if parent_visibility is null then
    raise exception 'Agenda moments require an active parent Activity.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.created_by_account_id := actor_id;
      new.updated_by_account_id := actor_id;
      new.deleted_by_account_id := null;
      new.deleted_at := null;
      new.purge_after := null;
      new.visibility := 'draft';
      new.published_at := null;
    end if;
  else
    if new.activity_id is distinct from old.activity_id then
      raise exception 'An Agenda moment cannot be moved to another Activity.'
        using errcode = '42501';
    end if;

    if actor_id is not null then
      new.created_by_account_id := old.created_by_account_id;
      new.updated_by_account_id := actor_id;

      if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_at := now();
        new.purge_after := new.deleted_at + interval '30 days';
        new.deleted_by_account_id := actor_id;
        new.visibility := 'draft';
        new.published_at := null;
      elsif old.deleted_at is not null then
        if new.deleted_at is distinct from old.deleted_at
           or new.purge_after is distinct from old.purge_after
           or new.deleted_by_account_id is distinct from old.deleted_by_account_id then
          raise exception 'Deleted Agenda moments require a trusted restore or purge workflow.'
            using errcode = '42501';
        end if;
      else
        new.deleted_at := null;
        new.purge_after := null;
        new.deleted_by_account_id := null;

        if new.visibility = 'published' and parent_visibility <> 'published' then
          raise exception 'An Agenda moment requires a published parent Activity.'
            using errcode = '23514';
        end if;

        if new.visibility = 'published' and old.visibility <> 'published' then
          new.published_at := now();
        elsif new.visibility = 'draft' then
          new.published_at := null;
        else
          new.published_at := old.published_at;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;


create trigger profile_activities_set_updated_at
before update on public.profile_activities
for each row execute function private.set_updated_at();

create trigger profile_activities_prepare_row
before insert or update on public.profile_activities
for each row execute function private.prepare_profile_activity_row();

create trigger activity_occurrences_set_updated_at
before update on public.activity_occurrences
for each row execute function private.set_updated_at();

create trigger activity_occurrences_prepare_row
before insert or update on public.activity_occurrences
for each row execute function private.prepare_activity_occurrence_row();


create function private.soft_delete_profile_activity(target_activity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.current_account_is_active()
     or not private.can_manage_activity(target_activity_id) then
    raise exception 'The Activity may not be deleted.'
      using errcode = '42501';
  end if;

  update public.profile_activities
     set deleted_at = now()
   where id = target_activity_id
     and deleted_at is null;

  return found;
end;
$$;

create function private.soft_delete_activity_occurrence(target_occurrence_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.current_account_is_active()
     or not private.can_manage_occurrence(target_occurrence_id) then
    raise exception 'The Agenda moment may not be deleted.'
      using errcode = '42501';
  end if;

  update public.activity_occurrences
     set deleted_at = now()
   where id = target_occurrence_id
     and deleted_at is null;

  return found;
end;
$$;

create function public.soft_delete_profile_activity(target_activity_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_profile_activity(target_activity_id);
$$;

create function public.soft_delete_activity_occurrence(target_occurrence_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_activity_occurrence(target_occurrence_id);
$$;


alter table public.profile_activities enable row level security;
alter table public.profile_activities force row level security;
alter table public.activity_occurrences enable row level security;
alter table public.activity_occurrences force row level security;

create policy profile_activities_guest_read_published
on public.profile_activities
for select
to anon
using (
  visibility = 'published'
  and deleted_at is null
  and (select private.is_published_profile(owner_profile_id))
);

create policy profile_activities_authenticated_read
on public.profile_activities
for select
to authenticated
using (
  (
    visibility = 'published'
    and deleted_at is null
    and (select private.is_published_profile(owner_profile_id))
  )
  or (
    deleted_at is null
    and (
      (select private.can_manage_activity_owner(owner_profile_id))
      or (select private.can_manage_event_owner(owner_profile_id))
    )
  )
);

create policy profile_activities_authenticated_insert
on public.profile_activities
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select private.current_account_is_active())
  and visibility = 'draft'
  and published_at is null
  and deleted_at is null
  and created_by_account_id = (select auth.uid())
  and updated_by_account_id = (select auth.uid())
  and (select private.can_manage_activity_owner(owner_profile_id))
);

create policy profile_activities_authenticated_update
on public.profile_activities
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and (select private.can_manage_activity_owner(owner_profile_id))
)
with check (
  (select auth.uid()) is not null
  and (select private.can_manage_activity_owner(owner_profile_id))
  and updated_by_account_id = (select auth.uid())
);

create policy activity_occurrences_guest_read_published
on public.activity_occurrences
for select
to anon
using (
  visibility = 'published'
  and show_in_agenda
  and deleted_at is null
  and (select private.is_published_activity(activity_id))
);

create policy activity_occurrences_authenticated_read
on public.activity_occurrences
for select
to authenticated
using (
  (
    visibility = 'published'
    and show_in_agenda
    and deleted_at is null
    and (select private.is_published_activity(activity_id))
  )
  or (
    deleted_at is null
    and exists (
      select 1
        from public.profile_activities as pa
       where pa.id = activity_id
         and pa.deleted_at is null
         and (
           (select private.can_manage_activity_owner(pa.owner_profile_id))
           or (select private.can_manage_event_owner(pa.owner_profile_id))
         )
    )
  )
);

create policy activity_occurrences_authenticated_insert
on public.activity_occurrences
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select private.current_account_is_active())
  and visibility = 'draft'
  and published_at is null
  and deleted_at is null
  and created_by_account_id = (select auth.uid())
  and updated_by_account_id = (select auth.uid())
  and exists (
    select 1
      from public.profile_activities as pa
     where pa.id = activity_id
       and pa.deleted_at is null
       and (select private.can_manage_event_owner(pa.owner_profile_id))
  )
);

create policy activity_occurrences_authenticated_update
on public.activity_occurrences
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and exists (
    select 1
      from public.profile_activities as pa
     where pa.id = activity_id
       and pa.deleted_at is null
       and (select private.can_manage_event_owner(pa.owner_profile_id))
  )
)
with check (
  (select auth.uid()) is not null
  and updated_by_account_id = (select auth.uid())
  and exists (
    select 1
      from public.profile_activities as pa
     where pa.id = activity_id
       and pa.deleted_at is null
       and (select private.can_manage_event_owner(pa.owner_profile_id))
  )
);


revoke all on table public.profile_activities from anon, authenticated;
revoke all on table public.activity_occurrences from anon, authenticated;

grant select on table public.profile_activities to anon, authenticated;
grant select on table public.activity_occurrences to anon, authenticated;

grant insert (
  owner_profile_id,
  title,
  activity_type,
  venue_name,
  city,
  country,
  start_date,
  end_date,
  description,
  external_url,
  show_in_presentations,
  include_in_cv
) on public.profile_activities to authenticated;

grant update (
  title,
  activity_type,
  venue_name,
  city,
  country,
  start_date,
  end_date,
  description,
  external_url,
  show_in_presentations,
  include_in_cv,
  visibility
) on public.profile_activities to authenticated;

grant insert (
  activity_id,
  occurrence_type,
  title_override,
  start_date,
  end_date,
  start_time,
  end_time,
  time_zone,
  venue_name_override,
  city_override,
  show_in_agenda
) on public.activity_occurrences to authenticated;

grant update (
  occurrence_type,
  title_override,
  start_date,
  end_date,
  start_time,
  end_time,
  time_zone,
  venue_name_override,
  city_override,
  show_in_agenda,
  visibility
) on public.activity_occurrences to authenticated;


revoke all on function private.can_manage_activity_owner(uuid) from public, anon;
revoke all on function private.can_manage_event_owner(uuid) from public, anon;
revoke all on function private.can_manage_activity(uuid) from public, anon;
revoke all on function private.can_manage_occurrence(uuid) from public, anon;
revoke all on function private.is_published_activity(uuid) from public;
revoke all on function private.prepare_profile_activity_row() from public, anon, authenticated;
revoke all on function private.prepare_activity_occurrence_row() from public, anon, authenticated;
revoke all on function private.soft_delete_profile_activity(uuid) from public, anon;
revoke all on function private.soft_delete_activity_occurrence(uuid) from public, anon;

grant execute on function private.can_manage_activity_owner(uuid) to authenticated;
grant execute on function private.can_manage_event_owner(uuid) to authenticated;
grant execute on function private.can_manage_activity(uuid) to authenticated;
grant execute on function private.can_manage_occurrence(uuid) to authenticated;
grant execute on function private.is_published_activity(uuid) to anon, authenticated;
grant execute on function private.soft_delete_profile_activity(uuid) to authenticated;
grant execute on function private.soft_delete_activity_occurrence(uuid) to authenticated;

revoke all on function public.soft_delete_profile_activity(uuid) from public, anon;
revoke all on function public.soft_delete_activity_occurrence(uuid) from public, anon;

grant execute on function public.soft_delete_profile_activity(uuid) to authenticated;
grant execute on function public.soft_delete_activity_occurrence(uuid) to authenticated;
