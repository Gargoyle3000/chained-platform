begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'derivative-owner@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'derivative-other@example.test', now(), now());
insert into public.accounts (id, status, display_name) values
  ('91000000-0000-4000-8000-000000000001', 'active', 'DERIVATIVE OWNER'),
  ('91000000-0000-4000-8000-000000000002', 'active', 'DERIVATIVE OTHER');
insert into public.public_profiles (id, profile_type, slug, display_name, publication_status, published_at, claim_state, primary_controller_account_id, claimed_at, created_by_account_id)
values
  ('92000000-0000-4000-8000-000000000001', 'artist', 'derivative-owner', 'DERIVATIVE OWNER', 'published', now(), 'claimed', '91000000-0000-4000-8000-000000000001', now(), '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'artist', 'derivative-other', 'DERIVATIVE OTHER', 'published', now(), 'claimed', '91000000-0000-4000-8000-000000000002', now(), '91000000-0000-4000-8000-000000000002');
insert into public.profile_members (profile_id, account_id, membership_level, status) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'owner', 'active');
insert into public.works (id, owner_profile_id, created_by_account_id, updated_by_account_id, title, year_label, work_type)
values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'DERIVATIVE WORK', '2026', 'single-work'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'OTHER WORK', '2026', 'single-work');
insert into public.work_images (id, work_id, private_object_path, original_filename, mime_type, file_size, sort_order, is_cover, upload_status, original_verified_at, uploaded_by_account_id, updated_by_account_id)
values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/original.jpg', 'source.jpg', 'image/jpeg', 4, 0, true, 'ready', now(), '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002/original.jpg', 'stale.jpg', 'image/jpeg', 4, 1, false, 'ready', now(), '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000003/original.jpg', 'deleted.jpg', 'image/jpeg', 4, 2, false, 'ready', now(), '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002/93000000-0000-4000-8000-000000000002/94000000-0000-4000-8000-000000000004/original.jpg', 'other.jpg', 'image/jpeg', 4, 0, true, 'ready', now(), '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002');

