begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ready-owner@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ready-other@example.test', now(), now());

insert into public.accounts (id, status, display_name) values
  ('f1000000-0000-4000-8000-000000000001', 'active', 'READY OWNER'),
  ('f1000000-0000-4000-8000-000000000002', 'active', 'READY OTHER');

insert into public.public_profiles (
  id, profile_type, slug, display_name, claim_state,
  primary_controller_account_id, claimed_at, created_by_account_id
) values (
  'f2000000-0000-4000-8000-000000000001', 'artist', 'ready-owner', 'READY OWNER',
  'claimed', 'f1000000-0000-4000-8000-000000000001', now(), 'f1000000-0000-4000-8000-000000000001'
);

insert into public.profile_members (profile_id, account_id, membership_level, status) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner', 'active');

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, year_sort, year_label, work_type
) values
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'AFTER PROCESSING', 2026, '2026', 'single-work'),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'SECOND READY', 2026, '2026', 'single-work'),
  ('f3000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'STILL PROCESSING', 2026, '2026', 'single-work'),
  ('f3000000-0000-4000-8000-000000000004', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'PUBLISHED READY', 2026, '2026', 'single-work'),
  ('f3000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'DELETED READY', 2026, '2026', 'single-work'),
  ('f3000000-0000-4000-8000-000000000006', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'EXISTING READY DRAFT', 2026, '2026', 'single-work');

insert into public.work_images (
  id, work_id, private_object_path, original_filename, mime_type,
  file_size, pixel_width, pixel_height, sort_order, is_cover,
  upload_status, original_verified_at, uploaded_by_account_id, updated_by_account_id
) values
  ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000001/images/f4000000-0000-4000-8000-000000000001/source.jpg', 'one.jpg', 'image/jpeg', 100, 96, 64, 0, true, 'ready', now(), 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000002/images/f4000000-0000-4000-8000-000000000002/source.jpg', 'two.jpg', 'image/jpeg', 100, 96, 64, 0, true, 'ready', now(), 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000003/images/f4000000-0000-4000-8000-000000000003/source.jpg', 'three.jpg', 'image/jpeg', 100, 96, 64, 0, true, 'ready', now(), 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000005', 'f3000000-0000-4000-8000-000000000006', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000006/images/f4000000-0000-4000-8000-000000000005/source.jpg', 'existing.jpg', 'image/jpeg', 100, 96, 64, 0, true, 'ready', now(), 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001');

insert into private.work_image_derivative_jobs (
  id, work_image_id, source_private_object_path, state, attempt_count,
  claimed_at, completed_at, requested_by_account_id
) values
  ('f5000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000001/images/f4000000-0000-4000-8000-000000000001/source.jpg', 'ready', 1, '2026-09-12 10:00:00+00', '2026-09-12 10:00:00+00', 'f1000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000002', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000002/images/f4000000-0000-4000-8000-000000000002/source.jpg', 'ready', 1, '2026-09-12 11:00:00+00', '2026-09-12 11:00:00+00', 'f1000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000003', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000003/images/f4000000-0000-4000-8000-000000000003/source.jpg', 'pending', 0, null, null, 'f1000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000005', 'f4000000-0000-4000-8000-000000000005', 'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000006/images/f4000000-0000-4000-8000-000000000005/source.jpg', 'ready', 1, '2026-09-12 09:00:00+00', '2026-09-12 09:00:00+00', 'f1000000-0000-4000-8000-000000000001');

insert into private.work_image_derivatives (
  id, work_image_id, source_private_object_path, rendition_key, state,
  staging_object_path, mime_type, file_size, pixel_width, pixel_height,
  checksum_sha256, pipeline_version, icc_profile_version, verified_at, completed_at
)
select
  gen_random_uuid(), job.work_image_id, job.source_private_object_path,
  rendition.rendition_key::private.work_image_derivative_rendition_key,
  case when job.state = 'ready' then 'ready'::private.work_image_derivative_state else 'pending'::private.work_image_derivative_state end,
  'staging/' || job.id::text || '/' || rendition.rendition_key || '.webp',
  case when job.state = 'ready' then 'image/webp' end,
  case when job.state = 'ready' then 20 end,
  case when job.state = 'ready' then 96 end,
  case when job.state = 'ready' then 64 end,
  case when job.state = 'ready' then repeat('a', 64) end,
  case when job.state = 'ready' then 'pipeline' end,
  case when job.state = 'ready' then 'icc' end,
  case when job.state = 'ready' then job.completed_at end,
  case when job.state = 'ready' then job.completed_at end
from private.work_image_derivative_jobs job
cross join (values ('small'), ('large')) as rendition(rendition_key);

select has_table('private', 'work_publish_ready_acknowledgements', 'Work-ready acknowledgement storage exists');
select has_table('private', 'work_publish_ready_action_activation', 'Work-ready activation boundary exists');
select col_is_pk('private', 'work_publish_ready_acknowledgements', array['account_id', 'work_id'], 'one acknowledgement exists per account and Work');
select col_is_pk('private', 'work_publish_ready_action_activation', array['singleton'], 'the activation boundary is a singleton');
select ok(not has_table_privilege('authenticated', 'private.work_publish_ready_acknowledgements', 'SELECT'), 'browser roles cannot read acknowledgement storage directly');
select ok(not has_table_privilege('authenticated', 'private.work_publish_ready_action_activation', 'SELECT'), 'browser roles cannot read or move the activation boundary');
select has_function('public', 'list_my_work_publish_ready_actions', array[]::text[], 'self-scoped Work-ready action projection exists');
select has_function('public', 'acknowledge_my_work_publish_ready_action', array['uuid'], 'explicit Work-ready acknowledgement exists');
select ok(not has_function_privilege('public', 'public.list_my_work_publish_ready_actions()', 'EXECUTE'), 'PUBLIC cannot list Work-ready actions');
select ok(not has_function_privilege('anon', 'public.list_my_work_publish_ready_actions()', 'EXECUTE'), 'anonymous callers cannot list Work-ready actions');
select ok(has_function_privilege('authenticated', 'public.list_my_work_publish_ready_actions()', 'EXECUTE'), 'authenticated callers may list their Work-ready actions');
select ok(not has_function_privilege('public', 'public.acknowledge_my_work_publish_ready_action(uuid)', 'EXECUTE'), 'PUBLIC cannot acknowledge Work-ready actions');
select ok(not has_function_privilege('anon', 'public.acknowledge_my_work_publish_ready_action(uuid)', 'EXECUTE'), 'anonymous callers cannot acknowledge Work-ready actions');
select ok(has_function_privilege('authenticated', 'public.acknowledge_my_work_publish_ready_action(uuid)', 'EXECUTE'), 'authenticated callers may acknowledge subject to manager authorization');
select ok(not has_function_privilege('authenticated', 'private.work_publication_readiness_snapshot(uuid)', 'EXECUTE'), 'browser roles cannot execute the internal readiness snapshot');

update private.work_publish_ready_action_activation
   set ready_generation_not_before = '2026-09-12 09:30:00+00'
 where singleton;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000006')$$,
  '22023', 'The Work is not ready to publish.', 'a historical pre-activation READY draft cannot be acknowledged'
);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000003')$$,
  '22023', 'The Work is not ready to publish.', 'a processing Work cannot be acknowledged'
);
select results_eq(
  $$select work_id, work_title from public.list_my_work_publish_ready_actions()$$,
  $$values
    ('f3000000-0000-4000-8000-000000000001'::uuid, 'AFTER PROCESSING'::text),
    ('f3000000-0000-4000-8000-000000000002'::uuid, 'SECOND READY'::text)$$,
  'one self-scoped projection returns only post-activation current ready Work actions'
);
select results_eq(
  $$select work_id, work_title from public.list_my_work_publish_ready_actions()$$,
  $$values
    ('f3000000-0000-4000-8000-000000000001'::uuid, 'AFTER PROCESSING'::text),
    ('f3000000-0000-4000-8000-000000000002'::uuid, 'SECOND READY'::text)$$,
  'rendering or reloading alone does not acknowledge an action'
);
reset role;

