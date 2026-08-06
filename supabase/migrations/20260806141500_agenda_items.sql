-- Allow Agenda items to exist either independently or as moments linked
-- to a Presentation. Every Agenda item belongs directly to an artist profile.

alter table public.activity_occurrences
  add column owner_profile_id uuid;

update public.activity_occurrences as ao
   set owner_profile_id = pa.owner_profile_id
  from public.profile_activities as pa
 where pa.id = ao.activity_id;

alter table public.activity_occurrences
  alter column owner_profile_id set not null;

alter table public.activity_occurrences
  add constraint activity_occurrences_owner_profile_id_fkey
  foreign key (owner_profile_id)
  references public.public_profiles (id)
  on delete restrict;

alter table public.activity_occurrences
  alter column activity_id drop not null;


-- A linked Agenda moment may inherit its public context from a Presentation.
-- An independent Agenda item needs its own title and location.

alter table public.activity_occurrences
  drop constraint activity_occurrences_publication_consistent;

alter table public.activity_occurrences
  add constraint activity_occurrences_publication_consistent
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
      and (
        activity_id is not null
        or (
          title_override is not null
          and char_length(trim(title_override)) between 1 and 300
          and venue_name_override is not null
          and char_length(trim(venue_name_override)) between 1 and 300
          and city_override is not null
          and char_length(trim(city_override)) between 1 and 160
        )
      )
    )
  );


-- Agenda ownership is now available directly on the occurrence.

create or replace function private.can_manage_occurrence(
  target_occurrence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.activity_occurrences as ao
     where ao.id = target_occurrence_id
       and ao.deleted_at is null
       and private.can_manage_event_owner(ao.owner_profile_id)
  );
$$;


-- Validate linked and independent Agenda items and preserve immutable ownership.

create or replace function private.prepare_activity_occurrence_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  parent_visibility public.publication_status;
  parent_owner_profile_id uuid;
begin
  if new.activity_id is not null then
    select
      pa.visibility,
      pa.owner_profile_id
      into
        parent_visibility,
        parent_owner_profile_id
      from public.profile_activities as pa
     where pa.id = new.activity_id
       and pa.deleted_at is null;

    if parent_owner_profile_id is null then
      raise exception 'Agenda moments require an active parent Presentation.'
        using errcode = '23514';
    end if;

    if tg_op = 'INSERT' and new.owner_profile_id is null then
      new.owner_profile_id := parent_owner_profile_id;
    end if;

    if new.owner_profile_id is distinct from parent_owner_profile_id then
      raise exception 'The Agenda item and Presentation must have the same owner.'
        using errcode = '23514';
    end if;
  end if;

  if not exists (
    select 1
      from public.public_profiles as p
     where p.id = new.owner_profile_id
       and p.profile_type = 'artist'
       and p.deleted_at is null
  ) then
    raise exception 'Agenda items must belong to an active artist profile.'
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
      raise exception 'Agenda item ownership cannot be changed by an ordinary update.'
        using errcode = '42501';
    end if;

    if new.activity_id is distinct from old.activity_id then
      raise exception 'Agenda item Presentation linkage cannot be changed by an ordinary update.'
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
          raise exception 'Deleted Agenda items require a trusted restore or purge workflow.'
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

  if new.visibility = 'published' then
    if new.activity_id is not null
       and parent_visibility <> 'published' then
      raise exception 'An Agenda moment requires a published parent Presentation.'
        using errcode = '23514';
    end if;

    if new.activity_id is null
       and not private.is_published_profile(new.owner_profile_id) then
      raise exception 'An independent Agenda item requires a published artist profile.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


-- Public Agenda queries can now resolve linked and independent items.

drop index if exists public.activity_occurrences_public_agenda;

create index activity_occurrences_public_agenda
  on public.activity_occurrences (
    owner_profile_id,
    start_date,
    start_time,
    id
  )
  where visibility = 'published'
    and show_in_agenda
    and deleted_at is null;

create index activity_occurrences_owner_updated
  on public.activity_occurrences (
    owner_profile_id,
    updated_at desc,
    id
  )
  where deleted_at is null;


drop policy if exists
  activity_occurrences_guest_read_published
  on public.activity_occurrences;

create policy activity_occurrences_guest_read_published
on public.activity_occurrences
for select
to anon
using (
  visibility = 'published'
  and show_in_agenda
  and deleted_at is null
  and (select private.is_published_profile(owner_profile_id))
  and (
    activity_id is null
    or (select private.is_published_activity(activity_id))
  )
);


drop policy if exists
  activity_occurrences_authenticated_read
  on public.activity_occurrences;

create policy activity_occurrences_authenticated_read
on public.activity_occurrences
for select
to authenticated
using (
  (
    visibility = 'published'
    and show_in_agenda
    and deleted_at is null
    and (select private.is_published_profile(owner_profile_id))
    and (
      activity_id is null
      or (select private.is_published_activity(activity_id))
    )
  )
  or (
    deleted_at is null
    and (
      (select private.can_manage_activity_owner(owner_profile_id))
      or (select private.can_manage_event_owner(owner_profile_id))
    )
  )
);


drop policy if exists
  activity_occurrences_authenticated_insert
  on public.activity_occurrences;

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
  and (select private.can_manage_event_owner(owner_profile_id))
);


drop policy if exists
  activity_occurrences_authenticated_update
  on public.activity_occurrences;

create policy activity_occurrences_authenticated_update
on public.activity_occurrences
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and (select private.can_manage_event_owner(owner_profile_id))
)
with check (
  (select auth.uid()) is not null
  and updated_by_account_id = (select auth.uid())
  and (select private.can_manage_event_owner(owner_profile_id))
);


-- Linked inserts may continue deriving ownership in the trigger.
-- Independent Agenda items can supply owner_profile_id directly.

grant insert (
  owner_profile_id
) on public.activity_occurrences to authenticated;


comment on column public.activity_occurrences.owner_profile_id is
  'Artist profile that owns the Agenda item directly.';

comment on column public.activity_occurrences.activity_id is
  'Optional Presentation linked to this Agenda item.';