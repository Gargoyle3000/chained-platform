begin;

create extension if not exists pgtap with schema extensions;
select plan(7);


insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '94100000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'fixed-cv-owner@example.test',
  now(),
  now()
);


insert into public.accounts (
  id,
  status,
  display_name
)
values (
  '94100000-0000-4000-8000-000000000001',
  'active',
  'FIXED CV OWNER'
);


insert into public.account_roles (
  account_id,
  role
)
values (
  '94100000-0000-4000-8000-000000000001',
  'artist'
);


insert into public.public_profiles (
  id,
  profile_type,
  slug,
  display_name,
  claim_state,
  primary_controller_account_id,
  claimed_at,
  created_by_account_id
)
values (
  '94200000-0000-4000-8000-000000000001',
  'artist',
  'fixed-cv-artist',
  'FIXED CV ARTIST',
  'claimed',
  '94100000-0000-4000-8000-000000000001',
  now(),
  '94100000-0000-4000-8000-000000000001'
);


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_categories
     where profile_id =
       '94200000-0000-4000-8000-000000000001'
  $$,
  $$
    values (10::bigint)
  $$,
  'new artist receives ten fixed CV categories'
);


select results_eq(
  $$
    select
      category_type,
      label,
      display_order
    from public.cv_categories
    where profile_id =
      '94200000-0000-4000-8000-000000000001'
    order by display_order
  $$,
  $$
    values
      ('education'::varchar, 'EDUCATION'::varchar, 0),
      ('solo_exhibition', 'SOLO EXHIBITIONS', 1),
      ('duo_exhibition', 'DUO EXHIBITIONS', 2),
      (
        'group_presentation',
        'GROUP EXHIBITIONS / PRESENTATIONS',
        3
      ),
      ('award', 'NOMINATIONS & PRIZES', 4),
      ('grant', 'SCHOLARSHIPS & FUNDING', 5),
      ('collection', 'COLLECTIONS', 6),
      ('residency', 'RESIDENCIES', 7),
      ('teaching', 'TEACHING', 8),
      ('curatorial', 'CURATORIAL PROJECTS', 9)
  $$,
  'fixed CV categories use the canonical order and labels'
);


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_categories
     where profile_id =
       '94200000-0000-4000-8000-000000000001'
       and is_visible
  $$,
  $$
    values (10::bigint)
  $$,
  'fixed CV categories start visible'
);


insert into public.profile_members (
  profile_id,
  account_id,
  membership_level
)
values (
  '94200000-0000-4000-8000-000000000001',
  '94100000-0000-4000-8000-000000000001',
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
  start_date,
  include_in_cv,
  visibility
)
values
  (
    '94300000-0000-4000-8000-000000000001',
    '94200000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'SOLO TEST',
    'solo-exhibition',
    'SOLO VENUE',
    'AMSTERDAM',
    '2026-01-01',
    true,
    'draft'
  ),
  (
    '94300000-0000-4000-8000-000000000002',
    '94200000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'DUO TEST',
    'duo-exhibition',
    'DUO VENUE',
    'UTRECHT',
    '2026-02-01',
    true,
    'draft'
  ),
  (
    '94300000-0000-4000-8000-000000000003',
    '94200000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'GROUP TEST',
    'group-exhibition',
    'GROUP VENUE',
    'ROTTERDAM',
    '2026-03-01',
    true,
    'draft'
  ),
  (
    '94300000-0000-4000-8000-000000000004',
    '94200000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    '94100000-0000-4000-8000-000000000001',
    'RESIDENCY TEST',
    'residency',
    'RESIDENCY VENUE',
    'ARNHEM',
    '2026-04-01',
    true,
    'draft'
  );


select results_eq(
  $$
    select count(*)::bigint
      from public.cv_entries
     where source_activity_id is not null
       and source_activity_id in (
         '94300000-0000-4000-8000-000000000001',
         '94300000-0000-4000-8000-000000000002',
         '94300000-0000-4000-8000-000000000003',
         '94300000-0000-4000-8000-000000000004'
       )
  $$,
  $$
    values (4::bigint)
  $$,
  'included Presentations create four linked CV entries'
);


select results_eq(
  $$
    select
      activity.title,
      category.category_type
    from public.cv_entries as entry
    join public.profile_activities as activity
      on activity.id = entry.source_activity_id
    join public.cv_categories as category
      on category.id = entry.category_id
    where activity.owner_profile_id =
      '94200000-0000-4000-8000-000000000001'
    order by activity.title
  $$,
  $$
    values
      ('DUO TEST'::varchar, 'duo_exhibition'::varchar),
      ('GROUP TEST', 'group_presentation'),
      ('RESIDENCY TEST', 'residency'),
      ('SOLO TEST', 'solo_exhibition')
  $$,
  'Presentations route into their matching fixed CV categories'
);


update public.profile_activities
   set activity_type = 'art-fair'
 where id =
   '94300000-0000-4000-8000-000000000001';


select results_eq(
  $$
    select category.category_type
      from public.cv_entries as entry
      join public.cv_categories as category
        on category.id = entry.category_id
     where entry.source_activity_id =
       '94300000-0000-4000-8000-000000000001'
  $$,
  $$
    values ('group_presentation'::varchar)
  $$,
  'changing Presentation type moves its linked CV entry'
);


update public.profile_activities
   set include_in_cv = false
 where id =
   '94300000-0000-4000-8000-000000000002';


select is_empty(
  $$
    select id
      from public.cv_entries
     where source_activity_id =
       '94300000-0000-4000-8000-000000000002'
  $$,
  'excluding a Presentation removes only its linked CV entry'
);


select * from finish();
rollback;