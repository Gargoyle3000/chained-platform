begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public', 'archive_items', 'origin', 'SELECT membership records its origin');
select col_type_is('public', 'archive_items', 'origin', 'public.archive_item_origin', 'SELECT origin uses the constrained enum');
select has_index('public', 'archive_items', 'archive_items_account_origin_created', 'SELECT origin listing is indexed');
select has_function('public', 'list_managed_select_works', array[]::text[], 'managed SELECT Work projection exists');
select has_function('public', 'list_managed_select_work_images', array[]::text[], 'managed SELECT image projection exists');
select ok(not has_column_privilege('authenticated', 'public.archive_items', 'origin', 'INSERT'), 'clients cannot choose SELECT origin');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'select-owner@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'select-manager@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'select-outsider@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'select-delegate@example.test', now(), now());

insert into public.accounts (id, status, display_name) values
  ('d1000000-0000-4000-8000-000000000001', 'active', 'SELECT OWNER'),
  ('d1000000-0000-4000-8000-000000000002', 'active', 'SELECT MANAGER'),
  ('d1000000-0000-4000-8000-000000000003', 'active', 'SELECT OUTSIDER'),
  ('d1000000-0000-4000-8000-000000000004', 'active', 'SELECT DELEGATE');

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id
) values
  ('d2000000-0000-4000-8000-000000000001', 'artist', 'select-artist-a', 'SELECT ARTIST A', 'published', now(), 'claimed', 'd1000000-0000-4000-8000-000000000001', now(), 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'artist', 'select-artist-b', 'SELECT ARTIST B', 'draft', null, 'claimed', 'd1000000-0000-4000-8000-000000000001', now(), 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000003', 'artist', 'select-external', 'SELECT EXTERNAL', 'published', now(), 'unclaimed_gallery_managed', null, null, 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000004', 'institution', 'select-institution', 'SELECT INSTITUTION', 'published', now(), 'claimed', 'd1000000-0000-4000-8000-000000000004', now(), 'd1000000-0000-4000-8000-000000000004');

insert into public.profile_members (profile_id, account_id, membership_level, status) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'manager', 'active'),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004', 'manager', 'active');

