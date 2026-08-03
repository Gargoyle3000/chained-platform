begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

select has_type('public', 'work_image_upload_status', 'Work-image upload lifecycle enum exists');
select has_type('public', 'work_publication_operation_status', 'publication operation lifecycle enum exists');
select has_type('public', 'work_publication_operation_kind', 'publication operation kind enum exists');
select has_table('public', 'work_publication_operations', 'publication operations table exists');
select has_table('public', 'work_publication_operation_images', 'publication operation image snapshots exist');
select has_column('public', 'works', 'publication_revision', 'Works record a server publication revision');
select has_column('public', 'work_images', 'upload_status', 'Work images record upload lifecycle');
select has_column('public', 'work_images', 'original_verified_at', 'Work images record verification time');
select has_column('public', 'work_images', 'cleanup_required', 'Work images record cleanup state');

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.work_publication_operations'::regclass),
  'publication operations have enabled and forced RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.work_publication_operation_images'::regclass),
  'publication operation images have enabled and forced RLS'
);

select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'work_originals_insert_exact_reservation' and cmd = 'INSERT'),
  'exact original reservation upload policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'work_originals_read_exact_authorised' and cmd = 'SELECT'),
  'exact original retrieval policy exists'
);
select ok(
  (select qual like '%object.get_authenticated%' from pg_policies where schemaname = 'storage' and policyname = 'work_originals_read_exact_authorised'),
  'original retrieval policy is operation-aware'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%work_public%'),
  'public-copy bucket has no browser write policy'
);

select results_eq(
  $$select id, public, file_size_limit from storage.buckets where id in ('work-originals', 'work-public') order by id$$,
  $$values ('work-originals'::text, false, 52428800::bigint), ('work-public'::text, true, 52428800::bigint)$$,
  'declarative private and public buckets have the intended limits'
);
select results_eq(
  $$select allowed_mime_types from storage.buckets where id = 'work-originals'$$,
  $$values (array['image/jpeg','image/png','image/webp','image/avif']::text[])$$,
  'original bucket permits only approved image MIME types'
);

select has_function('public', 'reserve_work_image_upload', array['uuid','text','text','bigint','boolean'], 'narrow browser reservation RPC exists');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.reserve_work_image_upload(uuid,text,text,bigint,boolean)'::regprocedure),
  'public reservation wrapper is SECURITY INVOKER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.reserve_work_image_upload(uuid,text,text,bigint,boolean)'::regprocedure),
  'reservation implementation is private and SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.account_can_manage_work(uuid,uuid)'::regprocedure),
  'explicit service authorization helper is private'
);

select ok(
  not has_function_privilege('anon', 'public.reserve_work_image_upload(uuid,text,text,bigint,boolean)', 'EXECUTE'),
  'anonymous users cannot reserve uploads'
);
select ok(
  has_function_privilege('authenticated', 'public.reserve_work_image_upload(uuid,text,text,bigint,boolean)', 'EXECUTE'),
  'authenticated users may invoke only the reservation wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'public.service_finalize_work_publication(uuid,uuid)', 'EXECUTE'),
  'ordinary users cannot finalize publication'
);
select ok(
  has_function_privilege('service_role', 'public.service_finalize_work_publication(uuid,uuid)', 'EXECUTE'),
  'service role may invoke trusted publication finalization'
);
select ok(
  not has_function_privilege('authenticated', 'public.service_mark_work_image_upload(uuid,uuid,boolean,text)', 'EXECUTE'),
  'ordinary users cannot forge upload verification'
);
select ok(
  not has_table_privilege('authenticated', 'public.work_publication_operations', 'INSERT,UPDATE,DELETE'),
  'ordinary users cannot mutate publication operations'
);
select ok(
  not has_table_privilege('anon', 'public.work_publication_operations', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous users have no publication-operation privileges'
);

select ok(
  exists (
    select 1
      from pg_index
     where indexrelid = 'public.work_publication_operations_one_active_per_work'::regclass
       and indisunique
       and indpred is not null
  ),
  'active-operation uniqueness uses deterministic status values'
);
select ok(
  not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname in ('work_publication_operations_one_active_per_work', 'work_publication_operations_idempotency')
       and (
         lower(indexdef) like '%now(%'
         or lower(indexdef) like '%statement_timestamp(%'
         or lower(indexdef) like '%current_timestamp(%'
       )
  ),
  'publication unique-index predicates contain no time-dependent expression'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.work_images'::regclass and conname = 'work_images_public_private_paths_differ'),
  'private and public paths are constrained to differ'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.work_images'::regclass and conname = 'work_images_file_size_limit'),
  'Work-image file size constraint matches the bucket ceiling'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.work_publication_operations'::regclass and conname = 'work_publication_operations_cleanup_consistent'),
  'publication cleanup lifecycle is constrained'
);

select ok(
  not has_table_privilege('anon', 'storage.objects', 'INSERT,UPDATE,DELETE')
  or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and roles @> array['anon'::name] and cmd in ('INSERT','UPDATE','DELETE','ALL')),
  'anonymous users have no effective Storage mutation policy'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and roles @> array['authenticated'::name] and cmd in ('UPDATE','DELETE','ALL')),
  'authenticated users have no Storage overwrite, move, or delete policy'
);

select * from finish();
rollback;
