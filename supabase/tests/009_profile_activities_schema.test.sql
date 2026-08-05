begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

select has_table('public','profile_activities','profile activities table exists');
select has_table('public','activity_occurrences','activity occurrences table exists');

select has_column('public','profile_activities','owner_profile_id','activity belongs to a profile');
select has_column('public','profile_activities','title','activity has a title');
select has_column('public','profile_activities','activity_type','activity has a type');
select has_column('public','profile_activities','start_date','activity has a start date');
select has_column('public','profile_activities','show_in_presentations','activity controls presentation visibility');
select has_column('public','profile_activities','include_in_cv','activity controls CV inclusion');
select has_column('public','profile_activities','visibility','activity has publication state');
select has_column('public','profile_activities','deleted_at','activity supports soft deletion');
select has_column('public','profile_activities','purge_after','activity records its purge window');

select has_column('public','activity_occurrences','activity_id','occurrence belongs to an activity');
select has_column('public','activity_occurrences','occurrence_type','occurrence has a type');
select has_column('public','activity_occurrences','start_date','occurrence has a start date');
select has_column('public','activity_occurrences','start_time','occurrence has an optional start time');
select has_column('public','activity_occurrences','show_in_agenda','occurrence controls Agenda visibility');
select has_column('public','activity_occurrences','visibility','occurrence has publication state');
select has_column('public','activity_occurrences','deleted_at','occurrence supports soft deletion');
select has_column('public','activity_occurrences','purge_after','occurrence records its purge window');

select has_index(
  'public','profile_activities','profile_activities_owner_updated',
  'managed activity lookup is indexed'
);
select has_index(
  'public','profile_activities','profile_activities_public_presentations',
  'public presentation lookup is indexed'
);
select has_index(
  'public','profile_activities','profile_activities_public_cv',
  'public CV lookup is indexed'
);
select has_index(
  'public','activity_occurrences','activity_occurrences_activity',
  'activity occurrence lookup is indexed'
);
select has_index(
  'public','activity_occurrences','activity_occurrences_public_agenda',
  'public Agenda lookup is indexed'
);

select ok(
  (select relrowsecurity
     from pg_class
    where oid='public.profile_activities'::regclass),
  'activity RLS is enabled'
);
select ok(
  (select relforcerowsecurity
     from pg_class
    where oid='public.profile_activities'::regclass),
  'activity RLS is forced'
);
select ok(
  (select relrowsecurity
     from pg_class
    where oid='public.activity_occurrences'::regclass),
  'occurrence RLS is enabled'
);
select ok(
  (select relforcerowsecurity
     from pg_class
    where oid='public.activity_occurrences'::regclass),
  'occurrence RLS is forced'
);

select ok(
  not has_table_privilege(
    'anon','public.profile_activities','INSERT'
  ),
  'anon cannot insert activities'
);
select ok(
  not has_table_privilege(
    'authenticated','public.profile_activities','DELETE'
  ),
  'authenticated cannot permanently delete activities'
);
select ok(
  not has_table_privilege(
    'anon','public.activity_occurrences','INSERT'
  ),
  'anon cannot insert occurrences'
);
select ok(
  not has_table_privilege(
    'authenticated','public.activity_occurrences','DELETE'
  ),
  'authenticated cannot permanently delete occurrences'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.profile_activities',
    'deleted_at',
    'UPDATE'
  ),
  'authenticated cannot directly write activity deletion state'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.profile_activities',
    'purge_after',
    'UPDATE'
  ),
  'authenticated cannot directly write activity purge state'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.activity_occurrences',
    'deleted_at',
    'UPDATE'
  ),
  'authenticated cannot directly write occurrence deletion state'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.activity_occurrences',
    'purge_after',
    'UPDATE'
  ),
  'authenticated cannot directly write occurrence purge state'
);

select has_function(
  'public',
  'soft_delete_profile_activity',
  array['uuid'],
  'activity soft-delete RPC exists'
);
select has_function(
  'public',
  'soft_delete_activity_occurrence',
  array['uuid'],
  'occurrence soft-delete RPC exists'
);
select function_privs_are(
  'public',
  'soft_delete_profile_activity',
  array['uuid'],
  'authenticated',
  array['EXECUTE'],
  'only authenticated receives activity soft-delete execution'
);
select function_privs_are(
  'public',
  'soft_delete_activity_occurrence',
  array['uuid'],
  'authenticated',
  array['EXECUTE'],
  'only authenticated receives occurrence soft-delete execution'
);

select * from finish();
rollback;
