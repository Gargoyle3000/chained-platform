begin;

create extension if not exists pgtap with schema extensions;
select plan(17);


-- Test accounts

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
    '91100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'agenda-owner-a@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'agenda-owner-b@example.test',
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
    '91100000-0000-4000-8000-000000000001',
    'active',
    'AGENDA OWNER A'
  ),
  (
    '91100000-0000-4000-8000-000000000002',
    'active',
    'AGENDA OWNER B'
  );

insert into public.account_roles (
  account_id,
  role
)
values
  (
    '91100000-0000-4000-8000-000000000001',
    'artist'
  ),
  (
    '91100000-0000-4000-8000-000000000002',
    'artist'
  );


-- Artist profiles

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
    '92100000-0000-4000-8000-000000000001',
    'artist',
    'agenda-artist-a',
    'AGENDA ARTIST A',
    'published',
    now(),
    'claimed',
    '91100000-0000-4000-8000-000000000001',
    now(),
    '91100000-0000-4000-8000-000000000001'
  ),
  (
    '92100000-0000-4000-8000-000000000002',
    'artist',
    'agenda-artist-b',
    'AGENDA ARTIST B',
    'published',
    now(),
    'claimed',
    '91100000-0000-4000-8000-000000000002',
    now(),
    '91100000-0000-4000-8000-000000000002'
  );

insert into public.profile_members (
  profile_id,
  account_id,
  membership_level
)
values
  (
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '92100000-0000-4000-8000-000000000002',
    '91100000-0000-4000-8000-000000000002',
    'owner'
  );


-- Presentations used by linked Agenda moments

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
    '93100000-0000-4000-8000-000000000001',
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'PUBLISHED PRESENTATION A',
    'group-exhibition',
    'TEST VENUE A',
    'AMSTERDAM',
    'NETHERLANDS',
    '2026-09-01',
    '2026-09-30',
    true,
    true,
    'published',
    now()
  ),
  (
    '93100000-0000-4000-8000-000000000002',
    '92100000-0000-4000-8000-000000000002',
    '91100000-0000-4000-8000-000000000002',
    '91100000-0000-4000-8000-000000000002',
    'PUBLISHED PRESENTATION B',
    'project',
    'TEST VENUE B',
    'ROTTERDAM',
    'NETHERLANDS',
    '2026-10-01',
    '2026-10-31',
    true,
    true,
    'published',
    now()
  ),
  (
    '93100000-0000-4000-8000-000000000003',
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'DELETE PRESENTATION A',
    'project',
    'DELETE VENUE',
    'AMSTERDAM',
    'NETHERLANDS',
    '2026-11-01',
    '2026-11-30',
    true,
    false,
    'draft',
    null
  );


-- Linked fixture: owner_profile_id must be derived from its Presentation.

insert into public.activity_occurrences (
  id,
  activity_id,
  created_by_account_id,
  updated_by_account_id,
  occurrence_type,
  start_date,
  start_time,
  time_zone,
  show_in_agenda,
  visibility,
  published_at
)
values (
  '94100000-0000-4000-8000-000000000001',
  '93100000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001',
  'opening',
  '2026-09-01',
  '18:00',
  'Europe/Amsterdam',
  true,
  'draft',
  null
);


-- Independent fixtures used for publication and deletion checks.

insert into public.activity_occurrences (
  id,
  owner_profile_id,
  created_by_account_id,
  updated_by_account_id,
  occurrence_type,
  title_override,
  start_date,
  start_time,
  end_time,
  time_zone,
  venue_name_override,
  city_override,
  show_in_agenda,
  visibility,
  published_at
)
values
  (
    '94100000-0000-4000-8000-000000000002',
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'incomplete',
    null,
    '2026-12-01',
    '18:00',
    '20:00',
    'Europe/Amsterdam',
    null,
    null,
    true,
    'draft',
    null
  ),
  (
    '94100000-0000-4000-8000-000000000003',
    '92100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001',
    'open-studio',
    'SURVIVING OPEN STUDIO',
    '2027-01-15',
    '12:00',
    '18:00',
    'Europe/Amsterdam',
    'ARTIST STUDIO',
    'AMSTERDAM',
    true,
    'draft',
    null
  );


-- Schema

select has_column(
  'public',
  'activity_occurrences',
  'owner_profile_id',
  'Agenda item belongs directly to an artist profile'
);

select ok(
  (
    select is_nullable = 'NO'
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'activity_occurrences'
       and column_name = 'owner_profile_id'
  ),
  'Agenda ownership is required'
);

