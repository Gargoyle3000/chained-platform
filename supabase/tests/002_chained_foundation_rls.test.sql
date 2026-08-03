begin;

create extension if not exists pgtap with schema extensions;

select plan(59);

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
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'artist-a@test.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'artist-b@test.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'gallery-staff@test.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000104', 'authenticated', 'authenticated', 'private-member@test.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000105', 'authenticated', 'authenticated', 'claimant@test.invalid', now(), now());

insert into public.accounts (id, status, display_name)
values
  ('00000000-0000-0000-0000-000000000101', 'active', 'ARTIST A'),
  ('00000000-0000-0000-0000-000000000102', 'active', 'ARTIST B'),
  ('00000000-0000-0000-0000-000000000103', 'active', 'GALLERY STAFF'),
  ('00000000-0000-0000-0000-000000000104', 'active', 'PRIVATE MEMBER'),
  ('00000000-0000-0000-0000-000000000105', 'active', 'CLAIMANT');

insert into public.account_roles (account_id, role)
values
  ('00000000-0000-0000-0000-000000000101', 'private_member'),
  ('00000000-0000-0000-0000-000000000101', 'artist'),
  ('00000000-0000-0000-0000-000000000102', 'private_member'),
  ('00000000-0000-0000-0000-000000000102', 'artist'),
  ('00000000-0000-0000-0000-000000000103', 'private_member'),
  ('00000000-0000-0000-0000-000000000103', 'institution'),
  ('00000000-0000-0000-0000-000000000104', 'private_member'),
  ('00000000-0000-0000-0000-000000000105', 'private_member');

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
    '00000000-0000-0000-0000-000000000201',
    'artist',
    'artist-a',
    'ARTIST A',
    'published',
    now(),
    'claimed',
    '00000000-0000-0000-0000-000000000101',
    now(),
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    'artist',
    'artist-b',
    'ARTIST B',
    'published',
    now(),
    'claimed',
    '00000000-0000-0000-0000-000000000102',
    now(),
    '00000000-0000-0000-0000-000000000102'
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    'artist',
    'unclaimed-artist',
    'UNCLAIMED ARTIST',
    'draft',
    null,
    'unclaimed_gallery_managed',
    null,
    null,
    '00000000-0000-0000-0000-000000000103'
  ),
  (
    '00000000-0000-0000-0000-000000000301',
    'institution',
    'gallery-one',
    'GALLERY ONE',
    'published',
    now(),
    'claimed',
    null,
    null,
    '00000000-0000-0000-0000-000000000103'
  ),
  (
    '00000000-0000-0000-0000-000000000302',
    'institution',
    'gallery-two',
    'GALLERY TWO',
    'published',
    now(),
    'claimed',
    null,
    null,
    '00000000-0000-0000-0000-000000000103'
  );

insert into public.profile_members (
  profile_id,
  account_id,
  membership_level,
  status
)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000103', 'manager', 'active');

insert into public.profile_relationships (
  id,
  from_profile_id,
  to_profile_id,
  relationship_type,
  status,
  created_by_account_id
)
values
  (
    '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201',
    'represents',
    'active',
    '00000000-0000-0000-0000-000000000103'
  ),
  (
    '00000000-0000-0000-0000-000000000702',
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000202',
    'represents',
    'active',
    '00000000-0000-0000-0000-000000000103'
  );

insert into public.profile_access_grants (
  id,
  grantor_profile_id,
  grantee_profile_id,
  scope,
  status,
  granted_by_account_id
)
values
  (
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000301',
    'works_editor',
    'active',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000302',
    'works_editor',
    'active',
    '00000000-0000-0000-0000-000000000102'
  );

insert into public.profile_claims (
  id,
  target_profile_id,
  claimant_account_id,
  status,
  evidence_note
)
values (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000105',
  'pending',
  'LOCAL TEST EVIDENCE ONLY'
);

insert into public.audit_events (
  id,
  actor_account_id,
  action,
  target_type,
  target_id,
  metadata
)
values (
  '00000000-0000-0000-0000-000000000951',
  '00000000-0000-0000-0000-000000000101',
  'work.fixture_created',
  'work',
  '00000000-0000-0000-0000-000000000501',
  '{"fixture": true}'::jsonb
);

