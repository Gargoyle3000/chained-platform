begin;

create extension if not exists pgtap
with schema extensions;

select plan(13);


-- Test accounts.

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
    '95100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'press-owner-a@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '95100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'press-owner-b@example.test',
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
    '95100000-0000-4000-8000-000000000001',
    'active',
    'PRESS OWNER A'
  ),
  (
    '95100000-0000-4000-8000-000000000002',
    'active',
    'PRESS OWNER B'
  );


insert into public.account_roles (
  account_id,
  role
)
values
  (
    '95100000-0000-4000-8000-000000000001',
    'artist'
  ),
  (
    '95100000-0000-4000-8000-000000000002',
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
    '95200000-0000-4000-8000-000000000001',
    'artist',
    'press-artist-a',
    'PRESS ARTIST A',
    'published',
    now(),
    'claimed',
    '95100000-0000-4000-8000-000000000001',
    now(),
    '95100000-0000-4000-8000-000000000001'
  ),
  (
    '95200000-0000-4000-8000-000000000002',
    'artist',
    'press-artist-b',
    'PRESS ARTIST B',
    'published',
    now(),
    'claimed',
    '95100000-0000-4000-8000-000000000002',
    now(),
    '95100000-0000-4000-8000-000000000002'
  );


insert into public.profile_members (
  profile_id,
  account_id,
  membership_level
)
values
  (
    '95200000-0000-4000-8000-000000000001',
    '95100000-0000-4000-8000-000000000001',
    'owner'
  ),
  (
    '95200000-0000-4000-8000-000000000002',
    '95100000-0000-4000-8000-000000000002',
    'owner'
  );


-- Schema.

select has_table(
  'public',
  'profile_press_items',
  'Press items table exists'
);

select has_column(
  'public',
  'profile_press_items',
  'owner_profile_id',
  'Press item belongs directly to an artist profile'
);


-- Owner A can create Press items.

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select lives_ok(
  $$
    insert into public.profile_press_items (
      owner_profile_id,
      year_label,
      title,
      author,
      body,
      url,
      is_visible
    )
    values (
      '95200000-0000-4000-8000-000000000001',
      '2026',
      'PRESS ITEM A',
      'AUTHOR A',
      'TEXT A',
      'https://example.test/a',
      true
    )
  $$,
  'artist can create a visible Press item'
);


select lives_ok(
  $$
    insert into public.profile_press_items (
      owner_profile_id,
      year_label,
      title,
      author,
      body,
      url,
      is_visible
    )
    values (
      '95200000-0000-4000-8000-000000000001',
      '2025',
      'PRESS ITEM B',
      'AUTHOR B',
      'TEXT B',
      null,
      true
    )
  $$,
  'artist can create another Press item'
);


-- Public visibility.

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
      from public.profile_press_items
     where owner_profile_id =
       '95200000-0000-4000-8000-000000000001'
  $$,
  $$values (2)$$,
  'guest can read visible Press items from a published artist'
);


-- Owner hides one item.

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select results_eq(
  $$
    update public.profile_press_items
       set is_visible = false
     where title = 'PRESS ITEM A'
     returning title
  $$,
  $$values ('PRESS ITEM A'::varchar)$$,
  'artist can hide a Press item'
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
    select title
      from public.profile_press_items
     where owner_profile_id =
       '95200000-0000-4000-8000-000000000001'
     order by title
  $$,
  $$values ('PRESS ITEM B'::varchar)$$,
  'hidden Press items are not public'
);


-- Validation.

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select throws_ok(
  $$
    insert into public.profile_press_items (
      owner_profile_id,
      year_label,
      title,
      url
    )
    values (
      '95200000-0000-4000-8000-000000000001',
      '2026',
      'INVALID URL',
      'example.test/no-protocol'
    )
  $$,
  '23514',
  null,
  'Press URL must use HTTP or HTTPS'
);


select throws_ok(
  $$
    insert into public.profile_press_items (
      owner_profile_id,
      year_label,
      title
    )
    values (
      '95200000-0000-4000-8000-000000000001',
      '',
      'NO YEAR'
    )
  $$,
  '23514',
  null,
  'Press item requires a year'
);


select throws_ok(
  $$
    insert into public.profile_press_items (
      owner_profile_id,
      year_label,
      title
    )
    values (
      '95200000-0000-4000-8000-000000000001',
      '2026',
      ''
    )
  $$,
  '23514',
  null,
  'Press item requires a title'
);


-- Another artist cannot modify Owner A Press.

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);


select results_eq(
  $$
    update public.profile_press_items
       set title = 'UNAUTHORIZED'
     where title = 'PRESS ITEM B'
     returning id
  $$,
  $$select null::uuid where false$$,
  'unrelated artist cannot update another artist Press item'
);


-- Owner can delete.

reset role;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"95100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);


select results_eq(
  $$
    delete from public.profile_press_items
     where title = 'PRESS ITEM B'
     returning title
  $$,
  $$values ('PRESS ITEM B'::varchar)$$,
  'artist can delete a Press item'
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
    select title
      from public.profile_press_items
     where owner_profile_id =
       '95200000-0000-4000-8000-000000000001'
  $$,
  $$select null::varchar where false$$,
  'no visible Press remains after hide and delete'
);


select * from finish();

rollback;