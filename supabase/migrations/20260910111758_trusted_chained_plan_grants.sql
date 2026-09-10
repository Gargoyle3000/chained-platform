-- Trusted complimentary CHAINED plan grants for alpha Artist admission.

alter table public.account_invitations
  add column approved_account_plan public.account_plan
    not null default 'unchained';

create or replace function private.prepare_account_invitation_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_roles public.application_role[];
begin
  if new.status <> 'approved' then
    raise exception 'New account invitations must begin as approved.'
      using errcode = '23514';
  end if;

  new.email_normalized := lower(btrim(new.email_normalized));

  if 'admin'::public.application_role = any(coalesce(new.approved_roles, '{}'::public.application_role[])) then
    raise exception 'Ordinary account invitations cannot assign admin.'
      using errcode = '23514';
  end if;

  select array_agg(
           candidate.role
           order by case candidate.role
             when 'private_member' then 1
             when 'artist' then 2
             when 'curator' then 3
             when 'institution' then 4
             else 5
           end
         )
    into normalized_roles
    from (
      select distinct requested.role
        from unnest(
          coalesce(new.approved_roles, '{}'::public.application_role[])
          || array['private_member'::public.application_role]
        ) as requested(role)
    ) as candidate;

  new.approved_roles := normalized_roles;
  new.approved_account_plan := case
    when 'artist'::public.application_role = any(new.approved_roles)
      then 'chained'::public.account_plan
    else 'unchained'::public.account_plan
  end;

  if 'artist'::public.application_role = any(new.approved_roles) then
    new.artist_workspace_display_name := btrim(new.artist_workspace_display_name);
    new.artist_workspace_slug := lower(btrim(new.artist_workspace_slug));

    if char_length(new.artist_workspace_display_name) not between 1 and 160 then
      raise exception 'Artist workspace display name is required.'
        using errcode = '23514';
    end if;

    if new.artist_workspace_slug is null
       or new.artist_workspace_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Artist workspace slug is invalid.'
        using errcode = '23514';
    end if;
  elsif new.artist_workspace_display_name is not null
     or new.artist_workspace_slug is not null then
    raise exception 'Only artist invitations may include artist workspace data.'
      using errcode = '23514';
  end if;

  new.approved_at := coalesce(new.approved_at, statement_timestamp());
  new.expires_at := coalesce(new.expires_at, new.approved_at + interval '1 hour');
  new.auth_user_id := null;
  new.sending_at := null;
  new.sent_at := null;
  new.accepted_at := null;
  new.expired_at := null;
  new.revoked_at := null;
  new.revoked_by_account_id := null;
  new.failed_at := null;
  new.failure_code := null;

  if not exists (
    select 1
      from public.accounts as a
      join public.account_roles as ar
        on ar.account_id = a.id
       and ar.role = 'admin'
       and ar.revoked_at is null
     where a.id = new.approved_by_account_id
       and a.status = 'active'
  ) then
    raise exception 'Only an active administrator may approve an invitation.'
      using errcode = '42501';
  end if;

  update public.account_invitations
     set status = 'expired', expired_at = statement_timestamp()
   where email_normalized = new.email_normalized
     and status in ('approved', 'sending', 'sent')
     and expires_at <= statement_timestamp();

  return new;
end;
$$;

