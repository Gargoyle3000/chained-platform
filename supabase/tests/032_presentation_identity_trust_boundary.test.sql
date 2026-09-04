begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

-- Canonical accounts and profiles used by the identity boundary.

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000001','authenticated','authenticated','identity-owner@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000002','authenticated','authenticated','identity-target@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000003','authenticated','authenticated','identity-other@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000004','authenticated','authenticated','identity-private@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000005','authenticated','authenticated','identity-suspended@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000006','authenticated','authenticated','identity-no-role@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b1100000-0000-4000-8000-000000000007','authenticated','authenticated','identity-no-member@example.test',now(),now());

insert into public.accounts (id, status, display_name)
values
  ('b1100000-0000-4000-8000-000000000001','active','IDENTITY OWNER'),
  ('b1100000-0000-4000-8000-000000000002','active','ELIGIBLE ARTIST'),
  ('b1100000-0000-4000-8000-000000000003','active','OTHER ARTIST'),
  ('b1100000-0000-4000-8000-000000000004','active','PRIVATE ARTIST'),
  ('b1100000-0000-4000-8000-000000000005','suspended','SUSPENDED ARTIST'),
  ('b1100000-0000-4000-8000-000000000006','active','NO ROLE ARTIST'),
  ('b1100000-0000-4000-8000-000000000007','active','NO MEMBER ARTIST');

insert into public.account_roles (account_id, role)
values
  ('b1100000-0000-4000-8000-000000000001','artist'),
  ('b1100000-0000-4000-8000-000000000002','artist'),
  ('b1100000-0000-4000-8000-000000000003','artist'),
  ('b1100000-0000-4000-8000-000000000004','artist'),
  ('b1100000-0000-4000-8000-000000000005','artist'),
  ('b1100000-0000-4000-8000-000000000007','artist');

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at,
  created_by_account_id, show_presentations
)
values
  ('b1200000-0000-4000-8000-000000000001','artist','identity-owner','IDENTITY OWNER','published',now(),'claimed','b1100000-0000-4000-8000-000000000001',now(),'b1100000-0000-4000-8000-000000000001',true),
  ('b1200000-0000-4000-8000-000000000002','artist','eligible-artist','ELIGIBLE ARTIST','published',now(),'claimed','b1100000-0000-4000-8000-000000000002',now(),'b1100000-0000-4000-8000-000000000002',true),
  ('b1200000-0000-4000-8000-000000000003','artist','other-artist','OTHER ARTIST','published',now(),'claimed','b1100000-0000-4000-8000-000000000003',now(),'b1100000-0000-4000-8000-000000000003',true),
  ('b1200000-0000-4000-8000-000000000004','artist','private-artist','PRIVATE ARTIST','draft',null,'claimed','b1100000-0000-4000-8000-000000000004',now(),'b1100000-0000-4000-8000-000000000004',true),
  ('b1200000-0000-4000-8000-000000000005','artist','suspended-artist','SUSPENDED ARTIST','published',now(),'claimed','b1100000-0000-4000-8000-000000000005',now(),'b1100000-0000-4000-8000-000000000005',true),
  ('b1200000-0000-4000-8000-000000000006','artist','no-role-artist','NO ROLE ARTIST','published',now(),'claimed','b1100000-0000-4000-8000-000000000006',now(),'b1100000-0000-4000-8000-000000000006',true),
  ('b1200000-0000-4000-8000-000000000007','artist','no-member-artist','NO MEMBER ARTIST','published',now(),'claimed','b1100000-0000-4000-8000-000000000007',now(),'b1100000-0000-4000-8000-000000000007',true);

insert into public.profile_members (profile_id, account_id, membership_level)
values
  ('b1200000-0000-4000-8000-000000000001','b1100000-0000-4000-8000-000000000001','owner'),
  ('b1200000-0000-4000-8000-000000000002','b1100000-0000-4000-8000-000000000002','owner'),
  ('b1200000-0000-4000-8000-000000000003','b1100000-0000-4000-8000-000000000003','owner'),
  ('b1200000-0000-4000-8000-000000000004','b1100000-0000-4000-8000-000000000004','owner'),
  ('b1200000-0000-4000-8000-000000000005','b1100000-0000-4000-8000-000000000005','owner'),
  ('b1200000-0000-4000-8000-000000000006','b1100000-0000-4000-8000-000000000006','owner');

