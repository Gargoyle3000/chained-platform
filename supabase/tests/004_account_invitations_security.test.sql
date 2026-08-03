begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000001101',
  'authenticated',
  'authenticated',
  'admin@example.test',
  now(),
  now(),
  now()
);

insert into public.accounts (id, status, display_name)
values (
  '00000000-0000-0000-0000-000000001101',
  'active',
  'LOCAL TEST ADMIN'
);

insert into public.account_roles (account_id, role)
values
  ('00000000-0000-0000-0000-000000001101', 'private_member'),
  ('00000000-0000-0000-0000-000000001101', 'admin');

select lives_ok(
  $$
    insert into public.account_invitations (
      id,
      email_normalized,
      approved_roles,
      approved_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000001201',
      '  INVITED.ARTIST@EXAMPLE.TEST  ',
      array['artist'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'active admin can persist approval before Auth invitation creation'
);

select is(
  (
    select email_normalized
      from public.account_invitations
     where id = '00000000-0000-0000-0000-000000001201'
  ),
  'invited.artist@example.test',
  'invitation email is normalized consistently'
);

select is(
  (
    select approved_roles = array[
      'private_member'::public.application_role,
      'artist'::public.application_role
    ]
      from public.account_invitations
     where id = '00000000-0000-0000-0000-000000001201'
  ),
  true,
  'private_member is automatically included with the approved artist role'
);

select results_eq(
  $$
    select count(*)
      from public.audit_events
     where target_id = '00000000-0000-0000-0000-000000001201'
       and action = 'account_invitation.approved'
  $$,
  array[1::bigint],
  'invitation approval is audited'
);

select lives_ok(
  $$
    update public.account_invitations
       set status = 'sending'
     where id = '00000000-0000-0000-0000-000000001201'
  $$,
  'trusted dispatch can claim an approved invitation once'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      raw_user_meta_data,
      raw_app_meta_data,
      created_at,
      updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000001103',
      'authenticated',
      'authenticated',
      'INVITED.ARTIST@EXAMPLE.TEST',
      '{"role":"admin","roles":["admin"]}'::jsonb,
      '{"application_role":"admin"}'::jsonb,
      now(),
      now()
    )
  $$,
  'matching Auth Admin invitation user is created without trusting metadata'
);

select lives_ok(
  $$
    update auth.users
       set invited_at = now(),
           updated_at = now()
     where id = '00000000-0000-0000-0000-000000001103'
  $$,
  'a delayed Auth invited_at update links the matching invitation'
);

select results_eq(
  $$
    select count(*)
      from public.account_invitations
     where id = '00000000-0000-0000-0000-000000001201'
       and status = 'sent'
       and auth_user_id = '00000000-0000-0000-0000-000000001103'
       and sent_at is not null
  $$,
  array[1::bigint],
  'valid approved invitation links to the matching invited Auth user'
);

select results_eq(
  $$
    select count(*)
      from public.audit_events
     where target_id = '00000000-0000-0000-0000-000000001201'
       and action = 'account_invitation.sent'
  $$,
  array[1::bigint],
  'sent invitation transition is audited'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001103'$$,
  array[0::bigint],
  'application account does not exist before invite confirmation'
);

select lives_ok(
  $$
    update auth.users
       set email_confirmed_at = now(),
           updated_at = now()
     where id = '00000000-0000-0000-0000-000000001103'
  $$,
  'first valid invite confirmation completes account admission'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001103' and status = 'active'$$,
  array[1::bigint],
  'confirmed valid invitation creates exactly one active account'
);

select results_eq(
  $$select count(*) from public.account_roles where account_id = '00000000-0000-0000-0000-000000001103' and role = 'private_member' and revoked_at is null$$,
  array[1::bigint],
  'acceptance grants private_member'
);

select results_eq(
  $$select count(*) from public.account_roles where account_id = '00000000-0000-0000-0000-000000001103' and role = 'artist' and revoked_at is null$$,
  array[1::bigint],
  'acceptance grants the approved artist role'
);

select results_eq(
  $$select count(*) from public.account_roles where account_id = '00000000-0000-0000-0000-000000001103' and role not in ('private_member', 'artist') and revoked_at is null$$,
  array[0::bigint],
  'Auth metadata cannot grant unapproved roles or admin'
);

select results_eq(
  $$select count(*) from public.account_invitations where id = '00000000-0000-0000-0000-000000001201' and status = 'accepted' and accepted_at is not null$$,
  array[1::bigint],
  'successful confirmation marks the invitation accepted'
);

select results_eq(
  $$select count(*) from public.audit_events where target_id = '00000000-0000-0000-0000-000000001201' and action = 'account_invitation.accepted'$$,
  array[1::bigint],
  'invitation acceptance is audited'
);

select results_eq(
  $$select count(*) from public.audit_events where target_id = '00000000-0000-0000-0000-000000001103' and action = 'account.created'$$,
  array[1::bigint],
  'application account creation is audited'
);

select results_eq(
  $$select count(*) from public.audit_events where action = 'application_role.granted' and metadata ->> 'account_id' = '00000000-0000-0000-0000-000000001103'$$,
  array[2::bigint],
  'each approved application role grant is audited'
);

select lives_ok(
  $$
    update auth.users
       set email_confirmed_at = email_confirmed_at + interval '1 second',
           updated_at = now()
     where id = '00000000-0000-0000-0000-000000001103'
  $$,
  'repeated acceptance trigger execution is harmless'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001103'$$,
  array[1::bigint],
  'repeated acceptance does not duplicate the account'
);

select results_eq(
  $$select count(*) from public.account_roles where account_id = '00000000-0000-0000-0000-000000001103' and revoked_at is null$$,
  array[2::bigint],
  'repeated acceptance does not duplicate roles'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000001102',
      'authenticated',
      'authenticated',
      'public-signup@example.test',
      now(),
      '{"role":"admin"}'::jsonb,
      '{"roles":["admin","artist"]}'::jsonb,
      now(),
      now()
    )
  $$,
  'unapproved Auth user creation does not break the Auth trigger'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001102'$$,
  array[0::bigint],
  'unapproved Auth user cannot obtain an active application account'
);