create or replace function private.enforce_account_invitation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_normalized is distinct from old.email_normalized
     or new.approved_roles is distinct from old.approved_roles
     or new.approved_account_plan is distinct from old.approved_account_plan
     or new.artist_workspace_display_name is distinct from old.artist_workspace_display_name
     or new.artist_workspace_slug is distinct from old.artist_workspace_slug
     or new.approved_by_account_id is distinct from old.approved_by_account_id
     or new.approved_at is distinct from old.approved_at
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Invitation approval fields are immutable.'
      using errcode = '42501';
  end if;

  if old.status in ('accepted', 'expired', 'revoked', 'failed') then
    if new.status = old.status
       and old.auth_user_id is not null
       and new.auth_user_id is null
       and new.sending_at is not distinct from old.sending_at
       and new.sent_at is not distinct from old.sent_at
       and new.accepted_at is not distinct from old.accepted_at
       and new.expired_at is not distinct from old.expired_at
       and new.revoked_at is not distinct from old.revoked_at
       and new.revoked_by_account_id is not distinct from old.revoked_by_account_id
       and new.failed_at is not distinct from old.failed_at
       and new.failure_code is not distinct from old.failure_code then
      return new;
    end if;

    raise exception 'Terminal account invitations are immutable history.'
      using errcode = '42501';
  end if;

  if old.status = 'approved' and new.status = 'sending' then
    if new.expires_at <= statement_timestamp() then
      raise exception 'An expired invitation cannot begin Auth dispatch.'
        using errcode = '23514';
    end if;
    new.sending_at := coalesce(new.sending_at, statement_timestamp());
  elsif old.status = 'sending' and new.status = 'sent' then
    if new.auth_user_id is null then
      raise exception 'A sent invitation must link an Auth user.'
        using errcode = '23514';
    end if;
    new.sending_at := old.sending_at;
    new.sent_at := coalesce(new.sent_at, statement_timestamp());
  elsif old.status = 'sent' and new.status = 'accepted' then
    new.auth_user_id := old.auth_user_id;
    new.sending_at := old.sending_at;
    new.sent_at := old.sent_at;
    new.accepted_at := coalesce(new.accepted_at, statement_timestamp());
  elsif old.status in ('approved', 'sending', 'sent') and new.status = 'expired' then
    if new.expires_at > statement_timestamp() then
      raise exception 'Only a time-expired invitation may enter expired status.'
        using errcode = '23514';
    end if;
    new.expired_at := coalesce(new.expired_at, statement_timestamp());
  elsif old.status in ('approved', 'sending', 'sent') and new.status = 'revoked' then
    new.revoked_at := coalesce(new.revoked_at, statement_timestamp());
  elsif old.status in ('approved', 'sending', 'sent') and new.status = 'failed' then
    new.failed_at := coalesce(new.failed_at, statement_timestamp());
    new.failure_code := lower(btrim(new.failure_code));
    if new.failure_code is null
       or new.failure_code !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' then
      raise exception 'Invitation failures require a sanitized failure code.'
        using errcode = '23514';
    end if;
  elsif new.status <> old.status
        or new.auth_user_id is distinct from old.auth_user_id
        or new.sending_at is distinct from old.sending_at
        or new.sent_at is distinct from old.sent_at
        or new.accepted_at is distinct from old.accepted_at
        or new.expired_at is distinct from old.expired_at
        or new.revoked_at is distinct from old.revoked_at
        or new.revoked_by_account_id is distinct from old.revoked_by_account_id
        or new.failed_at is distinct from old.failed_at
        or new.failure_code is distinct from old.failure_code then
    raise exception 'Invalid account invitation lifecycle transition.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.audit_account_invitation_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    new.approved_by_account_id,
    'account_invitation.approved',
    'account_invitation',
    new.id,
    jsonb_build_object(
      'approved_roles', to_jsonb(new.approved_roles),
      'approved_account_plan', new.approved_account_plan
    )
  );
  return null;
end;
$$;

create or replace function private.audit_account_invitation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  event_metadata jsonb := jsonb_build_object(
    'previous_status', old.status,
    'status', new.status,
    'approved_account_plan', new.approved_account_plan
  );
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  actor_id := case
    when new.status = 'accepted' then new.auth_user_id
    when new.status = 'revoked' then new.revoked_by_account_id
    else new.approved_by_account_id
  end;

  if new.status = 'failed' then
    event_metadata := event_metadata || jsonb_build_object('failure_code', new.failure_code);
  end if;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_id,
    'account_invitation.' || new.status::text,
    'account_invitation',
    new.id,
    event_metadata
  );
  return null;
