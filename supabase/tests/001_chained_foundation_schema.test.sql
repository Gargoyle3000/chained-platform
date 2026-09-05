begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

select has_table('public', 'accounts', 'accounts table exists');
select has_table('public', 'account_roles', 'account_roles table exists');
select has_table('public', 'public_profiles', 'public_profiles table exists');
select has_table('public', 'profile_members', 'profile_members table exists');
select has_table('public', 'profile_relationships', 'profile_relationships table exists');
select has_table('public', 'profile_access_grants', 'profile_access_grants table exists');
select has_table('public', 'profile_claims', 'profile_claims table exists');
select has_table('public', 'audit_events', 'audit_events table exists');
select has_table('public', 'works', 'works table exists');
select has_table('public', 'work_images', 'work_images table exists');

select has_type(
  'public',
  'access_grant_status',
  'access grants use a dedicated lifecycle status type'
);

select col_type_is(
  'public',
  'profile_access_grants',
  'status',
  'public.access_grant_status',
  'access grant status uses the dedicated lifecycle type'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'accounts',
         'account_roles',
         'public_profiles',
         'profile_members',
         'profile_relationships',
         'profile_access_grants',
         'profile_claims',
         'audit_events',
         'works',
         'work_images'
       )
       and c.relrowsecurity
  ),
  10::bigint,
  'RLS is enabled on every exposed application table'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_class as c
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'accounts',
         'account_roles',
         'public_profiles',
         'profile_members',
         'profile_relationships',
         'profile_access_grants',
         'profile_claims',
         'audit_events',
         'works',
         'work_images'
       )
       and c.relforcerowsecurity
  ),
  10::bigint,
  'RLS is forced on every exposed application table'
);

select ok(
  not exists (
    select 1
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.oid not in (
         'public.list_published_curated_collection_items(uuid[])'::regprocedure,
         'public.get_public_presentation_participant_summaries(uuid)'::regprocedure,
         'public.get_public_presentation_program(uuid)'::regprocedure,
         'public.get_public_presentation_works(uuid)'::regprocedure
       )
  )
  and not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid in (
       'public.list_published_curated_collection_items(uuid[])'::regprocedure,
       'public.get_public_presentation_participant_summaries(uuid)'::regprocedure,
       'public.get_public_presentation_program(uuid)'::regprocedure,
       'public.get_public_presentation_works(uuid)'::regprocedure
     )
       and (
         not p.prosecdef
         or not exists (
           select 1
             from unnest(coalesce(p.proconfig, array[]::text[])) as setting
            where setting like 'search_path=%'
         )
       )
  ),
  'only allowlisted public SECURITY DEFINER projections use a fixed search_path'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.prosecdef
       and not exists (
         select 1
           from unnest(coalesce(p.proconfig, array[]::text[])) as setting
          where setting like 'search_path=%'
       )
  ),
  0::bigint,
  'every private SECURITY DEFINER helper fixes its search_path'
);

select has_index(
  'public',
  'public_profiles',
  'public_profiles_active_slug',
  'active profile slugs have a partial unique index'
);

select has_index(
  'public',
  'profile_members',
  'profile_members_one_active_membership',
  'active profile memberships are unique'
);

select has_index(
  'public',
  'profile_relationships',
  'profile_relationships_one_active_equivalent',
  'active descriptive relationships are unique'
);

select has_index(
  'public',
  'profile_access_grants',
  'profile_access_grants_one_effective_scope',
  'declared-active equivalent delegated scopes are unique'
);

select is(
  (
    select position('now()' in pg_get_expr(i.indpred, i.indrelid))
      from pg_catalog.pg_index as i
      join pg_catalog.pg_class as c on c.oid = i.indexrelid
      join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'profile_access_grants_one_effective_scope'
  ),
  0,
  'effective grant uniqueness has no wall-clock index predicate'
);

select has_index(
  'public',
  'works',
  'works_profile_public_order',
  'profile Work ordering is indexed'
);

select has_index(
  'public',
  'works',
  'works_global_publication_order',
  'global publication ordering is indexed'
);

select has_index(
  'public',
  'work_images',
  'work_images_one_active_sort_order',
  'active Work image order is unique'
);

select has_index(
  'public',
  'work_images',
  'work_images_one_active_cover',
  'at most one active cover is enforced by a partial unique index'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'works_publication_consistent'
  ),
  1::bigint,
  'Work publication consistency constraint exists'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'works_deletion_consistent'
  ),
  1::bigint,
  'Work deletion consistency constraint exists'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'work_images_mime_type_allowed'
  ),
  1::bigint,
  'Work image MIME constraint exists'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'profile_access_grants_lifecycle_consistent'
  ),
  1::bigint,
  'access grant lifecycle consistency constraint exists'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_constraint
     where conname = 'profile_access_grants_revocation_after_grant'
  ),
  1::bigint,
  'access grant revocation chronology constraint exists'
);

select has_trigger(
  'public',
  'profile_access_grants',
  'profile_access_grants_enforce_lifecycle',
  'access grant lifecycle transitions are enforced'
);

select has_trigger(
  'public',
  'profile_access_grants',
  'profile_access_grants_normalize_expired_equivalents',
  'expired equivalents are normalized before replacement'
);

select has_trigger(
  'public',
  'profile_access_grants',
  'profile_access_grants_audit_lifecycle',
  'access grant lifecycle transitions are audited'
);

select has_trigger(
  'public',
  'work_images',
  'work_images_require_exactly_one_cover',
  'a deferred cover-integrity trigger exists'
);

select is(
  has_column_privilege('anon', 'public.work_images', 'private_object_path', 'select'),
  false,
  'anon has no column privilege for private image paths'
);

select is(
  has_table_privilege('authenticated', 'public.works', 'delete'),
  false,
  'authenticated clients cannot permanently delete Works'
);

select is(
  has_function_privilege(
    'authenticated',
    'private.expire_profile_access_grants(timestamptz)',
    'execute'
  ),
  false,
  'authenticated clients cannot execute the trusted grant expiry sweep'
);

select is(
  (
    select count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in (
         'current_account_is_active',
         'has_active_profile_membership',
         'has_delegated_scope',
         'can_manage_work_owner',
         'can_manage_work',
         'is_published_profile',
         'is_published_work'
       )
  ),
  7::bigint,
  'required authorization helpers exist only in private'
);

select * from finish();

rollback;