select results_eq(
  $$select count(*) from public.account_roles where account_id = '00000000-0000-0000-0000-000000001102'$$,
  array[0::bigint],
  'user-controlled metadata cannot assign application roles'
);

select lives_ok(
  $$
    insert into public.account_invitations (
      id, email_normalized, approved_roles, approved_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000001202',
      'intended@example.test',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    );
    update public.account_invitations
       set status = 'sending'
     where id = '00000000-0000-0000-0000-000000001202';
  $$,
  'a second approved invitation can enter dispatch'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at, invited_at,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000001104',
      'authenticated',
      'authenticated',
      'different@example.test',
      now(),
      now(),
      now(),
      now()
    )
  $$,
  'different invited email is safely left without admission'
);

select results_eq(
  $$select count(*) from public.account_invitations where id = '00000000-0000-0000-0000-000000001202' and status = 'sending' and auth_user_id is null$$,
  array[1::bigint],
  'different email cannot consume an invitation'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001104'$$,
  array[0::bigint],
  'different invited email cannot create an application account'
);

select lives_ok(
  $$
    insert into public.account_invitations (
      id, email_normalized, approved_roles, approved_by_account_id,
      approved_at, expires_at
    ) values (
      '00000000-0000-0000-0000-000000001203',
      'expired@example.test',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001101',
      now() - interval '2 hours',
      now() - interval '1 hour'
    )
  $$,
  'time-expired historical approval can exist before lifecycle sweep'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at, invited_at,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000001105',
      'authenticated',
      'authenticated',
      'expired@example.test',
      now(),
      now(),
      now(),
      now()
    )
  $$,
  'expired invitation does not block Auth user creation'
);

select results_eq(
  $$select count(*) from public.account_invitations where id = '00000000-0000-0000-0000-000000001203' and status = 'expired' and expired_at is not null$$,
  array[1::bigint],
  'expired invitation is deterministically transitioned to history'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001105'$$,
  array[0::bigint],
  'expired invitation cannot create an account'
);

insert into public.account_invitations (
  id, email_normalized, approved_roles, approved_by_account_id
)
values (
  '00000000-0000-0000-0000-000000001204',
  'revoked@example.test',
  array['private_member'::public.application_role],
  '00000000-0000-0000-0000-000000001101'
);
update public.account_invitations set status = 'sending'
 where id = '00000000-0000-0000-0000-000000001204';
update public.account_invitations
   set status = 'revoked',
       revoked_by_account_id = '00000000-0000-0000-0000-000000001101'
 where id = '00000000-0000-0000-0000-000000001204';

select lives_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at, invited_at,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000001106',
      'authenticated',
      'authenticated',
      'revoked@example.test',
      now(),
      now(),
      now(),
      now()
    )
  $$,
  'revoked invitation cannot be consumed by an Auth user'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001106'$$,
  array[0::bigint],
  'revoked invitation cannot create an account'
);

insert into public.account_invitations (
  id, email_normalized, approved_roles, approved_by_account_id
)
values (
  '00000000-0000-0000-0000-000000001205',
  'failed@example.test',
  array['private_member'::public.application_role],
  '00000000-0000-0000-0000-000000001101'
);
update public.account_invitations set status = 'sending'
 where id = '00000000-0000-0000-0000-000000001205';