insert into public.works (
  id,
  owner_profile_id,
  created_by_account_id,
  updated_by_account_id,
  deleted_by_account_id,
  title,
  year_sort,
  year_label,
  work_type,
  visibility,
  published_at,
  deleted_at,
  purge_after
)
values
  (
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    null,
    'PUBLISHED WORK A',
    2026,
    '2026',
    'single-work',
    'published',
    now(),
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    null,
    'DRAFT WORK A',
    null,
    'ONGOING',
    'single-work',
    'draft',
    null,
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000503',
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000102',
    null,
    'DRAFT WORK B',
    2024,
    '2024–2026',
    'series',
    'draft',
    null,
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    null,
    'DELETE TARGET',
    2020,
    '2020',
    'single-work',
    'draft',
    null,
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000505',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    'DELETED PUBLISHED WORK',
    2019,
    '2019',
    'single-work',
    'published',
    now() - interval '10 days',
    timestamptz '2026-01-01 00:00:00+00',
    timestamptz '2026-01-31 00:00:00+00'
  );

insert into public.work_images (
  id,
  work_id,
  private_object_path,
  public_object_path,
  original_filename,
  mime_type,
  file_size,
  pixel_width,
  pixel_height,
  sort_order,
  is_cover,
  uploaded_by_account_id,
  updated_by_account_id
)
values
  (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000501',
    'profiles/00000000-0000-0000-0000-000000000201/works/00000000-0000-0000-0000-000000000501/images/00000000-0000-0000-0000-000000000601/source.jpg',
    'profiles/00000000-0000-0000-0000-000000000201/works/00000000-0000-0000-0000-000000000501/images/00000000-0000-0000-0000-000000000601/version-a.jpg',
    'published-a.jpg',
    'image/jpeg',
    1000,
    100,
    200,
    0,
    true,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000502',
    'profiles/00000000-0000-0000-0000-000000000201/works/00000000-0000-0000-0000-000000000502/images/00000000-0000-0000-0000-000000000602/source.png',
    null,
    'draft-a.png',
    'image/png',
    2000,
    200,
    100,
    0,
    true,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000503',
    'profiles/00000000-0000-0000-0000-000000000202/works/00000000-0000-0000-0000-000000000503/images/00000000-0000-0000-0000-000000000603/source.webp',
    null,
    'draft-b.webp',
    'image/webp',
    3000,
    300,
    300,
    0,
    true,
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000102'
  ),
  (
    '00000000-0000-0000-0000-000000000604',
    '00000000-0000-0000-0000-000000000504',
    'profiles/00000000-0000-0000-0000-000000000201/works/00000000-0000-0000-0000-000000000504/images/00000000-0000-0000-0000-000000000604/source.jpg',
    null,
    'delete-target.jpg',
    'image/jpeg',
    4000,
    400,
    400,
    0,
    true,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

set constraints all immediate;
set constraints all deferred;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select count(id) from public.public_profiles where id = '00000000-0000-0000-0000-000000000201'$$,
  array[1::bigint],
  'guest can read a published artist profile'
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000501'$$,
  array[1::bigint],
  'guest can read a published Work'
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000502'$$,
  array[0::bigint],
  'guest cannot read a draft Work'
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000505'$$,
  array[0::bigint],
  'guest cannot read a deleted Work'
);

select throws_ok(
  $$select count(*) from public.accounts$$,
  '42501',
  null,
  'guest cannot read accounts'
);

select throws_ok(
  $$select count(*) from public.profile_members$$,
  '42501',
  null,
  'guest cannot read profile memberships'
);

select throws_ok(
  $$select count(*) from public.account_roles$$,
  '42501',
  null,
  'guest cannot read account roles'
);

select throws_ok(
  $$select count(*) from public.profile_access_grants$$,
  '42501',
  null,
  'guest cannot read access grants'
);

select throws_ok(
  $$select count(*) from public.profile_claims$$,
  '42501',
  null,
  'guest cannot read profile claims'
);

select throws_ok(
  $$select count(*) from public.audit_events$$,
  '42501',
  null,
  'guest cannot read audit events'
);

select results_eq(
  $$select count(id) from public.work_images where id = '00000000-0000-0000-0000-000000000601'$$,
  array[1::bigint],
  'guest can read public image metadata for a published Work'
);

