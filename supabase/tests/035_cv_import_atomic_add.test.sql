begin;

create extension if not exists pgtap with schema extensions;
select plan(38);

select has_function(
  'private',
  'import_cv_entries',
  array['uuid', 'jsonb'],
  'private atomic CV Import implementation exists'
);

select has_function(
  'public',
  'import_cv_entries',
  array['uuid', 'jsonb'],
  'public CV Import RPC exists'
);

select is(
  (
    select array_to_string(proargnames, ',')
      from pg_proc
     where oid = 'public.import_cv_entries(uuid,jsonb)'::regprocedure
  ),
  'target_profile_id,selected_entries',
  'public RPC exposes the exact PostgREST parameter names'
);

select ok(
  not (
    select prosecdef
      from pg_proc
     where oid = 'public.import_cv_entries(uuid,jsonb)'::regprocedure
  ),
  'public wrapper is security invoker'
);

select ok(
  (
    select p.prosecdef
       and exists (
         select 1
           from unnest(coalesce(p.proconfig, array[]::text[])) as setting
          where setting = 'search_path=""'
       )
      from pg_proc as p
     where p.oid = 'private.import_cv_entries(uuid,jsonb)'::regprocedure
  ),
  'private implementation is security definer with an empty search path'
);

select ok(
  pg_get_functiondef('private.import_cv_entries(uuid,jsonb)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'profile import serializes duplicate check and insertion transactionally'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.import_cv_entries(uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute CV Import'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.import_cv_entries(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated users may execute the authorized wrapper'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.import_cv_entries(uuid,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the private implementation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.import_cv_entries(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated wrapper callers may execute the private implementation'
);

insert into auth.users (
  instance_id, id, aud, role, email, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '95100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'cv-import-owner@example.test',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '95100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'cv-import-other@example.test',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '95100000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'cv-import-editor@example.test',
    now(), now()
  );

insert into public.accounts (id, status, display_name)
values
  ('95100000-0000-4000-8000-000000000001', 'active', 'CV IMPORT OWNER'),
  ('95100000-0000-4000-8000-000000000002', 'active', 'CV IMPORT OTHER'),
  ('95100000-0000-4000-8000-000000000003', 'active', 'CV IMPORT EDITOR');

insert into public.account_roles (account_id, role)
values
  ('95100000-0000-4000-8000-000000000001', 'artist'),
  ('95100000-0000-4000-8000-000000000002', 'artist'),
  ('95100000-0000-4000-8000-000000000003', 'artist');

insert into public.public_profiles (
  id, profile_type, slug, display_name, claim_state,
  primary_controller_account_id, claimed_at, created_by_account_id
)
values
  (
    '95200000-0000-4000-8000-000000000001', 'artist',
    'cv-import-artist', 'CV IMPORT ARTIST', 'claimed',
    '95100000-0000-4000-8000-000000000001', now(),
    '95100000-0000-4000-8000-000000000001'
  ),
  (
    '95200000-0000-4000-8000-000000000002', 'artist',
    'cv-import-other', 'CV IMPORT OTHER', 'claimed',
    '95100000-0000-4000-8000-000000000002', now(),
    '95100000-0000-4000-8000-000000000002'
  );

insert into public.profile_members (profile_id, account_id, membership_level)
values
  (
    '95200000-0000-4000-8000-000000000001',
    '95100000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '95200000-0000-4000-8000-000000000001',
    '95100000-0000-4000-8000-000000000003',
    'editor'
  ),
  (
    '95200000-0000-4000-8000-000000000002',
    '95100000-0000-4000-8000-000000000002',
    'owner'
  );

insert into public.cv_entries (
  category_id, year_label, title, display_order, is_visible
)
select id, '2000', 'EXISTING HIDDEN ENTRY', 7, false
  from public.cv_categories
 where profile_id = '95200000-0000-4000-8000-000000000001'
   and category_type = 'education';

insert into public.profile_activities (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  title, activity_type, start_date, include_in_cv, visibility
)
values (
  '95300000-0000-4000-8000-000000000001',
  '95200000-0000-4000-8000-000000000001',
  '95100000-0000-4000-8000-000000000001',
  '95100000-0000-4000-8000-000000000001',
  'UNCHANGED PRESENTATION', 'group-exhibition', '2026-01-01', false, 'draft'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$
    select public.import_cv_entries(
      '95200000-0000-4000-8000-000000000001',
      '[]'::jsonb
    )
  $$,
  '42501',
  null,
  'anonymous caller cannot invoke CV Import'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.import_cv_entries(
      '95200000-0000-4000-8000-000000000001',
      '[{"categoryType":"education","yearLabel":"2026","title":"FOREIGN","organization":null,"locationText":null,"url":null,"sourceActivityId":null}]'::jsonb
    )
  $$,
  '42501',
  'The Artist CV may not be imported.',
  'unrelated profile manager cannot import into another profile'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.import_cv_entries(
      '95200000-0000-4000-8000-000000000001',
      '[
        {"categoryType":"education","yearLabel":"2020","title":"EDUCATION IMPORT","organization":"ACADEMY","locationText":"AMSTERDAM","url":"https://example.test/education","sourceActivityId":null},
        {"categoryType":"solo_exhibition","yearLabel":"2021","title":"SOLO IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"duo_exhibition","yearLabel":"2022","title":"DUO IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"group_presentation","yearLabel":"2023","title":"GROUP IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"award","yearLabel":"2024","title":"AWARD IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"grant","yearLabel":"2024","title":"GRANT IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"collection","yearLabel":null,"title":"COLLECTION IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"residency","yearLabel":"2025","title":"RESIDENCY IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"teaching","yearLabel":"2025","title":"TEACHING IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"curatorial","yearLabel":"2026","title":"CURATORIAL IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null}
      ]'::jsonb
    )
  $$,
  'authorized owner imports all ten supported category types atomically'
);

reset role;

select is(
  (
    select count(*)::integer
      from public.cv_entries as entry
      join public.cv_categories as category on category.id = entry.category_id
     where category.profile_id = '95200000-0000-4000-8000-000000000001'
       and entry.title like '% IMPORT'
  ),
  10,
  'all ten imported rows persist'
);

select results_eq(
  $$
    select category.category_type
      from public.cv_entries as entry
      join public.cv_categories as category on category.id = entry.category_id
     where category.profile_id = '95200000-0000-4000-8000-000000000001'
       and entry.title like '% IMPORT'
     order by category.display_order
  $$,
  $$
    values
      ('education'::varchar), ('solo_exhibition'::varchar),
      ('duo_exhibition'::varchar), ('group_presentation'::varchar),
      ('award'::varchar), ('grant'::varchar), ('collection'::varchar),
      ('residency'::varchar), ('teaching'::varchar), ('curatorial'::varchar)
  $$,
  'only the ten fixed import categories are used'
);

select ok(
  not exists (
    select 1
      from public.cv_entries
     where title like '% IMPORT'
       and source_activity_id is not null
  ),
  'every imported row has source_activity_id null'
);

select ok(
  not exists (
    select 1
      from public.cv_entries
     where title like '% IMPORT'
       and not is_visible
  ),
  'import visibility matches new manual entries'
);

select results_eq(
  $$
    select title, organization, location_text, url
      from public.cv_entries
     where title = 'EDUCATION IMPORT'
  $$,
  $$
    values (
      'EDUCATION IMPORT'::varchar,
      'ACADEMY'::varchar,
      'AMSTERDAM'::varchar,
      'https://example.test/education'::text
    )
  $$,
  'supported manual CV fields persist without provider data'
);

select is(
  (
    select display_order
      from public.cv_entries
     where title = 'EXISTING HIDDEN ENTRY'
  ),
  7,
  'existing CV display order remains unchanged'
);

select is(
  (
    select display_order
      from public.cv_entries
     where title = 'EDUCATION IMPORT'
  ),
  8,
  'imported entries append using existing category order semantics'
);

select is(
  (
    select count(*)::integer
      from public.profile_activities
     where id = '95300000-0000-4000-8000-000000000001'
  ),
  1,
  'CV Import does not create, remove, or replace Presentations'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', '[{"categoryType":"publication","yearLabel":"2026","title":"BAD PUBLICATION","organization":null,"locationText":null,"url":null,"sourceActivityId":null}]'::jsonb) $$,
  '22023', 'A CV Import category is unsupported.',
  'publication category is rejected for import'
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', '[{"categoryType":"other","yearLabel":"2026","title":"BAD OTHER","organization":null,"locationText":null,"url":null,"sourceActivityId":null}]'::jsonb) $$,
  '22023', 'A CV Import category is unsupported.',
  'legacy other category is rejected for import'
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', '[{"categoryType":"archive","yearLabel":"2026","title":"BAD ARCHIVE","organization":null,"locationText":null,"url":null,"sourceActivityId":null}]'::jsonb) $$,
  '22023', 'A CV Import category is unsupported.',
  'arbitrary category is rejected for import'
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', '[{"categoryType":"education","yearLabel":"2026","title":"BAD SHAPE","organization":null,"locationText":null,"url":null,"sourceActivityId":null,"unsupportedSections":[]}]'::jsonb) $$,
  '22023', 'A CV Import entry has an invalid shape.',
  'unsupportedSections and extra fields cannot enter persistence'
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', '[{"categoryType":"education","yearLabel":"2026","title":"BAD SOURCE","organization":null,"locationText":null,"url":null,"sourceActivityId":"95300000-0000-4000-8000-000000000001"}]'::jsonb) $$,
  '22023', 'A CV Import entry has invalid field types.',
  'client cannot set source_activity_id'
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('categoryType','education','yearLabel','2026','title',repeat('x',301),'organization',null,'locationText',null,'url',null,'sourceActivityId',null))) $$,
  '22023', 'A CV Import entry contains invalid content.',
  'oversized title rejects the transaction'
);