update public.accounts
   set status = 'suspended'
 where id = 'f1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty(
  $$select * from public.list_my_work_publish_ready_actions()$$,
  'a suspended account cannot list Work-ready actions'
);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000001')$$,
  '42501', 'The Work is unavailable.', 'a suspended account cannot acknowledge a Work-ready action'
);
reset role;

update public.accounts
   set status = 'active'
 where id = 'f1000000-0000-4000-8000-000000000001';
update public.profile_members
   set status = 'revoked',
       revoked_at = statement_timestamp(),
       revoked_by_account_id = 'f1000000-0000-4000-8000-000000000001'
 where profile_id = 'f2000000-0000-4000-8000-000000000001'
   and account_id = 'f1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty(
  $$select * from public.list_my_work_publish_ready_actions()$$,
  'revoked Work management removes all Work-ready actions'
);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000001')$$,
  '42501', 'The Work is unavailable.', 'revoked Work management cannot acknowledge an action'
);
reset role;

update public.profile_members
   set status = 'active',
       revoked_at = null,
       revoked_by_account_id = null
 where profile_id = 'f2000000-0000-4000-8000-000000000001'
   and account_id = 'f1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000001'),
  true,
  'explicit acknowledgement succeeds for the current manageable ready Work'
);
select results_eq(
  $$select work_id from public.list_my_work_publish_ready_actions()$$,
  $$values ('f3000000-0000-4000-8000-000000000002'::uuid)$$,
  'acknowledged current ready generation no longer appears'
);
reset role;