select has_table('private', 'work_image_derivative_jobs', 'internal derivative jobs table exists');
select has_table('private', 'work_image_derivatives', 'internal derivative records table exists');
select has_table('public', 'work_publication_derivatives', 'publication derivative contract exists');
select has_type('private', 'work_image_derivative_state', 'internal derivative state enum exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'private.work_image_derivative_jobs'::regclass), 'jobs have forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'private.work_image_derivatives'::regclass), 'derivatives have forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.work_publication_derivatives'::regclass), 'publication derivative records have forced RLS');
select ok(not has_table_privilege('authenticated', 'private.work_image_derivative_jobs', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated users cannot mutate jobs');
select ok(not has_table_privilege('anon', 'private.work_image_derivatives', 'SELECT,INSERT,UPDATE,DELETE'), 'anonymous users cannot access derivatives');
select ok(not has_function_privilege('authenticated', 'public.service_claim_work_image_derivative_job()', 'EXECUTE'), 'ordinary users cannot claim jobs');
select ok(has_function_privilege('service_role', 'public.service_claim_work_image_derivative_job()', 'EXECUTE'), 'service role can claim jobs');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')$$, '42501', null, 'ordinary owner cannot invoke trusted enqueue wrapper');
reset role;
set local role anon;
select throws_ok($$select public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')$$, '42501', null, 'anonymous callers cannot invoke trusted enqueue wrapper');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok($$select public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$, '42501', null, 'service callers cannot enqueue another account image');
select is((public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')->>'status'), 'pending', 'verified source creates one pending job');
select is((public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')->>'idempotent')::boolean, true, 'duplicate enqueue is idempotent');
reset role;
select is((select count(*) from private.work_image_derivatives where work_image_id = '94000000-0000-4000-8000-000000000001'), 2::bigint, 'enqueue creates SMALL and LARGE records');
select results_eq($$select rendition_key::text || ':' || staging_bucket from private.work_image_derivatives where work_image_id = '94000000-0000-4000-8000-000000000001' order by rendition_key$$, $$values ('small:work-derivative-staging'::text), ('large:work-derivative-staging'::text)$$, 'staging namespace is server-owned and fixed');

set local role service_role;
select set_config('test.claim', public.service_claim_work_image_derivative_job()::text, true);
select is((current_setting('test.claim')::jsonb->>'status'), 'processing', 'claim atomically moves job to processing');
reset role;
select is((select attempt_count from private.work_image_derivative_jobs where work_image_id = '94000000-0000-4000-8000-000000000001'), 1::smallint, 'claim increments attempts');
select ok((current_setting('test.claim')::jsonb->>'lease_token') is not null, 'claim creates a lease token');
set local role service_role;
select throws_ok($$select public.service_complete_work_image_derivative_job((current_setting('test.claim')::jsonb->>'job_id')::uuid, gen_random_uuid(), 'pipeline-1', 'srgb-1', 10, 960, 640, repeat('a',64), 20, 3200, 2133, repeat('b',64))$$, '42501', null, 'wrong lease cannot complete');
reset role;
update private.work_image_derivative_jobs set lease_expires_at = statement_timestamp() - interval '1 second' where id = (current_setting('test.claim')::jsonb->>'job_id')::uuid;
set local role service_role;
select set_config('test.reclaim', public.service_claim_work_image_derivative_job()::text, true);
reset role;
select is((select attempt_count from private.work_image_derivative_jobs where id = (current_setting('test.reclaim')::jsonb->>'job_id')::uuid), 2::smallint, 'expired processing lease is reclaimed with a new attempt');
set local role service_role;
select is((public.service_complete_work_image_derivative_job((current_setting('test.reclaim')::jsonb->>'job_id')::uuid, (current_setting('test.reclaim')::jsonb->>'lease_token')::uuid, 'pipeline-1', 'srgb-1', 10, 960, 640, repeat('a',64), 20, 3200, 2133, repeat('b',64))->>'status'), 'ready', 'valid lease completes both derivatives');
reset role;
select is((select count(*) from private.work_image_derivatives where work_image_id = '94000000-0000-4000-8000-000000000001' and state = 'ready'), 2::bigint, 'both renditions are required and ready together');
select is((select state::text from private.work_image_derivative_jobs where work_image_id = '94000000-0000-4000-8000-000000000001'), 'ready', 'job becomes ready only after derivative set completion');

set local role service_role;
select set_config('test.stale', public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.stale_claim', public.service_claim_work_image_derivative_job()::text, true);
reset role;
update public.work_images set deleted_at = statement_timestamp(), deleted_by_account_id = '91000000-0000-4000-8000-000000000001' where id = '94000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok($$select public.service_complete_work_image_derivative_job((current_setting('test.stale_claim')::jsonb->>'job_id')::uuid, (current_setting('test.stale_claim')::jsonb->>'lease_token')::uuid, 'pipeline-1', 'srgb-1', 10, 960, 640, repeat('a',64), 20, 3200, 2133, repeat('b',64))$$, '42501', null, 'deleted source cannot complete through a stale lease');

select set_config('test.deleted', public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001')::text, true);
reset role;
update public.work_images set deleted_at = statement_timestamp(), deleted_by_account_id = '91000000-0000-4000-8000-000000000001' where id = '94000000-0000-4000-8000-000000000003';
set local role service_role;
select is((public.service_claim_work_image_derivative_job()->>'status'), 'obsolete', 'deleted image cannot be claimed');
reset role;
select is((select state::text from private.work_image_derivative_jobs where id = (current_setting('test.deleted')::jsonb->>'job_id')::uuid), 'failed', 'deleted image job becomes terminally failed');

set local role service_role;
select set_config('test.fail', public.service_enqueue_work_image_derivatives('94000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000002')::text, true);
select set_config('test.fail_claim', public.service_claim_work_image_derivative_job()::text, true);
select is((public.service_fail_work_image_derivative_job((current_setting('test.fail_claim')::jsonb->>'job_id')::uuid, (current_setting('test.fail_claim')::jsonb->>'lease_token')::uuid, 'decoder_failed', 'safe detail')->>'status'), 'failed', 'valid lease can mark a job failed');
reset role;
select is((select failure_code from private.work_image_derivative_jobs where id = (current_setting('test.fail')::jsonb->>'job_id')::uuid), 'decoder_failed', 'failed job retains a sanitized code');

insert into public.work_publication_operations (id, work_id, operation_kind, status, publication_revision, actor_account_id, started_at)
values ('95000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'publish', 'running', '96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', now());
insert into public.work_publication_derivatives (operation_id, publication_revision, work_image_id, rendition_key, source_derivative_id, public_object_path)
select '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', work_image_id, rendition_key, id, '92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/' || rendition_key::text || '.webp' from private.work_image_derivatives where work_image_id = '94000000-0000-4000-8000-000000000001';
select is((select count(*) from public.work_publication_derivatives), 2::bigint, 'publication contract records both immutable public assets');
select throws_ok($$insert into public.work_publication_derivatives (operation_id, publication_revision, work_image_id, rendition_key, source_derivative_id, public_object_path) select '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', work_image_id, rendition_key, id, '92000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/96000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/small.webp' from private.work_image_derivatives where work_image_id = '94000000-0000-4000-8000-000000000001' and rendition_key = 'large'$$, '23505', null, 'public derivative paths are unique');

select * from finish();
rollback;
