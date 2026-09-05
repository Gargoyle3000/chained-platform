begin;

create extension if not exists pgtap with schema extensions;
select plan(149);

-- Accounts

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','a1100000-0000-4000-8000-000000000001','authenticated','authenticated','p2-owner@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a1100000-0000-4000-8000-000000000002','authenticated','authenticated','p2-work-owner@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a1100000-0000-4000-8000-000000000003','authenticated','authenticated','p2-cooperator@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a1100000-0000-4000-8000-000000000004','authenticated','authenticated','p2-pending@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a1100000-0000-4000-8000-000000000005','authenticated','authenticated','p2-unrelated@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a1100000-0000-4000-8000-000000000006','authenticated','authenticated','p2-editor@example.test',now(),now());

insert into public.accounts (id, status, display_name)
values
  ('a1100000-0000-4000-8000-000000000001','active','P2 OWNER'),
  ('a1100000-0000-4000-8000-000000000002','active','P2 WORK OWNER'),
  ('a1100000-0000-4000-8000-000000000003','active','P2 COOPERATOR'),
  ('a1100000-0000-4000-8000-000000000004','active','P2 PENDING'),
  ('a1100000-0000-4000-8000-000000000005','active','P2 UNRELATED'),
  ('a1100000-0000-4000-8000-000000000006','active','P2 EDITOR');

insert into public.account_roles (account_id, role)
select id, 'artist' from public.accounts
where id::text like 'a1100000-0000-4000-8000-%';

-- Profiles: host, Work owner, cooperator, unrelated, hidden host, and private link.

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id,
  show_presentations
)
values
  ('a1200000-0000-4000-8000-000000000001','artist','p2-host','P2 HOST','published',now(),'claimed','a1100000-0000-4000-8000-000000000001',now(),'a1100000-0000-4000-8000-000000000001',true),
  ('a1200000-0000-4000-8000-000000000002','artist','p2-work-owner','P2 WORK OWNER','published',now(),'claimed','a1100000-0000-4000-8000-000000000002',now(),'a1100000-0000-4000-8000-000000000002',true),
  ('a1200000-0000-4000-8000-000000000003','artist','p2-cooperator','P2 COOPERATOR','published',now(),'claimed','a1100000-0000-4000-8000-000000000003',now(),'a1100000-0000-4000-8000-000000000003',true),
  ('a1200000-0000-4000-8000-000000000004','artist','p2-unrelated','P2 UNRELATED','published',now(),'claimed','a1100000-0000-4000-8000-000000000005',now(),'a1100000-0000-4000-8000-000000000005',true),
  ('a1200000-0000-4000-8000-000000000005','artist','p2-hidden-host','P2 HIDDEN HOST','published',now(),'claimed','a1100000-0000-4000-8000-000000000001',now(),'a1100000-0000-4000-8000-000000000001',false),
  ('a1200000-0000-4000-8000-000000000006','artist','p2-private-link','P2 PRIVATE LINK','draft',null,'claimed','a1100000-0000-4000-8000-000000000004',now(),'a1100000-0000-4000-8000-000000000004',true),
  ('a1200000-0000-4000-8000-000000000007','artist','p2-pending','P2 PENDING','published',now(),'claimed','a1100000-0000-4000-8000-000000000004',now(),'a1100000-0000-4000-8000-000000000004',true);

insert into public.profile_members (profile_id, account_id, membership_level)
values
  ('a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','owner'),
  ('a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000006','editor'),
  ('a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','owner'),
  ('a1200000-0000-4000-8000-000000000003','a1100000-0000-4000-8000-000000000003','owner'),
  ('a1200000-0000-4000-8000-000000000004','a1100000-0000-4000-8000-000000000005','owner'),
  ('a1200000-0000-4000-8000-000000000005','a1100000-0000-4000-8000-000000000001','owner'),
  ('a1200000-0000-4000-8000-000000000006','a1100000-0000-4000-8000-000000000004','owner'),
  ('a1200000-0000-4000-8000-000000000007','a1100000-0000-4000-8000-000000000004','owner');

-- Presentations

