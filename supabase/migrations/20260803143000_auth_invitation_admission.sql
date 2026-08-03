-- Link only Auth Admin invitations to pre-approved application invitations,
-- then create application access only after the invited email is confirmed.

create function private.link_auth_user_to_account_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invitation_id uuid;
  normalized_email text;
begin
  if new.invited_at is null or new.email is null then
    return new;
  end if;

  normalized_email := lower(btrim(new.email));

  update public.account_invitations
     set status = 'expired',
         expired_at = statement_timestamp()
   where email_normalized = normalized_email
     and status in ('approved', 'sending')
     and expires_at <= statement_timestamp();

  select ai.id
    into matching_invitation_id
    from public.account_invitations as ai
   where ai.email_normalized = normalized_email
     and ai.status = 'sending'
     and ai.auth_user_id is null
     and ai.expires_at > statement_timestamp()
   order by ai.approved_at, ai.id
   for update skip locked
   limit 1;

  if matching_invitation_id is null then
    return new;
  end if;

  update public.account_invitations
     set status = 'sent',
         auth_user_id = new.id,
         sent_at = statement_timestamp()
   where id = matching_invitation_id
     and status = 'sending';

  return new;
end;
$$;

create function private.accept_auth_user_account_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invitation public.account_invitations%rowtype;
  account_was_created boolean := false;
  granted_role public.application_role;
  granted_role_id uuid;
begin
  if new.invited_at is null
     or new.email is null
     or new.email_confirmed_at is null then
    return new;
  end if;

  update public.account_invitations
     set status = 'expired',
         expired_at = statement_timestamp()
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

  insert into public.accounts (id, status)
  values (new.id, 'active')
  on conflict (id) do nothing;

  account_was_created := found;

  if not exists (
    select 1
      from public.accounts as a
     where a.id = new.id
       and a.status = 'active'
  ) then
    raise exception 'Invite acceptance cannot reactivate an inactive account.'
      using errcode = '42501';
  end if;

  if account_was_created then
    insert into public.audit_events (
      actor_account_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      new.id,
      'account.created',
      'account',
      new.id,
      jsonb_build_object('admission', 'account_invitation')
    );
  end if;

  foreach granted_role in array matching_invitation.approved_roles loop
    granted_role_id := null;

    insert into public.account_roles (
      account_id,
      role,
      granted_by_account_id
    ) values (
      new.id,
      granted_role,
      matching_invitation.approved_by_account_id
    )
    on conflict do nothing
    returning id into granted_role_id;

    if granted_role_id is not null then
      insert into public.audit_events (
        actor_account_id,
        action,
        target_type,
        target_id,
        metadata
      ) values (
        matching_invitation.approved_by_account_id,
        'application_role.granted',
        'account_role',
        granted_role_id,
        jsonb_build_object(
          'account_id', new.id,
          'role', granted_role
        )
      );
    end if;
  end loop;

  update public.account_invitations
     set status = 'accepted',
         accepted_at = statement_timestamp()
   where id = matching_invitation.id
     and status = 'sent';

  return new;
end;
$$;

revoke all on function private.link_auth_user_to_account_invitation() from public;
revoke all on function private.accept_auth_user_account_invitation() from public;
revoke all on function private.link_auth_user_to_account_invitation() from anon, authenticated;
revoke all on function private.accept_auth_user_account_invitation() from anon, authenticated;

create trigger auth_users_10_link_account_invitation
after insert or update of invited_at, email on auth.users
for each row execute function private.link_auth_user_to_account_invitation();

create trigger auth_users_20_accept_confirmed_invitation
after insert on auth.users
for each row
when (new.email_confirmed_at is not null)
execute function private.accept_auth_user_account_invitation();

create trigger auth_users_20_accept_invitation_confirmation
after update of email_confirmed_at on auth.users
for each row
when (
  new.email_confirmed_at is not null
  and old.email_confirmed_at is distinct from new.email_confirmed_at
)
execute function private.accept_auth_user_account_invitation();
