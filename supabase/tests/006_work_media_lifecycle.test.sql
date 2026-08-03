begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'media-artist-one@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'media-artist-two@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'media-gallery@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'media-suspended@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'media-relation-only@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'media-expired-delegate@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'media-revoked-delegate@example.test', now(), now());

insert into public.accounts (id, status, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'active', 'MEDIA ARTIST ONE'),
  ('10000000-0000-4000-8000-000000000002', 'active', 'MEDIA ARTIST TWO'),
  ('10000000-0000-4000-8000-000000000003', 'active', 'MEDIA GALLERY'),
  ('10000000-0000-4000-8000-000000000004', 'suspended', 'MEDIA SUSPENDED'),
  ('10000000-0000-4000-8000-000000000005', 'active', 'MEDIA RELATION ONLY'),
  ('10000000-0000-4000-8000-000000000006', 'active', 'MEDIA EXPIRED DELEGATE'),
  ('10000000-0000-4000-8000-000000000007', 'active', 'MEDIA REVOKED DELEGATE');

insert into public.public_profiles (
  id, profile_type, slug, display_name, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id
)
values
  ('20000000-0000-4000-8000-000000000001', 'artist', 'media-artist-one', 'MEDIA ARTIST ONE', 'published', now(), 'claimed', '10000000-0000-4000-8000-000000000001', now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'artist', 'media-artist-two', 'MEDIA ARTIST TWO', 'published', now(), 'claimed', '10000000-0000-4000-8000-000000000002', now(), '10000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000001', 'institution', 'media-gallery', 'MEDIA GALLERY', 'published', now(), 'claimed', null, null, '10000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000002', 'institution', 'media-relation-only', 'MEDIA RELATION ONLY', 'published', now(), 'claimed', null, null, '10000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000003', 'institution', 'media-expired-gallery', 'MEDIA EXPIRED GALLERY', 'published', now(), 'claimed', null, null, '10000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000004', 'institution', 'media-revoked-gallery', 'MEDIA REVOKED GALLERY', 'published', now(), 'claimed', null, null, '10000000-0000-4000-8000-000000000007');

insert into public.profile_members (profile_id, account_id, membership_level, status, revoked_at)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', null),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'owner', 'active', null),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'editor', 'active', null),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'manager', 'active', null),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'manager', 'active', null),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'manager', 'active', null),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000007', 'manager', 'active', null);

insert into public.profile_relationships (from_profile_id, to_profile_id, relationship_type, status, created_by_account_id)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'represents', 'active', '10000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'represents', 'active', '10000000-0000-4000-8000-000000000005');

insert into public.profile_access_grants (
  grantor_profile_id, grantee_profile_id, scope, status, granted_by_account_id,
  granted_at, expires_at, expired_at, revoked_at, revoked_by_account_id
)
values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'works_editor', 'active', '10000000-0000-4000-8000-000000000001', now(), null, null, null, null),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'works_editor', 'active', '10000000-0000-4000-8000-000000000002', now() - interval '2 hours', now() - interval '1 hour', null, null, null),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'works_editor', 'revoked', '10000000-0000-4000-8000-000000000002', now(), null, null, now(), '10000000-0000-4000-8000-000000000002');

