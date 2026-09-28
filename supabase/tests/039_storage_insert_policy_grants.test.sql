begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(
  has_function_privilege('authenticated', 'private.can_insert_reserved_presentation_agenda_media(text,jsonb)', 'EXECUTE'),
  'authenticated can evaluate the Agenda INSERT predicate alongside other Storage policies'
);
select ok(
  not has_function_privilege('anon', 'private.can_insert_reserved_presentation_agenda_media(text,jsonb)', 'EXECUTE'),
  'anonymous callers cannot execute the Agenda INSERT predicate'
);
select ok(
  not exists (
    select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
    where p.oid = 'private.can_insert_reserved_presentation_agenda_media(text,jsonb)'::regprocedure
      and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no implicit execute grant on the Agenda INSERT predicate'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'presentation_agenda_media_insert_exact_reservation'
      and cmd = 'INSERT' and 'authenticated' = any(roles)
      and position('bucket_id = ''presentation-agenda-media''' in with_check) > 0
      and position('can_insert_reserved_presentation_agenda_media' in with_check) > 0
  ),
  'Agenda INSERT policy still requires its bucket and exact reservation predicate'
);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '99000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'storage-grant-owner@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'storage-grant-other@example.test', now(), now());
insert into public.accounts (id, status, display_name)
values
  ('99000000-0000-4000-8000-000000000001', 'active', 'STORAGE GRANT OWNER'),
  ('99000000-0000-4000-8000-000000000002', 'active', 'STORAGE GRANT OTHER');
insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id
) values (
  '99000000-0000-4000-8000-000000000003', 'artist', 'storage-grant-owner', 'STORAGE GRANT OWNER',
  'published', now(), 'claimed', '99000000-0000-4000-8000-000000000001', now(), '99000000-0000-4000-8000-000000000001'
);
insert into public.profile_members (profile_id, account_id, membership_level, status)
values ('99000000-0000-4000-8000-000000000003', '99000000-0000-4000-8000-000000000001', 'owner', 'active');
insert into public.works (id, owner_profile_id, created_by_account_id, updated_by_account_id, title, year_label, work_type)
values ('99000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'STORAGE GRANT WORK', '2026', 'single-work');
insert into public.profile_activities (id, owner_profile_id, created_by_account_id, updated_by_account_id, title, activity_type)
values ('99000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000003',
  '99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'STORAGE GRANT PRESENTATION', 'exhibition');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.reserve_work_image_upload('99000000-0000-4000-8000-000000000004', 'work.jpg', 'image/jpeg', 4, true)$$,
  'authorized Artist reserves an exact Work original'
);
select lives_ok(
  $$select public.reserve_presentation_agenda_image_upload('99000000-0000-4000-8000-000000000005', 'agenda.jpg', 'image/jpeg', 4, 12)$$,
  'authorized Presentation manager reserves an exact Agenda original and preview'
);
reset role;
select set_config('test.work_path', (select private_object_path from public.work_images where work_id = '99000000-0000-4000-8000-000000000004'), true);
select set_config('test.agenda_path', (select original_object_path from public.presentation_agenda_images where presentation_id = '99000000-0000-4000-8000-000000000005'), true);
select set_config('test.agenda_preview_path', (select preview_object_path from public.presentation_agenda_images where presentation_id = '99000000-0000-4000-8000-000000000005'), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('storage.operation', 'storage.object.upload', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('work-originals', current_setting('test.work_path'), '{"mimetype":"image/jpeg","contentLength":"4"}'::jsonb)$$,
  'Work original INSERT succeeds with the Agenda INSERT policy also installed'
);
select ok(
  not private.can_insert_reserved_presentation_agenda_media(current_setting('test.work_path'), '{"mimetype":"image/jpeg","contentLength":"4"}'::jsonb),
  'Agenda predicate does not authorize the Work path; the Work policy remains authoritative'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('presentation-agenda-media', current_setting('test.agenda_path') || '-wrong', '{"mimetype":"image/jpeg","contentLength":"4"}'::jsonb)$$,
  '42501', null, 'Agenda policy rejects a path without an exact reservation'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('presentation-agenda-media', current_setting('test.agenda_path'), '{"mimetype":"image/png","contentLength":"4"}'::jsonb)$$,
  '42501', null, 'Agenda policy rejects a MIME mismatch'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('presentation-agenda-media', current_setting('test.agenda_path'), '{"mimetype":"image/jpeg","contentLength":"5"}'::jsonb)$$,
  '42501', null, 'Agenda policy rejects a byte-size mismatch'
);

select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('presentation-agenda-media', current_setting('test.agenda_path'), '{"mimetype":"image/jpeg","contentLength":"4"}'::jsonb)$$,
  '42501', null, 'unrelated authenticated user cannot upload the exact reserved Agenda image'
);

select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('presentation-agenda-media', current_setting('test.agenda_path'), '{"mimetype":"image/jpeg","contentLength":"4"}'::jsonb)$$,
  'authorized manager uploads the exact reserved Agenda original'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('presentation-agenda-media', current_setting('test.agenda_preview_path'), '{"mimetype":"image/webp","contentLength":"12"}'::jsonb)$$,
  'authorized manager uploads the exact reserved Agenda WebP preview'
);

select * from finish();
rollback;