end;
$$;

create or replace function private.accept_auth_user_account_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invitation public.account_invitations%rowtype;
  account_was_created boolean := false;
  plan_was_granted boolean := false;
  granted_role public.application_role;
  granted_role_id uuid;
begin
  if new.invited_at is null or new.email is null or new.email_confirmed_at is null then
    return new;
  end if;

  update public.account_invitations
     set status = 'expired', expired_at = statement_timestamp()
   where auth_user_id = new.id
     and status = 'sent'
     and expires_at <= statement_timestamp();

  select ai.*
    into matching_invitation
    from public.account_invitations as ai
   where ai.auth_user_id = new.id
     and ai.email_normalized = lower(btrim(new.email))
     and ai.status = 'sent'
     and ai.expires_at > statement_timestamp()
   for update;

  if not found then
    return new;
  end if;

  insert into public.accounts (id, status, account_plan)
  values (new.id, 'active', matching_invitation.approved_account_plan)
  on conflict (id) do nothing;
  account_was_created := found;

  if not exists (
    select 1 from public.accounts as a where a.id = new.id and a.status = 'active'
  ) then
    raise exception 'Invite acceptance cannot reactivate an inactive account.'
      using errcode = '42501';
  end if;

  if account_was_created then
    insert into public.audit_events (
      actor_account_id, action, target_type, target_id, metadata
    ) values (
      new.id, 'account.created', 'account', new.id,
      jsonb_build_object('admission', 'account_invitation')
    );
  end if;

  if matching_invitation.approved_account_plan = 'chained' then
    if account_was_created then
      plan_was_granted := true;
    else
      update public.accounts
         set account_plan = 'chained'
       where id = new.id
         and status = 'active'
         and account_plan = 'unchained';
      plan_was_granted := found;
    end if;
  end if;

  if plan_was_granted then
    insert into public.audit_events (
      actor_account_id, action, target_type, target_id, metadata
    ) values (
      matching_invitation.approved_by_account_id,
      'account.plan_granted',
      'account',
      new.id,
      jsonb_build_object(
        'account_plan', 'chained',
        'source', 'trusted_invitation',
        'invitation_id', matching_invitation.id
      )
    );
  end if;

  foreach granted_role in array matching_invitation.approved_roles loop
    granted_role_id := null;
    insert into public.account_roles (account_id, role, granted_by_account_id)
    values (new.id, granted_role, matching_invitation.approved_by_account_id)
    on conflict do nothing
    returning id into granted_role_id;

    if granted_role_id is not null then
      insert into public.audit_events (
        actor_account_id, action, target_type, target_id, metadata
      ) values (
        matching_invitation.approved_by_account_id,
        'application_role.granted',
        'account_role',
        granted_role_id,
        jsonb_build_object('account_id', new.id, 'role', granted_role)
      );
    end if;
  end loop;

  if 'artist'::public.application_role = any(matching_invitation.approved_roles)
     and matching_invitation.artist_workspace_display_name is not null
     and matching_invitation.artist_workspace_slug is not null then
    perform private.provision_artist_workspace(
      new.id,
      matching_invitation.id,
      matching_invitation.artist_workspace_display_name,
      matching_invitation.artist_workspace_slug,
      matching_invitation.approved_by_account_id,
      'invitation_acceptance'
    );
  end if;

  update public.account_invitations
     set status = 'accepted', accepted_at = statement_timestamp()
   where id = matching_invitation.id and status = 'sent';
  return new;
end;
$$;

