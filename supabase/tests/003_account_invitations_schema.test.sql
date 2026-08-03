begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_type(
  'public',
  'account_invitation_status',
  'account invitation lifecycle type exists'
);

select has_table(
  'public',
  'account_invitations',
  'account invitations table exists'
);

select has_column(
  'public',
  'account_invitations',
  'email_normalized',
  'normalized invitation email is stored'
);

select col_type_is(
  'public',
  'account_invitations',
  'approved_roles',
  'public.application_role[]',
  'approved invitation roles use the application role type'
);

select is(
  (
    select c.relrowsecurity
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'account_invitations'
  ),
  true,
  'RLS is enabled on account invitations'
);

select is(
  (
    select c.relforcerowsecurity
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'account_invitations'
  ),
  true,
  'RLS is forced on account invitations'
);

select has_index(
  'public',
  'account_invitations',
  'account_invitations_one_actionable_email',
  'one actionable invitation per normalized email is indexed'
);

select is(
  (
    select position('now()' in pg_get_expr(i.indpred, i.indrelid))
      from pg_catalog.pg_index as i
      join pg_catalog.pg_class as c on c.oid = i.indexrelid
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'account_invitations_one_actionable_email'
  ),
  0,
  'actionable invitation uniqueness has no wall-clock predicate'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'account_invitations_lifecycle_consistent'
  ),
  1::bigint,
  'invitation lifecycle consistency constraint exists'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'account_invitations_roles_allowed'
  ),
  1::bigint,
  'invitation role allowlist constraint exists'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'account_invitations_email_normalized'
  ),
  1::bigint,
  'invitation email normalization constraint exists'
);

select has_trigger(
  'auth',
  'users',
  'auth_users_10_link_account_invitation',
  'Auth invitation users are linked by trigger'
);

select has_trigger(
  'auth',
  'users',
  'auth_users_20_accept_confirmed_invitation',
  'already-confirmed invited users are admitted by trigger'
);

select has_trigger(
  'auth',
  'users',
  'auth_users_20_accept_invitation_confirmation',
  'invite confirmation is admitted by update trigger'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in (
         'prepare_account_invitation_approval',
         'enforce_account_invitation_lifecycle',
         'audit_account_invitation_approval',
         'audit_account_invitation_lifecycle',
         'expire_account_invitations',
         'link_auth_user_to_account_invitation',
         'accept_auth_user_account_invitation'
       )
       and p.prosecdef
  ),
  7::bigint,
  'invitation security helpers exist only in private'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in (
         'prepare_account_invitation_approval',
         'enforce_account_invitation_lifecycle',
         'audit_account_invitation_approval',
         'audit_account_invitation_lifecycle',
         'expire_account_invitations',
         'link_auth_user_to_account_invitation',
         'accept_auth_user_account_invitation'
       )
       and not exists (
         select 1
           from unnest(coalesce(p.proconfig, array[]::text[])) as setting
          where setting like 'search_path=%'
       )
  ),
  0::bigint,
  'every invitation SECURITY DEFINER helper has an empty search_path'
);

select is(
  has_table_privilege('anon', 'public.account_invitations', 'select'),
  false,
  'anon cannot read account invitations'
);

select is(
  has_table_privilege('authenticated', 'public.account_invitations', 'select'),
  false,
  'authenticated users cannot read account invitations directly'
);

select is(
  has_table_privilege('anon', 'public.account_invitations', 'insert'),
  false,
  'anon cannot create account invitations'
);

select is(
  has_table_privilege('authenticated', 'public.account_invitations', 'insert'),
  false,
  'authenticated users cannot create account invitations directly'
);

select is(
  has_table_privilege('authenticated', 'public.account_invitations', 'update'),
  false,
  'authenticated users cannot change invitation lifecycle fields'
);

select is(
  has_table_privilege('authenticated', 'public.account_invitations', 'delete'),
  false,
  'authenticated users cannot delete invitation history'
);

select is(
  has_function_privilege(
    'authenticated',
    'private.expire_account_invitations(timestamptz)',
    'execute'
  ),
  false,
  'authenticated users cannot execute the trusted expiry sweep'
);

select is(
  has_table_privilege('service_role', 'public.account_invitations', 'insert'),
  true,
  'the trusted service role can create approved invitations'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like '%invitation%'
       and p.prosecdef
  ),
  0::bigint,
  'no invitation SECURITY DEFINER helper is exposed in public'
);

select * from finish();

rollback;
