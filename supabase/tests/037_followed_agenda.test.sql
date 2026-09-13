begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select has_function('public', 'list_followed_agenda', array[]::text[], 'followed Agenda RPC exists');
select function_privs_are('public', 'list_followed_agenda', array[]::text[], 'authenticated', array['EXECUTE'], 'only authenticated may execute followed Agenda RPC');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'b7100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'agenda-follow-reader@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b7100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'agenda-follow-other@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b7100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'agenda-follow-suspended@example.test', now(), now());

insert into public.accounts (id, status, display_name) values
  ('b7100000-0000-4000-8000-000000000001', 'active', 'AGENDA FOLLOW READER'),
  ('b7100000-0000-4000-8000-000000000002', 'active', 'AGENDA FOLLOW OTHER'),
  ('b7100000-0000-4000-8000-000000000003', 'suspended', 'AGENDA FOLLOW SUSPENDED');

insert into public.public_profiles (id, profile_type, slug, display_name, publication_status, published_at, claim_state, primary_controller_account_id, claimed_at, created_by_account_id) values
  ('b7200000-0000-4000-8000-000000000001', 'artist', 'agenda-followed', 'AGENDA FOLLOWED', 'published', now(), 'claimed', 'b7100000-0000-4000-8000-000000000002', now(), 'b7100000-0000-4000-8000-000000000002'),
  ('b7200000-0000-4000-8000-000000000002', 'artist', 'agenda-unfollowed', 'AGENDA UNFOLLOWED', 'published', now(), 'claimed', 'b7100000-0000-4000-8000-000000000002', now(), 'b7100000-0000-4000-8000-000000000002'),
  ('b7200000-0000-4000-8000-000000000003', 'artist', 'agenda-private', 'AGENDA PRIVATE', 'draft', null, 'claimed', 'b7100000-0000-4000-8000-000000000002', now(), 'b7100000-0000-4000-8000-000000000002');

insert into public.profile_activities (id, owner_profile_id, created_by_account_id, updated_by_account_id, title, activity_type, venue_name, city, country, start_date, show_in_presentations, visibility, published_at) values
  ('b7300000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'FOLLOWED PRESENTATION', 'group-exhibition', 'FOLLOW VENUE', 'AMSTERDAM', 'NETHERLANDS', current_date + 10, true, 'published', now()),
  ('b7300000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'UNFOLLOWED PRESENTATION', 'group-exhibition', 'OTHER VENUE', 'ROTTERDAM', 'NETHERLANDS', current_date + 11, true, 'published', now()),
  ('b7300000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'PRIVATE PRESENTATION', 'group-exhibition', 'PRIVATE VENUE', 'UTRECHT', 'NETHERLANDS', current_date + 12, true, 'draft', null);

insert into public.activity_occurrences (id, activity_id, owner_profile_id, created_by_account_id, updated_by_account_id, occurrence_type, start_date, start_time, show_in_agenda, visibility, published_at) values
  ('b7400000-0000-4000-8000-000000000001', 'b7300000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'opening', current_date + 10, '18:00', true, 'published', now()),
  ('b7400000-0000-4000-8000-000000000002', 'b7300000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'opening', current_date + 11, '18:00', true, 'published', now()),
  ('b7400000-0000-4000-8000-000000000003', 'b7300000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000003', 'b7100000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'opening', current_date + 12, '18:00', true, 'draft', null);

set constraints all immediate;
set constraints all deferred;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.list_followed_agenda()$$, '42501', null, 'anonymous cannot execute followed Agenda RPC');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into public.profile_follows(account_id, profile_id) values ('b7100000-0000-4000-8000-000000000001', 'b7200000-0000-4000-8000-000000000001')$$, 'active account can follow the public Agenda profile');
select results_eq($$select title, city from public.list_followed_agenda()$$, $$values ('FOLLOWED PRESENTATION'::varchar, 'AMSTERDAM'::varchar)$$, 'followed Agenda returns only public published followed occurrence data');
select is_empty($$select occurrence_id from public.list_followed_agenda() where title in ('UNFOLLOWED PRESENTATION', 'PRIVATE PRESENTATION')$$, 'unfollowed and draft-profile Agenda items never leak');
select results_eq($$select presentation_id from public.list_followed_agenda()$$, $$values ('b7300000-0000-4000-8000-000000000001'::uuid)$$, 'eligible public Presentation remains linked');
select is_empty($$select external_url from public.list_followed_agenda() where external_url like 'private/%'$$, 'followed Agenda returns no private storage data');
select lives_ok($$delete from public.profile_follows where profile_id = 'b7200000-0000-4000-8000-000000000001'$$, 'active account can unfollow');
select is_empty($$select occurrence_id from public.list_followed_agenda()$$, 'unfollow removes followed Agenda items immediately');

reset role;
insert into public.profile_follows(account_id, profile_id) values
  ('b7100000-0000-4000-8000-000000000002', 'b7200000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000003', 'b7200000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty($$select occurrence_id from public.list_followed_agenda()$$, 'other accounts follow relationships are not projected to this account');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b7100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$select occurrence_id from public.list_followed_agenda()$$, 'suspended account receives no followed Agenda data');
select is_empty($$select account_id from public.profile_follows$$, 'suspended account cannot read follow relationships through RLS');

reset role;
select ok(position('account_id' in pg_get_function_result('public.list_followed_agenda()'::regprocedure)) = 0, 'RPC result exposes no follow account identifier');
select ok(position('security definer' in lower(pg_get_functiondef('public.list_followed_agenda()'::regprocedure))) = 0, 'followed Agenda RPC remains security invoker');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.list_followed_agenda()'::regprocedure), 'followed Agenda RPC fixes an empty search path');

select * from finish();
rollback;
