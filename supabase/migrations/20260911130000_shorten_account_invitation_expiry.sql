-- Shorten trusted invitation lifecycle expiry to the approved twelve-hour window.

alter table public.account_invitations
  alter column expires_at
  set default statement_timestamp() + interval '12 hours';

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
  new.expires_at := coalesce(new.expires_at, new.approved_at + interval '12 hours');
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