insert into public.works (
  id, owner_profile_id, created_by_account_id, updated_by_account_id,
  deleted_by_account_id, title, year_label, work_type, visibility,
  published_at, deleted_at, purge_after
)
values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, 'MEDIA DRAFT ONE', '2026', 'single-work', 'draft', null, null, null),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', null, 'MEDIA DRAFT TWO', '2026', 'single-work', 'draft', null, null, null),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, 'MEDIA PUBLISHED', '2026', 'single-work', 'published', now(), null, null),
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'MEDIA DELETED', '2026', 'single-work', 'draft', null, now(), now() + interval '30 days'),
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, 'MEDIA FAILURE', '2026', 'single-work', 'draft', null, null, null),
  ('50000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, 'MEDIA PARTIAL', '2026', 'single-work', 'draft', null, null, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000001', '../CLIENT NAME.JPG', 'image/jpeg', 4, true)$$,
  'authorised direct artist can reserve an exact upload'
);
reset role;
select ok(
  exists (
    select 1 from public.work_images
     where work_id = '50000000-0000-4000-8000-000000000001'
       and private_object_path ~ '^20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001/[0-9a-f-]{36}/original[.]jpg$'
       and private_object_path not like '%CLIENT%'
       and upload_status = 'reserved'
  ),
  'reservation path is server-generated and filename-independent'
);
select results_eq(
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and is_cover and deleted_at is null$$,
  $$values (1::bigint)$$,
  'the first reservation is the sole cover'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000001', 'second.avif', 'image/avif', 32, false)$$,
  'AVIF reservation derives its trusted extension'
);
reset role;
select ok(
  exists (select 1 from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and private_object_path like '%/original.avif'),
  'AVIF MIME maps to the AVIF extension'
);
select results_eq(
  $$select count(distinct sort_order)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and deleted_at is null$$,
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and deleted_at is null$$,
  'serialized reservations retain distinct sort order'
);
select results_eq(
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and is_cover and deleted_at is null$$,
  $$values (1::bigint)$$,
  'additional reservations preserve one-cover integrity'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000001', 'bad.gif', 'image/gif', 4, false)$$,
  '22023', null, 'unsupported MIME is rejected'
);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000001', 'large.jpg', 'image/jpeg', 52428801, false)$$,
  '22023', null, 'oversize image reservation is rejected'
);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000003', 'published.jpg', 'image/jpeg', 4, false)$$,
  '22023', null, 'published Work cannot reserve an upload'
);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000004', 'deleted.jpg', 'image/jpeg', 4, false)$$,
  '42501', null, 'deleted Work cannot reserve an upload'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000001', 'gallery.png', 'image/png', 8, false)$$,
  'valid delegated gallery can reserve an upload'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000002', 'relation.jpg', 'image/jpeg', 4, false)$$,
  '42501', null, 'representation without exact grant cannot reserve'
);

reset role;
insert into public.profile_access_grants (grantor_profile_id, grantee_profile_id, scope, status, granted_by_account_id)
values ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'presentations_editor', 'active', '10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000002', 'wrong-scope.jpg', 'image/jpeg', 4, false)$$,
  '42501', null, 'wrong-scope grant cannot reserve'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000002', 'expired.jpg', 'image/jpeg', 4, false)$$,
  '42501', null, 'expired grant cannot reserve'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000002', 'revoked.jpg', 'image/jpeg', 4, false)$$,
  '42501', null, 'revoked grant cannot reserve'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000001', 'suspended.jpg', 'image/jpeg', 4, false)$$,
  '42501', null, 'suspended account cannot reserve'
);

reset role;
select throws_ok(
  $$insert into public.works (owner_profile_id, title, year_label, work_type) values ('30000000-0000-4000-8000-000000000001', 'INVALID OWNER', '2026', 'single-work')$$,
  '23514', null, 'institution-owned Work cannot be created for image reservation'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('storage.operation', 'storage.object.upload', true);
select ok(
  private.can_insert_reserved_work_original(
    (select private_object_path from public.work_images where original_filename = '../CLIENT NAME.JPG'),
    jsonb_build_object('mimetype', 'image/jpeg', 'contentLength', '4')
  ),
  'exact reserved original path passes upload policy logic'
);
select ok(
  not private.can_insert_reserved_work_original('arbitrary/original.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'contentLength', '4')),
  'arbitrary private path fails upload policy logic'
);
select ok(
  not private.can_insert_reserved_work_original(
    replace((select private_object_path from public.work_images where original_filename = '../CLIENT NAME.JPG'), '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002'),
    jsonb_build_object('mimetype', 'image/jpeg', 'contentLength', '4')
  ),
  'another Work path fails upload policy logic'
);
select set_config('storage.operation', 'storage.object.get_authenticated', true);
select ok(
  storage.allow_only_operation('object.get_authenticated')
  and private.can_read_exact_work_original((select private_object_path from public.work_images where original_filename = '../CLIENT NAME.JPG')),
  'authorised manager may retrieve the exact original'
);
select set_config('storage.operation', 'storage.object.list', true);
select ok(
  not storage.allow_only_operation('object.get_authenticated'),
  'broad original-bucket listing is not authorised'
);

update public.profile_members
   set status = 'revoked', revoked_at = now(), revoked_by_account_id = '10000000-0000-4000-8000-000000000001'
 where profile_id = '30000000-0000-4000-8000-000000000001'
   and account_id = '10000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select ok(
  not private.can_read_exact_work_original((select private_object_path from public.work_images where original_filename = 'gallery.png')),
  'delegated private access disappears immediately after membership revocation'
);

-- Reserve images for database publication failure and partial-copy cases.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000005', 'failure.jpg', 'image/jpeg', 4, true);
select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000006', 'partial-one.jpg', 'image/jpeg', 4, true);
select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000006', 'partial-two.jpg', 'image/jpeg', 4, false);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$select public.service_mark_work_image_upload(id, '10000000-0000-4000-8000-000000000001', true, null)
      from public.work_images where work_id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000006')$$,
  'trusted verifier can mark reserved images ready'
);
select results_eq(
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and upload_status = 'ready' and original_verified_at is not null$$,
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and deleted_at is null$$,
  'all images are verified before publication'
);

