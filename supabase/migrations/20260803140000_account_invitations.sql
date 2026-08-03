-- Local invitation approval and lifecycle foundation. Invitation secrets,
-- links, OTPs, and passwords are deliberately not stored in application data.

create type public.account_invitation_status as enum (
  'approved',
  'sending',
  'sent',
  'accepted',
  'expired',
  'revoked',
  'failed'
);

create table public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  status public.account_invitation_status not null default 'approved',
  approved_roles public.application_role[] not null
    default array['private_member'::public.application_role],
  approved_by_account_id uuid not null
    references public.accounts (id) on delete restrict,
  auth_user_id uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null default statement_timestamp(),
  sending_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz not null
    default statement_timestamp() + interval '1 hour',
  expired_at timestamptz,
  revoked_at timestamptz,
  revoked_by_account_id uuid
    references public.accounts (id) on delete set null,
  failed_at timestamptz,
  failure_code varchar(80),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint account_invitations_email_normalized
    check (
      email_normalized = lower(btrim(email_normalized))
      and char_length(email_normalized) between 3 and 254
      and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint account_invitations_roles_allowed
    check (
      cardinality(approved_roles) between 1 and 4
      and 'private_member'::public.application_role = any(approved_roles)
      and not ('admin'::public.application_role = any(approved_roles))
      and approved_roles <@ array[
        'private_member'::public.application_role,
        'artist'::public.application_role,
        'curator'::public.application_role,
        'institution'::public.application_role
      ]
    ),
  constraint account_invitations_expiry_after_approval
    check (expires_at > approved_at),
  constraint account_invitations_failure_code_sanitized
    check (
      failure_code is null
      or failure_code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
    ),
  constraint account_invitations_lifecycle_consistent
    check (
      (
        status = 'approved'
        and auth_user_id is null
        and sending_at is null
        and sent_at is null
        and accepted_at is null
        and expired_at is null
        and revoked_at is null
        and failed_at is null
        and failure_code is null
      )
      or (
        status = 'sending'
        and auth_user_id is null
        and sending_at is not null
        and sent_at is null
        and accepted_at is null
        and expired_at is null
        and revoked_at is null
        and failed_at is null
        and failure_code is null
      )
      or (
        status = 'sent'
        and auth_user_id is not null
        and sending_at is not null
        and sent_at is not null
        and accepted_at is null
        and expired_at is null
        and revoked_at is null
        and failed_at is null
        and failure_code is null
      )
      or (
        status = 'accepted'
        and sending_at is not null
        and sent_at is not null
        and accepted_at is not null
        and expired_at is null
        and revoked_at is null
        and failed_at is null
        and failure_code is null
      )
      or (
        status = 'expired'
        and accepted_at is null
        and expired_at is not null
        and expires_at <= expired_at
        and revoked_at is null
        and failed_at is null
        and failure_code is null
      )
      or (
        status = 'revoked'
        and accepted_at is null
        and expired_at is null
        and revoked_at is not null
        and failed_at is null
        and failure_code is null
      )
      or (
        status = 'failed'
        and accepted_at is null
        and expired_at is null
        and revoked_at is null
        and failed_at is not null
        and failure_code is not null
      )
    )
);

create unique index account_invitations_one_actionable_email
  on public.account_invitations (email_normalized)
  where status in ('approved', 'sending', 'sent');

create unique index account_invitations_one_link_per_auth_user
  on public.account_invitations (auth_user_id)
  where auth_user_id is not null;

create index account_invitations_status_expiry
  on public.account_invitations (status, expires_at, id);

create index account_invitations_approver_history
  on public.account_invitations (approved_by_account_id, created_at desc, id);

create function private.prepare_account_invitation_approval()
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
  new.approved_at := coalesce(new.approved_at, statement_timestamp());
  new.expires_at := coalesce(
    new.expires_at,
    new.approved_at + interval '1 hour'
  );
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
     set status = 'expired',
         expired_at = statement_timestamp()
   where email_normalized = new.email_normalized
     and status in ('approved', 'sending', 'sent')
     and expires_at <= statement_timestamp();

  return new;
end;
$$;

create function private.enforce_account_invitation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_normalized is distinct from old.email_normalized
     or new.approved_roles is distinct from old.approved_roles
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

create function private.audit_account_invitation_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_account_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    new.approved_by_account_id,
    'account_invitation.approved',
    'account_invitation',
    new.id,
    jsonb_build_object('approved_roles', to_jsonb(new.approved_roles))
  );

  return null;
end;
$$;

create function private.audit_account_invitation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  event_metadata jsonb := jsonb_build_object(
    'previous_status', old.status,
    'status', new.status
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
    event_metadata := event_metadata
      || jsonb_build_object('failure_code', new.failure_code);
  end if;

  insert into public.audit_events (
    actor_account_id,
    action,
    target_type,
    target_id,
    metadata
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

create function private.expire_account_invitations(
  expiration_cutoff timestamptz default statement_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows bigint;
begin
  if expiration_cutoff > statement_timestamp() then
    raise exception 'The expiration cutoff cannot be in the future.'
      using errcode = '22023';
  end if;

  update public.account_invitations
     set status = 'expired',
         expired_at = statement_timestamp()
   where status in ('approved', 'sending', 'sent')
     and expires_at <= expiration_cutoff;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function private.prepare_account_invitation_approval() from public;
revoke all on function private.enforce_account_invitation_lifecycle() from public;
revoke all on function private.audit_account_invitation_approval() from public;
revoke all on function private.audit_account_invitation_lifecycle() from public;
revoke all on function private.expire_account_invitations(timestamptz) from public;
revoke all on function private.expire_account_invitations(timestamptz) from anon, authenticated;
grant execute on function private.expire_account_invitations(timestamptz) to service_role;

create trigger account_invitations_10_prepare_approval
before insert on public.account_invitations
for each row execute function private.prepare_account_invitation_approval();

create trigger account_invitations_20_enforce_lifecycle
before update on public.account_invitations
for each row execute function private.enforce_account_invitation_lifecycle();

create trigger account_invitations_30_set_updated_at
before update on public.account_invitations
for each row execute function private.set_updated_at();

create trigger account_invitations_40_audit_approval
after insert on public.account_invitations
for each row execute function private.audit_account_invitation_approval();

create trigger account_invitations_50_audit_lifecycle
after update of status on public.account_invitations
for each row execute function private.audit_account_invitation_lifecycle();

alter table public.account_invitations enable row level security;
alter table public.account_invitations force row level security;

revoke all on table public.account_invitations from public;
revoke all on table public.account_invitations from anon, authenticated;
grant select, insert, update on table public.account_invitations to service_role;
