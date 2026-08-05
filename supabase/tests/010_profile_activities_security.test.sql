begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

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
    '91000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'activity-owner-a@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'activity-owner-b@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'presentation-delegate@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'event-delegate@example.test',
    now(),
    now()
  );

insert into public.accounts (id, status, display_name)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'active',
    'ACTIVITY OWNER A'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'active',
    'ACTIVITY OWNER B'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'active',
    'PRESENTATION DELEGATE'
  ),
  (
    '91000000-0000-4000-8000-000000000004',
    'active',
    'EVENT DELEGATE'
  );

insert into public.account_roles (account_id, role)
values
  (
    '91000000-0000-4000-8000-000000000001',
    'artist'
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'artist'
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'institution'
  ),
  (
    '91000000-0000-4000-8000-000000000004',
    'institution'
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
    '92000000-0000-4000-8000-000000000001',
    'artist',
    'activity-artist-a',
    'ACTIVITY ARTIST A',
    'published',
    now(),
    'claimed',
    '91000000-0000-4000-8000-000000000001',
    now(),
    '91000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    'artist',
    'activity-artist-b',
    'ACTIVITY ARTIST B',
    'published',
    now(),
    'claimed',
    '91000000-0000-4000-8000-000000000002',
    now(),
    '91000000-0000-4000-8000-000000000002'
  ),
  (
    '92000000-0000-4000-8000-000000000003',
    'institution',
    'presentation-delegate-profile',
    'PRESENTATION DELEGATE PROFILE',
    'published',
    now(),
    'claimed',
    '91000000-0000-4000-8000-000000000003',
    now(),
    '91000000-0000-4000-8000-000000000003'
  ),
  (
    '92000000-0000-4000-8000-000000000004',
    'institution',
    'event-delegate-profile',
    'EVENT DELEGATE PROFILE',
    'published',
    now(),
    'claimed',
    '91000000-0000-4000-8000-000000000004',
    now(),
    '91000000-0000-4000-8000-000000000004'
  );

insert into public.profile_members (
  profile_id,
  account_id,
  membership_level
)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'owner'
  ),
  (
    '92000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000003',
    'owner'
  ),
  (
    '92000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000004',
    'owner'
  );

insert into public.profile_access_grants (
  grantor_profile_id,
  grantee_profile_id,
  scope,
  status,
  granted_by_account_id
)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000003',
    'presentations_editor',
    'active',
    '91000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000004',
    'events_editor',
    'active',
    '91000000-0000-4000-8000-000000000001'
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
  show_in_presentations,
  include_in_cv,
  visibility,
  published_at
)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'PUBLISHED ACTIVITY A',
    'group-exhibition',
    'TEST VENUE',
    'AMSTERDAM',
    'NETHERLANDS',
    '2026-08-01',
    '2026-08-31',
    true,
    true,
    'published',
    now()
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'DRAFT ACTIVITY A',
    'solo-exhibition',
    'DRAFT VENUE',
    'UTRECHT',
    'NETHERLANDS',
    '2026-09-01',
    '2026-09-30',
    true,
    true,
    'draft',
    null
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '',
    '',
    '',
    '',
    null,
    null,
    null,
    true,
    false,
    'draft',
    null
  ),
  (
    '93000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'DRAFT ACTIVITY B',
    'group-exhibition',
    'OTHER VENUE',
    'ROTTERDAM',
    'NETHERLANDS',
    '2026-10-01',
    '2026-10-31',
    true,
    true,
    'draft',
    null
  ),
  (
    '93000000-0000-4000-8000-000000000005',
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'DELETE ACTIVITY',
    'project',
    'DELETE VENUE',
    'AMSTERDAM',
    'NETHERLANDS',
    '2026-11-01',
    '2026-11-30',
    true,
    true,
    'draft',
    null
  );

insert into public.activity_occurrences (
  id,
  activity_id,
  created_by_account_id,
  updated_by_account_id,
  occurrence_type,
  start_date,
  end_date,
  start_time,
  end_time,
  time_zone,
  show_in_agenda,
  visibility,
  published_at
)
values
  (
    '94000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'opening',
    '2026-08-01',
    '2026-08-01',
    '18:00',
    '21:00',
    'Europe/Amsterdam',
    true,
    'published',
    now()
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'talk',
    '2026-08-15',
    '2026-08-15',
    '19:00',
    '20:00',
    'Europe/Amsterdam',
    true,
    'draft',
    null
  ),
  (
    '94000000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'opening',
    '2026-09-01',
    '2026-09-01',
    '18:00',
    '21:00',
    'Europe/Amsterdam',
    true,
    'draft',
    null
  ),
  (
    '94000000-0000-4000-8000-000000000004',
    '93000000-0000-4000-8000-000000000005',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'opening',
    '2026-11-01',
    '2026-11-01',
    '18:00',
    '21:00',
    'Europe/Amsterdam',
    true,
    'draft',
    null
  ),
  (
    '94000000-0000-4000-8000-000000000005',
    '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'performance',
    '2026-08-20',
    '2026-08-20',
    '20:00',
    '21:00',
    'Europe/Amsterdam',
    true,
    'draft',
    null
  );

