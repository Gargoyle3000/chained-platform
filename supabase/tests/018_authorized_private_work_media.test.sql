begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'gateway-owner@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'gateway-other@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'gateway-delegate@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'gateway-suspended@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'gateway-disabled@example.test', now(), now());

insert into public.accounts (id, status, display_name)
values
  ('81000000-0000-4000-8000-000000000001', 'active', 'GATEWAY OWNER'),
  ('81000000-0000-4000-8000-000000000002', 'active', 'GATEWAY OTHER'),
  ('81000000-0000-4000-8000-000000000003', 'active', 'GATEWAY DELEGATE'),
  ('81000000-0000-4000-8000-000000000004', 'suspended', 'GATEWAY SUSPENDED'),
  ('81000000-0000-4000-8000-000000000005', 'disabled', 'GATEWAY DISABLED');

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id
)
values
  ('82000000-0000-4000-8000-000000000001', 'artist', 'gateway-owner', 'GATEWAY OWNER', 'published', now(), 'claimed', '81000000-0000-4000-8000-000000000001', now(), '81000000-0000-4000-8000-000000000001'),
  ('82000000-0000-4000-8000-000000000002', 'artist', 'gateway-other', 'GATEWAY OTHER', 'published', now(), 'claimed', '81000000-0000-4000-8000-000000000002', now(), '81000000-0000-4000-8000-000000000002'),
  ('83000000-0000-4000-8000-000000000001', 'institution', 'gateway-delegate', 'GATEWAY DELEGATE', 'published', now(), 'claimed', null, null, '81000000-0000-4000-8000-000000000003');

insert into public.profile_members (profile_id, account_id, membership_level, status, revoked_at)
values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'owner', 'active', null),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'owner', 'active', null),
  ('83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 'manager', 'active', null),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', 'editor', 'active', null),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000005', 'editor', 'active', null);

