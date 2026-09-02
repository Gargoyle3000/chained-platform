begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

insert into auth.users(instance_id,id,aud,role,email,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','b1000000-0000-4000-8000-000000000001','authenticated','authenticated','backfill@example.test',now(),now());
insert into public.accounts(id,status,display_name) values ('b1000000-0000-4000-8000-000000000001','active','BACKFILL');
insert into public.public_profiles(id,profile_type,slug,display_name,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values ('b2000000-0000-4000-8000-000000000001','artist','backfill','BACKFILL','claimed','b1000000-0000-4000-8000-000000000001',now(),'b1000000-0000-4000-8000-000000000001');
insert into public.profile_members(profile_id,account_id,membership_level,status) values ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','owner','active');
insert into public.works(id,owner_profile_id,created_by_account_id,updated_by_account_id,title,year_label,work_type,visibility,published_at,publication_revision) values
('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','DRAFT LEGACY','2025','single-work','draft',null,null),
('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','PUBLISHED LEGACY','2025','single-work','published',now(),'b9000000-0000-4000-8000-000000000001'),
('b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','OTHER LEGACY','2025','single-work','draft',null,null);
insert into public.work_images(id,work_id,private_object_path,preview_object_path,preview_file_size,preview_verified_at,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,upload_status,original_verified_at,uploaded_by_account_id,updated_by_account_id,deleted_at) values
('b4000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000001/original.jpg','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000001/preview.webp',12,now(),'draft.jpg','image/jpeg',100,null,null,0,true,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000002/b4000000-0000-4000-8000-000000000002/original.jpg','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000002/b4000000-0000-4000-8000-000000000002/preview.webp',12,now(),'published.jpg','image/jpeg',100,1,1,0,true,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000003/original.jpg',null,null,null,'pending.jpg','image/jpeg',100,10,10,1,false,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000004/original.jpg',null,null,null,'processing.jpg','image/jpeg',100,10,10,2,false,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000005','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000005/original.jpg',null,null,null,'ready.jpg','image/jpeg',100,10,10,3,false,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000006','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000006/original.jpg',null,null,null,'failed.jpg','image/jpeg',100,10,10,4,false,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000007','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000007/original.jpg',null,null,null,'unverified.jpg','image/jpeg',100,10,10,5,false,'ready',null,'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000008','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000008/original.jpg',null,null,null,'inactive.jpg','image/jpeg',100,10,10,6,false,'reserved',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000009','b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000009/original.jpg',null,null,null,'stale.jpg','image/jpeg',100,10,10,7,false,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null),
('b4000000-0000-4000-8000-000000000010','b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000003/b4000000-0000-4000-8000-000000000010/original.jpg',null,null,null,'other.jpg','image/jpeg',100,77,88,0,true,'ready',now(),'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',null);
insert into public.work_publication_operations(id,work_id,operation_kind,status,publication_revision,actor_account_id,started_at,finished_at) values ('b5000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002','publish','succeeded','b9000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',now(),now());
insert into public.work_publication_operation_images(operation_id,work_image_id,private_object_path,public_object_path,mime_type,file_size) values ('b5000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000002/b4000000-0000-4000-8000-000000000002/original.jpg','legacy/published.jpg','image/jpeg',100);
insert into private.work_image_derivative_jobs(id,work_image_id,source_private_object_path,requested_by_account_id,state,attempt_count,available_at,lease_token,lease_expires_at,claimed_at,completed_at) values
('b6000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000003/original.jpg','b1000000-0000-4000-8000-000000000001','pending',0,now(),null,null,null,null),
('b6000000-0000-4000-8000-000000000004','b4000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000004/original.jpg','b1000000-0000-4000-8000-000000000001','processing',1,now(),'b7000000-0000-4000-8000-000000000004',now()+interval '5 min',now(),null),
('b6000000-0000-4000-8000-000000000006','b4000000-0000-4000-8000-000000000006','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000006/original.jpg','b1000000-0000-4000-8000-000000000001','failed',1,now(),null,null,now(),now());
insert into private.work_image_derivatives(work_image_id,source_private_object_path,rendition_key,state,staging_object_path,mime_type,file_size,pixel_width,pixel_height,checksum_sha256,pipeline_version,icc_profile_version,verified_at,completed_at) values
('b4000000-0000-4000-8000-000000000005','b2000000-0000-4000-8000-000000000001/b3000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000005/original.jpg','small','ready','x/small.webp','image/webp',10,10,10,repeat('a',64),'p','s',now(),now()),
('b4000000-0000-4000-8000-000000000009','old/source.jpg','small','pending','x/stale.webp',null,null,null,null,null,null,null,null,null);

set local role service_role;
select set_config('test.draft',public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000001',719,960)::text,true);
reset role;
select is(current_setting('test.draft')::jsonb->>'status','pending','draft legacy backfill succeeds');
select is((select visibility::text from public.works where id='b3000000-0000-4000-8000-000000000001'),'draft','draft work remains draft');
select is((select state::text from private.work_image_derivative_jobs where work_image_id='b4000000-0000-4000-8000-000000000001'),'pending','normal pending job created');
select results_eq($$select rendition_key::text||':'||state::text from private.work_image_derivatives where work_image_id='b4000000-0000-4000-8000-000000000001' order by rendition_key$$,$$values ('small:pending'::text),('large:pending'::text)$$,'SMALL and LARGE start pending');
select ok((select bool_and(source_private_object_path=private_object_path) from private.work_image_derivatives d join public.work_images wi on wi.id=d.work_image_id where wi.id='b4000000-0000-4000-8000-000000000001'),'current source binding is retained');
select results_eq($$select pixel_width,pixel_height from public.work_images where id='b4000000-0000-4000-8000-000000000001'$$,$$values (719::integer,960::integer)$$,'authoritative dimensions replace stale dimensions');
select ok((select preview_verified_at is not null and preview_file_size=12 and original_verified_at is not null and mime_type='image/jpeg' and file_size=100 from public.work_images where id='b4000000-0000-4000-8000-000000000001'),'original and preview metadata remain intact');
select is((select count(*) from public.work_publication_operations where work_id='b3000000-0000-4000-8000-000000000001'),0::bigint,'draft backfill creates no publication operation');
select ok((select public_object_path is null from public.work_images where id='b4000000-0000-4000-8000-000000000001'),'draft backfill creates no public media state');
select is((select count(*) from private.work_image_derivatives where work_image_id='b4000000-0000-4000-8000-000000000001' and (state='ready' or mime_type is not null or checksum_sha256 is not null)),0::bigint,'backfill fabricates no ready result metadata');

set local role service_role;
select set_config('test.published',public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000002',1349,1800)::text,true);
reset role;
select is(current_setting('test.published')::jsonb->>'status','pending','published legacy backfill succeeds');
select is((select state::text from private.work_image_derivative_jobs where work_image_id='b4000000-0000-4000-8000-000000000002'),'pending','published image receives pending job');
select is((select count(*) from private.work_image_derivatives where work_image_id='b4000000-0000-4000-8000-000000000002' and state='pending'),2::bigint,'published image receives both pending renditions');
select is((select visibility::text from public.works where id='b3000000-0000-4000-8000-000000000002'),'published','published work remains published');
select is((select publication_revision::text from public.works where id='b3000000-0000-4000-8000-000000000002'),'b9000000-0000-4000-8000-000000000001','publication revision is unchanged');
select is((select count(*) from public.work_publication_operation_images where operation_id='b5000000-0000-4000-8000-000000000001'),1::bigint,'existing publication rows are unchanged');
select is((select public_object_path from public.work_publication_operation_images where operation_id='b5000000-0000-4000-8000-000000000001'),'legacy/published.jpg','existing public media reference is unchanged');
select is((select count(*) from public.work_publication_operations where work_id='b3000000-0000-4000-8000-000000000002'),1::bigint,'no new publication operation is created');

select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000003',1,1)$$,'55000','A derivative lifecycle already exists.','existing pending lifecycle rejects');
select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000004',1,1)$$,'55000','A derivative lifecycle already exists.','existing processing lifecycle rejects');
select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000005',1,1)$$,'55000','A derivative lifecycle already exists.','existing ready lifecycle rejects');
select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000006',1,1)$$,'55000','A derivative lifecycle already exists.','failed current lifecycle rejects');
select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000007',1,1)$$,'42501','The verified image is unavailable.','unverified original rejects');
select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000008',1,1)$$,'42501','The verified image is unavailable.','inactive image rejects');
select throws_ok($$set local role service_role; select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000009',1,1)$$,'55000','A derivative lifecycle already exists.','stale source lifecycle rejects');
select is((select count(*) from private.work_image_derivative_jobs where work_image_id in ('b4000000-0000-4000-8000-000000000007','b4000000-0000-4000-8000-000000000008')),0::bigint,'invalid-image rejections create no jobs');

set local role service_role;
select throws_ok($$select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000001',719,960)$$,'55000','A derivative lifecycle already exists.','second backfill safely rejects');
reset role;
select is((select count(*) from private.work_image_derivative_jobs where work_image_id='b4000000-0000-4000-8000-000000000001'),1::bigint,'idempotency retains one job');
select is((select count(*) from private.work_image_derivatives where work_image_id='b4000000-0000-4000-8000-000000000001'),2::bigint,'idempotency retains one derivative pair');
select results_eq($$select pixel_width,pixel_height from public.work_images where id='b4000000-0000-4000-8000-000000000003'$$,$$values (10::integer,10::integer)$$,'sibling image remains unchanged');
select results_eq($$select pixel_width,pixel_height from public.work_images where id='b4000000-0000-4000-8000-000000000010'$$,$$values (77::integer,88::integer)$$,'other Work remains unchanged');
select is((select count(*) from public.work_publication_operation_images where operation_id='b5000000-0000-4000-8000-000000000001'),1::bigint,'unrelated publication row remains unchanged');

set local role anon;
select throws_ok($$select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000010',1,1)$$,'42501',null,'anon cannot execute backfill');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.service_backfill_legacy_work_image_derivatives('b4000000-0000-4000-8000-000000000010',1,1)$$,'42501',null,'authenticated cannot execute backfill');
reset role;
select ok(not has_function_privilege('public','public.service_backfill_legacy_work_image_derivatives(uuid,integer,integer)','EXECUTE'),'PUBLIC has no execute access');
select ok(has_function_privilege('service_role','public.service_backfill_legacy_work_image_derivatives(uuid,integer,integer)','EXECUTE'),'service role has execute access');
select is((select count(*) from public.audit_events where action='work_image.derivative_legacy_backfilled' and target_id='b4000000-0000-4000-8000-000000000001'),1::bigint,'successful backfill records one audit event');
select is((select count(*) from private.work_image_derivatives where work_image_id='b4000000-0000-4000-8000-000000000001' and mime_type is not null),0::bigint,'pending rows have no output MIME');
select is((select state::text from private.work_image_derivative_jobs where id='b6000000-0000-4000-8000-000000000003'),'pending','rejected lifecycle retains its pending state');
select is((select public_object_path from public.work_publication_operation_images where operation_id='b5000000-0000-4000-8000-000000000001'),'legacy/published.jpg','later tests leave legacy publication reference untouched');
select is((select count(*) from public.work_publication_derivatives),0::bigint,'backfill creates no derivative publication rows');

select * from finish(); rollback;
