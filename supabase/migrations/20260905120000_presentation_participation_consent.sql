-- Cross-account consent for surfacing a Presentation in a linked Artist's own history.

create type public.presentation_participation_status as enum (
  'pending',
  'accepted',
  'declined',
  'revoked'
);

create table public.presentation_participation_consents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.presentation_participants (id)
    on update cascade on delete cascade,
  linked_profile_id uuid not null references public.public_profiles (id) on delete cascade,
  status public.presentation_participation_status not null default 'pending',
  requested_by_account_id uuid references public.accounts (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by_account_id uuid references public.accounts (id) on delete set null,
  decided_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_participation_consents_pair_unique
    unique (participant_id, linked_profile_id),
  constraint presentation_participation_consents_lifecycle_consistent
    check (
      (status = 'pending' and decided_by_account_id is null and decided_at is null and revoked_at is null)
      or (status in ('accepted', 'declined') and decided_at is not null and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create index presentation_participation_consents_profile_pending
  on public.presentation_participation_consents (linked_profile_id, status, requested_at desc, id);

alter table public.presentation_participation_consents enable row level security;
alter table public.presentation_participation_consents force row level security;
revoke all on table public.presentation_participation_consents from public, anon, authenticated;

create function private.ensure_presentation_participation_consent(
  target_participant_id uuid,
  target_profile_id uuid,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  consent_id uuid;
  presentation_id uuid;
begin
  if target_profile_id is null then
    return null;
  end if;

  select pp.presentation_id into presentation_id
    from public.presentation_participants as pp
   where pp.id = target_participant_id
     and pp.linked_profile_id = target_profile_id;

  if presentation_id is null then
    return null;
  end if;

  insert into public.presentation_participation_consents (
    participant_id, linked_profile_id, requested_by_account_id
  ) values (
    target_participant_id, target_profile_id, actor_id
  ) on conflict (participant_id, linked_profile_id) do nothing
  returning id into consent_id;

  if consent_id is not null then
    insert into public.audit_events (
      actor_account_id, action, target_type, target_id, result, metadata
    ) values (
      actor_id, 'presentation.participation_requested',
      'presentation_participation_consent', consent_id, 'pending',
      jsonb_build_object('presentation_id', presentation_id)
    );
  end if;

  return consent_id;
end;
$$;

create or replace function private.create_presentation_participant(
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
  if actor_id is null or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Presentation participant may not be created.' using errcode = '42501';
  end if;
  if participant_display_name is null or char_length(trim(participant_display_name)) not between 1 and 300 then
    raise exception 'A participant display name is required.' using errcode = '22023';
  end if;
  if target_linked_profile_id is not null and not private.is_selectable_presentation_artist_profile(target_linked_profile_id) then
    raise exception 'The linked profile is unavailable.' using errcode = '22023';
  end if;

  perform 1 from public.profile_activities where id = target_presentation_id and deleted_at is null for update;
  select coalesce(max(pp.position) + 1, 0) into next_position
    from public.presentation_participants as pp where pp.presentation_id = target_presentation_id;
  insert into public.presentation_participants (
    presentation_id, linked_profile_id, display_name, position, created_by_account_id, updated_by_account_id
  ) values (
    target_presentation_id, target_linked_profile_id, trim(participant_display_name), next_position, actor_id, actor_id
  ) returning id into participant_id;

  perform private.ensure_presentation_participation_consent(participant_id, target_linked_profile_id, actor_id);
  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (actor_id, 'presentation.participant_created', 'presentation_participant', participant_id,
          jsonb_build_object('presentation_id', target_presentation_id));
  return participant_id;
end;
$$;

create or replace function private.update_presentation_participant(
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
  select * into participant_row from public.presentation_participants where id = target_participant_id for update;
  if not found or actor_id is null or not private.can_manage_presentation_content(participant_row.presentation_id) then
    raise exception 'The Presentation participant may not be updated.' using errcode = '42501';
  end if;
  if participant_display_name is null or char_length(trim(participant_display_name)) not between 1 and 300 or participant_is_visible is null then
    raise exception 'The participant values are invalid.' using errcode = '22023';
  end if;
  if target_linked_profile_id is not null and target_linked_profile_id is distinct from participant_row.linked_profile_id
     and not private.is_selectable_presentation_artist_profile(target_linked_profile_id) then
    raise exception 'The linked profile is unavailable.' using errcode = '22023';
  end if;

  update public.presentation_participants
     set display_name = trim(participant_display_name), linked_profile_id = target_linked_profile_id,
         is_visible = participant_is_visible, updated_by_account_id = actor_id, updated_at = now()
   where id = target_participant_id;
  if target_linked_profile_id is not null and target_linked_profile_id is distinct from participant_row.linked_profile_id then
    perform private.ensure_presentation_participation_consent(target_participant_id, target_linked_profile_id, actor_id);
  end if;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (actor_id, 'presentation.participant_updated', 'presentation_participant', target_participant_id,
          jsonb_build_object('presentation_id', participant_row.presentation_id));
  return true;
end;
$$;

create or replace function private.set_presentation_participant_profile(
  target_participant_id uuid,
  target_profile_id uuid default null
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
  select * into participant_row from public.presentation_participants where id = target_participant_id for update;
  if not found or actor_id is null or not private.can_manage_presentation_content(participant_row.presentation_id) then
    raise exception 'The Presentation participant profile may not be changed.' using errcode = '42501';
  end if;
  if target_profile_id is not null and not private.is_selectable_presentation_artist_profile(target_profile_id) then
    raise exception 'The linked profile is unavailable.' using errcode = '22023';
  end if;

  update public.presentation_participants
     set linked_profile_id = target_profile_id, updated_by_account_id = actor_id, updated_at = now()
   where id = target_participant_id;
  if target_profile_id is not null and target_profile_id is distinct from participant_row.linked_profile_id then
    perform private.ensure_presentation_participation_consent(target_participant_id, target_profile_id, actor_id);
  end if;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (actor_id, 'presentation.participant_profile_changed', 'presentation_participant', target_participant_id,
          jsonb_build_object('presentation_id', participant_row.presentation_id, 'linked', target_profile_id is not null));
  return true;
end;
$$;

create function private.get_my_presentation_participation_request_summaries()
returns table (
  consent_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  participant_display_name varchar,
  consent_status public.presentation_participation_status,
  requested_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select pc.id, pa.id, pa.title, host.display_name, pp.display_name, pc.status, pc.requested_at
    from public.presentation_participation_consents as pc
    join public.presentation_participants as pp on pp.id = pc.participant_id
    join public.profile_activities as pa on pa.id = pp.presentation_id and pa.deleted_at is null
    join public.public_profiles as linked on linked.id = pc.linked_profile_id
    join public.public_profiles as host on host.id = pa.owner_profile_id and host.deleted_at is null
   where pc.status = 'pending'
     and pp.linked_profile_id = pc.linked_profile_id
     and linked.primary_controller_account_id = auth.uid()
     and linked.deleted_at is null
     and private.current_account_is_active()
   order by pc.requested_at desc, pc.id;
$$;

create function private.decide_presentation_participation(
  target_consent_id uuid,
  target_decision public.presentation_participation_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  consent_row public.presentation_participation_consents%rowtype;
  participant_row public.presentation_participants%rowtype;
begin
  if target_decision not in ('accepted', 'declined') then
    raise exception 'The participation decision is invalid.' using errcode = '22023';
  end if;
  select * into consent_row from public.presentation_participation_consents where id = target_consent_id for update;
  select * into participant_row from public.presentation_participants where id = consent_row.participant_id for update;
  if not found or actor_id is null or not private.current_account_is_active()
     or participant_row.linked_profile_id is distinct from consent_row.linked_profile_id
     or not exists (
       select 1 from public.public_profiles as p join public.accounts as a on a.id = p.primary_controller_account_id
        where p.id = consent_row.linked_profile_id and p.primary_controller_account_id = actor_id and a.status = 'active' and p.deleted_at is null
     ) then
    raise exception 'The participation request may not be decided.' using errcode = '42501';
  end if;
  if consent_row.status = target_decision then return true; end if;
  if consent_row.status <> 'pending' then
    raise exception 'The participation request may not be decided.' using errcode = '42501';
  end if;
  update public.presentation_participation_consents
     set status = target_decision, decided_by_account_id = actor_id, decided_at = now(), updated_at = now()
   where id = target_consent_id;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (actor_id, 'presentation.participation_decided', 'presentation_participation_consent', target_consent_id,
          target_decision::text, jsonb_build_object('presentation_id', participant_row.presentation_id));
  return true;
end;
$$;

create function public.get_my_presentation_participation_request_summaries()
returns table (
  consent_id uuid, presentation_id uuid, presentation_title varchar,
  presentation_host_display_name varchar, participant_display_name varchar,
  consent_status public.presentation_participation_status, requested_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_presentation_participation_request_summaries(); $$;

create function public.accept_presentation_participation(target_consent_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.decide_presentation_participation(target_consent_id, 'accepted'::public.presentation_participation_status); $$;

create function public.decline_presentation_participation(target_consent_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.decide_presentation_participation(target_consent_id, 'declined'::public.presentation_participation_status); $$;

create function private.get_public_profile_presentation_summaries(target_profile_id uuid)
returns table (
  id uuid, title varchar, activity_type varchar, venue_name varchar, city varchar,
  country varchar, start_date date, end_date date, description text, external_url text,
  show_in_presentations boolean, visibility public.publication_status, published_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select pa.id, pa.title, pa.activity_type, pa.venue_name, pa.city, pa.country,
         pa.start_date, pa.end_date, pa.description, pa.external_url,
         pa.show_in_presentations, pa.visibility, pa.published_at
    from public.profile_activities as pa
   where exists (
     select 1 from public.public_profiles as target
      where target.id = target_profile_id and target.profile_type = 'artist'
        and target.publication_status = 'published' and target.published_at is not null
        and target.show_presentations and target.deleted_at is null
   )
     and private.is_public_presentation(pa.id)
     and (
       pa.owner_profile_id = target_profile_id
       or exists (
         select 1 from public.presentation_participation_consents as pc
          join public.presentation_participants as pp on pp.id = pc.participant_id
         where pp.presentation_id = pa.id and pp.linked_profile_id = target_profile_id
           and pp.is_visible and pc.linked_profile_id = target_profile_id and pc.status = 'accepted'
       )
     )
   order by pa.start_date desc nulls last, pa.published_at desc, pa.id;
$$;

create function public.get_public_profile_presentation_summaries(target_profile_id uuid)
returns table (
  id uuid, title varchar, activity_type varchar, venue_name varchar, city varchar,
  country varchar, start_date date, end_date date, description text, external_url text,
  show_in_presentations boolean, visibility public.publication_status, published_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_public_profile_presentation_summaries(target_profile_id); $$;

revoke all on function private.ensure_presentation_participation_consent(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.get_my_presentation_participation_request_summaries() from public, anon, authenticated;
revoke all on function private.decide_presentation_participation(uuid, public.presentation_participation_status) from public, anon, authenticated;
revoke all on function private.get_public_profile_presentation_summaries(uuid) from public, anon, authenticated;
grant execute on function private.get_my_presentation_participation_request_summaries() to authenticated;
grant execute on function private.decide_presentation_participation(uuid, public.presentation_participation_status) to authenticated;
grant execute on function private.get_public_profile_presentation_summaries(uuid) to anon, authenticated;

revoke all on function public.get_my_presentation_participation_request_summaries() from public, anon;
revoke all on function public.accept_presentation_participation(uuid) from public, anon;
revoke all on function public.decline_presentation_participation(uuid) from public, anon;
revoke all on function public.get_public_profile_presentation_summaries(uuid) from public;
grant execute on function public.get_my_presentation_participation_request_summaries() to authenticated;
grant execute on function public.accept_presentation_participation(uuid) to authenticated;
grant execute on function public.decline_presentation_participation(uuid) to authenticated;
grant execute on function public.get_public_profile_presentation_summaries(uuid) to anon, authenticated;