insert into public.profile_access_grants (
  grantor_profile_id, grantee_profile_id, scope, status,
  granted_by_account_id, granted_at
)
values (
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'works_editor', 'active',
  '81000000-0000-4000-8000-000000000001', now()
);

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  deleted_by_account_id, title, year_label, work_type, visibility,
  published_at, publication_revision, deleted_at, purge_after
)
values
  ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, 'GATEWAY DRAFT', '2026', 'single-work', 'draft', null, null, null, null),
  ('84000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, 'GATEWAY PUBLISHED', '2026', 'single-work', 'published', now(), '86000000-0000-4000-8000-000000000001', null, null),
  ('84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', null, 'GATEWAY OTHER', '2026', 'single-work', 'draft', null, null, null, null),
  ('84000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, 'GATEWAY DELETED WORK', '2026', 'single-work', 'draft', null, null, null, null),
  ('84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, 'GATEWAY STATES', '2026', 'single-work', 'draft', null, null, null, null);

insert into public.work_images (
  id, work_id, private_object_path, public_object_path, original_filename,
  mime_type, file_size, sort_order, is_cover, upload_status,
  original_verified_at, uploaded_by_account_id, updated_by_account_id,
  deleted_by_account_id, deleted_at, deletion_started_at,
  cleanup_required, cleanup_failure_code
)
values
  ('85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000001/85000000-0000-4000-8000-000000000001/original.jpg', null, 'draft-one.jpg', 'image/jpeg', 4, 0, true, 'ready', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, null, null, false, null),
  ('85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000001/85000000-0000-4000-8000-000000000002/original.jpg', null, 'draft-two.jpg', 'image/jpeg', 4, 1, false, 'ready', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, null, null, false, null),
  ('85000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000002/85000000-0000-4000-8000-000000000003/original.jpg', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000002/86000000-0000-4000-8000-000000000001/85000000-0000-4000-8000-000000000003.jpg', 'published.jpg', 'image/jpeg', 4, 0, true, 'ready', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, null, null, false, null),
  ('85000000-0000-4000-8000-000000000004', '84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000002/84000000-0000-4000-8000-000000000003/85000000-0000-4000-8000-000000000004/original.jpg', null, 'other.jpg', 'image/jpeg', 4, 0, true, 'ready', now(), '81000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', null, null, null, false, null),
  ('85000000-0000-4000-8000-000000000005', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000005/85000000-0000-4000-8000-000000000005/original.jpg', null, 'reserved.jpg', 'image/jpeg', 4, 0, true, 'reserved', null, '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, null, null, false, null),
  ('85000000-0000-4000-8000-000000000006', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000005/85000000-0000-4000-8000-000000000006/original.jpg', null, 'unverified.jpg', 'image/jpeg', 4, 1, false, 'ready', null, '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, null, null, false, null),
  ('85000000-0000-4000-8000-000000000007', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000005/85000000-0000-4000-8000-000000000007/original.jpg', null, 'deleting.jpg', 'image/jpeg', 4, 2, false, 'deleting', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now(), now(), true, null),
  ('85000000-0000-4000-8000-000000000008', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000005/85000000-0000-4000-8000-000000000008/original.jpg', null, 'cleanup.jpg', 'image/jpeg', 4, 3, false, 'cleanup_pending', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now(), now(), true, 'object_cleanup_incomplete'),
  ('85000000-0000-4000-8000-000000000009', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000005/85000000-0000-4000-8000-000000000009/original.jpg', null, 'deleted.jpg', 'image/jpeg', 4, 4, false, 'deleted', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now(), now(), false, null),
  ('85000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000005/85000000-0000-4000-8000-000000000010/original.jpg', null, 'soft-deleted.jpg', 'image/jpeg', 4, 5, false, 'ready', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now(), now(), false, null),
  ('85000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000004/85000000-0000-4000-8000-000000000011/original.jpg', null, 'deleted-work.jpg', 'image/jpeg', 4, 0, true, 'ready', now(), '81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', null, null, null, false, null);

update public.works
   set deleted_by_account_id = '81000000-0000-4000-8000-000000000001',
       deleted_at = now(),
       purge_after = now() + interval '30 days'
 where id = '84000000-0000-4000-8000-000000000004';

select has_function(
  'private', 'service_resolve_authorized_private_work_images', array['uuid', 'uuid[]'],
  'private batch resolver exists'
);
select has_function(
  'public', 'service_resolve_authorized_private_work_images', array['uuid', 'uuid[]'],
  'service wrapper exists'
);
select is_definer(
  'private', 'service_resolve_authorized_private_work_images', array['uuid', 'uuid[]'],
  'private resolver is security definer'
);
select isnt_definer(
  'public', 'service_resolve_authorized_private_work_images', array['uuid', 'uuid[]'],
  'public wrapper remains security invoker'
);
select ok(
  not has_function_privilege('authenticated', 'public.service_resolve_authorized_private_work_images(uuid,uuid[])', 'execute'),
  'authenticated clients cannot execute the resolver wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.service_resolve_authorized_private_work_images(uuid,uuid[])', 'execute'),
  'anonymous clients cannot execute the resolver wrapper'
);
select ok(
  has_function_privilege('service_role', 'public.service_resolve_authorized_private_work_images(uuid,uuid[])', 'execute'),
  'service role can execute the resolver wrapper'
);
select ok(
  has_function_privilege('service_role', 'private.service_resolve_authorized_private_work_images(uuid,uuid[])', 'execute'),
  'service role can execute the private resolver'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array['85000000-0000-4000-8000-000000000001']::uuid[]
    )$$,
  '42501', null, 'ordinary authenticated callers cannot invoke the service resolver'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$select jsonb_array_length(public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array['85000000-0000-4000-8000-000000000001']::uuid[]
    )->'images')$$,
  $$values (1)$$,
  'owner resolves one ready draft image'
);
select results_eq(
  $$select item->>'work_image_id'
      from jsonb_array_elements(public.service_resolve_authorized_private_work_images(
        '81000000-0000-4000-8000-000000000001',
        array[
          '85000000-0000-4000-8000-000000000002',
          '85000000-0000-4000-8000-000000000001'
        ]::uuid[]
      )->'images') as item$$,
  $$values
      ('85000000-0000-4000-8000-000000000002'::text),
      ('85000000-0000-4000-8000-000000000001'::text)$$,
  'multi-image batch preserves requested order'
);
select results_eq(
  $$select jsonb_array_length(public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array[
        '85000000-0000-4000-8000-000000000001',
        '85000000-0000-4000-8000-000000000001'
      ]::uuid[]
    )->'images')$$,
  $$values (1)$$,
  'duplicate image IDs are returned once'
);
select results_eq(
  $$select jsonb_array_length(public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array['85000000-0000-4000-8000-000000000003']::uuid[]
    )->'images')$$,
  $$values (1)$$,
  'owner resolves a currently published image private original'
);

select public.service_begin_work_unpublication(
  '84000000-0000-4000-8000-000000000002',
  '81000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000002'
);
select results_eq(
  $$select jsonb_array_length(public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array['85000000-0000-4000-8000-000000000003']::uuid[]
    )->'images')$$,
  $$values (1)$$,
  'the same private original resolves after publish to draft'
);
select results_eq(
  $$select jsonb_array_length(public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000003',
      array['85000000-0000-4000-8000-000000000001']::uuid[]
    )->'images')$$,
  $$values (1)$$,
  'active delegated works editor resolves the private original'
);

