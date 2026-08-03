-- Give delegated access grants a deterministic lifecycle without using
-- wall-clock expressions in index predicates. Expired and revoked rows remain
-- immutable history; trusted inserts normalize an expired equivalent first.

create type public.access_grant_status as enum (
  'active',
  'expired',
  'revoked'
);

drop index public.profile_access_grants_one_unrevoked_scope;
drop index public.profile_access_grants_delegate_lookup;
drop index public.profile_access_grants_grantor_lookup;

alter table public.profile_access_grants
  drop constraint profile_access_grants_lifecycle_consistent;

alter table public.profile_access_grants
  add column expired_at timestamptz;

alter table public.profile_access_grants
  alter column status drop default;

alter table public.profile_access_grants
  alter column status type public.access_grant_status
  using status::text::public.access_grant_status;

alter table public.profile_access_grants
  alter column status set default 'active';

alter table public.profile_access_grants
  add constraint profile_access_grants_lifecycle_consistent
  check (
    (
      status = 'active'
      and expired_at is null
      and revoked_at is null
      and revoked_by_account_id is null
    )
    or (
      status = 'expired'
      and expires_at is not null
      and expired_at is not null
      and expires_at <= expired_at
      and revoked_at is null
      and revoked_by_account_id is null
    )
    or (
      status = 'revoked'
      and revoked_at is not null
      and (
        expired_at is null
        or (
          expires_at is not null
          and expires_at <= expired_at
        )
      )
    )
  );

alter table public.profile_access_grants
  add constraint profile_access_grants_revocation_after_grant
  check (revoked_at is null or revoked_at >= granted_at);

create unique index profile_access_grants_one_effective_scope
  on public.profile_access_grants (grantor_profile_id, grantee_profile_id, scope)
  where status = 'active' and expired_at is null and revoked_at is null;

create index profile_access_grants_delegate_lookup
  on public.profile_access_grants (grantee_profile_id, scope, grantor_profile_id, expires_at)
  where status = 'active' and expired_at is null and revoked_at is null;

create index profile_access_grants_grantor_lookup
  on public.profile_access_grants (grantor_profile_id, scope, grantee_profile_id, expires_at)
  where status = 'active' and expired_at is null and revoked_at is null;

create function private.enforce_profile_access_grant_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.grantor_profile_id is distinct from old.grantor_profile_id
       or new.grantee_profile_id is distinct from old.grantee_profile_id
       or new.scope is distinct from old.scope
       or new.granted_at is distinct from old.granted_at
       or new.granted_by_account_id is distinct from old.granted_by_account_id then
      raise exception 'Access grant identity and origin fields are immutable.'
        using errcode = '42501';
    end if;

    if old.status = 'revoked' then
      if new.status <> 'revoked'
         or new.expires_at is distinct from old.expires_at
         or new.expired_at is distinct from old.expired_at
         or new.revoked_at is distinct from old.revoked_at
         or new.revoked_by_account_id is distinct from old.revoked_by_account_id then
        raise exception 'Revoked access grants are immutable history.'
          using errcode = '42501';
      end if;
    elsif old.status = 'expired' then
      if new.status = 'active' then
        raise exception 'Expired access grants cannot be reactivated.'
          using errcode = '42501';
      end if;

      new.expires_at := old.expires_at;
      new.expired_at := old.expired_at;

      if new.status = 'expired' then
        new.revoked_at := null;
        new.revoked_by_account_id := null;
      elsif new.status <> 'revoked' then
        raise exception 'Expired access grants may only remain expired or be explicitly revoked.'
          using errcode = '42501';
      end if;
    elsif old.status = 'active' and new.status = 'expired' then
      if new.expires_at is null or new.expires_at > statement_timestamp() then
        raise exception 'Only a time-expired access grant may enter expired status.'
          using errcode = '23514';
      end if;

      new.expired_at := coalesce(new.expired_at, statement_timestamp());
      new.revoked_at := null;
      new.revoked_by_account_id := null;
    elsif old.status = 'active' and new.status = 'revoked' then
      new.expired_at := null;
    elsif old.status = 'active' and new.status <> 'active' then
      raise exception 'Invalid access grant lifecycle transition.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create function private.normalize_expired_profile_access_grant_equivalents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    update public.profile_access_grants
       set status = 'expired',
           expired_at = statement_timestamp()
     where grantor_profile_id = new.grantor_profile_id
       and grantee_profile_id = new.grantee_profile_id
       and scope = new.scope
       and id <> new.id
       and status = 'active'
       and expired_at is null
       and revoked_at is null
       and expires_at is not null
       and expires_at <= statement_timestamp();
  end if;

  return new;