select ok(
  (
    select is_nullable = 'YES'
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'activity_occurrences'
       and column_name = 'activity_id'
  ),
  'Presentation linkage is optional'
);

select has_index(
  'public',
  'activity_occurrences',
  'activity_occurrences_owner_updated',
  'managed Agenda lookup by owner is indexed'
);

select results_eq(
  $$
    select owner_profile_id
      from public.activity_occurrences
     where id = '94100000-0000-4000-8000-000000000001'
  $$,
  $$values ('92100000-0000-4000-8000-000000000001'::uuid)$$,
  'linked Agenda moment derives its owner from the Presentation'
);


-- Owner A creates and publishes an independent Agenda item.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.activity_occurrences (
      owner_profile_id,
      occurrence_type,
      title_override,
      start_date,
      start_time,
      end_time,
      time_zone,
      venue_name_override,
      city_override,
      show_in_agenda
    )
    values (
      '92100000-0000-4000-8000-000000000001',
      'open-studio',
      'OPEN STUDIO PEER VINK',
      '2026-12-12',
      '12:00',
      '18:00',
      'Europe/Amsterdam',
      'ARTIST STUDIO',
      'AMSTERDAM',
      true
    )
  $$,
  'artist can create an independent Agenda item'
);

select results_eq(
  $$
    select owner_profile_id, activity_id
      from public.activity_occurrences
     where title_override = 'OPEN STUDIO PEER VINK'
  $$,
  $$
    values (
      '92100000-0000-4000-8000-000000000001'::uuid,
      null::uuid
    )
  $$,
  'independent Agenda item has a direct owner and no Presentation'
);

select results_eq(
  $$
    update public.activity_occurrences
       set visibility = 'published'
     where title_override = 'OPEN STUDIO PEER VINK'
     returning title_override
  $$,
  $$values ('OPEN STUDIO PEER VINK'::varchar)$$,
  'artist can publish a complete independent Agenda item'
);


-- Public visibility

reset role;
set local role anon;
select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);

select results_eq(
  $$
    select title_override
      from public.activity_occurrences
     where title_override = 'OPEN STUDIO PEER VINK'
  $$,
  $$values ('OPEN STUDIO PEER VINK'::varchar)$$,
  'guest can read a published independent Agenda item'
);


-- Validation and ownership protection

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    update public.activity_occurrences
       set visibility = 'published'
     where id = '94100000-0000-4000-8000-000000000002'
  $$,
  '23514',
  null,
  'incomplete independent Agenda item cannot be published'
);

select throws_ok(
  $$
    insert into public.activity_occurrences (
      owner_profile_id,
      activity_id,
      occurrence_type,
      start_date,
      show_in_agenda
    )
    values (
      '92100000-0000-4000-8000-000000000001',
      '93100000-0000-4000-8000-000000000002',
      'opening',
      '2026-10-01',
      true
    )
  $$,
  '23514',
  null,
  'Agenda item and linked Presentation cannot have different owners'
);


reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select results_eq(
  $$
    update public.activity_occurrences
       set occurrence_type = 'unauthorized-update'
     where title_override = 'OPEN STUDIO PEER VINK'
     returning id
  $$,
  $$select null::uuid where false$$,
  'unrelated artist cannot update another artist Agenda item'
);


-- Independent deletion does not affect Presentations.

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select public.soft_delete_activity_occurrence(
      (
        select id
          from public.activity_occurrences
         where title_override = 'OPEN STUDIO PEER VINK'
      )
    )
  $$,
  $$values (true)$$,
  'artist can soft-delete an independent Agenda item'
);

select results_eq(
  $$
    select id
      from public.profile_activities
     where id = '93100000-0000-4000-8000-000000000001'
  $$,
  $$values ('93100000-0000-4000-8000-000000000001'::uuid)$$,
  'deleting an independent Agenda item leaves Presentations untouched'
);


-- Deleting a Presentation does not affect independent Agenda items.

select results_eq(
  $$
    select public.soft_delete_profile_activity(
      '93100000-0000-4000-8000-000000000003'
    )
  $$,
  $$values (true)$$,
  'artist can soft-delete the test Presentation'
);

select results_eq(
  $$
    select id
      from public.activity_occurrences
     where id = '94100000-0000-4000-8000-000000000003'
  $$,
  $$values ('94100000-0000-4000-8000-000000000003'::uuid)$$,
  'deleting a Presentation leaves independent Agenda items untouched'
);


-- Deleted independent item is no longer public.

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
     where title_override = 'OPEN STUDIO PEER VINK'
  $$,
  'soft-deleted independent Agenda item is absent publicly'
);


select * from finish();
rollback;