update public.account_invitations
   set status = 'failed',
       failure_code = 'auth_invite_failed'
 where id = '00000000-0000-0000-0000-000000001205';

select lives_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, email_confirmed_at, invited_at,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000001107',
      'authenticated',
      'authenticated',
      'failed@example.test',
      now(),
      now(),
      now(),
      now()
    )
  $$,
  'failed invitation cannot be consumed by an Auth user'
);

select results_eq(
  $$select count(*) from public.accounts where id = '00000000-0000-0000-0000-000000001107'$$,
  array[0::bigint],
  'failed invitation cannot create an account'
);

select lives_ok(
  $$
    insert into public.account_invitations (
      id, email_normalized, approved_roles, approved_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000001206',
      'invited.artist@example.test',
      array['artist'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'accepted historical invitation does not block a later approval'
);

select results_eq(
  $$select count(*) from public.account_invitations where id = '00000000-0000-0000-0000-000000001201' and status = 'accepted'$$,
  array[1::bigint],
  'accepted invitation remains immutable history after later approval'
);

insert into public.account_invitations (
  id, email_normalized, approved_roles, approved_by_account_id
)
values (
  '00000000-0000-0000-0000-000000001207',
  'Case.Duplicate@Example.Test',
  array['private_member'::public.application_role],
  '00000000-0000-0000-0000-000000001101'
);

select throws_ok(
  $$
    insert into public.account_invitations (
      email_normalized, approved_roles, approved_by_account_id
    ) values (
      ' case.duplicate@example.test ',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  '23505',
  null,
  'case normalization cannot create duplicate actionable invitations'
);

select throws_ok(
  $$
    insert into public.account_invitations (
      email_normalized, approved_roles, approved_by_account_id
    ) values (
      'forbidden-admin@example.test',
      array['admin'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  '23514',
  null,
  'ordinary invitation lifecycle cannot approve admin'
);

select throws_ok(
  $$
    insert into public.account_invitations (
      email_normalized, approved_roles, approved_by_account_id
    ) values (
      'nonadmin-approval@example.test',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001103'
    )
  $$,
  '42501',
  null,
  'non-admin account cannot approve an invitation even through trusted SQL'
);

select lives_ok(
  $$
    insert into public.account_invitations (
      id, email_normalized, approved_roles, approved_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000001208',
      'expired@example.test',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'expired historical invitation does not block replacement'
);

select lives_ok(
  $$
    insert into public.account_invitations (
      id, email_normalized, approved_roles, approved_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000001209',
      'revoked@example.test',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'revoked historical invitation does not block replacement'
);

select lives_ok(
  $$
    insert into public.account_invitations (
      id, email_normalized, approved_roles, approved_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000001210',
      'failed@example.test',
      array['private_member'::public.application_role],
      '00000000-0000-0000-0000-000000001101'
    )
  $$,
  'failed historical invitation does not block replacement'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001103","role":"authenticated"}',
  true
);

select throws_ok(
  $$select count(*) from public.account_invitations$$,
  '42501',
  null,
  'ordinary authenticated users cannot read invitations'
);

select throws_ok(
  $$
    insert into public.account_invitations (
      email_normalized, approved_by_account_id
    ) values (
      'self-approved@example.test',
      '00000000-0000-0000-0000-000000001103'
    )
  $$,
  '42501',
  null,
  'ordinary authenticated users cannot create invitations'
);

select throws_ok(
  $$update public.account_invitations set status = 'accepted' where id = '00000000-0000-0000-0000-000000001206'$$,
  '42501',
  null,
  'ordinary authenticated users cannot manipulate invitation lifecycle'
);

select throws_ok(
  $$select private.expire_account_invitations()$$,
  '42501',
  null,
  'ordinary authenticated users cannot execute invitation expiry'
);

reset role;
update public.accounts set status = 'disabled'
 where id = '00000000-0000-0000-0000-000000001103';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000001103","role":"authenticated"}',
  true
);

select is(
  private.current_account_is_active(),
  false,
  'disabled admitted account remains denied by existing authorization helpers'
);

reset role;

select cmp_ok(
  (select count(*) from public.audit_events where action = 'account_invitation.expired'),
  '>=',
  1::bigint,
  'invitation expiry is audited'
);

select cmp_ok(
  (select count(*) from public.audit_events where action = 'account_invitation.revoked'),
  '>=',
  1::bigint,
  'invitation revocation is audited'
);

select cmp_ok(
  (select count(*) from public.audit_events where action = 'account_invitation.failed'),
  '>=',
  1::bigint,
  'invitation failure is audited with sanitized state'
);

select * from finish();

rollback;