end;
$$;

create function private.audit_profile_access_grant_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_events (
      actor_account_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      auth.uid(),
      'profile_access_grant.' || new.status::text,
      'profile_access_grant',
      new.id,
      jsonb_build_object(
        'previous_status', old.status::text,
        'status', new.status::text,
        'grantor_profile_id', new.grantor_profile_id,
        'grantee_profile_id', new.grantee_profile_id,
        'scope', new.scope
      )
    );
  end if;

  return null;
end;
$$;

create function private.expire_profile_access_grants(
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

  update public.profile_access_grants
     set status = 'expired',
         expired_at = statement_timestamp()
   where status = 'active'
     and expired_at is null
     and revoked_at is null
     and expires_at is not null
     and expires_at <= expiration_cutoff;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function private.enforce_profile_access_grant_lifecycle() from public;
revoke all on function private.normalize_expired_profile_access_grant_equivalents() from public;
revoke all on function private.audit_profile_access_grant_lifecycle() from public;
revoke all on function private.expire_profile_access_grants(timestamptz) from public;
revoke all on function private.expire_profile_access_grants(timestamptz) from anon, authenticated;
grant execute on function private.expire_profile_access_grants(timestamptz) to service_role;

create trigger profile_access_grants_enforce_lifecycle
before insert or update on public.profile_access_grants
for each row execute function private.enforce_profile_access_grant_lifecycle();

create trigger profile_access_grants_normalize_expired_equivalents
before insert or update of grantor_profile_id, grantee_profile_id, scope, status
on public.profile_access_grants
for each row execute function private.normalize_expired_profile_access_grant_equivalents();

create trigger profile_access_grants_audit_lifecycle
after update of status on public.profile_access_grants
for each row execute function private.audit_profile_access_grant_lifecycle();

create or replace function private.has_delegated_scope(
  target_artist_profile_id uuid,
  required_scope public.access_grant_scope
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
        from public.profile_access_grants as pag
        join public.public_profiles as artist_profile
          on artist_profile.id = pag.grantor_profile_id
         and artist_profile.profile_type = 'artist'
         and artist_profile.deleted_at is null
        join public.public_profiles as institution_profile
          on institution_profile.id = pag.grantee_profile_id
         and institution_profile.profile_type = 'institution'
         and institution_profile.deleted_at is null
        join public.profile_members as pm
          on pm.profile_id = pag.grantee_profile_id
         and pm.account_id = auth.uid()
         and pm.status = 'active'
         and pm.revoked_at is null
       where pag.grantor_profile_id = target_artist_profile_id
         and pag.scope = required_scope
         and pag.status = 'active'
         and pag.expired_at is null
         and pag.revoked_at is null
         and (pag.expires_at is null or pag.expires_at > statement_timestamp())
    );
$$;

create or replace function private.can_read_managed_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and (
      private.has_active_profile_membership(target_profile_id, 'editor')
      or exists (
        select 1
          from public.profile_access_grants as pag
          join public.profile_members as pm
            on pm.profile_id = pag.grantee_profile_id
           and pm.account_id = auth.uid()
           and pm.status = 'active'
           and pm.revoked_at is null
         where pag.grantor_profile_id = target_profile_id
           and pag.status = 'active'
           and pag.expired_at is null
           and pag.revoked_at is null
           and (pag.expires_at is null or pag.expires_at > statement_timestamp())
      )
    );
$$;

grant select (expired_at) on public.profile_access_grants to authenticated;