select results_eq(
  $$select count(id) from public.work_images where id = '00000000-0000-0000-0000-000000000602'$$,
  array[0::bigint],
  'guest cannot read draft image metadata'
);

select throws_ok(
  $$select private_object_path from public.work_images limit 1$$,
  '42501',
  null,
  'guest cannot read private image object paths'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(id) from public.accounts where id = '00000000-0000-0000-0000-000000000101'$$,
  array[1::bigint],
  'artist can read their own account row'
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000502'$$,
  array[1::bigint],
  'artist can read their own draft Work'
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000503'$$,
  array[0::bigint],
  'artist cannot read another artist draft'
);

select results_eq(
  $$update public.works set title = 'ARTIST UPDATED A' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000502'::uuid)$$,
  'artist can update their authorized Work'
);

select lives_ok(
  $$
    insert into public.works (
      owner_profile_id,
      title,
      year_sort,
      year_label,
      work_type
    ) values (
      '00000000-0000-0000-0000-000000000201',
      'ARTIST CREATED WORK',
      2026,
      '2026',
      'single-work'
    )
  $$,
  'artist can create a draft for an artist profile they manage'
);

reset role;

select is(
  (
    select created_by_account_id
      from public.works
     where title = 'ARTIST CREATED WORK'
  ),
  '00000000-0000-0000-0000-000000000101'::uuid,
  'created_by_account_id is derived from the authenticated actor'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.works (
      owner_profile_id,
      title,
      year_label,
      work_type
    ) values (
      '00000000-0000-0000-0000-000000000301',
      'INVALID INSTITUTION WORK',
      '2026',
      'single-work'
    )
  $$,
  '23514',
  null,
  'artist cannot create a Work owned by an institution profile'
);

select throws_ok(
  $$update public.works set owner_profile_id = '00000000-0000-0000-0000-000000000202' where id = '00000000-0000-0000-0000-000000000502'$$,
  '42501',
  null,
  'ordinary updates cannot change owner_profile_id'
);

select throws_ok(
  $$insert into public.account_roles (account_id, role) values ('00000000-0000-0000-0000-000000000101', 'admin')$$,
  '42501',
  null,
  'artist cannot self-assign an application role'
);

select throws_ok(
  $$update public.profile_members set membership_level = 'owner' where profile_id = '00000000-0000-0000-0000-000000000202'$$,
  '42501',
  null,
  'artist cannot promote themselves on an unrelated profile'
);

select results_eq(
  $$update public.works set title = 'UNAUTHORIZED' where id = '00000000-0000-0000-0000-000000000503' returning id$$,
  $$select null::uuid where false$$,
  'artist cannot update another artist draft'
);

select throws_ok(
  $$delete from public.works where id = '00000000-0000-0000-0000-000000000502'$$,
  '42501',
  null,
  'ordinary authenticated users cannot permanently delete Works'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'GALLERY UPDATED A' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000502'::uuid)$$,
  'active gallery staff plus works_editor grant can manage artist A Work'
);

select results_eq(
  $$update public.works set title = 'RELATIONSHIP IS NOT AUTHORITY' where id = '00000000-0000-0000-0000-000000000503' returning id$$,
  $$select null::uuid where false$$,
  'representation relationship without a matching access grant cannot manage a Work'
);

select results_eq(
  $$update public.works set title = 'GRANT WITHOUT MEMBERSHIP' where id = '00000000-0000-0000-0000-000000000503' returning id$$,
  $$select null::uuid where false$$,
  'access grant without membership in its grantee profile cannot manage a Work'
);

reset role;
select throws_ok(
  $$
    insert into public.profile_access_grants (
      id,
      grantor_profile_id,
      grantee_profile_id,
      scope,
      status,
      granted_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000000809',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000301',
      'works_editor',
      'active',
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  '23505',
  null,
  'an effective equivalent access grant blocks a duplicate'
);

update public.profile_members
   set status = 'revoked',
       revoked_at = now(),
       revoked_by_account_id = '00000000-0000-0000-0000-000000000101'
 where profile_id = '00000000-0000-0000-0000-000000000301'
   and account_id = '00000000-0000-0000-0000-000000000103';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'REVOKED STAFF' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$select null::uuid where false$$,
  'revoked gallery membership immediately blocks delegated access'
);