select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array['85000000-0000-4000-8000-000000000004']::uuid[]
    )$$,
  '42501', 'Private media is unavailable.', 'another artist image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array['89999999-9999-4999-8999-999999999999']::uuid[]
    )$$,
  '42501', 'Private media is unavailable.', 'fake image ID is indistinguishable from denied media'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array[
        '85000000-0000-4000-8000-000000000001',
        '85000000-0000-4000-8000-000000000004'
      ]::uuid[]
    )$$,
  '42501', 'Private media is unavailable.', 'one denied image rejects the whole mixed batch'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000004',
      array['85000000-0000-4000-8000-000000000001']::uuid[]
    )$$,
  '42501', 'Private media is unavailable.', 'suspended account is denied'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000005',
      array['85000000-0000-4000-8000-000000000001']::uuid[]
    )$$,
  '42501', 'Private media is unavailable.', 'disabled account is denied'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81999999-9999-4999-8999-999999999999',
      array['85000000-0000-4000-8000-000000000001']::uuid[]
    )$$,
  '42501', 'Private media is unavailable.', 'missing account is denied'
);

select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000005']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'reserved image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000006']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'unverified image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000007']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'deleting image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000008']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'cleanup-pending image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000009']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'deleted image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000010']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'soft-deleted image is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000011']::uuid[])$$,
  '42501', 'Private media is unavailable.', 'image belonging to a deleted Work is unavailable'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images('81000000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  '22023', null, 'empty image list is rejected'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
      '81000000-0000-4000-8000-000000000001',
      array(select gen_random_uuid() from generate_series(1, 101))
    )$$,
  '22023', null, 'more than 100 unique image IDs are rejected'
);

reset role;
select ok(
  position('allow_only_operation' in (
    select qual from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'work_originals_read_exact_authorised'
  )) > 0,
  'strict private Storage operation gate remains unchanged'
);
select ok(
  position('can_read_exact_work_original' in (
    select qual from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'work_originals_read_exact_authorised'
  )) > 0,
  'strict exact-object Storage authorization remains unchanged'
);
select results_eq(
  $$select public from storage.buckets where id = 'work-originals'$$,
  $$values (false)$$,
  'work-originals remains private'
);

select * from finish();
rollback;