create or replace function private.repair_accepted_artist_workspace(
  target_invitation_id uuid,
  target_display_name text,
  target_slug text,
  actor_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_account_id uuid;
  intended_plan public.account_plan;
  existing_profile_id uuid;
  plan_was_granted boolean := false;
begin
  select ai.auth_user_id, ai.approved_account_plan
    into target_account_id, intended_plan
    from public.account_invitations as ai
   where ai.id = target_invitation_id
     and ai.status = 'accepted'
     and ai.auth_user_id is not null
     and 'artist'::public.application_role = any(ai.approved_roles)
   for update;

  if target_account_id is null then
    raise exception 'Accepted artist invitation is unavailable for workspace repair.'
      using errcode = '23503';
  end if;

  if not exists (
    select 1
      from public.accounts as a
      join public.account_roles as ar
        on ar.account_id = a.id and ar.role = 'admin' and ar.revoked_at is null
     where a.id = actor_account_id and a.status = 'active'
  ) then
    raise exception 'Artist workspace provisioning requires an active administrator.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.accounts as a
      join public.account_roles as ar
        on ar.account_id = a.id and ar.role = 'artist' and ar.revoked_at is null
     where a.id = target_account_id and a.status = 'active'
  ) then
    raise exception 'Artist workspace provisioning requires an active artist account.'
      using errcode = '42501';
  end if;

  if intended_plan = 'chained' then
    update public.accounts
       set account_plan = 'chained'
     where id = target_account_id and account_plan = 'unchained';
    plan_was_granted := found;
  end if;

  if plan_was_granted then
    insert into public.audit_events (
      actor_account_id, action, target_type, target_id, metadata
    ) values (
      actor_account_id,
      'account.plan_granted',
      'account',
      target_account_id,
      jsonb_build_object(
        'account_plan', 'chained',
        'source', 'trusted_invitation',
        'invitation_id', target_invitation_id
      )
    );
  end if;

  select p.id
    into existing_profile_id
    from public.public_profiles as p
    join public.profile_members as pm
      on pm.profile_id = p.id
     and pm.account_id = target_account_id
     and pm.membership_level = 'owner'
     and pm.status = 'active'
     and pm.revoked_at is null
   where p.profile_type = 'artist'
     and p.deleted_at is null
     and p.publication_status = 'draft'
     and p.claim_state = 'claimed'
     and p.primary_controller_account_id = target_account_id
     and p.display_name = btrim(target_display_name)
     and p.slug = lower(btrim(target_slug));

  if existing_profile_id is not null then
    return existing_profile_id;
  end if;

  return private.provision_artist_workspace(
    target_account_id,
    target_invitation_id,
    target_display_name,
    target_slug,
    actor_account_id,
    'repair'
  );
end;
$$;

create function private.grant_trusted_account_plan(
  target_account_id uuid,
  actor_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.accounts as a
      join public.account_roles as ar
        on ar.account_id = a.id and ar.role = 'admin' and ar.revoked_at is null
     where a.id = actor_account_id and a.status = 'active'
  ) then
    raise exception 'Trusted plan grants require an active administrator.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.accounts as a
     where a.id = target_account_id and a.status = 'active'
  ) then
    raise exception 'Trusted plan grants require an active target account.'
      using errcode = '23503';
  end if;

  update public.accounts
     set account_plan = 'chained'
   where id = target_account_id and account_plan = 'unchained';

  if not found then
    return false;
  end if;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, metadata
  ) values (
    actor_account_id,
    'account.plan_granted',
    'account',
    target_account_id,
    jsonb_build_object(
      'account_plan', 'chained',
      'source', 'trusted_complimentary_admin'
    )
  );
  return true;
end;
$$;

create function public.service_grant_trusted_account_plan(
  target_account_id uuid,
  actor_account_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.grant_trusted_account_plan(target_account_id, actor_account_id);
$$;

revoke all on function private.grant_trusted_account_plan(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.service_grant_trusted_account_plan(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.grant_trusted_account_plan(uuid, uuid)
  to service_role;
grant execute on function public.service_grant_trusted_account_plan(uuid, uuid)
  to service_role;

comment on column public.account_invitations.approved_account_plan is
  'Trusted immutable account plan approved before Auth invitation dispatch.';
comment on function public.service_grant_trusted_account_plan(uuid, uuid) is
  'Service-role-only audited complimentary upgrade of one active account from UNCHAINED to CHAINED.';
