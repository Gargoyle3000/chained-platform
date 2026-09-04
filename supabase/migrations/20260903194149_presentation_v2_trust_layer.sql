-- Presentation v2 database trust layer: participants, Works, program, and
-- Presentation-specific co-operators. Presentation remains profile_activities.

create type public.presentation_work_status as enum (
  'pending',
  'accepted',
  'rejected'
);

create type public.presentation_cooperator_status as enum (
  'pending',
  'accepted',
  'declined',
  'revoked'
);

create table public.presentation_participants (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null
    references public.profile_activities (id) on delete cascade,
  linked_profile_id uuid
    references public.public_profiles (id) on delete set null,
  display_name varchar(300) not null,
  position integer not null default 0,
  is_visible boolean not null default true,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  updated_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_participants_display_name_nonempty
    check (char_length(trim(display_name)) between 1 and 300),
  constraint presentation_participants_position_nonnegative
    check (position >= 0),
  constraint presentation_participants_link_once
    unique (presentation_id, linked_profile_id)
);

create table public.presentation_works (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null
    references public.profile_activities (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  position integer not null default 0,
  is_visible boolean not null default true,
  status public.presentation_work_status not null,
  requested_by_account_id uuid references public.accounts (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by_account_id uuid references public.accounts (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_works_pair_unique
    unique (presentation_id, work_id),
  constraint presentation_works_position_nonnegative
    check (position >= 0),
  constraint presentation_works_decision_consistent
    check (
      (
        status = 'pending'
        and decided_by_account_id is null
        and decided_at is null
      )
      or (
        status in ('accepted', 'rejected')
        and decided_at is not null
      )
    )
);

create table public.presentation_cooperators (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null
    references public.profile_activities (id) on delete cascade,
  invited_account_id uuid not null
    references public.accounts (id) on delete cascade,
  invited_profile_id uuid
    references public.public_profiles (id) on delete set null,
  role varchar(40) not null default 'co_operator',
  status public.presentation_cooperator_status not null default 'pending',
  invited_by_account_id uuid references public.accounts (id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_cooperators_role_fixed
    check (role = 'co_operator'),
  constraint presentation_cooperators_lifecycle_consistent
    check (
      (
        status = 'pending'
        and responded_at is null
        and revoked_at is null
        and revoked_by_account_id is null
      )
      or (
        status in ('accepted', 'declined')
        and responded_at is not null
        and revoked_at is null
        and revoked_by_account_id is null
      )
      or (
        status = 'revoked'
        and revoked_at is not null
      )
    )
);

alter table public.activity_occurrences
  add column show_in_presentation boolean not null default false;

create index presentation_participants_order
  on public.presentation_participants (presentation_id, position, id);

create index presentation_participants_linked_profile
  on public.presentation_participants (linked_profile_id, presentation_id)
  where linked_profile_id is not null;

create index presentation_works_order
  on public.presentation_works (presentation_id, status, position, id);

create index presentation_works_work
  on public.presentation_works (work_id, status, presentation_id);

create unique index presentation_cooperators_one_active_invitation
  on public.presentation_cooperators (presentation_id, invited_account_id)
  where status in ('pending', 'accepted');

create index presentation_cooperators_account
  on public.presentation_cooperators (invited_account_id, status, presentation_id);

create index activity_occurrences_public_presentation
  on public.activity_occurrences (activity_id, start_date, start_time, id)
  where visibility = 'published'
    and show_in_presentation
    and deleted_at is null;


-- Authorization helpers

create function private.is_presentation_owner_account(target_presentation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.profile_activities as pa
        join public.profile_members as pm
          on pm.profile_id = pa.owner_profile_id
         and pm.account_id = auth.uid()
         and pm.membership_level = 'owner'
         and pm.status = 'active'
         and pm.revoked_at is null
       where pa.id = target_presentation_id
         and pa.deleted_at is null
    );
$$;

create function private.is_accepted_presentation_cooperator(
  target_presentation_id uuid
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
        from public.presentation_cooperators as pc
       where pc.presentation_id = target_presentation_id
         and pc.invited_account_id = auth.uid()
         and pc.role = 'co_operator'
         and pc.status = 'accepted'
         and pc.revoked_at is null
    );
$$;

create function private.can_manage_presentation_content(target_presentation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.profile_activities as pa
       where pa.id = target_presentation_id
         and pa.deleted_at is null
         and (
           private.can_manage_activity_owner(pa.owner_profile_id)
           or private.is_accepted_presentation_cooperator(pa.id)
         )
    );
$$;

create function private.can_manage_presentation_program(target_presentation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.profile_activities as pa
       where pa.id = target_presentation_id
         and pa.deleted_at is null
         and (
           private.can_manage_event_owner(pa.owner_profile_id)
           or private.is_accepted_presentation_cooperator(pa.id)
         )
    );
$$;

create or replace function private.is_published_activity(target_activity_id uuid)
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

create function private.is_public_presentation(target_presentation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profile_activities as pa
      join public.public_profiles as p
        on p.id = pa.owner_profile_id
     where pa.id = target_presentation_id
       and pa.visibility = 'published'
       and pa.published_at is not null
       and pa.show_in_presentations
       and pa.deleted_at is null
       and p.publication_status = 'published'
       and p.published_at is not null
       and p.show_presentations
       and p.deleted_at is null
  );
$$;

create or replace function private.can_manage_occurrence(target_occurrence_id uuid)
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
       and (
          (
            ao.activity_id is not null
            and (
              private.can_manage_event_owner(ao.owner_profile_id)
              or (
                not ao.show_in_agenda
                and private.is_accepted_presentation_cooperator(ao.activity_id)
              )
            )
          )
         or (
           ao.activity_id is null
           and private.can_manage_event_owner(ao.owner_profile_id)
         )
       )
  );
$$;

create function private.set_presentation_occurrence_visibility(
  target_occurrence_id uuid,
  target_show_in_presentation boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_presentation_id uuid;
begin
  if target_show_in_presentation is null then
    raise exception 'Presentation program visibility must be true or false.'
      using errcode = '22023';
  end if;

  select ao.activity_id
    into target_presentation_id
    from public.activity_occurrences as ao
   where ao.id = target_occurrence_id
     and ao.deleted_at is null
   for update;

  if not found
     or actor_id is null
     or target_presentation_id is null
     or not private.can_manage_presentation_program(target_presentation_id) then
    raise exception 'The Presentation program item may not be changed.'
      using errcode = '42501';
  end if;

  update public.activity_occurrences
     set show_in_presentation = target_show_in_presentation,
         updated_by_account_id = actor_id,
         updated_at = now()
   where id = target_occurrence_id;

  return true;
end;
$$;

revoke all on function private.is_presentation_owner_account(uuid)
  from public, anon, authenticated;
revoke all on function private.is_accepted_presentation_cooperator(uuid)
  from public, anon, authenticated;
revoke all on function private.can_manage_presentation_content(uuid)
  from public, anon, authenticated;
revoke all on function private.can_manage_presentation_program(uuid)
  from public, anon, authenticated;
revoke all on function private.set_presentation_occurrence_visibility(uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.is_public_presentation(uuid)
  from public;

grant execute on function private.is_presentation_owner_account(uuid)
  to authenticated;
grant execute on function private.is_accepted_presentation_cooperator(uuid)
  to authenticated;
grant execute on function private.can_manage_presentation_content(uuid)
  to authenticated;
grant execute on function private.can_manage_presentation_program(uuid)
  to authenticated;
grant execute on function private.set_presentation_occurrence_visibility(uuid, boolean)
  to authenticated;
grant execute on function private.is_public_presentation(uuid)
  to anon, authenticated;


-- Public parent and program boundaries.

drop policy if exists profile_activities_guest_read_published
  on public.profile_activities;
create policy profile_activities_guest_read_published
on public.profile_activities
for select
to anon
using ((select private.is_public_presentation(id)));

drop policy if exists profile_activities_authenticated_read
  on public.profile_activities;
create policy profile_activities_authenticated_read
on public.profile_activities
for select
to authenticated
using (
  (select private.is_public_presentation(id))
  or (
    deleted_at is null
    and (
      (select private.can_manage_activity_owner(owner_profile_id))
      or (select private.can_manage_event_owner(owner_profile_id))
      or (select private.can_manage_presentation_content(id))
    )
  )
);

drop policy if exists profile_activities_authenticated_update
  on public.profile_activities;
create policy profile_activities_authenticated_update
on public.profile_activities
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and (select private.can_manage_presentation_content(id))
)
with check (
  (select auth.uid()) is not null
  and (select private.can_manage_presentation_content(id))
  and updated_by_account_id = (select auth.uid())
);

drop policy if exists activity_occurrences_guest_read_published
  on public.activity_occurrences;
create policy activity_occurrences_guest_read_published
on public.activity_occurrences
for select
to anon
using (
  visibility = 'published'
  and published_at is not null
  and deleted_at is null
  and (
    (
      show_in_agenda
      and (select private.is_published_profile(owner_profile_id))
      and (
        activity_id is null
        or (select private.is_published_activity(activity_id))
      )
    )
    or (
      show_in_presentation
      and activity_id is not null
      and (select private.is_public_presentation(activity_id))
    )
  )
);

drop policy if exists activity_occurrences_authenticated_read
  on public.activity_occurrences;
create policy activity_occurrences_authenticated_read
on public.activity_occurrences
for select
to authenticated
using (
  (
    visibility = 'published'
    and published_at is not null
    and deleted_at is null
    and (
      (
        show_in_agenda
        and (select private.is_published_profile(owner_profile_id))
        and (
          activity_id is null
          or (select private.is_published_activity(activity_id))
        )
      )
      or (
        show_in_presentation
        and activity_id is not null
        and (select private.is_public_presentation(activity_id))
      )
    )
  )
  or (
    deleted_at is null
    and (
      (select private.can_manage_event_owner(owner_profile_id))
      or (
        activity_id is not null
        and (select private.can_manage_presentation_program(activity_id))
      )
    )
  )
);

drop policy if exists activity_occurrences_authenticated_insert
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
  and (
    (select private.can_manage_event_owner(owner_profile_id))
    or (
      activity_id is not null
      and (select private.can_manage_presentation_program(activity_id))
      and not show_in_agenda
    )
  )
);

drop policy if exists activity_occurrences_authenticated_update
  on public.activity_occurrences;
create policy activity_occurrences_authenticated_update
on public.activity_occurrences
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and (
    (select private.can_manage_event_owner(owner_profile_id))
    or (
      activity_id is not null
      and (select private.can_manage_presentation_program(activity_id))
      and not show_in_agenda
    )
  )
)
with check (
  (select auth.uid()) is not null
  and updated_by_account_id = (select auth.uid())
  and (
    (select private.can_manage_event_owner(owner_profile_id))
    or (
      activity_id is not null
      and (select private.can_manage_presentation_program(activity_id))
      and not show_in_agenda
    )
  )
);

grant insert (show_in_presentation)
  on public.activity_occurrences to authenticated;
grant update (show_in_presentation)
  on public.activity_occurrences to authenticated;
grant select (show_in_presentation)
  on public.activity_occurrences to anon;


-- Child-table RLS. Writes are RPC-only.

alter table public.presentation_participants enable row level security;
alter table public.presentation_participants force row level security;
alter table public.presentation_works enable row level security;
alter table public.presentation_works force row level security;
alter table public.presentation_cooperators enable row level security;
alter table public.presentation_cooperators force row level security;

create policy presentation_participants_guest_read
on public.presentation_participants
for select
to anon
using (
  is_visible
  and (select private.is_public_presentation(presentation_id))
);

create policy presentation_participants_authenticated_read
on public.presentation_participants
for select
to authenticated
using (
  (
    is_visible
    and (select private.is_public_presentation(presentation_id))
  )
  or (select private.can_manage_presentation_content(presentation_id))
);

create policy presentation_works_guest_read
on public.presentation_works
for select
to anon
using (
  status = 'accepted'
  and is_visible
  and (select private.is_public_presentation(presentation_id))
  and (select private.is_published_work(work_id))
);

create policy presentation_works_authenticated_read
on public.presentation_works
for select
to authenticated
using (
  (
    status = 'accepted'
    and is_visible
    and (select private.is_public_presentation(presentation_id))
    and (select private.is_published_work(work_id))
  )
  or (select private.can_manage_presentation_content(presentation_id))
  or (select private.can_manage_work(work_id))
);

create policy presentation_cooperators_authenticated_read
on public.presentation_cooperators
for select
to authenticated
using (
  invited_account_id = (select auth.uid())
  or (select private.is_presentation_owner_account(presentation_id))
);

revoke all on table public.presentation_participants from public, anon, authenticated;
revoke all on table public.presentation_works from public, anon, authenticated;
revoke all on table public.presentation_cooperators from public, anon, authenticated;

grant select (
  id,
  presentation_id,
  display_name,
  position,
  is_visible,
  created_at,
  updated_at
) on public.presentation_participants to anon, authenticated;

grant select (
  id,
  presentation_id,
  work_id,
  position,
  is_visible,
  status,
  created_at,
  updated_at
) on public.presentation_works to anon, authenticated;
grant select on public.presentation_cooperators to authenticated;


-- Participant RPCs

create function private.create_presentation_participant(
  target_presentation_id uuid,
  participant_display_name text,
  target_linked_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  participant_id uuid;
  next_position integer;
begin
  if actor_id is null
     or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Presentation participant may not be created.'
      using errcode = '42501';
  end if;

  if participant_display_name is null
     or char_length(trim(participant_display_name)) not between 1 and 300 then
    raise exception 'A participant display name is required.'
      using errcode = '22023';
  end if;

  if target_linked_profile_id is not null
     and not exists (
       select 1 from public.public_profiles as p
        where p.id = target_linked_profile_id and p.deleted_at is null
     ) then
    raise exception 'The linked profile is unavailable.' using errcode = '22023';
  end if;

  perform 1 from public.profile_activities
   where id = target_presentation_id and deleted_at is null for update;

  select coalesce(max(pp.position) + 1, 0)
    into next_position
    from public.presentation_participants as pp
   where pp.presentation_id = target_presentation_id;

  insert into public.presentation_participants (
    presentation_id, linked_profile_id, display_name, position,
    created_by_account_id, updated_by_account_id
  ) values (
    target_presentation_id, target_linked_profile_id,
    trim(participant_display_name), next_position, actor_id, actor_id
  ) returning id into participant_id;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.participant_created',
    'presentation_participant', participant_id,
    jsonb_build_object('presentation_id', target_presentation_id)
  );

  return participant_id;
end;
$$;

create function private.update_presentation_participant(
  target_participant_id uuid,
  participant_display_name text,
  target_linked_profile_id uuid,
  participant_is_visible boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  participant_row public.presentation_participants%rowtype;
begin
  select * into participant_row
    from public.presentation_participants
   where id = target_participant_id for update;

  if not found
     or actor_id is null
     or not private.can_manage_presentation_content(participant_row.presentation_id) then
    raise exception 'The Presentation participant may not be updated.'
      using errcode = '42501';
  end if;

  if participant_display_name is null
     or char_length(trim(participant_display_name)) not between 1 and 300
     or participant_is_visible is null then
    raise exception 'The participant values are invalid.' using errcode = '22023';
  end if;

  if target_linked_profile_id is not null
     and not exists (
       select 1 from public.public_profiles as p
        where p.id = target_linked_profile_id and p.deleted_at is null
     ) then
    raise exception 'The linked profile is unavailable.' using errcode = '22023';
  end if;

  update public.presentation_participants
     set display_name = trim(participant_display_name),
         linked_profile_id = target_linked_profile_id,
         is_visible = participant_is_visible,
         updated_by_account_id = actor_id,
         updated_at = now()
   where id = target_participant_id;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.participant_updated',
    'presentation_participant', target_participant_id,
    jsonb_build_object('presentation_id', participant_row.presentation_id)
  );
  return true;
end;
$$;

create function private.remove_presentation_participant(target_participant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  participant_row public.presentation_participants%rowtype;
begin
  select * into participant_row
    from public.presentation_participants
   where id = target_participant_id for update;

  if not found
     or actor_id is null
     or not private.can_manage_presentation_content(participant_row.presentation_id) then
    raise exception 'The Presentation participant may not be removed.'
      using errcode = '42501';
  end if;

  delete from public.presentation_participants where id = target_participant_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.participant_removed',
    'presentation_participant', target_participant_id,
    jsonb_build_object('presentation_id', participant_row.presentation_id)
  );
  return true;
end;
$$;

create function private.reorder_presentation_participants(
  target_presentation_id uuid,
  ordered_participant_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
     or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Presentation participants may not be reordered.'
      using errcode = '42501';
  end if;

  if ordered_participant_ids is null
     or cardinality(ordered_participant_ids) <> (
       select count(*) from public.presentation_participants
        where presentation_id = target_presentation_id
     )
     or cardinality(ordered_participant_ids) <> (
       select count(distinct item_id)
         from unnest(ordered_participant_ids) as item_id
     )
     or exists (
       select 1 from unnest(ordered_participant_ids) as item_id
        where not exists (
          select 1 from public.presentation_participants as pp
           where pp.id = item_id
             and pp.presentation_id = target_presentation_id
        )
     ) then
    raise exception 'The participant order must contain every participant exactly once.'
      using errcode = '22023';
  end if;

  update public.presentation_participants as pp
     set position = ordered.ordinality - 1,
         updated_by_account_id = actor_id,
         updated_at = now()
    from unnest(ordered_participant_ids) with ordinality as ordered(id, ordinality)
   where pp.id = ordered.id
     and pp.presentation_id = target_presentation_id;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id
  ) values (
    actor_id, 'presentation.participants_reordered',
    'profile_activity', target_presentation_id
  );
  return true;
end;
$$;


-- Co-operator invitation RPCs

create function private.invite_presentation_cooperator(
  target_presentation_id uuid,
  target_account_id uuid,
  target_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_id uuid;
begin
  if actor_id is null
     or not private.is_presentation_owner_account(target_presentation_id) then
    raise exception 'Only the Presentation owner may invite co-operators.'
      using errcode = '42501';
  end if;

  if target_account_id = actor_id
     or not exists (
       select 1 from public.accounts as a
        where a.id = target_account_id and a.status = 'active'
     ) then
    raise exception 'The invited account is unavailable.' using errcode = '22023';
  end if;

  if target_profile_id is not null
     and not exists (
       select 1
         from public.public_profiles as p
         join public.profile_members as pm on pm.profile_id = p.id
        where p.id = target_profile_id
          and p.deleted_at is null
          and pm.account_id = target_account_id
          and pm.status = 'active'
          and pm.revoked_at is null
     ) then
    raise exception 'The invited profile does not belong to the invited account.'
      using errcode = '22023';
  end if;

  insert into public.presentation_cooperators (
    presentation_id, invited_account_id, invited_profile_id,
    invited_by_account_id
  ) values (
    target_presentation_id, target_account_id, target_profile_id, actor_id
  ) returning id into invitation_id;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.cooperator_invited',
    'presentation_cooperator', invitation_id,
    jsonb_build_object('presentation_id', target_presentation_id)
  );
  return invitation_id;
end;
$$;

create function private.accept_presentation_cooperator(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_row public.presentation_cooperators%rowtype;
begin
  select * into invitation_row from public.presentation_cooperators
   where id = target_invitation_id for update;
  if not found
     or actor_id is null
     or invitation_row.invited_account_id <> actor_id
     or invitation_row.status <> 'pending'
     or not private.current_account_is_active() then
    raise exception 'The co-operator invitation may not be accepted.'
      using errcode = '42501';
  end if;

  update public.presentation_cooperators
     set status = 'accepted', responded_at = now(), updated_at = now()
   where id = target_invitation_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.cooperator_accepted',
    'presentation_cooperator', target_invitation_id,
    jsonb_build_object('presentation_id', invitation_row.presentation_id)
  );
  return true;
end;
$$;

create function private.decline_presentation_cooperator(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_row public.presentation_cooperators%rowtype;
begin
  select * into invitation_row from public.presentation_cooperators
   where id = target_invitation_id for update;
  if not found
     or actor_id is null
     or invitation_row.invited_account_id <> actor_id
     or invitation_row.status <> 'pending'
     or not private.current_account_is_active() then
    raise exception 'The co-operator invitation may not be declined.'
      using errcode = '42501';
  end if;

  update public.presentation_cooperators
     set status = 'declined', responded_at = now(), updated_at = now()
   where id = target_invitation_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.cooperator_declined',
    'presentation_cooperator', target_invitation_id,
    jsonb_build_object('presentation_id', invitation_row.presentation_id)
  );
  return true;
end;
$$;

create function private.revoke_presentation_cooperator(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invitation_row public.presentation_cooperators%rowtype;
begin
  select * into invitation_row from public.presentation_cooperators
   where id = target_invitation_id for update;
  if not found
     or actor_id is null
     or not private.is_presentation_owner_account(invitation_row.presentation_id)
     or invitation_row.status not in ('pending', 'accepted') then
    raise exception 'The co-operator invitation may not be revoked.'
      using errcode = '42501';
  end if;

  update public.presentation_cooperators
     set status = 'revoked', revoked_at = now(),
         revoked_by_account_id = actor_id, updated_at = now()
   where id = target_invitation_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.cooperator_revoked',
    'presentation_cooperator', target_invitation_id,
    jsonb_build_object('presentation_id', invitation_row.presentation_id)
  );
  return true;
end;
$$;


-- Work-association RPCs

create function private.propose_presentation_work(
  target_presentation_id uuid,
  target_work_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  work_owner_profile_id uuid;
  association_id uuid;
  association_status public.presentation_work_status;
  next_position integer;
  caller_manages_work boolean;
begin
  if actor_id is null
     or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Work may not be proposed to this Presentation.'
      using errcode = '42501';
  end if;

  perform 1 from public.profile_activities
   where id = target_presentation_id and deleted_at is null for update;
  select w.owner_profile_id
    into work_owner_profile_id
    from public.works as w
   where w.id = target_work_id
     and w.deleted_at is null
   for update;

  if work_owner_profile_id is null then
    raise exception 'The Work is unavailable.' using errcode = '22023';
  end if;

  caller_manages_work := private.can_manage_work(target_work_id);
  if not caller_manages_work then
    if not private.is_published_work(target_work_id)
       or not exists (
         select 1 from public.presentation_participants as pp
          where pp.presentation_id = target_presentation_id
            and pp.linked_profile_id = work_owner_profile_id
       ) then
      raise exception 'A foreign Work requires its artist as a linked participant.'
        using errcode = '42501';
    end if;
  end if;

  select pw.id, pw.status
    into association_id, association_status
    from public.presentation_works as pw
   where pw.presentation_id = target_presentation_id
     and pw.work_id = target_work_id
   for update;

  if association_id is not null and association_status in ('pending', 'accepted') then
    return association_id;
  end if;

  if association_id is null then
    select coalesce(max(pw.position) + 1, 0)
      into next_position
      from public.presentation_works as pw
     where pw.presentation_id = target_presentation_id;

    insert into public.presentation_works (
      presentation_id, work_id, position, status,
      requested_by_account_id, decided_by_account_id, decided_at
    ) values (
      target_presentation_id, target_work_id, next_position,
      case
        when caller_manages_work then 'accepted'::public.presentation_work_status
        else 'pending'::public.presentation_work_status
      end,
      actor_id,
      case when caller_manages_work then actor_id else null end,
      case when caller_manages_work then now() else null end
    ) returning id into association_id;
  else
    update public.presentation_works
       set status = case
             when caller_manages_work then 'accepted'::public.presentation_work_status
             else 'pending'::public.presentation_work_status
           end,
           is_visible = true,
           requested_by_account_id = actor_id,
           requested_at = now(),
           decided_by_account_id = case when caller_manages_work then actor_id else null end,
           decided_at = case when caller_manages_work then now() else null end,
           updated_at = now()
     where id = association_id;
  end if;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, result, metadata
  ) values (
    actor_id, 'presentation.work_proposed', 'presentation_work', association_id,
    case when caller_manages_work then 'accepted' else 'pending' end,
    jsonb_build_object(
      'presentation_id', target_presentation_id,
      'work_id', target_work_id
    )
  );
  return association_id;
end;
$$;

create function private.decide_presentation_work(
  target_association_id uuid,
  target_decision public.presentation_work_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  association_row public.presentation_works%rowtype;
begin
  select * into association_row from public.presentation_works
   where id = target_association_id for update;

  if target_decision not in ('accepted', 'rejected') then
    raise exception 'The Work decision must be accepted or rejected.'
      using errcode = '22023';
  end if;

  if not found
     or actor_id is null
     or association_row.status <> 'pending'
     or not private.can_manage_work(association_row.work_id) then
    raise exception 'Only the Work manager may decide this proposal.'
      using errcode = '42501';
  end if;

  update public.presentation_works
     set status = target_decision,
         decided_by_account_id = actor_id,
         decided_at = now(),
         updated_at = now()
   where id = target_association_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, result, metadata
  ) values (
    actor_id, 'presentation.work_decided', 'presentation_work',
    target_association_id, target_decision::text,
    jsonb_build_object(
      'presentation_id', association_row.presentation_id,
      'work_id', association_row.work_id
    )
  );
  return true;
end;
$$;

create function private.set_presentation_work_visibility(
  target_association_id uuid,
  target_is_visible boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  association_row public.presentation_works%rowtype;
begin
  select * into association_row from public.presentation_works
   where id = target_association_id for update;
  if not found
     or actor_id is null
     or target_is_visible is null
     or not (
       private.can_manage_presentation_content(association_row.presentation_id)
       or private.can_manage_work(association_row.work_id)
     ) then
    raise exception 'The Presentation Work visibility may not be changed.'
      using errcode = '42501';
  end if;
  update public.presentation_works
     set is_visible = target_is_visible, updated_at = now()
   where id = target_association_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.work_visibility_changed',
    'presentation_work', target_association_id,
    jsonb_build_object('is_visible', target_is_visible)
  );
  return true;
end;
$$;

create function private.remove_presentation_work(target_association_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  association_row public.presentation_works%rowtype;
begin
  select * into association_row from public.presentation_works
   where id = target_association_id for update;
  if not found
     or actor_id is null
     or not (
       private.can_manage_presentation_content(association_row.presentation_id)
       or private.can_manage_work(association_row.work_id)
     ) then
    raise exception 'The Presentation Work association may not be removed.'
      using errcode = '42501';
  end if;
  delete from public.presentation_works where id = target_association_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.work_removed', 'presentation_work',
    target_association_id,
    jsonb_build_object(
      'presentation_id', association_row.presentation_id,
      'work_id', association_row.work_id
    )
  );
  return true;
end;
$$;

create function private.reorder_presentation_works(
  target_presentation_id uuid,
  ordered_association_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
     or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Presentation Works may not be reordered.'
      using errcode = '42501';
  end if;

  if ordered_association_ids is null
     or cardinality(ordered_association_ids) <> (
       select count(*) from public.presentation_works
        where presentation_id = target_presentation_id
     )
     or cardinality(ordered_association_ids) <> (
       select count(distinct item_id)
         from unnest(ordered_association_ids) as item_id
     )
     or exists (
       select 1 from unnest(ordered_association_ids) as item_id
        where not exists (
          select 1 from public.presentation_works as pw
           where pw.id = item_id
             and pw.presentation_id = target_presentation_id
        )
     ) then
    raise exception 'The Work order must contain every association exactly once.'
      using errcode = '22023';
  end if;

  update public.presentation_works as pw
     set position = ordered.ordinality - 1,
         updated_at = now()
    from unnest(ordered_association_ids) with ordinality as ordered(id, ordinality)
   where pw.id = ordered.id
     and pw.presentation_id = target_presentation_id;
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id
  ) values (
    actor_id, 'presentation.works_reordered',
    'profile_activity', target_presentation_id
  );
  return true;
end;
$$;


-- Safe public participant projection. A private linked profile produces no
-- profile identifier or profile fields; the historical display name remains.

create function private.get_public_presentation_participants(
  target_presentation_id uuid
)
returns table (
  participant_id uuid,
  display_name varchar,
  participant_position integer,
  linked_profile_id uuid,
  linked_profile_slug varchar,
  linked_profile_display_name varchar
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.id,
    pp.display_name,
    pp.position,
    case when private.is_published_profile(p.id) then p.id end,
    case when private.is_published_profile(p.id) then p.slug end,
    case when private.is_published_profile(p.id) then p.display_name end
  from public.presentation_participants as pp
  left join public.public_profiles as p on p.id = pp.linked_profile_id
  where pp.presentation_id = target_presentation_id
    and pp.is_visible
    and private.is_public_presentation(pp.presentation_id)
  order by pp.position, pp.id;
$$;

create function private.get_public_activity_source_contexts(
  target_activity_ids uuid[]
)
returns table (
  activity_id uuid,
  owner_profile_id uuid,
  title varchar,
  activity_type varchar,
  venue_name varchar,
  city varchar,
  country varchar,
  start_date date,
  end_date date,
  external_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pa.id,
    pa.owner_profile_id,
    pa.title,
    pa.activity_type,
    pa.venue_name,
    pa.city,
    pa.country,
    case when eligibility.cv_eligible then pa.start_date end,
    case when eligibility.cv_eligible then pa.end_date end,
    case when eligibility.cv_eligible then pa.external_url end
  from public.profile_activities as pa
  cross join lateral (
    select
      exists (
        select 1
          from public.activity_occurrences as ao
         where ao.activity_id = pa.id
           and ao.owner_profile_id = pa.owner_profile_id
           and ao.visibility = 'published'
           and ao.published_at is not null
           and ao.show_in_agenda
           and ao.deleted_at is null
           and private.is_published_profile(ao.owner_profile_id)
      ) as agenda_eligible,
      exists (
        select 1
          from public.cv_entries as entry
         where entry.source_activity_id = pa.id
           and entry.is_visible
           and private.is_public_cv_source(pa.id)
           and private.is_public_cv_category(entry.category_id)
      ) as cv_eligible
  ) as eligibility
  where pa.id = any(coalesce(target_activity_ids, '{}'::uuid[]))
    and private.is_published_activity(pa.id)
    and (eligibility.agenda_eligible or eligibility.cv_eligible)
  order by pa.id;
$$;

create function private.get_managed_presentation_participants(
  target_presentation_id uuid
)
returns setof public.presentation_participants
language sql
stable
security definer
set search_path = ''
as $$
  select pp.*
    from public.presentation_participants as pp
   where pp.presentation_id = target_presentation_id
     and private.can_manage_presentation_content(target_presentation_id)
   order by pp.position, pp.id;
$$;

create function private.get_managed_presentation_works(
  target_presentation_id uuid
)
returns setof public.presentation_works
language sql
stable
security definer
set search_path = ''
as $$
  select pw.*
    from public.presentation_works as pw
   where pw.presentation_id = target_presentation_id
     and private.can_manage_presentation_content(target_presentation_id)
   order by pw.position, pw.id;
$$;

create function private.get_work_presentation_requests(target_work_id uuid)
returns setof public.presentation_works
language sql
stable
security definer
set search_path = ''
as $$
  select pw.*
    from public.presentation_works as pw
   where pw.work_id = target_work_id
     and private.can_manage_work(target_work_id)
   order by pw.requested_at desc, pw.id;
$$;

create function private.get_work_presentation_request_summaries(
  target_work_id uuid
)
returns table (
  association_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  work_id uuid,
  work_title varchar,
  request_status public.presentation_work_status,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pw.id,
    pw.presentation_id,
    pa.title,
    host_profile.display_name,
    pw.work_id,
    w.title,
    pw.status,
    pw.requested_at
  from public.presentation_works as pw
  join public.profile_activities as pa
    on pa.id = pw.presentation_id
   and pa.deleted_at is null
  join public.public_profiles as host_profile
    on host_profile.id = pa.owner_profile_id
   and host_profile.deleted_at is null
  join public.works as w
    on w.id = pw.work_id
   and w.deleted_at is null
  where pw.work_id = target_work_id
    and private.can_manage_work(target_work_id)
  order by pw.requested_at desc, pw.id;
$$;

create function private.get_presentation_cooperator_invitation_summaries()
returns table (
  invitation_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  invitation_status public.presentation_cooperator_status,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pc.id,
    pc.presentation_id,
    pa.title,
    host_profile.display_name,
    pc.status,
    pc.invited_at
  from public.presentation_cooperators as pc
  join public.profile_activities as pa
    on pa.id = pc.presentation_id
   and pa.deleted_at is null
  join public.public_profiles as host_profile
    on host_profile.id = pa.owner_profile_id
   and host_profile.deleted_at is null
  where pc.invited_account_id = auth.uid()
    and private.current_account_is_active()
  order by pc.invited_at desc, pc.id;
$$;

-- Public RPC exposure is explicit; no child table has direct write grants.

create function public.set_presentation_occurrence_visibility(
  target_occurrence_id uuid,
  target_show_in_presentation boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_presentation_occurrence_visibility(
    target_occurrence_id,
    target_show_in_presentation
  );
$$;

create function public.create_presentation_participant(
  target_presentation_id uuid,
  participant_display_name text,
  target_linked_profile_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_presentation_participant(
    target_presentation_id,
    participant_display_name,
    target_linked_profile_id
  );
$$;

create function public.update_presentation_participant(
  target_participant_id uuid,
  participant_display_name text,
  target_linked_profile_id uuid,
  participant_is_visible boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_presentation_participant(
    target_participant_id,
    participant_display_name,
    target_linked_profile_id,
    participant_is_visible
  );
$$;

create function public.remove_presentation_participant(target_participant_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.remove_presentation_participant(target_participant_id);
$$;

create function public.reorder_presentation_participants(
  target_presentation_id uuid,
  ordered_participant_ids uuid[]
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.reorder_presentation_participants(
    target_presentation_id,
    ordered_participant_ids
  );
$$;

create function public.invite_presentation_cooperator(
  target_presentation_id uuid,
  target_account_id uuid,
  target_profile_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.invite_presentation_cooperator(
    target_presentation_id,
    target_account_id,
    target_profile_id
  );
$$;

create function public.accept_presentation_cooperator(target_invitation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.accept_presentation_cooperator(target_invitation_id);
$$;

create function public.decline_presentation_cooperator(target_invitation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.decline_presentation_cooperator(target_invitation_id);
$$;

create function public.revoke_presentation_cooperator(target_invitation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_presentation_cooperator(target_invitation_id);
$$;

create function public.propose_presentation_work(
  target_presentation_id uuid,
  target_work_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.propose_presentation_work(
    target_presentation_id,
    target_work_id
  );
$$;

create function public.decide_presentation_work(
  target_association_id uuid,
  target_decision public.presentation_work_status
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.decide_presentation_work(
    target_association_id,
    target_decision
  );
$$;

create function public.set_presentation_work_visibility(
  target_association_id uuid,
  target_is_visible boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_presentation_work_visibility(
    target_association_id,
    target_is_visible
  );
$$;

create function public.remove_presentation_work(target_association_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.remove_presentation_work(target_association_id);
$$;

create function public.reorder_presentation_works(
  target_presentation_id uuid,
  ordered_association_ids uuid[]
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.reorder_presentation_works(
    target_presentation_id,
    ordered_association_ids
  );
$$;

create function public.get_public_presentation_participants(
  target_presentation_id uuid
)
returns table (
  participant_id uuid,
  display_name varchar,
  participant_position integer,
  linked_profile_id uuid,
  linked_profile_slug varchar,
  linked_profile_display_name varchar
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_public_presentation_participants(target_presentation_id);
$$;

create function public.get_public_activity_source_contexts(
  target_activity_ids uuid[]
)
returns table (
  activity_id uuid,
  owner_profile_id uuid,
  title varchar,
  activity_type varchar,
  venue_name varchar,
  city varchar,
  country varchar,
  start_date date,
  end_date date,
  external_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_public_activity_source_contexts(target_activity_ids);
$$;

create function public.get_managed_presentation_participants(
  target_presentation_id uuid
)
returns setof public.presentation_participants
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_managed_presentation_participants(target_presentation_id);
$$;

create function public.get_managed_presentation_works(
  target_presentation_id uuid
)
returns setof public.presentation_works
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_managed_presentation_works(target_presentation_id);
$$;

create function public.get_work_presentation_requests(target_work_id uuid)
returns setof public.presentation_works
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_work_presentation_requests(target_work_id);
$$;

create function public.get_work_presentation_request_summaries(
  target_work_id uuid
)
returns table (
  association_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  work_id uuid,
  work_title varchar,
  request_status public.presentation_work_status,
  requested_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_work_presentation_request_summaries(target_work_id);
$$;

create function public.get_presentation_cooperator_invitation_summaries()
returns table (
  invitation_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  invitation_status public.presentation_cooperator_status,
  invited_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_presentation_cooperator_invitation_summaries();
$$;

revoke all on function private.create_presentation_participant(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function private.update_presentation_participant(uuid, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.remove_presentation_participant(uuid)
  from public, anon, authenticated;
revoke all on function private.reorder_presentation_participants(uuid, uuid[])
  from public, anon, authenticated;
revoke all on function private.invite_presentation_cooperator(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.accept_presentation_cooperator(uuid)
  from public, anon, authenticated;
revoke all on function private.decline_presentation_cooperator(uuid)
  from public, anon, authenticated;
revoke all on function private.revoke_presentation_cooperator(uuid)
  from public, anon, authenticated;
revoke all on function private.propose_presentation_work(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.decide_presentation_work(uuid, public.presentation_work_status)
  from public, anon, authenticated;
revoke all on function private.set_presentation_work_visibility(uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.remove_presentation_work(uuid)
  from public, anon, authenticated;
revoke all on function private.reorder_presentation_works(uuid, uuid[])
  from public, anon, authenticated;
revoke all on function private.get_public_presentation_participants(uuid)
  from public, anon, authenticated;
revoke all on function private.get_public_activity_source_contexts(uuid[])
  from public, anon, authenticated;
revoke all on function private.get_managed_presentation_participants(uuid)
  from public, anon, authenticated;
revoke all on function private.get_managed_presentation_works(uuid)
  from public, anon, authenticated;
revoke all on function private.get_work_presentation_requests(uuid)
  from public, anon, authenticated;
revoke all on function private.get_work_presentation_request_summaries(uuid)
  from public, anon, authenticated;
revoke all on function private.get_presentation_cooperator_invitation_summaries()
  from public, anon, authenticated;

grant execute on function private.create_presentation_participant(uuid, text, uuid)
  to authenticated;
grant execute on function private.update_presentation_participant(uuid, text, uuid, boolean)
  to authenticated;
grant execute on function private.remove_presentation_participant(uuid)
  to authenticated;
grant execute on function private.reorder_presentation_participants(uuid, uuid[])
  to authenticated;
grant execute on function private.invite_presentation_cooperator(uuid, uuid, uuid)
  to authenticated;
grant execute on function private.accept_presentation_cooperator(uuid)
  to authenticated;
grant execute on function private.decline_presentation_cooperator(uuid)
  to authenticated;
grant execute on function private.revoke_presentation_cooperator(uuid)
  to authenticated;
grant execute on function private.propose_presentation_work(uuid, uuid)
  to authenticated;
grant execute on function private.decide_presentation_work(uuid, public.presentation_work_status)
  to authenticated;
grant execute on function private.set_presentation_work_visibility(uuid, boolean)
  to authenticated;
grant execute on function private.remove_presentation_work(uuid)
  to authenticated;
grant execute on function private.reorder_presentation_works(uuid, uuid[])
  to authenticated;
grant execute on function private.get_public_presentation_participants(uuid)
  to anon, authenticated;
grant execute on function private.get_public_activity_source_contexts(uuid[])
  to anon, authenticated;
grant execute on function private.get_managed_presentation_participants(uuid)
  to authenticated;
grant execute on function private.get_managed_presentation_works(uuid)
  to authenticated;
grant execute on function private.get_work_presentation_requests(uuid)
  to authenticated;
grant execute on function private.get_work_presentation_request_summaries(uuid)
  to authenticated;
grant execute on function private.get_presentation_cooperator_invitation_summaries()
  to authenticated;

revoke all on function public.create_presentation_participant(uuid, text, uuid)
  from public, anon;
revoke all on function public.set_presentation_occurrence_visibility(uuid, boolean)
  from public, anon;
revoke all on function public.update_presentation_participant(uuid, text, uuid, boolean)
  from public, anon;
revoke all on function public.remove_presentation_participant(uuid)
  from public, anon;
revoke all on function public.reorder_presentation_participants(uuid, uuid[])
  from public, anon;
revoke all on function public.invite_presentation_cooperator(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.accept_presentation_cooperator(uuid)
  from public, anon;
revoke all on function public.decline_presentation_cooperator(uuid)
  from public, anon;
revoke all on function public.revoke_presentation_cooperator(uuid)
  from public, anon;
revoke all on function public.propose_presentation_work(uuid, uuid)
  from public, anon;
revoke all on function public.decide_presentation_work(uuid, public.presentation_work_status)
  from public, anon;
revoke all on function public.set_presentation_work_visibility(uuid, boolean)
  from public, anon;
revoke all on function public.remove_presentation_work(uuid)
  from public, anon;
revoke all on function public.reorder_presentation_works(uuid, uuid[])
  from public, anon;
revoke all on function public.get_public_presentation_participants(uuid)
  from public;
revoke all on function public.get_public_activity_source_contexts(uuid[])
  from public;
revoke all on function public.get_managed_presentation_participants(uuid)
  from public, anon;
revoke all on function public.get_managed_presentation_works(uuid)
  from public, anon;
revoke all on function public.get_work_presentation_requests(uuid)
  from public, anon;
revoke all on function public.get_work_presentation_request_summaries(uuid)
  from public, anon;
revoke all on function public.get_presentation_cooperator_invitation_summaries()
  from public, anon;

grant execute on function public.create_presentation_participant(uuid, text, uuid)
  to authenticated;
grant execute on function public.set_presentation_occurrence_visibility(uuid, boolean)
  to authenticated;
grant execute on function public.update_presentation_participant(uuid, text, uuid, boolean)
  to authenticated;
grant execute on function public.remove_presentation_participant(uuid)
  to authenticated;
grant execute on function public.reorder_presentation_participants(uuid, uuid[])
  to authenticated;
grant execute on function public.invite_presentation_cooperator(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.accept_presentation_cooperator(uuid)
  to authenticated;
grant execute on function public.decline_presentation_cooperator(uuid)
  to authenticated;
grant execute on function public.revoke_presentation_cooperator(uuid)
  to authenticated;
grant execute on function public.propose_presentation_work(uuid, uuid)
  to authenticated;
grant execute on function public.decide_presentation_work(uuid, public.presentation_work_status)
  to authenticated;
grant execute on function public.set_presentation_work_visibility(uuid, boolean)
  to authenticated;
grant execute on function public.remove_presentation_work(uuid)
  to authenticated;
grant execute on function public.reorder_presentation_works(uuid, uuid[])
  to authenticated;
grant execute on function public.get_public_presentation_participants(uuid)
  to anon, authenticated;
grant execute on function public.get_public_activity_source_contexts(uuid[])
  to anon, authenticated;
grant execute on function public.get_managed_presentation_participants(uuid)
  to authenticated;
grant execute on function public.get_managed_presentation_works(uuid)
  to authenticated;
grant execute on function public.get_work_presentation_requests(uuid)
  to authenticated;
grant execute on function public.get_work_presentation_request_summaries(uuid)
  to authenticated;
grant execute on function public.get_presentation_cooperator_invitation_summaries()
  to authenticated;

comment on table public.presentation_participants is
  'Presentation-owned historical participant names with optional profile linkage.';
comment on table public.presentation_works is
  'Context-only Presentation-to-Work associations; Work remains authoritative.';
comment on table public.presentation_cooperators is
  'Presentation-scoped invitations that never grant authority over Works.';
comment on column public.activity_occurrences.show_in_presentation is
  'Independently controls inclusion in a public Presentation program.';
