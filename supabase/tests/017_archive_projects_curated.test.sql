begin;

create extension if not exists pgtap with schema extensions;
select plan(73);

select has_table('public', 'archive_projects', 'Archive Projects table exists');
select has_table('public', 'archive_project_items', 'Archive Project items table exists');
select has_table('public', 'curated_collections', 'public CURATED projection table exists');
select has_function('private', 'is_eligible_curated_publisher_profile', array['uuid'], 'central CURATED publisher eligibility helper exists');
select has_column('public', 'archive_projects', 'publisher_profile_id', 'Project retains publisher selection');
select col_is_pk('public', 'archive_project_items', array['project_id', 'work_id'], 'Project item identity prevents duplicate Works');
select has_index('public', 'archive_project_items', 'archive_project_items_project_position_key', 'Project positions are unique');
select ok((select relrowsecurity from pg_class where oid = 'public.archive_projects'::regclass), 'Project RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.archive_project_items'::regclass), 'Project item RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.curated_collections'::regclass), 'CURATED RLS is enabled');
select ok(not has_table_privilege('anon', 'public.archive_projects', 'SELECT'), 'anon cannot select private Projects');
select ok(not has_table_privilege('authenticated', 'public.archive_project_items', 'INSERT'), 'Project item mutation uses the controlled function');
select ok(not has_table_privilege('authenticated', 'public.curated_collections', 'INSERT'), 'CURATED publication uses the controlled function');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'projects-owner@example.test', now(), now()),
('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'projects-delegated@example.test', now(), now()),
('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'projects-outsider@example.test', now(), now());

insert into public.accounts (id, status, display_name) values
('b1000000-0000-4000-8000-000000000001', 'active', 'PROJECT OWNER'),
('b1000000-0000-4000-8000-000000000002', 'active', 'PROJECT DELEGATED MANAGER'),
('b1000000-0000-4000-8000-000000000003', 'active', 'PROJECT OUTSIDER');

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id,
  deleted_by_account_id, deleted_at, purge_after
) values
('b2000000-0000-4000-8000-000000000001', 'artist', 'projects-artist', 'PROJECTS ARTIST', 'published', now(), 'claimed', 'b1000000-0000-4000-8000-000000000001', now(), 'b1000000-0000-4000-8000-000000000001', null, null, null),
('b2000000-0000-4000-8000-000000000002', 'curator', 'projects-curator', 'PROJECTS CURATOR', 'published', now(), 'claimed', 'b1000000-0000-4000-8000-000000000002', now(), 'b1000000-0000-4000-8000-000000000002', null, null, null),
('b2000000-0000-4000-8000-000000000003', 'institution', 'projects-institution', 'PROJECTS INSTITUTION', 'published', now(), 'claimed', 'b1000000-0000-4000-8000-000000000001', now(), 'b1000000-0000-4000-8000-000000000001', null, null, null);

insert into public.profile_members (profile_id, account_id, membership_level, status) values
('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner', 'active'),
('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'manager', 'active'),
('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'manager', 'active');

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, year_label, work_type, visibility, published_at
) values
('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'PROJECT PUBLIC WORK ONE', '2026', 'single-work', 'published', now()),
('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'PROJECT PUBLIC WORK TWO', '2026', 'single-work', 'published', now()),
('b3000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'PROJECT DRAFT WORK', '2026', 'single-work', 'draft', null),
('b3000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'PROJECT ORDER WORK THREE', '2026', 'single-work', 'published', now()),
('b3000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'PROJECT ORDER WORK FOUR', '2026', 'single-work', 'published', now());

insert into public.archive_items (account_id, work_id) values
('b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000002'),
('b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000004'),
('b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000005'),
('b1000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000001');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.archive_projects$$, '42501', null, 'anon cannot read Projects');
select is_empty($$select id from public.curated_collections$$, 'anon cannot read unpublished CURATED rows');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty($$select id from public.archive_projects$$, 'new Project workspace is empty');
select lives_ok($$insert into public.archive_projects(title, description) values ('  FIRST PROJECT  ', '  PROJECT DESCRIPTION  ')$$, 'owner creates a private Project');
select results_eq($$select title, description from public.archive_projects$$, $$values ('FIRST PROJECT'::varchar, 'PROJECT DESCRIPTION'::text)$$, 'Project text is normalized');
select set_config('test.project_one', (select id::text from public.archive_projects where title = 'FIRST PROJECT'), true);
select lives_ok($$select public.add_archive_project_item(current_setting('test.project_one')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, 'owner adds an archived Work to a Project');
select lives_ok($$select public.add_archive_project_item(current_setting('test.project_one')::uuid, 'b3000000-0000-4000-8000-000000000002')$$, 'owner adds a second archived Work to a Project');
select results_eq($$select work_id, position from public.archive_project_items where project_id=current_setting('test.project_one')::uuid order by position$$, $$values ('b3000000-0000-4000-8000-000000000001'::uuid,0), ('b3000000-0000-4000-8000-000000000002'::uuid,1)$$, 'Project order starts deterministically');
select throws_ok($$select public.add_archive_project_item(current_setting('test.project_one')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, '23505', null, 'duplicate Project Work is blocked');
select lives_ok($$select public.reorder_archive_project_items(current_setting('test.project_one')::uuid, array['b3000000-0000-4000-8000-000000000002'::uuid,'b3000000-0000-4000-8000-000000000001'::uuid])$$, 'owner reorders the complete Project item set');
select results_eq($$select work_id from public.archive_project_items where project_id=current_setting('test.project_one')::uuid order by position$$, $$values ('b3000000-0000-4000-8000-000000000002'::uuid), ('b3000000-0000-4000-8000-000000000001'::uuid)$$, 'reordered Project Works persist');
select lives_ok($$select public.remove_archive_project_item(current_setting('test.project_one')::uuid, 'b3000000-0000-4000-8000-000000000002')$$, 'owner removes a Project Work');
select results_eq($$select position from public.archive_project_items where project_id=current_setting('test.project_one')::uuid$$, $$values (0::integer)$$, 'removing a Project Work closes the position gap');
select lives_ok($$select public.add_archive_project_item(current_setting('test.project_one')::uuid, 'b3000000-0000-4000-8000-000000000002')$$, 'owner restores a Project Work');
select lives_ok($$insert into public.archive_projects(title) values ('REMOVE FIRST POSITION')$$, 'owner creates a four-Work Project for first-position removal');
select set_config('test.remove_first_project', (select id::text from public.archive_projects where title='REMOVE FIRST POSITION'), true);
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_first_project')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, 'first-position Project adds Work 0');
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_first_project')::uuid, 'b3000000-0000-4000-8000-000000000002')$$, 'first-position Project adds Work 1');
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_first_project')::uuid, 'b3000000-0000-4000-8000-000000000004')$$, 'first-position Project adds Work 2');
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_first_project')::uuid, 'b3000000-0000-4000-8000-000000000005')$$, 'first-position Project adds Work 3');
select results_eq($$select work_id, position from public.archive_project_items where project_id=current_setting('test.remove_first_project')::uuid order by position$$, $$values ('b3000000-0000-4000-8000-000000000001'::uuid,0), ('b3000000-0000-4000-8000-000000000002'::uuid,1), ('b3000000-0000-4000-8000-000000000004'::uuid,2), ('b3000000-0000-4000-8000-000000000005'::uuid,3)$$, 'first-position Project starts with four contiguous Works');
select lives_ok($$select public.remove_archive_project_item(current_setting('test.remove_first_project')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, 'removing position 0 succeeds for a four-Work Project');
select results_eq($$select work_id, position from public.archive_project_items where project_id=current_setting('test.remove_first_project')::uuid order by position$$, $$values ('b3000000-0000-4000-8000-000000000002'::uuid,0), ('b3000000-0000-4000-8000-000000000004'::uuid,1), ('b3000000-0000-4000-8000-000000000005'::uuid,2)$$, 'removing position 0 keeps relative Work order and contiguous positions');
select lives_ok($$insert into public.archive_projects(title) values ('REMOVE MIDDLE POSITION')$$, 'owner creates a four-Work Project for middle-position removal');
select set_config('test.remove_middle_project', (select id::text from public.archive_projects where title='REMOVE MIDDLE POSITION'), true);
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_middle_project')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, 'middle-position Project adds Work 0');
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_middle_project')::uuid, 'b3000000-0000-4000-8000-000000000002')$$, 'middle-position Project adds Work 1');
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_middle_project')::uuid, 'b3000000-0000-4000-8000-000000000004')$$, 'middle-position Project adds Work 2');
select lives_ok($$select public.add_archive_project_item(current_setting('test.remove_middle_project')::uuid, 'b3000000-0000-4000-8000-000000000005')$$, 'middle-position Project adds Work 3');
select results_eq($$select work_id, position from public.archive_project_items where project_id=current_setting('test.remove_middle_project')::uuid order by position$$, $$values ('b3000000-0000-4000-8000-000000000001'::uuid,0), ('b3000000-0000-4000-8000-000000000002'::uuid,1), ('b3000000-0000-4000-8000-000000000004'::uuid,2), ('b3000000-0000-4000-8000-000000000005'::uuid,3)$$, 'middle-position Project starts with four contiguous Works');
select lives_ok($$select public.remove_archive_project_item(current_setting('test.remove_middle_project')::uuid, 'b3000000-0000-4000-8000-000000000002')$$, 'removing a middle position succeeds for a four-Work Project');
select results_eq($$select work_id, position from public.archive_project_items where project_id=current_setting('test.remove_middle_project')::uuid order by position$$, $$values ('b3000000-0000-4000-8000-000000000001'::uuid,0), ('b3000000-0000-4000-8000-000000000004'::uuid,1), ('b3000000-0000-4000-8000-000000000005'::uuid,2)$$, 'removing a middle position keeps relative Work order and contiguous positions');
select lives_ok($$insert into public.archive_projects(title) values ('SECOND PROJECT')$$, 'owner creates a second Project');
select set_config('test.project_two', (select id::text from public.archive_projects where title='SECOND PROJECT'), true);
select lives_ok($$select public.add_archive_project_item(current_setting('test.project_two')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, 'one archived Work can belong to multiple Projects');
select results_eq($$select count(*)::bigint from public.archive_project_items where work_id='b3000000-0000-4000-8000-000000000001'$$, $$values (3::bigint)$$, 'multiple Project memberships remain independent');
select throws_ok($$select public.publish_archive_project(current_setting('test.project_one')::uuid, 'b2000000-0000-4000-8000-000000000001')$$, '42501', null, 'artist-only publisher is rejected');
select lives_ok($$select public.publish_archive_project(current_setting('test.project_one')::uuid, 'b2000000-0000-4000-8000-000000000003')$$, 'eligible institution manager publishes a Project');
select set_config('test.collection_one', (select id::text from public.curated_collections where project_id=current_setting('test.project_one')::uuid), true);
select results_eq($$select status, publisher_profile_id from public.curated_collections where id=current_setting('test.collection_one')::uuid$$, $$values ('published'::public.publication_status, 'b2000000-0000-4000-8000-000000000003'::uuid)$$, 'published collection retains the selected institution profile');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select title from public.curated_collections where id=current_setting('test.collection_one')::uuid$$, $$values ('FIRST PROJECT'::varchar)$$, 'anon can read a published CURATED collection');
select results_eq($$select status from public.curated_collections where id=current_setting('test.collection_one')::uuid$$, $$values ('published'::public.publication_status)$$, 'anon can read the public collection status');
select results_eq($$select work_id from public.list_published_curated_collection_items(array[current_setting('test.collection_one')::uuid]) order by item_position$$, $$values ('b3000000-0000-4000-8000-000000000001'::uuid), ('b3000000-0000-4000-8000-000000000002'::uuid)$$, 'anon reads public Project Works in Project order');

reset role;
update public.works set visibility='draft', published_at=null where id='b3000000-0000-4000-8000-000000000002';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select work_id from public.list_published_curated_collection_items(array[current_setting('test.collection_one')::uuid])$$, $$values ('b3000000-0000-4000-8000-000000000001'::uuid)$$, 'unpublished Work does not leak through a published collection');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into public.archive_projects(title) values ('DELEGATED PROJECT')$$, 'delegated curator manager owns a private Project');
select set_config('test.delegated_project', (select id::text from public.archive_projects where title='DELEGATED PROJECT'), true);
select lives_ok($$select public.add_archive_project_item(current_setting('test.delegated_project')::uuid, 'b3000000-0000-4000-8000-000000000001')$$, 'delegated manager adds their archived Work');
select lives_ok($$select public.publish_archive_project(current_setting('test.delegated_project')::uuid, 'b2000000-0000-4000-8000-000000000002')$$, 'delegated curator profile manager can publish');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$select id from public.archive_projects$$, 'outsider cannot read another account Projects');
select lives_ok($$delete from public.archive_projects where id=current_setting('test.project_one')::uuid$$, 'outsider delete is RLS-safe');
select throws_ok($$select public.publish_archive_project(current_setting('test.project_one')::uuid, 'b2000000-0000-4000-8000-000000000003')$$, '42501', null, 'outsider cannot publish another Project');
select throws_ok($$select public.depublish_archive_project(current_setting('test.project_one')::uuid)$$, '42501', null, 'outsider cannot depublish another Project');

reset role;
update public.profile_members
   set status = 'revoked',
       revoked_at = now(),
       revoked_by_account_id = 'b1000000-0000-4000-8000-000000000001'
 where profile_id = 'b2000000-0000-4000-8000-000000000003'
   and account_id = 'b1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(not private.can_publish_curated('b2000000-0000-4000-8000-000000000003'), 'Project owner no longer manages the former publisher profile');
select lives_ok($$select public.depublish_archive_project(current_setting('test.project_one')::uuid)$$, 'Project owner depublishes after losing publisher-profile management');
select results_eq($$select status, publisher_profile_id, published_at is null from public.curated_collections where id=current_setting('test.collection_one')::uuid$$, $$values ('draft'::public.publication_status, 'b2000000-0000-4000-8000-000000000003'::uuid, true)$$, 'depublish keeps the CURATED row as a draft with its publisher profile');
select results_eq($$select publisher_profile_id from public.archive_projects where id=current_setting('test.project_one')::uuid$$, $$values ('b2000000-0000-4000-8000-000000000003'::uuid)$$, 'depublish preserves the Project publisher profile selection');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$select id from public.curated_collections where id=current_setting('test.collection_one')::uuid$$, 'anon cannot read a depublished collection');

reset role;
select results_eq($$select count(*)::bigint from public.archive_projects where id=current_setting('test.project_one')::uuid$$, $$values (1::bigint)$$, 'depublish preserves the private Project');
select results_eq($$select count(*)::bigint from public.archive_project_items where project_id=current_setting('test.project_one')::uuid$$, $$values (2::bigint)$$, 'depublish preserves Project item order source');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$delete from public.archive_projects where id=current_setting('test.project_one')::uuid$$, 'owner deletes their private Project');

reset role;
select results_eq($$select count(*)::bigint from public.curated_collections where id=current_setting('test.collection_one')::uuid$$, $$values (0::bigint)$$, 'deleting a Project removes its public projection');
select results_eq($$select count(*)::bigint from public.archive_items where account_id='b1000000-0000-4000-8000-000000000001' and work_id='b3000000-0000-4000-8000-000000000001'$$, $$values (1::bigint)$$, 'deleting a Project preserves the archived Work');
select results_eq($$select count(*)::bigint from public.works where id='b3000000-0000-4000-8000-000000000001'$$, $$values (1::bigint)$$, 'deleting a Project never deletes the Work');
select lives_ok($$delete from public.archive_items where account_id='b1000000-0000-4000-8000-000000000001' and work_id='b3000000-0000-4000-8000-000000000001'$$, 'removing an Archive Work is available for cascade verification');
select results_eq($$select count(*)::bigint from public.archive_project_items where project_id=current_setting('test.project_two')::uuid$$, $$values (0::bigint)$$, 'removing an Archive Work cascades only its Project membership');

select * from finish();
rollback;
