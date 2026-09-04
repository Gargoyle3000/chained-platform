-- Presentation v2 identity selection stays profile-based in the browser.
-- Account/auth identifiers remain internal to trusted database functions.

create or replace function private.is_selectable_presentation_artist_profile(
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
        join public.accounts as a
          on a.id = p.primary_controller_account_id
         and a.status = 'active'
        join public.profile_members as pm
          on pm.profile_id = p.id
         and pm.account_id = p.primary_controller_account_id
         and pm.membership_level = 'owner'
         and pm.status = 'active'
         and pm.revoked_at is null
       where p.id = target_profile_id
         and p.profile_type = 'artist'
         and p.publication_status = 'published'
         and p.published_at is not null
         and p.claim_state = 'claimed'
         and p.primary_controller_account_id is not null
         and p.deleted_at is null
         and exists (
           select 1
             from public.account_roles as ar
            where ar.account_id = p.primary_controller_account_id
              and ar.role = 'artist'
              and ar.revoked_at is null
         )
    );
$$;

create or replace function private.search_presentation_artist_profiles(
  search_query text
)
returns table (
  profile_id uuid,
  display_name varchar(160),
  slug varchar(100)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := lower(trim(search_query));
begin
  if auth.uid() is null or not private.current_account_is_active() then
    raise exception 'Artist profile search is unavailable.'
      using errcode = '42501';
  end if;

  if normalized_query is null
     or char_length(normalized_query) not between 3 and 100 then
    raise exception 'Artist profile search requires 3 to 100 characters.'
      using errcode = '22023';
  end if;

  return query
  select p.id, p.display_name, p.slug
    from public.public_profiles as p
   where private.is_selectable_presentation_artist_profile(p.id)
     and (
       left(lower(p.display_name), char_length(normalized_query)) = normalized_query
       or left(lower(p.slug), char_length(normalized_query)) = normalized_query
     )
   order by
     case
       when lower(p.display_name) = normalized_query
         or lower(p.slug) = normalized_query then 0
       else 1
     end,
     lower(p.display_name),
     p.id
   limit 10;
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
     and not private.is_selectable_presentation_artist_profile(
       target_linked_profile_id
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
     and target_linked_profile_id is distinct from participant_row.linked_profile_id
     and not private.is_selectable_presentation_artist_profile(
       target_linked_profile_id
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
  select * into participant_row
    from public.presentation_participants
   where id = target_participant_id
   for update;

  if not found
     or actor_id is null
     or not private.can_manage_presentation_content(participant_row.presentation_id) then
    raise exception 'The Presentation participant profile may not be changed.'
      using errcode = '42501';
  end if;

  if target_profile_id is not null
     and not private.is_selectable_presentation_artist_profile(target_profile_id) then
    raise exception 'The linked profile is unavailable.' using errcode = '22023';
  end if;

  update public.presentation_participants
     set linked_profile_id = target_profile_id,
         updated_by_account_id = actor_id,
         updated_at = now()
   where id = target_participant_id;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id, 'presentation.participant_profile_changed',
    'presentation_participant', target_participant_id,
    jsonb_build_object(
      'presentation_id', participant_row.presentation_id,
      'linked', target_profile_id is not null
    )
  );

  return true;
end;
$$;

create or replace function private.invite_presentation_cooperator_by_profile(
  target_presentation_id uuid,
  target_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_account_id uuid;
begin
  if actor_id is null
     or not private.is_presentation_owner_account(target_presentation_id) then
    raise exception 'Only the Presentation owner may invite co-operators.'
      using errcode = '42501';
  end if;

  if target_profile_id is null
     or not private.is_selectable_presentation_artist_profile(target_profile_id) then
    raise exception 'The invited profile is unavailable.' using errcode = '22023';
  end if;

  select p.primary_controller_account_id
    into target_account_id
    from public.public_profiles as p
   where p.id = target_profile_id;

  if target_account_id is null or target_account_id = actor_id then
    raise exception 'The invited profile is unavailable.' using errcode = '22023';
  end if;

  return private.invite_presentation_cooperator(
    target_presentation_id,
    target_account_id,
    target_profile_id
  );
end;
$$;

create or replace function private.get_managed_presentation_cooperator_summaries(
  target_presentation_id uuid
)
returns table (
  cooperator_id uuid,
  presentation_id uuid,
  profile_id uuid,
  profile_display_name varchar(160),
  profile_slug varchar(100),
  cooperator_status public.presentation_cooperator_status,
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
    case when eligible.is_selectable then p.id else null end,
    case when eligible.is_selectable then p.display_name else null end,
    case when eligible.is_selectable then p.slug else null end,
    pc.status,
    pc.invited_at
  from public.presentation_cooperators as pc
  left join public.public_profiles as p
    on p.id = pc.invited_profile_id
  cross join lateral (
    select coalesce(
      private.is_selectable_presentation_artist_profile(p.id),
      false
    ) as is_selectable
  ) as eligible
  where pc.presentation_id = target_presentation_id
    and private.current_account_is_active()
    and (
      private.is_presentation_owner_account(target_presentation_id)
      or (
        private.is_accepted_presentation_cooperator(target_presentation_id)
        and pc.invited_account_id = auth.uid()
      )
    )
  order by pc.invited_at desc, pc.id;
$$;

create or replace function public.search_presentation_artist_profiles(search_query text)
returns table (
  profile_id uuid,
  display_name varchar(160),
  slug varchar(100)
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.search_presentation_artist_profiles(search_query);
$$;

create or replace function public.set_presentation_participant_profile(
  target_participant_id uuid,
  target_profile_id uuid default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_presentation_participant_profile(
    target_participant_id,
    target_profile_id
  );
$$;

create or replace function public.invite_presentation_cooperator_by_profile(
  target_presentation_id uuid,
  target_profile_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.invite_presentation_cooperator_by_profile(
    target_presentation_id,
    target_profile_id
  );
$$;

create or replace function public.get_managed_presentation_cooperator_summaries(
  target_presentation_id uuid
)
returns table (
  cooperator_id uuid,
  presentation_id uuid,
  profile_id uuid,
  profile_display_name varchar(160),
  profile_slug varchar(100),
  cooperator_status public.presentation_cooperator_status,
  invited_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.get_managed_presentation_cooperator_summaries(
      target_presentation_id
    );
$$;

-- Preserve the existing RPC name while narrowing its browser projection.
drop function public.get_managed_presentation_participants(uuid);
create function public.get_managed_presentation_participants(
  target_presentation_id uuid
)
returns table (
  id uuid,
  presentation_id uuid,
  linked_profile_id uuid,
  display_name varchar(300),
  "position" integer,
  is_visible boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pp.id,
    pp.presentation_id,
    pp.linked_profile_id,
    pp.display_name,
    pp.position,
    pp.is_visible,
    pp.created_at,
    pp.updated_at
  from private.get_managed_presentation_participants(
    target_presentation_id
  ) as pp;
$$;

-- Direct table reads and the account-id invitation wrapper are no longer
-- browser contracts. Existing trusted internals remain available privately.
revoke select on public.presentation_cooperators from authenticated;
revoke all on function public.invite_presentation_cooperator(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function private.is_selectable_presentation_artist_profile(uuid)
  from public, anon, authenticated;
revoke all on function private.search_presentation_artist_profiles(text)
  from public, anon, authenticated;
revoke all on function private.set_presentation_participant_profile(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.invite_presentation_cooperator_by_profile(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.get_managed_presentation_cooperator_summaries(uuid)
  from public, anon, authenticated;
revoke all on function private.invite_presentation_cooperator(uuid, uuid, uuid)
  from authenticated;

grant execute on function private.search_presentation_artist_profiles(text)
  to authenticated;
grant execute on function private.set_presentation_participant_profile(uuid, uuid)
  to authenticated;
grant execute on function private.invite_presentation_cooperator_by_profile(uuid, uuid)
  to authenticated;
grant execute on function private.get_managed_presentation_cooperator_summaries(uuid)
  to authenticated;

revoke all on function public.search_presentation_artist_profiles(text)
  from public, anon;
revoke all on function public.set_presentation_participant_profile(uuid, uuid)
  from public, anon;
revoke all on function public.invite_presentation_cooperator_by_profile(uuid, uuid)
  from public, anon;
revoke all on function public.get_managed_presentation_cooperator_summaries(uuid)
  from public, anon;
revoke all on function public.get_managed_presentation_participants(uuid)
  from public, anon;

grant execute on function public.search_presentation_artist_profiles(text)
  to authenticated;
grant execute on function public.set_presentation_participant_profile(uuid, uuid)
  to authenticated;
grant execute on function public.invite_presentation_cooperator_by_profile(uuid, uuid)
  to authenticated;
grant execute on function public.get_managed_presentation_cooperator_summaries(uuid)
  to authenticated;
grant execute on function public.get_managed_presentation_participants(uuid)
  to authenticated;

comment on function public.search_presentation_artist_profiles(text) is
  'Bounded authenticated prefix search over eligible public Artist identities.';
comment on function public.set_presentation_participant_profile(uuid, uuid) is
  'Links or unlinks an eligible public Artist profile without changing historical participant attribution.';
comment on function public.invite_presentation_cooperator_by_profile(uuid, uuid) is
  'Owner-only co-operator invitation by safe profile identity; account resolution remains private.';
comment on function public.get_managed_presentation_cooperator_summaries(uuid) is
  'Safe Presentation co-operator management projection without account or auth identifiers.';
