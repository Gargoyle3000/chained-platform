begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'order-owner@example.test', now(), now()),
('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'order-unrelated@example.test', now(), now());

insert into public.accounts (id, status, display_name) values
('91000000-0000-4000-8000-000000000001', 'active', 'ORDER OWNER'),
('91000000-0000-4000-8000-000000000002', 'active', 'ORDER UNRELATED');

insert into public.public_profiles (id, profile_type, slug, display_name, publication_status, published_at, claim_state, primary_controller_account_id, claimed_at, created_by_account_id) values
('92000000-0000-4000-8000-000000000001', 'artist', 'order-owner', 'ORDER OWNER', 'published', now(), 'claimed', '91000000-0000-4000-8000-000000000001', now(), '91000000-0000-4000-8000-000000000001'),
('92000000-0000-4000-8000-000000000002', 'artist', 'order-other', 'ORDER OTHER', 'published', now(), 'claimed', '91000000-0000-4000-8000-000000000002', now(), '91000000-0000-4000-8000-000000000002');

insert into public.profile_members (profile_id, account_id, membership_level, status) values
('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'owner', 'active'),
('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'owner', 'active');

insert into public.works (id, owner_profile_id, created_by_account_id, updated_by_account_id, title, year_sort, year_label, work_type, visibility, published_at) values
('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'A', 2026, '2026', 'single-work', 'published', now()),
('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'B', 2026, '2026', 'single-work', 'draft', null),
('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'C', 2026, '2026', 'single-work', 'published', now()),
('93000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'UNKNOWN', null, '', 'single-work', 'draft', null),
('93000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'OLDER', 2025, '2025', 'single-work', 'draft', null),
('93000000-0000-4000-8000-000000000006', '92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'OTHER', 2026, '2026', 'single-work', 'draft', null);

select has_column('public', 'works', 'profile_order', 'artist Work ordering is stored separately from image sort order');
select has_function('public', 'reorder_artist_profile_works', array['uuid', 'integer', 'uuid[]'], 'atomic artist Work reorder RPC exists');
select function_privs_are('public', 'reorder_artist_profile_works', array['uuid', 'integer', 'uuid[]'], 'authenticated', array['EXECUTE'], 'only authenticated users can execute artist Work reorder RPC');
select results_eq(
  $$select id, profile_order from public.works where owner_profile_id = '92000000-0000-4000-8000-000000000001' and year_sort = 2026 order by profile_order$$,
  $$values
    ('93000000-0000-4000-8000-000000000001'::uuid, 0),
    ('93000000-0000-4000-8000-000000000002'::uuid, 1),
    ('93000000-0000-4000-8000-000000000003'::uuid, 2)$$,
  'new Works append to the end of their year bucket');
select is((select profile_order from public.works where id = '93000000-0000-4000-8000-000000000004'), 0, 'UNKNOWN starts its own manually orderable bucket');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.reorder_artist_profile_works(
    '92000000-0000-4000-8000-000000000001',
    2026,
    array[
      '93000000-0000-4000-8000-000000000003',
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002'
    ]::uuid[]
  )$$,
  'authorized artist manager can reorder a complete same-year bucket'
);
select results_eq(
  $$select id, profile_order from public.works where owner_profile_id = '92000000-0000-4000-8000-000000000001' and year_sort = 2026 order by profile_order$$,
  $$values
    ('93000000-0000-4000-8000-000000000003'::uuid, 0),
    ('93000000-0000-4000-8000-000000000001'::uuid, 1),
    ('93000000-0000-4000-8000-000000000002'::uuid, 2)$$,
  'reorder normalizes positions atomically'
);
select throws_ok(
  $$select public.reorder_artist_profile_works('92000000-0000-4000-8000-000000000001', 2026, array['93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000005', '93000000-0000-4000-8000-000000000003']::uuid[])$$,
  '23514', null, 'cross-year payload is rejected'
);
select throws_ok(
  $$select public.reorder_artist_profile_works('92000000-0000-4000-8000-000000000001', 2026, array['93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002']::uuid[])$$,
  '23514', null, 'duplicate payload is rejected'
);
select throws_ok(
  $$update public.works set profile_order = 99 where id = '93000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'ordinary clients cannot bypass the atomic ordering RPC'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.reorder_artist_profile_works('92000000-0000-4000-8000-000000000001', 2026, array['93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002']::uuid[])$$,
  '42501', null, 'unrelated authenticated user cannot reorder another artist profile'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.reorder_artist_profile_works('92000000-0000-4000-8000-000000000001', 2026, array['93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002']::uuid[])$$,
  '42501', null, 'anonymous user cannot reorder artist Works'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.works set year_sort = 2025, year_label = '2025' where id = '93000000-0000-4000-8000-000000000001';
reset role;
select is((select profile_order from public.works where id = '93000000-0000-4000-8000-000000000001'), 1, 'year change appends the Work to the destination bucket');
select results_eq(
  $$select id from public.works where owner_profile_id = '92000000-0000-4000-8000-000000000001' and year_sort = 2026 and deleted_at is null order by profile_order$$,
  $$values
    ('93000000-0000-4000-8000-000000000003'::uuid),
    ('93000000-0000-4000-8000-000000000002'::uuid)$$,
  'source bucket retains the remaining relative order after a year change'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.works set year_sort = null, year_label = '' where id = '93000000-0000-4000-8000-000000000002';
reset role;
select is((select profile_order from public.works where id = '93000000-0000-4000-8000-000000000002'), 1, 'known-to-UNKNOWN moves append to UNKNOWN');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.reorder_artist_profile_works('92000000-0000-4000-8000-000000000001', null, array['93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000004']::uuid[])$$,
  'UNKNOWN bucket supports the same authorised manual ordering'
);
reset role;
select results_eq(
  $$select id, profile_order from public.works where owner_profile_id = '92000000-0000-4000-8000-000000000001' and year_sort is null and deleted_at is null order by profile_order$$,
  $$values
    ('93000000-0000-4000-8000-000000000002'::uuid, 0),
    ('93000000-0000-4000-8000-000000000004'::uuid, 1)$$,
  'UNKNOWN manual ordering is normalized'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.works set year_sort = 2025, year_label = '2025' where id = '93000000-0000-4000-8000-000000000002';
reset role;
select is((select profile_order from public.works where id = '93000000-0000-4000-8000-000000000002'), 2, 'UNKNOWN-to-known moves append to the destination year');
select ok(has_column_privilege('anon', 'public.works', 'profile_order', 'SELECT'), 'public profile projection may read its safe curation position');
select ok(not has_column_privilege('authenticated', 'public.works', 'profile_order', 'UPDATE'), 'ordinary clients cannot write curation position directly');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.soft_delete_work('93000000-0000-4000-8000-000000000004')$$,
  'soft deletion leaves the order model intact'
);
reset role;
select is_empty(
  $$select id from public.works where owner_profile_id = '92000000-0000-4000-8000-000000000001' and year_sort is null and deleted_at is null$$,
  'soft-deleted Works do not participate in active ordering'
);
select ok(
  not exists (
    select 1 from public.work_publication_operations as operation
    join public.works as work on work.id = operation.work_id
    where work.owner_profile_id = '92000000-0000-4000-8000-000000000001'
  ),
  'ordering creates no publication lifecycle operation'
);
select results_eq(
  $$select count(*)::integer from public.audit_events where action = 'works.profile_order_reordered' and target_id = '92000000-0000-4000-8000-000000000001'$$,
  $$values (2)$$,
  'successful reorders are audit recorded'
);
select has_index('public', 'works', 'works_active_artist_curation_order', 'active artist-curation query has a narrow ordering index');

select * from finish();
rollback;