reset role;
update public.profile_members
   set status = 'active',
       revoked_at = null,
       revoked_by_account_id = null
 where profile_id = '00000000-0000-0000-0000-000000000301'
   and account_id = '00000000-0000-0000-0000-000000000103';

update public.profile_access_grants
   set status = 'revoked',
       revoked_at = now(),
       revoked_by_account_id = '00000000-0000-0000-0000-000000000101'
 where id = '00000000-0000-0000-0000-000000000801';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'REVOKED GRANT' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$select null::uuid where false$$,
  'revoked access grant immediately blocks delegated access'
);

reset role;
select lives_ok(
  $$
    insert into public.profile_access_grants (
      id,
      grantor_profile_id,
      grantee_profile_id,
      scope,
      status,
      granted_at,
      granted_by_account_id,
      expires_at
    ) values (
      '00000000-0000-0000-0000-000000000803',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000301',
      'works_editor',
      'active',
      now() - interval '2 hours',
      '00000000-0000-0000-0000-000000000101',
      now() + interval '1 hour'
    )
  $$,
  'a revoked historical grant does not block an effective replacement'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'REVOKED REPLACEMENT ACTIVE' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000502'::uuid)$$,
  'replacement after revocation authorizes the exact Work scope'
);

reset role;
select results_eq(
  $$
    select count(*)
      from public.profile_access_grants
     where grantor_profile_id = '00000000-0000-0000-0000-000000000201'
       and grantee_profile_id = '00000000-0000-0000-0000-000000000301'
       and scope = 'works_editor'
       and status = 'revoked'
  $$,
  array[1::bigint],
  'revoked grant history is preserved after replacement'
);

update public.profile_access_grants
   set expires_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-000000000803';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'EXPIRED GRANT' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$select null::uuid where false$$,
  'a time-expired grant never authorizes Work management before a lifecycle sweep'
);

