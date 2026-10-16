-- Security migration coverage: 20261016120000_activity_browser_select_columns.sql
begin;

create extension if not exists pgtap with schema extensions;
select plan(75);

-- Exact effective SELECT allowlists also catch inherited/PUBLIC access and
-- accidental future exposure of audit IDs or lifecycle-only purge_after.
select ok(not has_table_privilege('anon', 'public.profile_activities', 'SELECT'), 'anon has no whole-table SELECT on profile_activities');
select results_eq(
  $$select attname::text collate "default" from pg_attribute
    where attrelid = 'public.profile_activities'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('anon', attrelid, attname, 'SELECT')
    order by attname$$,
  $$values ('activity_type'::text), ('city'::text), ('country'::text), ('description'::text), ('end_date'::text), ('external_url'::text), ('id'::text), ('owner_profile_id'::text), ('published_at'::text), ('show_in_presentations'::text), ('start_date'::text), ('title'::text), ('updated_at'::text), ('venue_name'::text), ('visibility'::text)$$,
  'anon has exactly the required profile_activities SELECT columns'
);
select ok(not has_table_privilege('anon', 'public.activity_occurrences', 'SELECT'), 'anon has no whole-table SELECT on activity_occurrences');
select results_eq(
  $$select attname::text collate "default" from pg_attribute
    where attrelid = 'public.activity_occurrences'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('anon', attrelid, attname, 'SELECT')
    order by attname$$,
  $$values ('activity_id'::text), ('city_override'::text), ('created_at'::text), ('end_date'::text), ('end_time'::text), ('id'::text), ('occurrence_type'::text), ('owner_profile_id'::text), ('published_at'::text), ('show_in_agenda'::text), ('start_date'::text), ('start_time'::text), ('time_zone'::text), ('title_override'::text), ('updated_at'::text), ('venue_name_override'::text), ('visibility'::text)$$,
  'anon has exactly the required activity_occurrences SELECT columns'
);
select ok(not has_table_privilege('authenticated', 'public.profile_activities', 'SELECT'), 'authenticated has no whole-table SELECT on profile_activities');
select results_eq(
  $$select attname::text collate "default" from pg_attribute
    where attrelid = 'public.profile_activities'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attname, 'SELECT')
    order by attname$$,
  $$values ('activity_type'::text), ('city'::text), ('country'::text), ('created_at'::text), ('deleted_at'::text), ('description'::text), ('end_date'::text), ('external_url'::text), ('id'::text), ('include_in_cv'::text), ('owner_profile_id'::text), ('published_at'::text), ('show_in_presentations'::text), ('start_date'::text), ('title'::text), ('updated_at'::text), ('venue_name'::text), ('visibility'::text)$$,
  'authenticated has exactly the required profile_activities SELECT columns'
);
select ok(not has_table_privilege('authenticated', 'public.activity_occurrences', 'SELECT'), 'authenticated has no whole-table SELECT on activity_occurrences');
select results_eq(
  $$select attname::text collate "default" from pg_attribute
    where attrelid = 'public.activity_occurrences'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attname, 'SELECT')
    order by attname$$,
  $$values ('activity_id'::text), ('city_override'::text), ('created_at'::text), ('deleted_at'::text), ('end_date'::text), ('end_time'::text), ('id'::text), ('occurrence_type'::text), ('owner_profile_id'::text), ('published_at'::text), ('show_in_agenda'::text), ('show_in_presentation'::text), ('start_date'::text), ('start_time'::text), ('time_zone'::text), ('title_override'::text), ('updated_at'::text), ('venue_name_override'::text), ('visibility'::text)$$,
  'authenticated has exactly the required activity_occurrences SELECT columns'
);
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.profile_activities'::regclass), 'profile_activities keeps forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.activity_occurrences'::regclass), 'activity_occurrences keeps forced RLS');

-- Synthetic fixtures only; the transaction rolls back every write.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'activity-column-1@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'activity-column-2@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'activity-column-3@example.test', now(), now());
insert into public.accounts (id, status, display_name) values
  ('c4100000-0000-4000-8000-000000000001', 'active', 'ACTIVITY COLUMN 1'),
  ('c4100000-0000-4000-8000-000000000002', 'active', 'ACTIVITY COLUMN 2'),
  ('c4100000-0000-4000-8000-000000000003', 'active', 'ACTIVITY COLUMN 3');
insert into public.account_roles (account_id, role) values
  ('c4100000-0000-4000-8000-000000000001', 'artist'),
  ('c4100000-0000-4000-8000-000000000002', 'artist'),
  ('c4100000-0000-4000-8000-000000000003', 'artist');
insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id,
  show_presentations
) values (
  'c4200000-0000-4000-8000-000000000001', 'artist', 'activity-column-host', 'ACTIVITY COLUMN HOST', 'published', now(),
  'claimed', 'c4100000-0000-4000-8000-000000000001', now(), 'c4100000-0000-4000-8000-000000000001', true
);
insert into public.profile_members (profile_id, account_id, membership_level)
values ('c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'owner');
insert into public.profile_activities (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, activity_type, venue_name, city, country, start_date,
  show_in_presentations, visibility, published_at
) values
  ('c4300000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001',
   'PUBLIC PRESENTATION', 'group-exhibition', 'VENUE', 'AMSTERDAM', 'NETHERLANDS', current_date + 10, true, 'published', now()),
  ('c4300000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001',
   'PRIVATE PRESENTATION', 'group-exhibition', 'VENUE', 'AMSTERDAM', 'NETHERLANDS', current_date + 10, true, 'draft', null);
insert into public.activity_occurrences (
  id, activity_id, owner_profile_id, created_by_account_id, updated_by_account_id,
  occurrence_type, title_override, start_date, show_in_agenda, show_in_presentation,
  visibility, published_at, venue_name_override, city_override
) values
  ('c4400000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001',
   'opening', 'PUBLIC OPENING', current_date + 10, true, false, 'published', now(), null, null),
  ('c4400000-0000-4000-8000-000000000002', 'c4300000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001',
   'talk', 'PRIVATE PROGRAM', current_date + 10, false, true, 'draft', null, null, null),
  ('c4400000-0000-4000-8000-000000000003', null, 'c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001',
   'opening', 'STANDALONE OPENING', current_date + 11, true, false, 'published', now(), 'VENUE', 'AMSTERDAM'),
  ('c4400000-0000-4000-8000-000000000004', 'c4300000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001',
   'talk', 'PUBLIC PROGRAM ONLY', current_date + 12, false, true, 'published', now(), null, null);
insert into public.presentation_cooperators (
  presentation_id, invited_account_id, invited_by_account_id, status, responded_at
) values ('c4300000-0000-4000-8000-000000000002', 'c4100000-0000-4000-8000-000000000003', 'c4100000-0000-4000-8000-000000000001', 'accepted', now());
insert into public.profile_follows (account_id, profile_id)
values ('c4100000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000001');

set constraints all immediate;
set constraints all deferred;


-- anonymous: direct SQL checks, not UI assertions.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$select id, owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date, description, external_url, show_in_presentations, visibility, published_at, updated_at from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002')$$, 'anonymous can select the complete safe profile_activities projection');
select results_eq($$select id from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002') order by id$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid)$$, 'anonymous keeps intended profile_activities row visibility');
select throws_ok($$select created_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot select profile_activities.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot select profile_activities.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot select profile_activities.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot use wildcard SELECT on profile_activities');
select lives_ok($$select id, owner_profile_id, activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at, updated_at from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004')$$, 'anonymous can select the complete safe activity_occurrences projection');
select results_eq($$select id from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004') order by id$$, $$values ('c4400000-0000-4000-8000-000000000001'::uuid), ('c4400000-0000-4000-8000-000000000003'::uuid), ('c4400000-0000-4000-8000-000000000004'::uuid)$$, 'anonymous keeps intended activity_occurrences row visibility');
select throws_ok($$select created_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot select activity_occurrences.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot select activity_occurrences.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot select activity_occurrences.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'anonymous cannot use wildcard SELECT on activity_occurrences');
select results_eq($$select title from public.get_public_presentation_program('c4300000-0000-4000-8000-000000000001')$$, $$values ('PUBLIC PROGRAM ONLY'::varchar)$$, 'anonymous retains safe public Program RPC');
select results_eq($$select id from public.get_public_profile_presentation_summaries('c4200000-0000-4000-8000-000000000001')$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid)$$, 'anonymous retains safe public Presentation summaries');
select results_eq($$select activity_id from public.get_public_activity_source_contexts(array['c4300000-0000-4000-8000-000000000001'::uuid])$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid)$$, 'anonymous retains safe Agenda source projection');

-- unrelated: direct SQL checks, not UI assertions.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$select id, owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date, description, external_url, show_in_presentations, visibility, published_at, updated_at, include_in_cv, created_at, deleted_at from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002')$$, 'unrelated can select the complete safe profile_activities projection');
select results_eq($$select id from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002') order by id$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid)$$, 'unrelated keeps intended profile_activities row visibility');
select throws_ok($$select created_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot select profile_activities.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot select profile_activities.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot select profile_activities.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot use wildcard SELECT on profile_activities');
select lives_ok($$select id, owner_profile_id, activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at, updated_at, show_in_presentation, deleted_at from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004')$$, 'unrelated can select the complete safe activity_occurrences projection');
select results_eq($$select id from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004') order by id$$, $$values ('c4400000-0000-4000-8000-000000000001'::uuid), ('c4400000-0000-4000-8000-000000000003'::uuid), ('c4400000-0000-4000-8000-000000000004'::uuid)$$, 'unrelated keeps intended activity_occurrences row visibility');
select throws_ok($$select created_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot select activity_occurrences.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot select activity_occurrences.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot select activity_occurrences.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'unrelated cannot use wildcard SELECT on activity_occurrences');
select results_eq($$select title from public.get_public_presentation_program('c4300000-0000-4000-8000-000000000001')$$, $$values ('PUBLIC PROGRAM ONLY'::varchar)$$, 'unrelated retains safe public Program RPC');
select results_eq($$select id from public.get_public_profile_presentation_summaries('c4200000-0000-4000-8000-000000000001')$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid)$$, 'unrelated retains safe public Presentation summaries');
select results_eq($$select activity_id from public.get_public_activity_source_contexts(array['c4300000-0000-4000-8000-000000000001'::uuid])$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid)$$, 'unrelated retains safe Agenda source projection');
select results_eq($$select occurrence_id from public.list_followed_agenda() order by occurrence_id$$, $$values ('c4400000-0000-4000-8000-000000000001'::uuid), ('c4400000-0000-4000-8000-000000000003'::uuid)$$, 'unrelated follower retains invoker Agenda reads including deleted_at filters');

-- owner: direct SQL checks, not UI assertions.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select id, owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date, description, external_url, show_in_presentations, visibility, published_at, updated_at, include_in_cv, created_at, deleted_at from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002')$$, 'owner can select the complete safe profile_activities projection');
select results_eq($$select id from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002') order by id$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid), ('c4300000-0000-4000-8000-000000000002'::uuid)$$, 'owner keeps intended profile_activities row visibility');
select throws_ok($$select created_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot select profile_activities.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot select profile_activities.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot select profile_activities.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot use wildcard SELECT on profile_activities');
select lives_ok($$select id, owner_profile_id, activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at, updated_at, show_in_presentation, deleted_at from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004')$$, 'owner can select the complete safe activity_occurrences projection');
select results_eq($$select id from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004') order by id$$, $$values ('c4400000-0000-4000-8000-000000000001'::uuid), ('c4400000-0000-4000-8000-000000000002'::uuid), ('c4400000-0000-4000-8000-000000000003'::uuid), ('c4400000-0000-4000-8000-000000000004'::uuid)$$, 'owner keeps intended activity_occurrences row visibility');
select throws_ok($$select created_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot select activity_occurrences.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot select activity_occurrences.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot select activity_occurrences.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'owner cannot use wildcard SELECT on activity_occurrences');
select lives_ok($$select ao.id, ao.owner_profile_id, ao.activity_id, ao.occurrence_type, ao.title_override, ao.start_date, ao.end_date, ao.start_time, ao.end_time, ao.time_zone, ao.venue_name_override, ao.city_override, ao.show_in_agenda, ao.visibility, ao.published_at, ao.created_at, ao.updated_at, ao.show_in_presentation, ao.deleted_at, pa.id, pa.owner_profile_id, pa.title, pa.activity_type, pa.venue_name, pa.city, pa.country, pa.start_date, pa.end_date, pa.visibility
  from public.activity_occurrences ao left join public.profile_activities pa on pa.id = ao.activity_id
  where ao.id = 'c4400000-0000-4000-8000-000000000002'$$, 'owner retains the nested Agenda management read');
select results_eq($$update public.profile_activities set description = 'owner edit' where id = 'c4300000-0000-4000-8000-000000000002' returning id$$, $$values ('c4300000-0000-4000-8000-000000000002'::uuid)$$, 'owner can still edit a managed draft Presentation');
select results_eq($$update public.activity_occurrences set title_override = 'owner edit' where id = 'c4400000-0000-4000-8000-000000000002' returning id$$, $$values ('c4400000-0000-4000-8000-000000000002'::uuid)$$, 'owner can still edit a managed draft Program item');
select lives_ok($$update public.profile_activities set description = 'owner returning' where id = 'c4300000-0000-4000-8000-000000000002' returning id, owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date, description, external_url, show_in_presentations, visibility, published_at, updated_at, include_in_cv, created_at, deleted_at$$, 'owner retains complete safe Presentation UPDATE returning projection');
select lives_ok($$update public.activity_occurrences set title_override = 'owner returning' where id = 'c4400000-0000-4000-8000-000000000002' returning id, owner_profile_id, activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at, updated_at, show_in_presentation, deleted_at$$, 'owner retains complete safe Program UPDATE returning projection');

-- co-operator: direct SQL checks, not UI assertions.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c4100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok($$select id, owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date, description, external_url, show_in_presentations, visibility, published_at, updated_at, include_in_cv, created_at, deleted_at from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002')$$, 'co-operator can select the complete safe profile_activities projection');
select results_eq($$select id from public.profile_activities where id in ('c4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002') order by id$$, $$values ('c4300000-0000-4000-8000-000000000001'::uuid), ('c4300000-0000-4000-8000-000000000002'::uuid)$$, 'co-operator keeps intended profile_activities row visibility');
select throws_ok($$select created_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot select profile_activities.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot select profile_activities.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot select profile_activities.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.profile_activities where id = 'c4300000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot use wildcard SELECT on profile_activities');
select lives_ok($$select id, owner_profile_id, activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at, updated_at, show_in_presentation, deleted_at from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004')$$, 'co-operator can select the complete safe activity_occurrences projection');
select results_eq($$select id from public.activity_occurrences where id in ('c4400000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000003', 'c4400000-0000-4000-8000-000000000004') order by id$$, $$values ('c4400000-0000-4000-8000-000000000001'::uuid), ('c4400000-0000-4000-8000-000000000002'::uuid), ('c4400000-0000-4000-8000-000000000003'::uuid), ('c4400000-0000-4000-8000-000000000004'::uuid)$$, 'co-operator keeps intended activity_occurrences row visibility');
select throws_ok($$select created_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot select activity_occurrences.created_by_account_id even on a public row');
select throws_ok($$select updated_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot select activity_occurrences.updated_by_account_id even on a public row');
select throws_ok($$select deleted_by_account_id from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot select activity_occurrences.deleted_by_account_id even on a public row');
select throws_ok($$select * from public.activity_occurrences where id = 'c4400000-0000-4000-8000-000000000001'$$, '42501', null, 'co-operator cannot use wildcard SELECT on activity_occurrences');
select lives_ok($$select ao.id, ao.owner_profile_id, ao.activity_id, ao.occurrence_type, ao.title_override, ao.start_date, ao.end_date, ao.start_time, ao.end_time, ao.time_zone, ao.venue_name_override, ao.city_override, ao.show_in_agenda, ao.visibility, ao.published_at, ao.created_at, ao.updated_at, ao.show_in_presentation, ao.deleted_at, pa.id, pa.owner_profile_id, pa.title, pa.activity_type, pa.venue_name, pa.city, pa.country, pa.start_date, pa.end_date, pa.visibility
  from public.activity_occurrences ao left join public.profile_activities pa on pa.id = ao.activity_id
  where ao.id = 'c4400000-0000-4000-8000-000000000002'$$, 'co-operator retains the nested Agenda management read');
select results_eq($$update public.profile_activities set description = 'co-operator edit' where id = 'c4300000-0000-4000-8000-000000000002' returning id$$, $$values ('c4300000-0000-4000-8000-000000000002'::uuid)$$, 'co-operator can still edit a managed draft Presentation');
select results_eq($$update public.activity_occurrences set title_override = 'co-operator edit' where id = 'c4400000-0000-4000-8000-000000000002' returning id$$, $$values ('c4400000-0000-4000-8000-000000000002'::uuid)$$, 'co-operator can still edit a managed draft Program item');
select lives_ok($$update public.profile_activities set description = 'co-operator returning' where id = 'c4300000-0000-4000-8000-000000000002' returning id, owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date, description, external_url, show_in_presentations, visibility, published_at, updated_at, include_in_cv, created_at, deleted_at$$, 'co-operator retains complete safe Presentation UPDATE returning projection');
select lives_ok($$update public.activity_occurrences set title_override = 'co-operator returning' where id = 'c4400000-0000-4000-8000-000000000002' returning id, owner_profile_id, activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at, updated_at, show_in_presentation, deleted_at$$, 'co-operator retains complete safe Program UPDATE returning projection');

reset role;
select * from finish();
rollback;
