begin;

create extension if not exists pgtap with schema extensions;
select plan(36);


insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '93100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'cv-owner-a@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '93100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'cv-owner-b@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '93100000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'cv-editor-a@example.test',
    now(),
    now()
  );


insert into public.accounts (
  id,
  status,
  display_name
)
values
  (
    '93100000-0000-4000-8000-000000000001',
    'active',
    'CV OWNER A'
  ),
  (
    '93100000-0000-4000-8000-000000000002',
    'active',
    'CV OWNER B'
  ),
  (
    '93100000-0000-4000-8000-000000000003',
    'active',
    'CV EDITOR A'
  );


insert into public.account_roles (
  account_id,
  role
)
values
  (
    '93100000-0000-4000-8000-000000000001',
    'artist'
  ),
  (
    '93100000-0000-4000-8000-000000000002',
    'artist'
  ),
  (
    '93100000-0000-4000-8000-000000000003',
    'artist'
  );


insert into public.public_profiles (
  id,
  profile_type,
  slug,
  display_name,
  publication_status,
  published_at,
  claim_state,
  primary_controller_account_id,
  claimed_at,
  created_by_account_id
)
values
  (
    '93200000-0000-4000-8000-000000000001',
    'artist',
    'cv-artist-a',
    'CV ARTIST A',
    'published',
    now(),
    'claimed',
    '93100000-0000-4000-8000-000000000001',
    now(),
    '93100000-0000-4000-8000-000000000001'
  ),
  (
    '93200000-0000-4000-8000-000000000002',
    'artist',
    'cv-artist-b',
    'CV ARTIST B',
    'published',
    now(),
    'claimed',
    '93100000-0000-4000-8000-000000000002',
    now(),
    '93100000-0000-4000-8000-000000000002'
  );


insert into public.profile_members (
  profile_id,
  account_id,
  membership_level
)
values
  (
    '93200000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '93200000-0000-4000-8000-000000000001',
    '93100000-0000-4000-8000-000000000003',
    'editor'
  ),
  (
    '93200000-0000-4000-8000-000000000002',
    '93100000-0000-4000-8000-000000000002',
    'owner'
  );


insert into public.profile_activities (
  id,
  owner_profile_id,
  created_by_account_id,
  updated_by_account_id,
  title,
  activity_type,
  venue_name,
  city,
  country,
  start_date,
  end_date,
  description,
  external_url,
  show_in_presentations,
  include_in_cv,
  visibility
)
values (
  '93300000-0000-4000-8000-000000000001',
  '93200000-0000-4000-8000-000000000001',
  '93100000-0000-4000-8000-000000000001',
  '93100000-0000-4000-8000-000000000001',
  'INITIAL EXHIBITION',
  'group-exhibition',
  'TEST VENUE',
  'AMSTERDAM',
  'NL',
  '2026-06-01',
  '2026-06-30',
  'TEST PRESENTATION',
  'https://example.test/exhibition',
  true,
  false,
  'draft'
);


insert into public.cv_categories (
  id,
  profile_id,
  category_type,
  label,
  display_order,
  is_visible
)
values (
  '93400000-0000-4000-8000-000000000001',
  '93200000-0000-4000-8000-000000000002',
  'other',
  'OTHER',
  0,
  true
);


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_categories
     where profile_id =
       '93200000-0000-4000-8000-000000000001'
  $$,
  $$
    values (10::bigint)
  $$,
  'artist profile starts with ten fixed CV categories'
);


select is_empty(
  $$
    select id
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'a Presentation excluded from CV creates no entry'
);


set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.profile_activities
       set include_in_cv = true
     where id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can include a Presentation in CV'
);


reset role;


select results_eq(
  $$
    select c.category_type
      from public.cv_entries as e
      join public.cv_categories as c
        on c.id = e.category_id
     where e.source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    select private.cv_category_type_for_activity(
      pa.activity_type
    )
      from public.profile_activities as pa
     where pa.id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'included Presentation enters its matching fixed category'
);


select results_eq(
  $$
    select source_activity_id
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '93300000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'including a Presentation creates one linked CV entry'
);


select ok(
  (
    select
      year_label is null
      and title is null
      and organization is null
      and location_text is null
      and url is null
    from public.cv_entries
    where source_activity_id =
      '93300000-0000-4000-8000-000000000001'
  ),
  'linked CV entry does not duplicate Presentation content'
);


set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.profile_activities
       set title = 'UPDATED EXHIBITION'
     where id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can update the source Presentation'
);


reset role;


select results_eq(
  $$
    select pa.title
      from public.cv_entries as e
      join public.profile_activities as pa
        on pa.id = e.source_activity_id
     where e.source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    values ('UPDATED EXHIBITION'::varchar)
  $$,
  'CV immediately reflects updated Presentation content'
);


set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select is_empty(
  $$
    select id
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'anonymous visitor cannot see a linked draft Presentation'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.profile_activities
       set visibility = 'published'
     where id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can publish the included Presentation'
);


reset role;
set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select results_eq(
  $$
    select source_activity_id
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '93300000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'anonymous visitor sees a visible linked published Presentation'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    delete from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'direct deletion attempt on linked CV entry is safely ineffective'
);


reset role;


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (1::bigint)
  $$,
  'linked CV entry survives direct deletion attempt'
);


set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.cv_entries
       set is_visible = false
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can hide a linked CV placement'
);


reset role;
set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select is_empty(
  $$
    select id
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'hidden linked placement is absent publicly'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (1::bigint)
  $$,
  'profile owner can still read a hidden linked placement'
);