reset role;
select lives_ok(
  $$
    insert into public.profile_access_grants (
      id,
      grantor_profile_id,
      grantee_profile_id,
      scope,
      status,
      granted_by_account_id
    ) values (
      '00000000-0000-0000-0000-000000000804',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000301',
      'works_editor',
      'active',
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  'a time-expired historical grant is normalized and does not block replacement'
);

select results_eq(
  $$
    select count(*)
      from public.profile_access_grants
     where id = '00000000-0000-0000-0000-000000000803'
       and status = 'expired'
       and expired_at is not null
       and revoked_at is null
  $$,
  array[1::bigint],
  'replacement preserves the prior grant as explicit expired history'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'EXPIRED REPLACEMENT ACTIVE' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000502'::uuid)$$,
  'replacement after expiration authorizes the exact Work scope'
);

select throws_ok(
  $$update public.profile_access_grants set status = 'active' where id = '00000000-0000-0000-0000-000000000803'$$,
  '42501',
  null,
  'ordinary gallery staff cannot reactivate an expired grant'
);

select throws_ok(
  $$update public.profile_access_grants set status = 'expired' where id = '00000000-0000-0000-0000-000000000804'$$,
  '42501',
  null,
  'ordinary gallery staff cannot mark an effective grant expired'
);

select throws_ok(
  $$update public.profile_access_grants set status = 'revoked' where id = '00000000-0000-0000-0000-000000000804'$$,
  '42501',
  null,
  'ordinary gallery staff cannot revoke an effective grant'
);

reset role;
update public.profile_access_grants
   set status = 'revoked',
       revoked_at = now(),
       revoked_by_account_id = '00000000-0000-0000-0000-000000000101'
 where id = '00000000-0000-0000-0000-000000000804';

insert into public.profile_access_grants (
  id,
  grantor_profile_id,
  grantee_profile_id,
  scope,
  status,
  granted_by_account_id
)
values (
  '00000000-0000-0000-0000-000000000805',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000301',
  'presentations_editor',
  'active',
  '00000000-0000-0000-0000-000000000101'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'WRONG SCOPE' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$select null::uuid where false$$,
  'wrong delegated scope cannot manage Works'
);

reset role;
update public.profile_access_grants
   set status = 'revoked',
       revoked_at = now(),
       revoked_by_account_id = '00000000-0000-0000-0000-000000000101'
 where id = '00000000-0000-0000-0000-000000000805';

insert into public.profile_access_grants (
  id,
  grantor_profile_id,
  grantee_profile_id,
  scope,
  status,
  granted_by_account_id
)
values (
  '00000000-0000-0000-0000-000000000806',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000301',
  'works_editor',
  'active',
  '00000000-0000-0000-0000-000000000101'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.works set title = 'DELEGATION RESTORED' where id = '00000000-0000-0000-0000-000000000502' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000502'::uuid)$$,
  'a new exact active grant restores delegated access without rewriting history'
);

select results_eq(
  $$update public.works set title = 'ARTIST B IS SEPARATE' where id = '00000000-0000-0000-0000-000000000503' returning id$$,
  $$select null::uuid where false$$,
  'grant for artist A does not grant access to artist B'
);

select throws_ok(
  $$update public.works set owner_profile_id = '00000000-0000-0000-0000-000000000202' where id = '00000000-0000-0000-0000-000000000502'$$,
  '42501',
  null,
  'delegated gallery staff cannot change Work ownership'
);

select throws_ok(
  $$update public.public_profiles set claim_state = 'claimed' where id = '00000000-0000-0000-0000-000000000203'$$,
  '42501',
  null,
  'delegated gallery staff cannot change artist claim state'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.work_images set original_filename = 'artist-renamed.png' where id = '00000000-0000-0000-0000-000000000602' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000602'::uuid)$$,
  'artist owner can manage image metadata for their Work'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.work_images set original_filename = 'unauthorized.png' where id = '00000000-0000-0000-0000-000000000602' returning id$$,
  $$select null::uuid where false$$,
  'unrelated artist cannot manage another artist image row'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);

select results_eq(
  $$update public.work_images set original_filename = 'gallery-renamed.png' where id = '00000000-0000-0000-0000-000000000602' returning id$$,
  $$values ('00000000-0000-0000-0000-000000000602'::uuid)$$,
  'valid delegate can manage image metadata for the authorized Work'
);

select throws_ok(
  $$
    insert into public.work_images (
      id,
      work_id,
      private_object_path,
      original_filename,
      mime_type,
      file_size,
      sort_order,
      is_cover
    ) values (
      '00000000-0000-0000-0000-000000000606',
      '00000000-0000-0000-0000-000000000502',
      'profiles/00000000-0000-0000-0000-000000000201/works/00000000-0000-0000-0000-000000000502/images/00000000-0000-0000-0000-000000000606/source.jpg',
      'second-cover.jpg',
      'image/jpeg',
      6000,
      1,
      true
    )
  $$,
  '23505',
  null,
  'partial unique index prevents a second active cover image'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select lives_ok(
  $$select private.begin_work_soft_deletion('00000000-0000-0000-0000-000000000504')$$,
  'artist can begin the approved Work soft-deletion flow'
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000504'$$,
  array[0::bigint],
  'soft-deleted Work disappears from normal owner selection'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000504'$$,
  array[0::bigint],
  'soft-deleted Work is absent from public selection'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select throws_ok(
  $$delete from public.works where id = '00000000-0000-0000-0000-000000000504'$$,
  '42501',
  null,
  'ordinary authenticated access has no purge operation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000105","role":"authenticated"}',
  true
);

select throws_ok(
  $$update public.profile_claims set status = 'approved' where id = '00000000-0000-0000-0000-000000000901'$$,
  '42501',
  null,
  'ordinary claimant cannot approve their own claim'
);

select throws_ok(
  $$update public.audit_events set result = 'altered' where id = '00000000-0000-0000-0000-000000000951'$$,
  '42501',
  null,
  'ordinary users cannot update audit events'
);

select throws_ok(
  $$delete from public.audit_events where id = '00000000-0000-0000-0000-000000000951'$$,
  '42501',
  null,
  'ordinary users cannot delete audit events'
);

reset role;
update public.accounts
   set status = 'suspended'
 where id = '00000000-0000-0000-0000-000000000101';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(id) from public.works where id = '00000000-0000-0000-0000-000000000502'$$,
  array[0::bigint],
  'suspended account immediately loses managed draft access'
);

reset role;

select is(
  (
    select count(*)
      from (
        select wi.work_id
          from public.work_images as wi
         where wi.deleted_at is null
         group by wi.work_id
        having count(*) filter (where wi.is_cover) <> 1
      ) as invalid_cover_sets
  ),
  0::bigint,
  'every Work with active image fixtures has exactly one active cover'
);

select * from finish();

rollback;