select lives_ok(
  $$select public.service_claim_work_publication('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')$$,
  'trusted workflow atomically claims publication'
);
select throws_ok(
  $$insert into public.work_publication_operations (work_id, operation_kind, status, publication_revision, actor_account_id, started_at)
    values ('50000000-0000-4000-8000-000000000001', 'publish', 'running', gen_random_uuid(), '10000000-0000-4000-8000-000000000001', now())$$,
  '23505', null, 'only one active publication operation may exist per Work'
);
select lives_ok(
  $$select public.service_record_publication_copy(oi.operation_id, oi.work_image_id, '10000000-0000-4000-8000-000000000001')
      from public.work_publication_operation_images oi
      join public.work_publication_operations op on op.id = oi.operation_id
     where op.work_id = '50000000-0000-4000-8000-000000000001' and op.operation_kind = 'publish'$$,
  'trusted workflow records every created public copy'
);
select lives_ok(
  $$select public.service_finalize_work_publication(id, '10000000-0000-4000-8000-000000000001')
      from public.work_publication_operations
     where work_id = '50000000-0000-4000-8000-000000000001' and operation_kind = 'publish'$$,
  'complete copy set finalizes publication atomically'
);
select results_eq(
  $$select visibility::text, published_at is not null, publication_revision is not null from public.works where id = '50000000-0000-4000-8000-000000000001'$$,
  $$values ('published'::text, true, true)$$,
  'successful finalization publishes the Work with a revision'
);
select ok(
  not exists (
    select 1 from public.work_images wi join public.works w on w.id = wi.work_id
     where wi.work_id = '50000000-0000-4000-8000-000000000001'
       and (wi.public_object_path is null or wi.public_object_path not like lower(w.owner_profile_id::text) || '/' || lower(w.id::text) || '/' || lower(w.publication_revision::text) || '/%')
  ),
  'successful publication assigns a complete revisioned public path set'
);
select results_eq(
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and is_cover and deleted_at is null$$,
  $$values (1::bigint)$$,
  'publication preserves exactly one cover'
);
select results_eq(
  $$select (public.service_claim_work_publication('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')->>'idempotent')::boolean$$,
  $$values (true)$$,
  'identical successful publication retry is deterministic'
);

select public.service_claim_work_publication('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000006');
select public.service_record_publication_copy(
  (select id from public.work_publication_operations where work_id = '50000000-0000-4000-8000-000000000006' and operation_kind = 'publish'),
  (select work_image_id from public.work_publication_operation_images where operation_id = (select id from public.work_publication_operations where work_id = '50000000-0000-4000-8000-000000000006' and operation_kind = 'publish') order by work_image_id limit 1),
  '10000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$select public.service_finalize_work_publication(id, '10000000-0000-4000-8000-000000000001')
      from public.work_publication_operations where work_id = '50000000-0000-4000-8000-000000000006'$$,
  '55000', null, 'partial public path set cannot be finalized'
);
select results_eq(
  $$select visibility::text from public.works where id = '50000000-0000-4000-8000-000000000006'$$,
  $$values ('draft'::text)$$,
  'partial copy never publishes the Work'
);
select public.service_fail_work_publication(
  (select id from public.work_publication_operations where work_id = '50000000-0000-4000-8000-000000000006'),
  '10000000-0000-4000-8000-000000000001', 'partial_copy', true
);