select throws_ok(
  $$ select public.import_cv_entries('95200000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object('categoryType','education','yearLabel',repeat('2',41),'title','BAD YEAR','organization',null,'locationText',null,'url',null,'sourceActivityId',null))) $$,
  '22023', 'A CV Import entry contains invalid content.',
  'oversized year rejects the transaction'
);

select throws_ok(
  $$
    select public.import_cv_entries(
      '95200000-0000-4000-8000-000000000001',
      (
        select jsonb_agg(jsonb_build_object(
          'categoryType','education','yearLabel','2026',
          'title','BULK ' || item,'organization',null,
          'locationText',null,'url',null,'sourceActivityId',null
        ))
        from generate_series(1, 501) as item
      )
    )
  $$,
  '22023', 'CV Import requires between 1 and 500 entries.',
  'persistence batch is bounded to 500 entries'
);

select throws_ok(
  $$
    select public.import_cv_entries(
      '95200000-0000-4000-8000-000000000001',
      '[
        {"categoryType":"grant","yearLabel":"2026","title":"ATOMIC VALID","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
        {"categoryType":"publication","yearLabel":"2026","title":"ATOMIC INVALID","organization":null,"locationText":null,"url":null,"sourceActivityId":null}
      ]'::jsonb
    )
  $$,
  '22023', 'A CV Import category is unsupported.',
  'one invalid entry rejects the whole transaction'
);

reset role;

select is(
  (select count(*)::integer from public.cv_entries where title = 'ATOMIC VALID'),
  0,
  'atomic failure commits zero valid-prefix rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select
      (result ->> 'submitted_count')::integer,
      (result ->> 'inserted_count')::integer,
      (result ->> 'duplicate_count')::integer
    from (
      select public.import_cv_entries(
        '95200000-0000-4000-8000-000000000001',
        '[{"categoryType":"education","yearLabel":" 2020 ","title":"EDUCATION  IMPORT","organization":"ACADEMY","locationText":"AMSTERDAM","url":null,"sourceActivityId":null}]'::jsonb
      ) as result
    ) as call
  $$,
  $$ values (1, 0, 1) $$,
  'normalized exact existing duplicate is skipped safely'
);

select results_eq(
  $$
    select
      (result ->> 'inserted_count')::integer,
      (result ->> 'duplicate_count')::integer
    from (
      select public.import_cv_entries(
        '95200000-0000-4000-8000-000000000001',
        '[
          {"categoryType":"grant","yearLabel":"2026","title":"INTERNAL DUPLICATE","organization":null,"locationText":null,"url":null,"sourceActivityId":null},
          {"categoryType":"grant","yearLabel":" 2026 ","title":"INTERNAL   DUPLICATE","organization":null,"locationText":null,"url":null,"sourceActivityId":null}
        ]'::jsonb
      ) as result
    ) as call
  $$,
  $$ values (1, 1) $$,
  'duplicate candidates inside one batch create one row'
);

reset role;

select is(
  (select count(*)::integer from public.cv_entries where title = 'INTERNAL DUPLICATE'),
  1,
  'internal duplicate result is stored exactly once'
);

select is(
  (select count(*)::integer from public.cv_entries where title = 'EDUCATION IMPORT'),
  1,
  'repeated import does not duplicate an existing exact row'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.import_cv_entries(
      '95200000-0000-4000-8000-000000000001',
      '[{"categoryType":"award","yearLabel":"2026","title":"EDITOR IMPORT","organization":null,"locationText":null,"url":null,"sourceActivityId":null}]'::jsonb
    )
  $$,
  'authorized profile editor can import'
);

reset role;

select is(
  (
    select count(*)::integer
      from public.cv_entries
     where title in ('EXISTING HIDDEN ENTRY', 'EDITOR IMPORT')
  ),
  2,
  'existing and editor-created manual entries remain intact'
);

select is(
  (select count(*)::integer from public.profile_activities),
  1,
  'CV Import creates no Presentation or Agenda source records'
);

select * from finish();
rollback;
