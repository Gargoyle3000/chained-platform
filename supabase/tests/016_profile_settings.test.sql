begin;

create extension if not exists pgtap
with schema extensions;

select plan(19);


-- =========================================================
-- TEST ACCOUNTS
-- =========================================================

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
    '96100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'settings-owner@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '96100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'settings-manager@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '96100000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'settings-editor@example.test',
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
    '96100000-0000-4000-8000-000000000001',
    'active',
    'SETTINGS OWNER'
  ),
  (
    '96100000-0000-4000-8000-000000000002',
    'active',
    'SETTINGS MANAGER'
  ),
  (
    '96100000-0000-4000-8000-000000000003',
    'active',
    'SETTINGS EDITOR'
  );


insert into public.account_roles (
  account_id,
  role
)
values
  (
    '96100000-0000-4000-8000-000000000001',
    'artist'
  ),
  (
    '96100000-0000-4000-8000-000000000002',
    'artist'
  ),
  (
    '96100000-0000-4000-8000-000000000003',
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
values (
  '96200000-0000-4000-8000-000000000001',
  'artist',
  'settings-artist',
  'SETTINGS ARTIST',
  'published',
  now(),
  'claimed',
  '96100000-0000-4000-8000-000000000001',
  now(),
  '96100000-0000-4000-8000-000000000001'
);


insert into public.profile_members (
  profile_id,
  account_id,
  membership_level
)
values
  (
    '96200000-0000-4000-8000-000000000001',
    '96100000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '96200000-0000-4000-8000-000000000001',
    '96100000-0000-4000-8000-000000000002',
    'manager'
  ),
  (
    '96200000-0000-4000-8000-000000000001',
    '96100000-0000-4000-8000-000000000003',
    'editor'
  );


-- =========================================================
-- SCHEMA
-- =========================================================

select has_column(
  'public',
  'public_profiles',
  'alternative_name',
  'Artist profile has an alternative name field'
);

select has_column(
  'public',
  'public_profiles',
  'website_url',
  'Artist profile has a website field'
);

select has_column(
  'public',
  'public_profiles',
  'show_press',
  'Artist profile has a Press section switch'
);

select has_column(
  'public',
  'accounts',
  'account_plan',
  'Account has a private CHAINED plan'
);

select has_column(
  'public',
  'accounts',
  'legacy_status',
  'Account has an optional private legacy status'
);

select ok(
  to_regprocedure(
    'private.can_manage_profile_settings(uuid)'
  ) is not null,
  'Profile settings permission helper exists'
);


-- =========================================================
-- DEFAULTS
-- =========================================================

select results_eq(
  $$
    select
      account_plan::text,
      legacy_status is null
    from public.accounts
    where id =
      '96100000-0000-4000-8000-000000000001'
  $$,
  $$values ('unchained'::text, true)$$,
  'New accounts start UNCHAINED without a legacy status'
);


select results_eq(
  $$
    select
      show_works,
      show_presentations,
      show_agenda,
      show_cv,
      show_press
    from public.public_profiles
    where id =
      '96200000-0000-4000-8000-000000000001'
  $$,
  $$values (true, true, true, true, true)$$,
  'Existing public sections remain enabled by default'
);


-- =========================================================
-- OWNER CAN MANAGE SETTINGS
-- =========================================================

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"96100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.public_profiles
       set display_name = 'SETTINGS ARTIST UPDATED',
           alternative_name = 'ALTERNATIVE ARTIST',
           city = 'AMSTERDAM',
           country = 'NETHERLANDS',
           biography = 'PROFILE BIOGRAPHY',
           website_url = 'www.artist.example',
           social_url = 'social.example/artist',
           pronouns = 'THEY / THEM',
           public_contact_email =
             ' CONTACT@ARTIST.EXAMPLE '
     where id =
       '96200000-0000-4000-8000-000000000001'
  $$,
  'owner can update artist profile settings'
);


-- =========================================================
-- MANAGER CAN MANAGE SETTINGS
-- =========================================================

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"96100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.public_profiles
       set city = 'ROTTERDAM'
     where id =
       '96200000-0000-4000-8000-000000000001'
  $$,
  'manager can update artist profile settings'
);


-- =========================================================
-- EDITOR CANNOT MANAGE SETTINGS
-- =========================================================

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"96100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);


select results_eq(
  $$
    update public.public_profiles
       set city = 'EDITOR CITY'
     where id =
       '96200000-0000-4000-8000-000000000001'
    returning city
  $$,
  $$select null::varchar where false$$,
  'editor cannot update artist profile settings'
);


-- =========================================================
-- SECTION SWITCH
-- =========================================================

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"96100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    update public.public_profiles
       set show_press = false
     where id =
       '96200000-0000-4000-8000-000000000001'
  $$,
  'owner can hide a public profile section'
);


-- =========================================================
-- PROFILE PUBLICATION STATUS
-- =========================================================

select results_eq(
  $$
    update public.public_profiles
       set publication_status = 'draft'
     where id =
       '96200000-0000-4000-8000-000000000001'
    returning
      publication_status::text,
      published_at is null
  $$,
  $$values ('draft'::text, true)$$,
  'hiding the public profile clears published_at automatically'
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
    select count(*)::integer
      from public.public_profiles
     where id =
       '96200000-0000-4000-8000-000000000001'
  $$,
  $$values (0)$$,
  'guest cannot read a hidden artist profile'
);


reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"96100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select results_eq(
  $$
    update public.public_profiles
       set publication_status = 'published'
     where id =
       '96200000-0000-4000-8000-000000000001'
    returning
      publication_status::text,
      published_at is not null
  $$,
  $$values ('published'::text, true)$$,
  'publishing the public profile creates published_at automatically'
);


-- =========================================================
-- PUBLIC PROFILE INFORMATION
-- =========================================================

reset role;
set local role anon;

select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);


select results_eq(
  $$
    select
      display_name,
      alternative_name,
      city,
      country,
      website_url,
      social_url,
      pronouns,
      public_contact_email,
      show_press
    from public.public_profiles
    where id =
      '96200000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'SETTINGS ARTIST UPDATED'::varchar,
      'ALTERNATIVE ARTIST'::varchar,
      'ROTTERDAM'::varchar,
      'NETHERLANDS'::varchar,
      'https://www.artist.example'::text,
      'https://social.example/artist'::text,
      'THEY / THEM'::varchar,
      'contact@artist.example'::varchar,
      false
    )
  $$,
  'guest reads normalized public profile information and section state'
);


-- =========================================================
-- MEMBERSHIP IS READ-ONLY FROM THE APP
-- =========================================================

reset role;


select is(
  has_column_privilege(
    'authenticated',
    'public.accounts',
    'account_plan',
    'UPDATE'
  ),
  false,
  'authenticated users cannot change their own CHAINED plan'
);


select is(
  has_column_privilege(
    'authenticated',
    'public.accounts',
    'legacy_status',
    'UPDATE'
  ),
  false,
  'authenticated users cannot assign their own legacy status'
);


select ok(
  to_regclass(
    'public.accounts_single_master_chain'
  ) is not null,
  'database reserves MASTER CHAIN as a single unique account status'
);


select * from finish();

rollback;