insert into public.work_images (
  id, work_id, private_object_path, original_filename, mime_type,
  file_size, pixel_width, pixel_height, sort_order, is_cover,
  upload_status, original_verified_at, uploaded_by_account_id, updated_by_account_id
) values (
  'f4000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000001',
  'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000001/images/f4000000-0000-4000-8000-000000000004/source.jpg',
  'replacement.jpg', 'image/jpeg', 100, 96, 64, 1, false, 'ready', now(),
  'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001'
);
insert into private.work_image_derivative_jobs (
  id, work_image_id, source_private_object_path, state, attempt_count,
  claimed_at, completed_at, requested_by_account_id
) values (
  'f5000000-0000-4000-8000-000000000004', 'f4000000-0000-4000-8000-000000000004',
  'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000001/images/f4000000-0000-4000-8000-000000000004/source.jpg',
  'ready', 1, '2026-09-12 12:00:00+00', '2026-09-12 12:00:00+00', 'f1000000-0000-4000-8000-000000000001'
);
insert into private.work_image_derivatives (
  id, work_image_id, source_private_object_path, rendition_key, state,
  staging_object_path, mime_type, file_size, pixel_width, pixel_height,
  checksum_sha256, pipeline_version, icc_profile_version, verified_at, completed_at
)
select
  gen_random_uuid(), 'f4000000-0000-4000-8000-000000000004'::uuid,
  'profiles/f2000000-0000-4000-8000-000000000001/works/f3000000-0000-4000-8000-000000000001/images/f4000000-0000-4000-8000-000000000004/source.jpg',
  rendition.rendition_key::private.work_image_derivative_rendition_key, 'ready',
  'staging/replacement/' || rendition.rendition_key || '.webp', 'image/webp', 20, 96, 64,
  repeat('b', 64), 'pipeline', 'icc', '2026-09-12 12:00:00+00', '2026-09-12 12:00:00+00'
from (values ('small'), ('large')) as rendition(rendition_key);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select work_id, work_title from public.list_my_work_publish_ready_actions()$$,
  $$values
    ('f3000000-0000-4000-8000-000000000001'::uuid, 'AFTER PROCESSING'::text),
    ('f3000000-0000-4000-8000-000000000002'::uuid, 'SECOND READY'::text)$$,
  'a later current media-ready generation creates a new Work action'
);
reset role;

update public.works
   set visibility = 'published',
       published_at = '2026-09-12 13:00:00+00'
 where id = 'f3000000-0000-4000-8000-000000000002';
update public.works
   set deleted_at = '2026-09-12 13:00:00+00',
       purge_after = '2026-10-12 13:00:00+00',
       deleted_by_account_id = 'f1000000-0000-4000-8000-000000000001'
 where id = 'f3000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty(
  $$select * from public.list_my_work_publish_ready_actions()$$,
  'published and deleted Works disappear automatically'
);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000002')$$,
  '42501', 'The Work is unavailable.', 'a published Work cannot be acknowledged'
);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000001')$$,
  '42501', 'The Work is unavailable.', 'a deleted Work cannot be acknowledged'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty(
  $$select * from public.list_my_work_publish_ready_actions()$$,
  'non-manageable Works are not projected'
);
select throws_ok(
  $$select public.acknowledge_my_work_publish_ready_action('f3000000-0000-4000-8000-000000000002')$$,
  '42501', 'The Work is unavailable.', 'non-managers cannot acknowledge another Work action'
);
reset role;

select is(
  (select ready_generation_at from private.work_publish_ready_acknowledgements
    where account_id = 'f1000000-0000-4000-8000-000000000001'
      and work_id = 'f3000000-0000-4000-8000-000000000001'),
  '2026-09-12 10:00:00+00'::timestamptz,
  'acknowledgement remains scoped to the specifically handled generation'
);

select * from finish();
rollback;