select lives_ok(
  $$
    update public.cv_entries
       set is_visible = true
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can restore a hidden linked placement'
);


select lives_ok(
  $$
    update public.profile_activities
       set include_in_cv = false
     where id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can remove Presentation from CV'
);


reset role;


select is_empty(
  $$
    select id
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'disabling CV inclusion removes only the linked placement'
);


set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.profile_activities
       set include_in_cv = true
     where id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  'profile owner can re-add Presentation to CV'
);


reset role;


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_entries
     where source_activity_id =
       '93300000-0000-4000-8000-000000000001'
  $$,
  $$
    values (1::bigint)
  $$,
  're-adding Presentation creates exactly one linked placement'
);


set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.cv_categories
       set is_visible = true
     where profile_id =
       '93200000-0000-4000-8000-000000000001'
       and category_type = 'education'
  $$,
  'profile owner can manage a fixed CV category'
);


select throws_ok(
  $$
    insert into public.cv_categories (
      profile_id,
      category_type,
      label,
      display_order,
      is_visible
    )
    values (
      '93200000-0000-4000-8000-000000000001',
      'education',
      'STUDIES',
      99,
      true
    )
  $$,
  '23505',
  null,
  'duplicate fixed CV category is rejected'
);


select lives_ok(
  $$
    insert into public.cv_entries (
      category_id,
      year_label,
      title,
      organization,
      location_text,
      url,
      display_order,
      is_visible
    )
    select
      c.id,
      '2014-2018',
      'BA FINE ARTS',
      'AKV ST. JOOST',
      'DEN BOSCH, NL',
      'https://example.test/education',
      0,
      true
    from public.cv_categories as c
    where c.profile_id =
      '93200000-0000-4000-8000-000000000001'
      and c.category_type = 'education'
  $$,
  'profile owner can create a manual CV entry'
);


reset role;
set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select results_eq(
  $$
    select e.title
      from public.cv_entries as e
      join public.cv_categories as c
        on c.id = e.category_id
     where c.profile_id =
       '93200000-0000-4000-8000-000000000001'
       and e.source_activity_id is null
  $$,
  $$
    values ('BA FINE ARTS'::varchar)
  $$,
  'anonymous visitor sees a visible manual CV entry'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.cv_categories
       set is_visible = true
     where profile_id =
       '93200000-0000-4000-8000-000000000001'
       and category_type = 'award'
  $$,
  'active profile editor can manage fixed CV structure'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);


select throws_ok(
  $$
    insert into public.cv_categories (
      profile_id,
      category_type,
      label,
      display_order,
      is_visible
    )
    values (
      '93200000-0000-4000-8000-000000000001',
      'publication',
      'PUBLICATIONS',
      99,
      true
    )
  $$,
  '42501',
  null,
  'unrelated profile owner cannot manage another artist CV'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.cv_entries
       set category_id = (
         select id
           from public.cv_categories
          where profile_id =
            '93200000-0000-4000-8000-000000000001'
            and category_type = 'award'
       )
     where source_activity_id is null
       and title = 'BA FINE ARTS'
  $$,
  'manual CV entry can move between categories of one profile'
);


select throws_ok(
  $$
    update public.cv_entries
       set category_id =
         '93400000-0000-4000-8000-000000000001'
     where source_activity_id is null
       and title = 'BA FINE ARTS'
  $$,
  '42501',
  null,
  'manual CV entry cannot move to another artist profile'
);


select lives_ok(
  $$
    update public.cv_entries
       set is_visible = false
     where source_activity_id is null
       and title = 'BA FINE ARTS'
  $$,
  'profile owner can hide a manual CV entry'
);


reset role;
set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select is_empty(
  $$
    select e.id
      from public.cv_entries as e
      join public.cv_categories as c
        on c.id = e.category_id
     where c.profile_id =
       '93200000-0000-4000-8000-000000000001'
       and e.source_activity_id is null
  $$,
  'hidden manual CV entry is absent publicly'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_entries as e
      join public.cv_categories as c
        on c.id = e.category_id
     where c.profile_id =
       '93200000-0000-4000-8000-000000000001'
       and e.source_activity_id is null
  $$,
  $$
    values (1::bigint)
  $$,
  'profile owner can still read a hidden manual CV entry'
);


select lives_ok(
  $$
    delete from public.cv_entries
     where source_activity_id is null
       and title = 'BA FINE ARTS'
  $$,
  'profile owner can delete a manual CV entry'
);


reset role;


select is_empty(
  $$
    select id
      from public.cv_entries
     where source_activity_id is null
       and title = 'BA FINE ARTS'
  $$,
  'manual CV entry is permanently removed'
);


set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select throws_ok(
  $$
    insert into public.cv_entries (
      category_id,
      source_activity_id,
      display_order,
      is_visible
    )
    select
      c.id,
      '93300000-0000-4000-8000-000000000001',
      99,
      true
    from public.cv_categories as c
    where c.profile_id =
      '93200000-0000-4000-8000-000000000001'
      and c.category_type = 'group_presentation'
  $$,
  '42501',
  null,
  'ordinary user cannot forge Presentation linkage'
);


reset role;


update public.public_profiles
   set publication_status = 'draft',
       published_at = null
 where id =
   '93200000-0000-4000-8000-000000000001';


set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select is_empty(
  $$
    select e.id
      from public.cv_entries as e
      join public.cv_categories as c
        on c.id = e.category_id
     where c.profile_id =
       '93200000-0000-4000-8000-000000000001'
  $$,
  'unpublished artist profile exposes no CV entries'
);


select * from finish();
rollback;