set local role anon;
select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);

select results_eq(
  $$
    select title
      from public.profile_activities
     where id = '93000000-0000-4000-8000-000000000001'
  $$,
  $$values ('PUBLISHED ACTIVITY A'::varchar)$$,
  'guest can read a published Activity'
);

select is_empty(
  $$
    select id
      from public.profile_activities
     where id = '93000000-0000-4000-8000-000000000002'
  $$,
  'guest cannot read a draft Activity'
);

select results_eq(
  $$
    select occurrence_type
      from public.activity_occurrences
     where id = '94000000-0000-4000-8000-000000000001'
  $$,
  $$values ('opening'::varchar)$$,
  'guest can read a published Agenda moment'
);

select is_empty(
  $$
    select id
      from public.activity_occurrences
     where id = '94000000-0000-4000-8000-000000000002'
  $$,
  'guest cannot read a draft Agenda moment'
);


reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select id
      from public.profile_activities
     where id = '93000000-0000-4000-8000-000000000002'
  $$,
  $$values ('93000000-0000-4000-8000-000000000002'::uuid)$$,
  'artist can read their own draft Activity'
);

select results_eq(
  $$
    update public.profile_activities
       set title = 'UPDATED DRAFT ACTIVITY A'
     where id = '93000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$values ('93000000-0000-4000-8000-000000000002'::uuid)$$,
  'artist can update their own Activity'
);

select lives_ok(
  $$
    insert into public.profile_activities (
      owner_profile_id,
      title,
      activity_type,
      venue_name,
      city,
      start_date,
      show_in_presentations,
      include_in_cv
    )
    values (
      '92000000-0000-4000-8000-000000000001',
      'CREATED BY OWNER',
      'project',
      'OWNER VENUE',
      'AMSTERDAM',
      '2027-01-01',
      true,
      true
    )
  $$,
  'artist can create a draft Activity for their profile'
);

select throws_ok(
  $$
    insert into public.profile_activities (
      owner_profile_id,
      title,
      activity_type,
      venue_name,
      city,
      start_date
    )
    values (
      '92000000-0000-4000-8000-000000000002',
      'UNAUTHORIZED ACTIVITY',
      'project',
      'OTHER VENUE',
      'ROTTERDAM',
      '2027-01-01'
    )
  $$,
  '42501',
  null,
  'artist cannot create an Activity for another artist'
);

select throws_ok(
  $$
    update public.profile_activities
       set owner_profile_id = '92000000-0000-4000-8000-000000000002'
     where id = '93000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  null,
  'ordinary updates cannot change Activity ownership'
);

select results_eq(
  $$
    update public.profile_activities
       set visibility = 'published'
     where id = '93000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$values ('93000000-0000-4000-8000-000000000002'::uuid)$$,
  'artist can publish a complete Activity'
);

select throws_ok(
  $$
    update public.profile_activities
       set visibility = 'published'
     where id = '93000000-0000-4000-8000-000000000003'
  $$,
  '23514',
  null,
  'incomplete Activity cannot be published'
);

select lives_ok(
  $$
    insert into public.activity_occurrences (
      activity_id,
      occurrence_type,
      start_date,
      start_time,
      end_time,
      time_zone,
      show_in_agenda
    )
    values (
      '93000000-0000-4000-8000-000000000001',
      'screening',
      '2026-08-25',
      '20:00',
      '22:00',
      'Europe/Amsterdam',
      true
    )
  $$,
  'artist can create an Agenda moment for their Activity'
);

select results_eq(
  $$
    update public.activity_occurrences
       set visibility = 'published'
     where id = '94000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$values ('94000000-0000-4000-8000-000000000002'::uuid)$$,
  'artist can publish an Agenda moment under a published Activity'
);

select throws_ok(
  $$
    update public.activity_occurrences
       set visibility = 'published'
     where id = '94000000-0000-4000-8000-000000000003'
  $$,
  '23514',
  null,
  'Agenda moment cannot be published under a draft Activity'
);

select throws_ok(
  $$
    update public.activity_occurrences
       set activity_id = '93000000-0000-4000-8000-000000000005'
     where id = '94000000-0000-4000-8000-000000000005'
  $$,
  '42501',
  null,
  'ordinary updates cannot move an Agenda moment to another Activity'
);


reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select results_eq(
  $$
    update public.profile_activities
       set title = 'UNAUTHORIZED ACTIVITY UPDATE'
     where id = '93000000-0000-4000-8000-000000000001'
     returning id
  $$,
  $$select null::uuid where false$$,
  'unrelated artist cannot update another artist Activity'
);

select results_eq(
  $$
    update public.activity_occurrences
       set occurrence_type = 'unauthorized'
     where id = '94000000-0000-4000-8000-000000000001'
     returning id
  $$,
  $$select null::uuid where false$$,
  'unrelated artist cannot update another artist Agenda moment'
);


reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select results_eq(
  $$
    update public.profile_activities
       set venue_name = 'DELEGATE VENUE'
     where id = '93000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$values ('93000000-0000-4000-8000-000000000002'::uuid)$$,
  'presentations_editor delegate can manage Activities'
);

select results_eq(
  $$
    update public.activity_occurrences
       set occurrence_type = 'presentation-scope-failure'
     where id = '94000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$select null::uuid where false$$,
  'presentations_editor scope cannot manage Agenda moments'
);


reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select results_eq(
  $$
    update public.profile_activities
       set venue_name = 'EVENT SCOPE FAILURE'
     where id = '93000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$select null::uuid where false$$,
  'events_editor scope cannot manage Activities'
);

select results_eq(
  $$
    update public.activity_occurrences
       set occurrence_type = 'public-talk'
     where id = '94000000-0000-4000-8000-000000000002'
     returning id
  $$,
  $$values ('94000000-0000-4000-8000-000000000002'::uuid)$$,
  'events_editor delegate can manage Agenda moments'
);

select lives_ok(
  $$
    insert into public.activity_occurrences (
      activity_id,
      occurrence_type,
      start_date,
      show_in_agenda
    )
    values (
      '93000000-0000-4000-8000-000000000001',
      'book-launch',
      '2026-08-28',
      true
    )
  $$,
  'events_editor delegate can create an Agenda moment'
);

select throws_ok(
  $$
    delete from public.profile_activities
     where id = '93000000-0000-4000-8000-000000000005'
  $$,
  '42501',
  null,
  'ordinary authenticated users cannot permanently delete Activities'
);

select throws_ok(
  $$
    delete from public.activity_occurrences
     where id = '94000000-0000-4000-8000-000000000005'
  $$,
  '42501',
  null,
  'ordinary authenticated users cannot permanently delete Agenda moments'
);

select throws_ok(
  $$
    select public.soft_delete_profile_activity(
      '93000000-0000-4000-8000-000000000005'
    )
  $$,
  '42501',
  null,
  'events_editor scope cannot soft-delete an Activity'
);


reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select public.soft_delete_profile_activity(
      '93000000-0000-4000-8000-000000000005'
    )
  $$,
  $$values (true)$$,
  'presentations_editor delegate can soft-delete an Activity'
);

select results_eq(
  $$
    select count(*)::bigint
      from public.profile_activities
     where id = '93000000-0000-4000-8000-000000000005'
  $$,
  $$values (0::bigint)$$,
  'soft-deleted Activity disappears from managed selection'
);


reset role;

select ok(
  (
    select deleted_at is not null
       and purge_after = deleted_at + interval '30 days'
       and deleted_by_account_id =
         '91000000-0000-4000-8000-000000000003'::uuid
       and visibility = 'draft'
       and published_at is null
      from public.profile_activities
     where id = '93000000-0000-4000-8000-000000000005'
  ),
  'Activity soft deletion records its actor, purge window, and draft state'
);

select ok(
  (
    select deleted_at is not null
       and purge_after = deleted_at + interval '30 days'
       and deleted_by_account_id =
         '91000000-0000-4000-8000-000000000003'::uuid
      from public.activity_occurrences
     where id = '94000000-0000-4000-8000-000000000004'
  ),
  'soft-deleting an Activity also soft-deletes its Agenda moments'
);


set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select public.soft_delete_activity_occurrence(
      '94000000-0000-4000-8000-000000000005'
    )
  $$,
  $$values (true)$$,
  'artist can soft-delete their Agenda moment'
);

select is_empty(
  $$
    select id
      from public.activity_occurrences
     where id = '94000000-0000-4000-8000-000000000005'
  $$,
  'soft-deleted Agenda moment disappears from managed selection'
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
      from public.activity_occurrences
     where id = '94000000-0000-4000-8000-000000000005'
  $$,
  'soft-deleted Agenda moment is absent from public selection'
);

select * from finish();
rollback;
