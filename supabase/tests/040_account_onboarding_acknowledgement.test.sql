begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

select has_column('public', 'accounts', 'onboarding_acknowledged_version', 'accounts store onboarding acknowledgement');
select col_type_is('public', 'accounts', 'onboarding_acknowledged_version', 'integer', 'acknowledgement is an integer version');
select col_not_null('public', 'accounts', 'onboarding_acknowledged_version', 'acknowledgement is required');
select col_default_is('public', 'accounts', 'onboarding_acknowledged_version', '0', 'future accounts begin unacknowledged');
select has_check('public', 'accounts', 'onboarding version has a check constraint');

select ok(
  not exists (
    select 1
      from pg_class as c,
           lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as privilege
     where c.oid = 'public.accounts'::regclass
       and privilege.grantee in ('authenticated'::regrole::oid, 0)
       and privilege.privilege_type = 'UPDATE'
  ),
  'authenticated and PUBLIC have no table-level account UPDATE grant'
);
select ok(
  (
    select count(*) = 1
       and bool_and(a.attname = 'onboarding_acknowledged_version')
      from pg_attribute as a,
           lateral aclexplode(a.attacl) as privilege
     where a.attrelid = 'public.accounts'::regclass
       and privilege.grantee = 'authenticated'::regrole::oid
       and privilege.privilege_type = 'UPDATE'
  ),
  'the onboarding version is the only account column granted for authenticated UPDATE'
);
select ok(
  has_column_privilege('authenticated', 'public.accounts', 'onboarding_acknowledged_version', 'UPDATE'),
  'authenticated can update the onboarding column'
);
select ok(
  not has_column_privilege('anon', 'public.accounts', 'onboarding_acknowledged_version', 'UPDATE'),
  'anonymous callers cannot update the onboarding column'
);
select ok(
  not has_column_privilege('authenticated', 'public.accounts', 'status', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.accounts', 'account_plan', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.accounts', 'display_name', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.accounts', 'id', 'UPDATE'),
  'protected account fields remain unwritable'
);
select ok(
  not has_table_privilege('authenticated', 'public.account_roles', 'UPDATE'),
  'account roles remain unwritable'
);
select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'accounts'
       and policyname = 'accounts_update_own_onboarding_acknowledgement'
       and cmd = 'UPDATE'
       and 'authenticated' = any(roles)
       and position('auth.uid()' in qual) > 0
       and position('auth.uid()' in with_check) > 0
  ),
  'a self-only authenticated UPDATE policy exists'
);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'onboarding-self@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'onboarding-other@example.test', now(), now());

insert into public.accounts (id, status, display_name)
values
  ('40000000-0000-4000-8000-000000000001', 'active', 'ONBOARDING SELF'),
  ('40000000-0000-4000-8000-000000000002', 'active', 'ONBOARDING OTHER');

select results_eq(
  $$select onboarding_acknowledged_version from public.accounts
     where id = '40000000-0000-4000-8000-000000000001'$$,
  array[0::integer],
  'an account created after the migration defaults to zero'
);
select throws_ok(
  $$update public.accounts set onboarding_acknowledged_version = -1
     where id = '40000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'negative onboarding versions are rejected'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$update public.accounts set onboarding_acknowledged_version = 1
     where id = '40000000-0000-4000-8000-000000000001'$$,
  'authenticated user can acknowledge their own account'
);
select results_eq(
  $$select onboarding_acknowledged_version from public.accounts
     where id = '40000000-0000-4000-8000-000000000001'$$,
  array[1::integer],
  'self can read the acknowledged version'
);
select results_eq(
  $$with updated as (
       update public.accounts set onboarding_acknowledged_version = 1
        where id = '40000000-0000-4000-8000-000000000002'
        returning id
     ) select count(*)::integer from updated$$,
  array[0::integer],
  'RLS prevents updating another account'
);
select throws_ok(
  $$update public.accounts set status = 'disabled'
     where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'onboarding grant does not permit status changes'
);
select throws_ok(
  $$update public.accounts set account_plan = 'chained'
     where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'onboarding grant does not permit plan changes'
);
select throws_ok(
  $$update public.accounts set display_name = 'ALTERED'
     where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'onboarding grant does not permit identity-field changes'
);

reset role;
select results_eq(
  $$select onboarding_acknowledged_version from public.accounts
     where id = '40000000-0000-4000-8000-000000000002'$$,
  array[0::integer],
  'cross-account update left the other account unchanged'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$update public.accounts set onboarding_acknowledged_version = 1
     where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'anonymous user cannot acknowledge an account'
);

reset role;
update public.accounts
   set status = 'suspended'
 where id = '40000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$with updated as (
       update public.accounts set onboarding_acknowledged_version = 2
        where id = '40000000-0000-4000-8000-000000000001'
        returning id
     ) select count(*)::integer from updated$$,
  array[0::integer],
  'suspended account cannot update its onboarding preference'
);

reset role;
select * from finish();
rollback;