select public.service_claim_work_publication('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005');
select lives_ok(
  $$select public.service_fail_work_publication(id, '10000000-0000-4000-8000-000000000001', 'copy_failed', true)
      from public.work_publication_operations where work_id = '50000000-0000-4000-8000-000000000005'$$,
  'trusted workflow records a sanitized failed publication'
);
select results_eq(
  $$select visibility::text, published_at is null from public.works where id = '50000000-0000-4000-8000-000000000005'$$,
  $$values ('draft'::text, true)$$,
  'failed publication leaves the Work draft'
);

select lives_ok(
  $$select public.service_begin_work_unpublication('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001')$$,
  'unpublication atomically hides the Work before cleanup'
);
select results_eq(
  $$select visibility::text, published_at is null, publication_revision is null from public.works where id = '50000000-0000-4000-8000-000000000001'$$,
  $$values ('draft'::text, true, true)$$,
  'unpublication clears public Work state atomically'
);
select results_eq(
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000001' and public_object_path is not null$$,
  $$values (0::bigint)$$,
  'unpublication clears every active image public path'
);
select ok(
  exists (
    select 1 from public.work_publication_operation_images oi
    join public.work_publication_operations op on op.id = oi.operation_id
    where op.work_id = '50000000-0000-4000-8000-000000000001' and op.operation_kind = 'unpublish'
  ),
  'trusted cleanup snapshot preserves old public paths'
);
select lives_ok(
  $$select public.service_record_public_cleanup(id, '10000000-0000-4000-8000-000000000001', true, null)
      from public.work_publication_operations where work_id = '50000000-0000-4000-8000-000000000001' and operation_kind = 'unpublish'$$,
  'trusted cleanup can mark public recall complete'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.service_finalize_work_publication('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'ordinary clients cannot forge publication success'
);
select throws_ok(
  $$update public.work_images set public_object_path = 'forged/path.jpg' where work_id = '50000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'ordinary clients cannot write public paths'
);
select throws_ok(
  $$update public.works set visibility = 'published', published_at = now() where id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'ordinary clients cannot set visibility or published_at'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.reserve_work_image_upload('50000000-0000-4000-8000-000000000002', 'only.jpg', 'image/jpeg', 4, true)$$,
  'second artist reserves the only image for deletion behavior'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.service_mark_work_image_upload(
  (select id from public.work_images where work_id = '50000000-0000-4000-8000-000000000002'),
  '10000000-0000-4000-8000-000000000002', true, null
);
select lives_ok(
  $$select public.service_begin_work_image_deletion(id, '10000000-0000-4000-8000-000000000002')
      from public.work_images where work_id = '50000000-0000-4000-8000-000000000002'$$,
  'trusted deletion may hide the only image and leave a zero-image draft'
);
select results_eq(
  $$select count(*)::bigint from public.work_images where work_id = '50000000-0000-4000-8000-000000000002' and deleted_at is null$$,
  $$values (0::bigint)$$,
  'only-image deletion leaves no active image and no invalid cover state'
);
select lives_ok(
  $$select public.service_finish_work_image_deletion(id, '10000000-0000-4000-8000-000000000002', true, null)
      from public.work_images where work_id = '50000000-0000-4000-8000-000000000002'$$,
  'trusted deletion records successful object cleanup'
);
select results_eq(
  $$select upload_status::text, cleanup_required from public.work_images where work_id = '50000000-0000-4000-8000-000000000002'$$,
  $$values ('deleted'::text, false)$$,
  'completed deletion retains history in a closed deleted state'
);

select ok(
  (select count(*) >= 8 from public.audit_events where action in (
    'work_image.upload_reserved', 'work_image.upload_verified', 'work.publication_started',
    'work.published', 'work.publication_failed', 'work.unpublication_started',
    'work.unpublished', 'work.public_cleanup_completed', 'work_image.deletion_started', 'work_image.deleted'
  )),
  'media lifecycle writes the required append-only audit categories'
);

select * from finish();
rollback;