insert into public.profile_access_grants (
  grantor_profile_id, grantee_profile_id, scope, status,
  granted_by_account_id, granted_at
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000004',
  'works_editor', 'active', 'd1000000-0000-4000-8000-000000000001', now()
);

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, year_sort, year_label, work_type, visibility, published_at
) values
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'OWN DRAFT', 2026, '2026', 'single-work', 'draft', null),
  ('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'OWN PUBLISHED', 2025, '2025', 'single-work', 'published', now()),
  ('d3000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'DRAFT PROFILE WORK', 2024, '2024', 'single-work', 'draft', null),
  ('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'EXTERNAL PUBLISHED', 2023, '2023', 'single-work', 'published', now()),
  ('d3000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'EXTERNAL DRAFT', 2022, '2022', 'single-work', 'draft', null),
  ('d3000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'FOLLOWING ONLY', 2021, '2021', 'single-work', 'published', now());

insert into public.work_images (
  id, work_id, private_object_path, preview_object_path, original_filename,
  mime_type, file_size, preview_file_size, pixel_width, pixel_height,
  sort_order, is_cover, upload_status, original_verified_at, preview_verified_at,
  uploaded_by_account_id, updated_by_account_id
) values (
  'd4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000001/d4000000-0000-4000-8000-000000000001/original.webp',
  'd2000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000001/d4000000-0000-4000-8000-000000000001/preview.webp', 'draft.webp',
  'image/webp', 100, 50, 1000, 800, 0, true, 'ready', now(), now(),
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.archive_items$$, '42501', null, 'anon cannot read private SELECT membership');
select throws_ok($$select * from public.list_managed_select_works()$$, '42501', null, 'anon cannot call managed SELECT projection');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$select work_id, origin from public.archive_items order by work_id$$,
  $$values
    ('d3000000-0000-4000-8000-000000000001'::uuid, 'managed'::public.archive_item_origin),
    ('d3000000-0000-4000-8000-000000000002'::uuid, 'managed'::public.archive_item_origin),
    ('d3000000-0000-4000-8000-000000000003'::uuid, 'managed'::public.archive_item_origin)$$,
  'all Works from multiple directly managed Artist Profiles appear once'
);
select results_eq(
  $$select id from public.list_managed_select_works() order by id$$,
  $$values
    ('d3000000-0000-4000-8000-000000000001'::uuid),
    ('d3000000-0000-4000-8000-000000000002'::uuid),
    ('d3000000-0000-4000-8000-000000000003'::uuid)$$,
  'managed SELECT projection includes drafts, published Works and a draft Profile'
);
select results_eq(
  $$select id from public.list_managed_select_work_images()$$,
  $$values ('d4000000-0000-4000-8000-000000000001'::uuid)$$,
  'managed SELECT image projection returns authorized image metadata'
);
select lives_ok($$delete from public.archive_items where work_id='d3000000-0000-4000-8000-000000000001'$$, 'managed membership delete is RLS-safe');
select results_eq(
  $$select count(*)::bigint from public.archive_items where work_id='d3000000-0000-4000-8000-000000000001'$$,
  $$values (1::bigint)$$,
  'managed membership cannot be removed by the user'
);

select lives_ok($$insert into public.archive_items(work_id) values ('d3000000-0000-4000-8000-000000000004')$$, 'external published Work can still be saved explicitly');
select results_eq(
  $$select origin from public.archive_items where work_id='d3000000-0000-4000-8000-000000000004'$$,
  $$values ('saved'::public.archive_item_origin)$$,
  'external save retains saved origin'
);
select throws_ok($$insert into public.archive_items(work_id) values ('d3000000-0000-4000-8000-000000000004')$$, '23505', null, 'duplicate SELECT membership remains blocked');
select throws_ok($$insert into public.archive_items(work_id) values ('d3000000-0000-4000-8000-000000000005')$$, '42501', null, 'external draft cannot be saved');
select is_empty(
  $$select work_id from public.archive_items where work_id='d3000000-0000-4000-8000-000000000006'$$,
  'an encountered or followed public Work is not saved implicitly'
);

insert into public.archive_tags(name) values ('OWN WORK');
select lives_ok(
  $$insert into public.archive_item_tags(work_id, tag_id)
    select 'd3000000-0000-4000-8000-000000000001', id from public.archive_tags where name='OWN WORK'$$,
  'managed Work accepts a user Tag'
);
select results_eq(
  $$select work_id from public.archive_item_tags$$,
  $$values ('d3000000-0000-4000-8000-000000000001'::uuid)$$,
  'managed Work Tag membership persists'
);

insert into public.archive_projects(title) values ('OWN PROJECT');
select set_config('test.managed_select_project', (select id::text from public.archive_projects where title='OWN PROJECT'), true);
select lives_ok(
  $$select public.add_archive_project_item(current_setting('test.managed_select_project')::uuid, 'd3000000-0000-4000-8000-000000000001')$$,
  'managed draft Work enters a Project'
);
select lives_ok(
  $$select public.add_archive_project_item(current_setting('test.managed_select_project')::uuid, 'd3000000-0000-4000-8000-000000000002')$$,
  'managed published Work enters the same Project'
);
select lives_ok(
  $$select public.reorder_archive_project_items(
    current_setting('test.managed_select_project')::uuid,
    array['d3000000-0000-4000-8000-000000000002'::uuid, 'd3000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'managed Works use normal Project ordering'
);
select results_eq(
  $$select work_id from public.archive_project_items where project_id=current_setting('test.managed_select_project')::uuid order by position$$,
  $$values ('d3000000-0000-4000-8000-000000000002'::uuid), ('d3000000-0000-4000-8000-000000000001'::uuid)$$,
  'managed Project order persists'
);

reset role;
update public.works set visibility='draft', published_at=null where id='d3000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.archive_items where work_id='d3000000-0000-4000-8000-000000000002'$$,
  $$values (1::bigint)$$,
  'unpublishing an own Work preserves managed SELECT membership'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select results_eq(
  $$select jsonb_array_length(public.service_resolve_authorized_private_work_images(
    'd1000000-0000-4000-8000-000000000002',
    array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'select_preview'
  )->'images')$$,
  $$values (1)$$,
  'active direct manager can resolve a private SELECT preview'
);
select results_eq(
  $$select public.service_resolve_authorized_private_work_images(
    'd1000000-0000-4000-8000-000000000002',
    array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'select_pdf_export'
  )->'images'->0->>'object_path'$$,
  $$values ('d2000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000001/d4000000-0000-4000-8000-000000000001/original.webp')$$,
  'active direct manager can resolve a private original for SELECT PDF export'
);

reset role;
update public.profile_members
   set status='revoked', revoked_at=now(), revoked_by_account_id='d1000000-0000-4000-8000-000000000001'
 where profile_id='d2000000-0000-4000-8000-000000000001'
   and account_id='d1000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty($$select work_id from public.archive_items$$, 'revocation removes automatic SELECT representation immediately');
select is_empty($$select id from public.list_managed_select_works()$$, 'revoked manager cannot read managed SELECT Work metadata');
select is_empty($$select id from public.works where id='d3000000-0000-4000-8000-000000000001'$$, 'revoked manager cannot read the private draft Work');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
    'd1000000-0000-4000-8000-000000000002',
    array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'select_preview'
  )$$,
  '42501', null,
  'revoked manager cannot resolve private SELECT media'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
    'd1000000-0000-4000-8000-000000000002',
    array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'select_pdf_export'
  )$$,
  '42501', null,
  'revoked manager cannot resolve private SELECT PDF media'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
    'd1000000-0000-4000-8000-000000000004',
    array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'select_preview'
  )$$,
  '42501', null,
  'delegated Work access does not authorize private SELECT media'
);
select throws_ok(
  $$select public.service_resolve_authorized_private_work_images(
    'd1000000-0000-4000-8000-000000000004',
    array['d4000000-0000-4000-8000-000000000001']::uuid[],
    'select_pdf_export'
  )$$,
  '42501', null,
  'delegated Work access does not authorize private SELECT PDF media'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is_empty($$select work_id from public.archive_items$$, 'delegated Gallery Work access does not create private SELECT membership');
select is_empty($$select id from public.list_managed_select_works()$$, 'delegated Gallery Work access does not enter managed SELECT projection');

reset role;
insert into public.profile_members (profile_id, account_id, membership_level, status)
values ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'editor', 'active');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select work_id from public.archive_items order by work_id$$,
  $$values ('d3000000-0000-4000-8000-000000000001'::uuid), ('d3000000-0000-4000-8000-000000000002'::uuid)$$,
  'granting direct management backfills all current non-deleted Profile Works'
);

reset role;
update public.works
   set deleted_by_account_id='d1000000-0000-4000-8000-000000000001',
       deleted_at=now(), purge_after=now() + interval '30 days'
 where id='d3000000-0000-4000-8000-000000000001';
select is_empty(
  $$select work_id from public.archive_items where work_id='d3000000-0000-4000-8000-000000000001'$$,
  'soft-deleting a Work removes every automatic SELECT membership'
);
select is_empty(
  $$select work_id from public.archive_item_tags where work_id='d3000000-0000-4000-8000-000000000001'$$,
  'soft-delete cleanup removes dependent managed Tag membership'
);
select is_empty(
  $$select work_id from public.archive_project_items where work_id='d3000000-0000-4000-8000-000000000001'$$,
  'soft-delete cleanup removes dependent managed Project membership'
);

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, year_label, work_type
) values (
  'd3000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'NEW OWN DRAFT', '2026', 'single-work'
);
select results_eq(
  $$select count(*)::bigint from public.archive_items where work_id='d3000000-0000-4000-8000-000000000007' and origin='managed'$$,
  $$values (2::bigint)$$,
  'a new draft Work enters SELECT for every current direct manager immediately'
);

select * from finish();
rollback;