insert into public.profile_activities (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, activity_type, venue_name, city, start_date,
  show_in_presentations, visibility, published_at
)
values (
  'b1300000-0000-4000-8000-000000000001',
  'b1200000-0000-4000-8000-000000000001',
  'b1100000-0000-4000-8000-000000000001',
  'b1100000-0000-4000-8000-000000000001',
  'IDENTITY PRESENTATION', 'group-exhibition', 'IDENTITY VENUE',
  'AMSTERDAM', '2026-09-04', true, 'published', now()
);

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, year_sort, year_label, work_type, visibility
)
values (
  'b1400000-0000-4000-8000-000000000001',
  'b1200000-0000-4000-8000-000000000003',
  'b1100000-0000-4000-8000-000000000003',
  'b1100000-0000-4000-8000-000000000003',
  'OTHER ARTIST WORK', 2026, '2026', 'single-work', 'draft'
);

-- More than the result cap proves that lookup remains bounded.

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select
  '00000000-0000-0000-0000-000000000000',
  ('b1190000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'identity-limit-' || item || '@example.test', now(), now()
from generate_series(1, 12) as item;

insert into public.accounts (id, status, display_name)
select
  ('b1190000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'active', 'LIMIT ARTIST ' || lpad(item::text, 2, '0')
from generate_series(1, 12) as item;

insert into public.account_roles (account_id, role)
select
  ('b1190000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'artist'
from generate_series(1, 12) as item;

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at,
  created_by_account_id
)
select
  ('b1290000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'artist', 'limit-artist-' || item,
  'LIMIT ARTIST ' || lpad(item::text, 2, '0'),
  'published', now(), 'claimed',
  ('b1190000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  now(),
  ('b1190000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid
from generate_series(1, 12) as item;

insert into public.profile_members (profile_id, account_id, membership_level)
select
  ('b1290000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  ('b1190000-0000-4000-8000-' || lpad(item::text, 12, '0'))::uuid,
  'owner'
from generate_series(1, 12) as item;

-- Schema, projection, and grant boundaries.

select has_function('public','search_presentation_artist_profiles',array['text'],'safe Artist lookup exists');
select has_function('public','set_presentation_participant_profile',array['uuid','uuid'],'participant profile link RPC exists');
select has_function('public','invite_presentation_cooperator_by_profile',array['uuid','uuid'],'profile-based co-operator invite exists');
select has_function('public','get_managed_presentation_cooperator_summaries',array['uuid'],'safe managed co-operator summary exists');
select ok(not has_function_privilege('anon','public.search_presentation_artist_profiles(text)','EXECUTE'),'anonymous cannot execute Artist lookup');
select ok(has_function_privilege('authenticated','public.search_presentation_artist_profiles(text)','EXECUTE'),'authenticated may execute Artist lookup');
select ok(not has_function_privilege('authenticated','public.invite_presentation_cooperator(uuid,uuid,uuid)','EXECUTE'),'raw account-id invite wrapper is not a browser contract');
select ok(not has_function_privilege('authenticated','private.invite_presentation_cooperator(uuid,uuid,uuid)','EXECUTE'),'authenticated caller cannot bypass the profile wrapper through the private account-id primitive');
select ok(not has_table_privilege('authenticated','public.presentation_cooperators','SELECT'),'browser cannot select raw co-operator rows');
select ok(position('account' in lower(pg_get_function_result('public.search_presentation_artist_profiles(text)'::regprocedure)))=0 and position('email' in lower(pg_get_function_result('public.search_presentation_artist_profiles(text)'::regprocedure)))=0 and position('auth' in lower(pg_get_function_result('public.search_presentation_artist_profiles(text)'::regprocedure)))=0,'Artist lookup result has no account, auth, or email field');
select ok(position('account' in lower(pg_get_function_result('public.get_managed_presentation_cooperator_summaries(uuid)'::regprocedure)))=0 and position('email' in lower(pg_get_function_result('public.get_managed_presentation_cooperator_summaries(uuid)'::regprocedure)))=0 and position('auth' in lower(pg_get_function_result('public.get_managed_presentation_cooperator_summaries(uuid)'::regprocedure)))=0,'managed co-operator result has no account, auth, or email field');
select ok(position('created_by_account_id' in lower(pg_get_function_result('public.get_managed_presentation_participants(uuid)'::regprocedure)))=0 and position('updated_by_account_id' in lower(pg_get_function_result('public.get_managed_presentation_participants(uuid)'::regprocedure)))=0,'managed participant projection omits account audit identifiers');

-- Authenticated lookup exposes only eligible public Artist identities.

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select profile_id,display_name,slug from public.search_presentation_artist_profiles('eligible')$$,$$values ('b1200000-0000-4000-8000-000000000002'::uuid,'ELIGIBLE ARTIST'::varchar,'eligible-artist'::varchar)$$,'eligible published Artist is searchable');
select results_eq($$select profile_id from public.search_presentation_artist_profiles('  ELIGIBLE  ')$$,$$values ('b1200000-0000-4000-8000-000000000002'::uuid)$$,'lookup normalizes case and surrounding whitespace');
select results_eq($$select profile_id from public.search_presentation_artist_profiles('other-a')$$,$$values ('b1200000-0000-4000-8000-000000000003'::uuid)$$,'lookup supports canonical slug prefix');
select throws_ok($$select * from public.search_presentation_artist_profiles('el')$$,'22023',null,'lookup requires at least three characters');
select throws_ok($$select * from public.search_presentation_artist_profiles(repeat('a',101))$$,'22023',null,'lookup rejects oversized queries');
select results_eq($$select count(*) from public.search_presentation_artist_profiles('limit')$$,$$values (10::bigint)$$,'lookup result count is capped at ten');
select is_empty($$select * from public.search_presentation_artist_profiles('private')$$,'draft profile is excluded from lookup');
select is_empty($$select * from public.search_presentation_artist_profiles('suspended')$$,'suspended account profile is excluded from lookup');
select is_empty($$select * from public.search_presentation_artist_profiles('no-role')$$,'profile without active Artist role is excluded from lookup');
select is_empty($$select * from public.search_presentation_artist_profiles('no-member')$$,'profile without active owner membership is excluded from lookup');

reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.search_presentation_artist_profiles('eligible')$$,'42501',null,'anonymous cannot enumerate Artist lookup');

-- Participant linking preserves historical attribution and grants no Work authority.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.create_presentation_participant('b1300000-0000-4000-8000-000000000001','HISTORICAL ATTRIBUTION',null)$$,'owner creates independent historical participant');
select results_eq($$select public.set_presentation_participant_profile((select id from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ATTRIBUTION'),'b1200000-0000-4000-8000-000000000002')$$,$$values (true)$$,'owner links eligible participant profile');
select results_eq($$select display_name from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where linked_profile_id='b1200000-0000-4000-8000-000000000002'$$,$$values ('HISTORICAL ATTRIBUTION'::varchar)$$,'linking preserves historical display name');
select results_eq($$select public.set_presentation_participant_profile((select id from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ATTRIBUTION'),null)$$,$$values (true)$$,'owner unlinks participant profile');
select results_eq($$select display_name,linked_profile_id from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ATTRIBUTION'$$,$$values ('HISTORICAL ATTRIBUTION'::varchar,null::uuid)$$,'unlink preserves historical attribution');
select throws_ok($$select public.set_presentation_participant_profile((select id from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ATTRIBUTION'),'b1200000-0000-4000-8000-000000000004')$$,'22023',null,'private profile cannot be linked');
select throws_ok($$select public.create_presentation_participant('b1300000-0000-4000-8000-000000000001','PRIVATE BYPASS','b1200000-0000-4000-8000-000000000004')$$,'22023',null,'participant creation cannot bypass profile eligibility');
select throws_ok($$select public.set_presentation_participant_profile((select id from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ATTRIBUTION'),'b1200000-0000-4000-8000-000000009999')$$,'22023',null,'nonexistent profile cannot be linked');

reset role;
update public.presentation_participants
   set id = 'b1500000-0000-4000-8000-000000000001'
 where presentation_id = 'b1300000-0000-4000-8000-000000000001'
   and display_name = 'HISTORICAL ATTRIBUTION';

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.set_presentation_participant_profile('b1500000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000003')$$,'42501',null,'unrelated account cannot link a participant');

-- Profile-based invitation keeps account resolution private and owner-only.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000002')$$,'owner invites eligible profile');
select lives_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000003')$$,'owner invites second eligible profile');
select results_eq($$select count(*) from public.get_managed_presentation_cooperator_summaries('b1300000-0000-4000-8000-000000000001')$$,$$values (2::bigint)$$,'owner sees managed co-operator summaries');
select results_eq($$select profile_id,profile_display_name,profile_slug,cooperator_status from public.get_managed_presentation_cooperator_summaries('b1300000-0000-4000-8000-000000000001') where profile_id='b1200000-0000-4000-8000-000000000002'$$,$$values ('b1200000-0000-4000-8000-000000000002'::uuid,'ELIGIBLE ARTIST'::varchar,'eligible-artist'::varchar,'pending'::public.presentation_cooperator_status)$$,'owner summary contains only safe human identity and lifecycle status');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000001')$$,'22023',null,'self-invite is rejected safely');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000004')$$,'22023',null,'private profile invite is rejected');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000009999')$$,'22023',null,'nonexistent profile invite is rejected');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000009999','b1200000-0000-4000-8000-000000000002')$$,'42501',null,'unrelated Presentation invite is rejected');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000002')$$,'23505',null,'duplicate active invitation keeps existing lifecycle semantics');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.accept_presentation_cooperator((select invitation_id from public.get_presentation_cooperator_invitation_summaries() where presentation_id='b1300000-0000-4000-8000-000000000001'))$$,'invited profile owner accepts invitation');
select results_eq($$select count(*) from public.get_managed_presentation_cooperator_summaries('b1300000-0000-4000-8000-000000000001')$$,$$values (1::bigint)$$,'accepted co-operator sees only their own allowed context');
select results_eq($$select public.set_presentation_participant_profile((select id from public.get_managed_presentation_participants('b1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ATTRIBUTION'),'b1200000-0000-4000-8000-000000000003')$$,$$values (true)$$,'accepted co-operator can link an eligible participant profile');
select results_eq($$update public.works set title='ILLEGAL IDENTITY EDIT' where id='b1400000-0000-4000-8000-000000000001' returning id$$,$$select null::uuid where false$$,'participant linkage grants no Work edit authority');
select throws_ok($$select public.soft_delete_work('b1400000-0000-4000-8000-000000000001')$$,'42501',null,'participant linkage grants no Work delete authority');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000003')$$,'42501',null,'accepted co-operator cannot invite other co-operators');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is_empty($$select * from public.get_managed_presentation_cooperator_summaries('b1300000-0000-4000-8000-000000000001')$$,'unrelated account cannot read managed co-operator context');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000002')$$,'42501',null,'unrelated account cannot invite co-operators');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.revoke_presentation_cooperator((select cooperator_id from public.get_managed_presentation_cooperator_summaries('b1300000-0000-4000-8000-000000000001') where profile_id='b1200000-0000-4000-8000-000000000002'))$$,'owner revokes accepted co-operator');
select lives_ok($$select public.invite_presentation_cooperator_by_profile('b1300000-0000-4000-8000-000000000001','b1200000-0000-4000-8000-000000000002')$$,'revoked profile can be invited again under existing lifecycle semantics');

reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.get_managed_presentation_cooperator_summaries('b1300000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous cannot read managed co-operator summaries');

select * from finish();
rollback;