insert into public.profile_activities (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, activity_type, venue_name, city, start_date,
  show_in_presentations, include_in_cv, visibility, published_at
)
values
  ('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','PUBLIC PRESENTATION','group-exhibition','VENUE','AMSTERDAM','2020-01-01',true,false,'published',now()),
  ('a1300000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','HIDDEN PRESENTATION','group-exhibition','HIDDEN VENUE','AMSTERDAM','2020-01-01',false,true,'published',now()),
  ('a1300000-0000-4000-8000-000000000003','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','DRAFT PRESENTATION','group-exhibition','VENUE','AMSTERDAM','2020-01-01',true,false,'draft',null),
  ('a1300000-0000-4000-8000-000000000004','a1200000-0000-4000-8000-000000000005','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','PROFILE HIDDEN PRESENTATION','group-exhibition','VENUE','AMSTERDAM','2020-01-01',true,false,'published',now()),
  ('a1300000-0000-4000-8000-000000000005','a1200000-0000-4000-8000-000000000006','a1100000-0000-4000-8000-000000000004','a1100000-0000-4000-8000-000000000004','PRIVATE PROFILE PRESENTATION','group-exhibition','VENUE','AMSTERDAM','2020-01-01',true,false,'published',now()),
  ('a1300000-0000-4000-8000-000000000006','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','AGENDA SOURCE PRESENTATION','group-exhibition','AGENDA SOURCE VENUE','AMSTERDAM','2027-01-01',false,false,'published',now());

update public.profile_activities
   set end_date = '2027-02-01',
       external_url = 'https://example.test/agenda-source'
 where id = 'a1300000-0000-4000-8000-000000000006';

update public.profile_activities
   set end_date = '2020-02-01',
       external_url = 'https://example.test/cv-source'
 where id = 'a1300000-0000-4000-8000-000000000002';

-- Works

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, year_sort, year_label, work_type, visibility, published_at
)
values
  ('a1400000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','HOST WORK',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','FOREIGN ACCEPT',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000003','a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','FOREIGN REJECT',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000004','a1200000-0000-4000-8000-000000000004','a1100000-0000-4000-8000-000000000005','a1100000-0000-4000-8000-000000000005','UNLINKED FOREIGN',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000005','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','PURGE WORK',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000006','a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','COOPERATOR PROPOSAL',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000007','a1200000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','SOFT DELETE WORK',2026,'2026','single-work','published',now()),
  ('a1400000-0000-4000-8000-000000000008','a1200000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000002','PRIVATE REQUEST WORK',2026,'2026','single-work','published',now());

-- Schema and privilege contract

select has_table('public','presentation_participants','participant relation exists');
select has_table('public','presentation_works','Work association exists');
select has_table('public','presentation_cooperators','co-operator relation exists');
select has_column('public','activity_occurrences','show_in_presentation','program visibility flag exists');
select col_default_is('public','activity_occurrences','show_in_presentation','false','program visibility defaults off');
select has_function('public','get_public_activity_source_contexts',array['uuid[]'],'safe public activity-source projection exists');
select has_function('public','set_presentation_occurrence_visibility',array['uuid','boolean'],'Presentation-only program visibility RPC exists');
select has_function('public','get_work_presentation_request_summaries',array['uuid'],'Work request summary projection exists');
select has_function('public','get_my_presentation_work_request_summaries',array[]::text[],'Dashboard Work request summary projection exists');
select has_function('public','get_managed_presentation_summaries',array[]::text[],'managed Presentation summary projection exists');
select has_function('public','get_presentation_cooperator_invitation_summaries',array[]::text[],'co-operator invitation summary projection exists');
select ok(not has_function_privilege('anon','public.get_my_presentation_work_request_summaries()','EXECUTE'),'anonymous cannot execute Dashboard Work request summaries');
select ok(not has_function_privilege('anon','public.get_managed_presentation_summaries()','EXECUTE'),'anonymous cannot execute managed Presentation summaries');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.presentation_works'::regclass),'Work association RLS is forced');
select is_empty($$select grantee from information_schema.role_table_grants where table_schema='public' and table_name='presentation_works' and privilege_type in ('INSERT','UPDATE','DELETE') and grantee in ('anon','authenticated')$$,'association tables have no direct client writes');

-- Parent public visibility is enforced in RLS, not only in the client.

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000001'$$,$$values ('a1300000-0000-4000-8000-000000000001'::uuid)$$,'anonymous can read a public Presentation');
select is_empty($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000002'$$,'show_in_presentations false blocks anonymous');
select is_empty($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000003'$$,'draft Presentation remains private');
select is_empty($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000004'$$,'owner show_presentations false blocks anonymous');
select is_empty($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000005'$$,'unpublished owner profile blocks anonymous');
select is_empty($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000006'$$,'Agenda source Presentation remains hidden from direct public reads');
select throws_ok($$select * from public.get_managed_presentation_summaries()$$,'42501',null,'anonymous cannot call managed Presentation summaries');

-- Owner creates public/private-linked participants and invitations.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select id,management_role from public.get_managed_presentation_summaries() where id='a1300000-0000-4000-8000-000000000001'$$,$$values ('a1300000-0000-4000-8000-000000000001'::uuid,'owner'::text)$$,'owner sees one managed Presentation summary');
select lives_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','HISTORICAL ARTIST','a1200000-0000-4000-8000-000000000002')$$,'owner creates linked participant');
select throws_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','PRIVATE HISTORICAL NAME','a1200000-0000-4000-8000-000000000006')$$,'22023',null,'private profile cannot be linked as a participant');
select lives_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','EXTERNAL ARTIST',null)$$,'external participant needs no CHAINED account');
select lives_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000003','PRIVATE REQUEST ARTIST','a1200000-0000-4000-8000-000000000002')$$,'owner links the Work artist to a draft Presentation');
select lives_ok($$select public.update_presentation_participant((select id from public.get_managed_presentation_participants('a1300000-0000-4000-8000-000000000001') where display_name='EXTERNAL ARTIST'),'EXTERNAL ARTIST','a1200000-0000-4000-8000-000000000003',true)$$,'owner can link an existing profile later');
select results_eq($$select display_name from public.get_managed_presentation_participants('a1300000-0000-4000-8000-000000000001') where linked_profile_id='a1200000-0000-4000-8000-000000000003'$$,$$values ('EXTERNAL ARTIST'::varchar)$$,'later profile linkage preserves historical display name');
select is_empty($$select linked_profile_id from public.get_managed_presentation_participants('a1300000-0000-4000-8000-000000000001') where display_name='PRIVATE HISTORICAL NAME'$$,'rejected private participant linkage creates no row');
select lives_ok($$select public.invite_presentation_cooperator_by_profile('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000003')$$,'Presentation owner invites co-operator by profile');
select lives_ok($$select public.invite_presentation_cooperator_by_profile('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000007')$$,'Presentation owner creates pending invitation by profile');
select lives_ok($$select public.invite_presentation_cooperator_by_profile('a1300000-0000-4000-8000-000000000003','a1200000-0000-4000-8000-000000000007')$$,'Presentation owner creates a private-context invitation by profile');

reset role;
update public.presentation_cooperators
   set id = 'a1600000-0000-4000-8000-000000000001'
 where presentation_id = 'a1300000-0000-4000-8000-000000000001'
   and invited_profile_id = 'a1200000-0000-4000-8000-000000000003';
update public.presentation_cooperators
   set id = 'a1600000-0000-4000-8000-000000000002'
 where presentation_id = 'a1300000-0000-4000-8000-000000000001'
   and invited_profile_id = 'a1200000-0000-4000-8000-000000000007';
update public.presentation_cooperators
   set id = 'a1600000-0000-4000-8000-000000000003'
 where presentation_id = 'a1300000-0000-4000-8000-000000000003'
   and invited_profile_id = 'a1200000-0000-4000-8000-000000000007';

-- Editor can manage participants but cannot manage co-operators.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select lives_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','EDITOR PARTICIPANT',null)$$,'profile editor manages participants');
select lives_ok($$select public.reorder_presentation_participants('a1300000-0000-4000-8000-000000000001',(select array_agg(id order by position desc,id) from public.get_managed_presentation_participants('a1300000-0000-4000-8000-000000000001')))$$,'profile editor can reorder the complete participant set');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000004')$$,'42501',null,'profile editor cannot manage co-operators');

-- Pending co-operator and unrelated account have no management rights.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','PENDING FAILURE',null)$$,'42501',null,'pending co-operator cannot manage participants');
select results_eq($$update public.profile_activities set description='PENDING FAILURE' where id='a1300000-0000-4000-8000-000000000001' returning id$$,$$select null::uuid where false$$,'pending co-operator cannot edit Presentation');
select results_eq($$select presentation_title,presentation_host_display_name,invitation_status from public.get_presentation_cooperator_invitation_summaries() where presentation_id='a1300000-0000-4000-8000-000000000003'$$,$$values ('DRAFT PRESENTATION'::varchar,'P2 HOST'::varchar,'pending'::public.presentation_cooperator_status)$$,'invitee receives minimal private Presentation context');
select is_empty($$select id from public.get_managed_presentation_summaries() where id='a1300000-0000-4000-8000-000000000001'$$,'pending co-operator sees no invited Presentation summary');
select ok(position('description' in lower(pg_get_function_result('public.get_presentation_cooperator_invitation_summaries()'::regprocedure)))=0 and position('external_url' in lower(pg_get_function_result('public.get_presentation_cooperator_invitation_summaries()'::regprocedure)))=0,'invitation summary projects no private Presentation content');
select lives_ok($$select public.decline_presentation_cooperator('a1600000-0000-4000-8000-000000000002')$$,'invitee can decline a pending invitation');
select results_eq($$select invitation_status from public.get_presentation_cooperator_invitation_summaries() where invitation_id='a1600000-0000-4000-8000-000000000002'$$,$$values ('declined'::public.presentation_cooperator_status)$$,'declined invitation records terminal status');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.accept_presentation_cooperator('a1600000-0000-4000-8000-000000000001')$$,'42501',null,'another account cannot accept an invitation');
select throws_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','UNRELATED FAILURE',null)$$,'42501',null,'unrelated account cannot manage participants');
select throws_ok($$select linked_profile_id from public.presentation_participants where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'42501',null,'unrelated authenticated account cannot read raw linked profile identifiers');
select is_empty($$select invitation_id from public.get_presentation_cooperator_invitation_summaries()$$,'unrelated account cannot read invitation summaries');
select is_empty($$select id from public.get_managed_presentation_summaries()$$,'unrelated account sees no managed Presentation summaries');

-- Invitee accepts and receives only Presentation context authority.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.accept_presentation_cooperator('a1600000-0000-4000-8000-000000000001')$$,'invitee accepts invitation');
select results_eq($$select id,management_role from public.get_managed_presentation_summaries()$$,$$values ('a1300000-0000-4000-8000-000000000001'::uuid,'cooperator'::text)$$,'accepted co-operator sees exactly one co-operated Presentation summary');
select results_eq($$update public.profile_activities set description='COOPERATOR CONTEXT' where id='a1300000-0000-4000-8000-000000000001' returning id$$,$$values ('a1300000-0000-4000-8000-000000000001'::uuid)$$,'accepted co-operator edits Presentation context');
select lives_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','COOPERATOR PARTICIPANT',null)$$,'accepted co-operator manages participants');
select results_eq($$update public.works set title='ILLEGAL WORK EDIT' where id='a1400000-0000-4000-8000-000000000002' returning id$$,$$select null::uuid where false$$,'Presentation role grants no Work edit authority');
select throws_ok($$select public.soft_delete_work('a1400000-0000-4000-8000-000000000002')$$,'42501',null,'Presentation role grants no Work deletion authority');
select throws_ok($$select public.invite_presentation_cooperator_by_profile('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000004')$$,'42501',null,'accepted co-operator cannot manage co-operators');
select throws_ok($$select public.soft_delete_profile_activity('a1300000-0000-4000-8000-000000000001')$$,'42501',null,'accepted co-operator cannot perform owner deletion');
select lives_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000006')$$,'accepted co-operator proposes linked participant Work');
select results_eq($$select status from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001') where work_id='a1400000-0000-4000-8000-000000000006'$$,$$values ('pending'::public.presentation_work_status)$$,'co-operator foreign proposal remains pending');
select lives_ok($$select public.remove_presentation_participant((select id from public.get_managed_presentation_participants('a1300000-0000-4000-8000-000000000001') where display_name='COOPERATOR PARTICIPANT'))$$,'accepted co-operator can remove Presentation-owned participant context');
select is_empty($$select id from public.get_managed_presentation_participants('a1300000-0000-4000-8000-000000000001') where display_name='COOPERATOR PARTICIPANT'$$,'participant removal is durable');

-- Work proposal contract.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001')$$,'managed own Work links directly');
select results_eq($$select status from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000001'$$,$$values ('accepted'::public.presentation_work_status)$$,'own Work association is accepted');
select lives_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000002')$$,'linked participant foreign Work can be proposed');
select results_eq($$select status from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000002'$$,$$values ('pending'::public.presentation_work_status)$$,'foreign Work association starts pending');
select throws_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000004')$$,'42501',null,'unlinked foreign Work proposal is denied');
select lives_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000003')$$,'second linked Work proposal is pending');
select lives_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000008')$$,'foreign Work can be proposed from a draft Presentation');

reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is_empty($$select id from public.presentation_works where work_id in ('a1400000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000003','a1400000-0000-4000-8000-000000000006')$$,'pending Work proposals are never public');
select throws_ok($$select * from public.get_work_presentation_request_summaries('a1400000-0000-4000-8000-000000000008')$$,'42501',null,'anonymous cannot call Work request summaries');
select throws_ok($$select * from public.get_my_presentation_work_request_summaries()$$,'42501',null,'anonymous cannot call Dashboard Work request summaries');
select throws_ok($$select * from public.get_presentation_cooperator_invitation_summaries()$$,'42501',null,'anonymous cannot call invitation summaries');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.decide_presentation_work((select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000003'),'accepted')$$,'42501',null,'host cannot decide foreign Work request');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.decide_presentation_work((select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000003'),'accepted')$$,'42501',null,'co-operator cannot decide foreign Work request');
select lives_ok($$select public.reorder_presentation_works('a1300000-0000-4000-8000-000000000001',(select array_agg(id order by position desc,id) from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001')))$$,'accepted co-operator reorders Presentation Work context');
select lives_ok($$select public.set_presentation_work_visibility((select id from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001') where work_id='a1400000-0000-4000-8000-000000000001'),false)$$,'accepted co-operator hides an association contextually');
select results_eq($$select is_visible from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001') where work_id='a1400000-0000-4000-8000-000000000001'$$,$$values (false)$$,'association visibility change is stored');
select lives_ok($$select public.set_presentation_work_visibility((select id from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001') where work_id='a1400000-0000-4000-8000-000000000001'),true)$$,'accepted co-operator restores association visibility');
select lives_ok($$select public.remove_presentation_work((select id from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001') where work_id='a1400000-0000-4000-8000-000000000006'))$$,'accepted co-operator removes association context');
select results_eq($$select id from public.works where id='a1400000-0000-4000-8000-000000000006'$$,$$values ('a1400000-0000-4000-8000-000000000006'::uuid)$$,'association removal never deletes authoritative Work');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select presentation_title,presentation_host_display_name,work_title,request_status from public.get_work_presentation_request_summaries('a1400000-0000-4000-8000-000000000008')$$,$$values ('DRAFT PRESENTATION'::varchar,'P2 HOST'::varchar,'PRIVATE REQUEST WORK'::varchar,'pending'::public.presentation_work_status)$$,'Work owner receives minimal private Presentation request context');
select is_empty($$select id from public.profile_activities where id='a1300000-0000-4000-8000-000000000003'$$,'request summary does not grant access to the private parent row');
select ok(position('description' in lower(pg_get_function_result('public.get_work_presentation_request_summaries(uuid)'::regprocedure)))=0 and position('external_url' in lower(pg_get_function_result('public.get_work_presentation_request_summaries(uuid)'::regprocedure)))=0,'Work request summary projects no private Presentation content');
select lives_ok($$select public.decide_presentation_work((select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000002'),'accepted')$$,'Work owner accepts proposal');
select lives_ok($$select public.decide_presentation_work((select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000003'),'rejected')$$,'Work owner rejects proposal');
select results_eq($$select requested_by_account_id from public.get_work_presentation_requests('a1400000-0000-4000-8000-000000000002')$$,$$values ('a1100000-0000-4000-8000-000000000001'::uuid)$$,'Work manager can inspect proposal audit metadata');
select results_eq($$select presentation_title,presentation_host_display_name,work_id,work_title,request_status from public.get_my_presentation_work_request_summaries() order by work_id$$,$$values ('DRAFT PRESENTATION'::varchar,'P2 HOST'::varchar,'a1400000-0000-4000-8000-000000000008'::uuid,'PRIVATE REQUEST WORK'::varchar,'pending'::public.presentation_work_status)$$,'Work manager sees one pending private Presentation request in the Dashboard feed');
select ok(position('description' in lower(pg_get_function_result('public.get_my_presentation_work_request_summaries()'::regprocedure)))=0 and position('external_url' in lower(pg_get_function_result('public.get_my_presentation_work_request_summaries()'::regprocedure)))=0 and position('requested_by' in lower(pg_get_function_result('public.get_my_presentation_work_request_summaries()'::regprocedure)))=0,'Dashboard Work request feed projects no extra private Presentation or audit fields');

-- A rejected foreign proposal reuses its association while immutable audit events retain history.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.propose_presentation_work('a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000003')$$,'host can re-propose a rejected foreign Work');
select results_eq($$select count(*) from public.presentation_works where presentation_id='a1300000-0000-4000-8000-000000000001' and work_id='a1400000-0000-4000-8000-000000000003'$$,$$values (1::bigint)$$,'re-proposal reuses the same association row');
select results_eq($$select status,decided_by_account_id,decided_at from public.get_managed_presentation_works('a1300000-0000-4000-8000-000000000001') where work_id='a1400000-0000-4000-8000-000000000003'$$,$$values ('pending'::public.presentation_work_status,null::uuid,null::timestamptz)$$,'re-proposal resets decision state to pending');
select is_empty($$select association_id from public.get_my_presentation_work_request_summaries()$$,'Presentation manager receives no pending requests for another artist Work');
reset role;
select results_eq($$select count(*) from public.audit_events where action='presentation.work_proposed' and metadata->>'work_id'='a1400000-0000-4000-8000-000000000003'$$,$$values (2::bigint)$$,'both proposal attempts remain in immutable audit history');
select results_eq($$select count(*) from public.audit_events where action='presentation.work_decided' and result='rejected' and metadata->>'work_id'='a1400000-0000-4000-8000-000000000003'$$,$$values (1::bigint)$$,'the rejected decision remains in immutable audit history');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.decide_presentation_work((select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000003'),'accepted')$$,'42501',null,'host still cannot decide a re-proposed foreign Work');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select presentation_title,work_id,request_status from public.get_my_presentation_work_request_summaries() order by work_id$$,$$values ('PUBLIC PRESENTATION'::varchar,'a1400000-0000-4000-8000-000000000003'::uuid,'pending'::public.presentation_work_status),('DRAFT PRESENTATION'::varchar,'a1400000-0000-4000-8000-000000000008'::uuid,'pending'::public.presentation_work_status)$$,'Work manager receives multiple pending proposals in one Dashboard call while terminal requests are excluded');
select results_eq($$select work_id,request_status from public.get_work_presentation_request_summaries('a1400000-0000-4000-8000-000000000003')$$,$$values ('a1400000-0000-4000-8000-000000000003'::uuid,'pending'::public.presentation_work_status)$$,'existing per-Work request summary remains available');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select requested_by_account_id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000002'$$,'42501',null,'unrelated authenticated account cannot read proposal actor identifiers');
select is_empty($$select association_id from public.get_work_presentation_request_summaries('a1400000-0000-4000-8000-000000000008')$$,'unrelated account cannot read Work request summaries');
select is_empty($$select association_id from public.get_my_presentation_work_request_summaries()$$,'unrelated account receives no Dashboard Work request summaries');

-- Public child boundaries and private linked-profile projection.

reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq($$select display_name from public.presentation_participants where presentation_id='a1300000-0000-4000-8000-000000000001' and display_name='HISTORICAL ARTIST'$$,$$values ('HISTORICAL ARTIST'::varchar)$$,'visible participant of public parent is public');
select throws_ok($$select linked_profile_id from public.presentation_participants where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'42501',null,'anonymous cannot read raw linked profile identifiers');
select throws_ok($$select * from public.get_public_presentation_participants('a1300000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous cannot call the retired public raw participant projection');
select throws_ok($$select * from private.get_public_presentation_participants('a1300000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous cannot call the retired private raw participant projection');
select results_eq($$select display_name, linked_profile_slug from public.get_public_presentation_participant_summaries('a1300000-0000-4000-8000-000000000001') where display_name='HISTORICAL ARTIST'$$,$$values ('HISTORICAL ARTIST'::varchar,'p2-work-owner'::varchar)$$,'safe public participant summary preserves historical name and public profile slug');
select ok(position('linked_profile_id' in lower(pg_get_function_result('public.get_public_presentation_participant_summaries(uuid)'::regprocedure)))=0,'safe public participant summary exposes no linked profile identifier');
select results_eq($$select work_id from public.presentation_works where presentation_id='a1300000-0000-4000-8000-000000000001' order by work_id$$,$$values ('a1400000-0000-4000-8000-000000000001'::uuid),('a1400000-0000-4000-8000-000000000002'::uuid)$$,'anonymous sees only accepted public Works');
select is_empty($$select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000003'$$,'rejected Work proposal is never public');

-- Program flags are independent and historical items are eligible.

reset role;
insert into public.activity_occurrences (
  id, owner_profile_id, activity_id, created_by_account_id, updated_by_account_id,
  occurrence_type, start_date, show_in_agenda, show_in_presentation,
  visibility, published_at
)
values
  ('a1500000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','historical-talk','2020-01-02',false,true,'published',now()),
  ('a1500000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','agenda-only','2027-01-02',true,false,'published',now()),
  ('a1500000-0000-4000-8000-000000000003','a1200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','hidden-program','2020-01-03',false,false,'published',now()),
  ('a1500000-0000-4000-8000-000000000004','a1200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000002','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','private-parent','2020-01-04',false,true,'published',now()),
  ('a1500000-0000-4000-8000-000000000005','a1200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000006','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001','agenda-source','2027-01-02',true,false,'published',now());

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq($$select occurrence_type from public.activity_occurrences where id='a1500000-0000-4000-8000-000000000001'$$,$$values ('historical-talk'::varchar)$$,'historical Presentation program item is public without date filtering');
select results_eq($$select show_in_agenda,show_in_presentation from public.activity_occurrences where id='a1500000-0000-4000-8000-000000000002'$$,$$values (true,false)$$,'Agenda-only item remains independently public');
select is_empty($$select id from public.activity_occurrences where id='a1500000-0000-4000-8000-000000000003'$$,'item hidden from both surfaces is not public');
select is_empty($$select id from public.activity_occurrences where id='a1500000-0000-4000-8000-000000000004'$$,'private Presentation parent blocks program child');
select results_eq($$select occurrence_type from public.activity_occurrences where id='a1500000-0000-4000-8000-000000000005'$$,$$values ('agenda-source'::varchar)$$,'Agenda remains public when its source is hidden from Presentations');
select results_eq($$select title,venue_name from public.get_public_activity_source_contexts(array['a1300000-0000-4000-8000-000000000006'::uuid])$$,$$values ('AGENDA SOURCE PRESENTATION'::varchar,'AGENDA SOURCE VENUE'::varchar)$$,'Agenda receives minimal source context independently of Presentation visibility');
select results_eq($$select start_date,end_date,external_url from public.get_public_activity_source_contexts(array['a1300000-0000-4000-8000-000000000006'::uuid])$$,$$values (null::date,null::date,null::text)$$,'Agenda-only source context excludes CV-specific dates and URL');
select results_eq($$select title,venue_name from public.get_public_activity_source_contexts(array['a1300000-0000-4000-8000-000000000002'::uuid])$$,$$values ('HIDDEN PRESENTATION'::varchar,'HIDDEN VENUE'::varchar)$$,'automatic CV receives minimal source context independently of Presentation visibility');
select results_eq($$select start_date,end_date,external_url from public.get_public_activity_source_contexts(array['a1300000-0000-4000-8000-000000000002'::uuid])$$,$$values ('2020-01-01'::date,'2020-02-01'::date,'https://example.test/cv-source'::text)$$,'CV-eligible source context includes only the fields required by automatic CV mapping');
select is_empty($$select activity_id from public.get_public_activity_source_contexts(array['a1300000-0000-4000-8000-000000000004'::uuid])$$,'source projection rejects an activity without an independently public Agenda or CV surface');
select ok(position('description' in lower(pg_get_function_result('public.get_public_activity_source_contexts(uuid[])'::regprocedure)))=0 and position('deleted_at' in lower(pg_get_function_result('public.get_public_activity_source_contexts(uuid[])'::regprocedure)))=0 and position('visibility' in lower(pg_get_function_result('public.get_public_activity_source_contexts(uuid[])'::regprocedure)))=0 and position('published_at' in lower(pg_get_function_result('public.get_public_activity_source_contexts(uuid[])'::regprocedure)))=0,'source projection excludes private content and internal state');
select results_eq($$select source_activity_id from public.cv_entries where source_activity_id='a1300000-0000-4000-8000-000000000002'$$,$$values ('a1300000-0000-4000-8000-000000000002'::uuid)$$,'automatic public CV entry remains readable for a Presentation-hidden source');
select throws_ok($$select public.set_presentation_occurrence_visibility('a1500000-0000-4000-8000-000000000002',true)$$,'42501',null,'anonymous cannot change Presentation program visibility');

-- Accepted co-operator can create linked program items, then revocation removes access.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.set_presentation_occurrence_visibility('a1500000-0000-4000-8000-000000000002',true)$$,'42501',null,'unrelated account cannot change Presentation program visibility');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select results_eq($$select private.can_manage_presentation_program('a1300000-0000-4000-8000-000000000001')$$,$$values (true)$$,'accepted co-operator has Presentation program authority');
select results_eq($$select public.set_presentation_occurrence_visibility('a1500000-0000-4000-8000-000000000002',true)$$,$$values (true)$$,'accepted co-operator can add an Agenda-owned occurrence to the Presentation program');
select results_eq($$select show_in_agenda,show_in_presentation from public.activity_occurrences where id='a1500000-0000-4000-8000-000000000002'$$,$$values (true,true)$$,'Presentation-only visibility change preserves global Agenda visibility');
select results_eq($$select public.set_presentation_occurrence_visibility('a1500000-0000-4000-8000-000000000002',false)$$,$$values (true)$$,'accepted co-operator can remove an Agenda-owned occurrence from the Presentation program');
select lives_ok($$insert into public.activity_occurrences (owner_profile_id,activity_id,occurrence_type,start_date,show_in_agenda,show_in_presentation) values ('a1200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','cooperator-program','2020-01-05',false,true)$$,'accepted co-operator creates linked program item');
select results_eq($$update public.activity_occurrences set visibility='published' where occurrence_type='cooperator-program' returning visibility$$,$$values ('published'::public.publication_status)$$,'accepted co-operator can publish Presentation program context');
select results_eq($$update public.activity_occurrences set show_in_presentation=false where occurrence_type='cooperator-program' returning show_in_presentation$$,$$values (false)$$,'accepted co-operator can hide Presentation program context');
select results_eq($$update public.activity_occurrences set show_in_presentation=true where occurrence_type='cooperator-program' returning show_in_presentation$$,$$values (true)$$,'accepted co-operator can restore Presentation program context');
select throws_ok($$update public.activity_occurrences set show_in_agenda=true where occurrence_type='cooperator-program'$$,'42501',null,'Presentation co-operator cannot publish program context to the global Agenda');
select throws_ok($$select public.soft_delete_activity_occurrence('a1500000-0000-4000-8000-000000000002')$$,'42501',null,'Presentation co-operator cannot delete global Agenda context');

-- An independent profile events editor retains global Agenda authority.

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select results_eq($$update public.activity_occurrences set show_in_agenda=false where id='a1500000-0000-4000-8000-000000000002' returning show_in_agenda$$,$$values (false)$$,'profile editor retains independent global Agenda authority');
select results_eq($$update public.activity_occurrences set show_in_agenda=true where id='a1500000-0000-4000-8000-000000000002' returning show_in_agenda$$,$$values (true)$$,'profile editor can restore global Agenda visibility');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.revoke_presentation_cooperator('a1600000-0000-4000-8000-000000000001')$$,'owner revokes accepted co-operator');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.create_presentation_participant('a1300000-0000-4000-8000-000000000001','REVOKED FAILURE',null)$$,'42501',null,'revoked co-operator loses Presentation management');
select throws_ok($$select public.set_presentation_occurrence_visibility('a1500000-0000-4000-8000-000000000002',true)$$,'42501',null,'revoked co-operator loses Presentation program visibility authority');
select is_empty($$select id from public.get_managed_presentation_summaries()$$,'revoked co-operator no longer sees managed Presentation summaries');

-- Work unpublish immediately removes public eligibility; final purge cascades.

reset role;
update public.works set visibility='draft', published_at=null where id='a1400000-0000-4000-8000-000000000002';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is_empty($$select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000002'$$,'unpublished Work is no longer public Presentation content');

reset role;
insert into public.presentation_works (
  presentation_id, work_id, position, status, requested_by_account_id,
  decided_by_account_id, decided_at
) values (
  'a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000007',98,'accepted',
  'a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',now()
);
update public.works set visibility='draft', published_at=null where id='a1400000-0000-4000-8000-000000000007';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.soft_delete_work('a1400000-0000-4000-8000-000000000007')$$,'Work owner soft-deletes associated draft Work');
reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is_empty($$select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000007'$$,'soft-deleted Work is not public Presentation content');

reset role;
insert into public.presentation_works (
  presentation_id, work_id, position, status, requested_by_account_id,
  decided_by_account_id, decided_at
) values (
  'a1300000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000005',99,'accepted',
  'a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001',now()
);
delete from public.works where id='a1400000-0000-4000-8000-000000000005';
select is_empty($$select id from public.presentation_works where work_id='a1400000-0000-4000-8000-000000000005'$$,'Work final purge cascades its Presentation association');

-- Presentation soft delete hides every child; final purge leaves no orphans.

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.soft_delete_profile_activity('a1300000-0000-4000-8000-000000000001')$$,'owner soft-deletes Presentation');

reset role; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is_empty($$select id from public.presentation_participants where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'soft-deleted Presentation hides participants');
select is_empty($$select id from public.presentation_works where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'soft-deleted Presentation hides Works');
select is_empty($$select id from public.activity_occurrences where activity_id='a1300000-0000-4000-8000-000000000001'$$,'soft-deleted Presentation hides program');

reset role;
delete from public.profile_activities where id='a1300000-0000-4000-8000-000000000001';
select is_empty($$select id from public.presentation_participants where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'Presentation final purge cascades participants');
select is_empty($$select id from public.presentation_works where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'Presentation final purge cascades Work associations');
select is_empty($$select id from public.presentation_cooperators where presentation_id='a1300000-0000-4000-8000-000000000001'$$,'Presentation final purge cascades co-operator records');
select is_empty($$select id from public.activity_occurrences where activity_id='a1300000-0000-4000-8000-000000000001'$$,'Presentation final purge cascades program occurrences');

select * from finish();
rollback;
