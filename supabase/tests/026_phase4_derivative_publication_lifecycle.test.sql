begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users(instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001','authenticated','authenticated','phase4@example.test',now(),now());
insert into public.accounts(id,status,display_name) values ('a1000000-0000-4000-8000-000000000001','active','PHASE4');
insert into public.public_profiles(id,profile_type,slug,display_name,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values ('a2000000-0000-4000-8000-000000000001','artist','phase4','PHASE4','claimed','a1000000-0000-4000-8000-000000000001',now(),'a1000000-0000-4000-8000-000000000001');
insert into public.profile_members(profile_id,account_id,membership_level,status) values ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner','active');
insert into public.works(id,owner_profile_id,created_by_account_id,updated_by_account_id,title,year_label,work_type) values ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','PHASE4','2026','single-work');
insert into public.work_images(id,work_id,private_object_path,preview_object_path,preview_file_size,preview_verified_at,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,upload_status,original_verified_at,uploaded_by_account_id,updated_by_account_id) values
('a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001/a3000000-0000-4000-8000-000000000001/a4000000-0000-4000-8000-000000000001/original.jpg','a2000000-0000-4000-8000-000000000001/a3000000-0000-4000-8000-000000000001/a4000000-0000-4000-8000-000000000001/preview.webp',10,now(),'a.jpg','image/jpeg',100,96,64,0,true,'ready',now(),'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'),
('a4000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001/a3000000-0000-4000-8000-000000000001/a4000000-0000-4000-8000-000000000002/original.jpg','a2000000-0000-4000-8000-000000000001/a3000000-0000-4000-8000-000000000001/a4000000-0000-4000-8000-000000000002/preview.webp',10,now(),'b.jpg','image/jpeg',100,96,64,1,false,'ready',now(),'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
insert into private.work_image_derivatives(id,work_image_id,source_private_object_path,rendition_key,state,staging_object_path,mime_type,file_size,pixel_width,pixel_height,checksum_sha256,pipeline_version,icc_profile_version,verified_at,completed_at) select gen_random_uuid(),wi.id,wi.private_object_path,k::private.work_image_derivative_rendition_key,'ready',regexp_replace(wi.private_object_path,'/original[.][^/]+$','/public-derivatives/'||k||'.webp'),'image/webp',20,96,64,repeat('a',64),'p','s',now(),now() from public.work_images wi cross join unnest(array['small','large']) k where wi.work_id='a3000000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('test.claim',public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')::text,true);
reset role;
select is((current_setting('test.claim')::jsonb->>'status'),'running','two complete images claim a candidate');
select is(jsonb_array_length(current_setting('test.claim')::jsonb->'images'),4,'candidate has four exact renditions');
select is((select count(*) from public.work_publication_derivatives),4::bigint,'four publication derivative rows are recorded');
select is((select count(distinct publication_revision) from public.work_publication_derivatives),1::bigint,'all rows share a revision');
select is((select visibility::text from public.works where id='a3000000-0000-4000-8000-000000000001'),'draft','claim does not publish early');
set local role service_role;
select lives_ok($$select public.service_record_publication_derivative_copy((current_setting('test.claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000001','small','a1000000-0000-4000-8000-000000000001'); select public.service_record_publication_derivative_copy((current_setting('test.claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000001','large','a1000000-0000-4000-8000-000000000001'); select public.service_record_publication_derivative_copy((current_setting('test.claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000002','small','a1000000-0000-4000-8000-000000000001'); select public.service_record_publication_derivative_copy((current_setting('test.claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000002','large','a1000000-0000-4000-8000-000000000001')$$,'records every exact rendition');
select lives_ok($$select public.service_finalize_work_publication((current_setting('test.claim')::jsonb->>'operation_id')::uuid,'a1000000-0000-4000-8000-000000000001')$$,'complete candidate finalizes');
reset role;
select is((select visibility::text from public.works where id='a3000000-0000-4000-8000-000000000001'),'published','complete candidate publishes');
select ok((select count(*)=2 from public.work_images where work_id='a3000000-0000-4000-8000-000000000001' and public_object_path like '%/small.webp'),'each image exposes only SMALL compatibility path');

-- A fresh draft fixture is deliberately incomplete: no partial image set qualifies.
update public.works set visibility='draft',published_at=null,publication_revision=null where id='a3000000-0000-4000-8000-000000000001'; update public.work_images set public_object_path=null where work_id='a3000000-0000-4000-8000-000000000001'; delete from public.work_publication_derivatives; update private.work_image_derivatives set state='pending',mime_type=null,file_size=null,pixel_width=null,pixel_height=null,checksum_sha256=null,pipeline_version=null,icc_profile_version=null,verified_at=null,completed_at=null where work_image_id='a4000000-0000-4000-8000-000000000002' and rendition_key='large';
set local role service_role;
select throws_ok($$select public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')$$,'22023','Image processing is not complete yet.','pending LARGE rejects whole multi-image Work');
reset role;
select is((select visibility::text from public.works where id='a3000000-0000-4000-8000-000000000001'),'draft','rejected claim remains draft');
select is((select count(*) from public.work_publication_derivatives),0::bigint,'rejected claim leaves no candidate rows');
select is((select count(*) from public.work_images where work_id='a3000000-0000-4000-8000-000000000001' and public_object_path is not null),0::bigint,'rejected claim activates no public path');
select is((select count(*) from public.work_images where work_id='a3000000-0000-4000-8000-000000000001' and preview_object_path is not null),2::bigint,'private previews remain intact');
select is((select count(*) from public.work_images where work_id='a3000000-0000-4000-8000-000000000001' and private_object_path like '%/original.jpg'),2::bigint,'private originals remain intact');

-- Each required rendition must be present, READY, and tied to the current private source.
update private.work_image_derivatives set state='ready',mime_type='image/webp',file_size=20,pixel_width=96,pixel_height=64,checksum_sha256=repeat('a',64),pipeline_version='p',icc_profile_version='s',verified_at=now(),completed_at=now() where work_image_id='a4000000-0000-4000-8000-000000000002' and rendition_key='large';
delete from private.work_image_derivatives where work_image_id='a4000000-0000-4000-8000-000000000001' and rendition_key='small';
set local role service_role;
select throws_ok($$select public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')$$,'22023','Image processing is not complete yet.','missing SMALL rejects publication');
reset role;
insert into private.work_image_derivatives(id,work_image_id,source_private_object_path,rendition_key,state,staging_object_path,mime_type,file_size,pixel_width,pixel_height,checksum_sha256,pipeline_version,icc_profile_version,verified_at,completed_at) select gen_random_uuid(),id,private_object_path,'small', 'ready',regexp_replace(private_object_path,'/original[.][^/]+$','/public-derivatives/small.webp'),'image/webp',20,96,64,repeat('a',64),'p','s',now(),now() from public.work_images where id='a4000000-0000-4000-8000-000000000001';
update private.work_image_derivatives set state='failed' where work_image_id='a4000000-0000-4000-8000-000000000001' and rendition_key='large';
set local role service_role;
select throws_ok($$select public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')$$,'22023','Image processing is not complete yet.','failed LARGE rejects publication');
reset role;
update private.work_image_derivatives set state='ready' where work_image_id='a4000000-0000-4000-8000-000000000001' and rendition_key='large';
update private.work_image_derivatives set source_private_object_path='stale/source.jpg' where work_image_id='a4000000-0000-4000-8000-000000000002' and rendition_key='small';
set local role service_role;
select throws_ok($$select public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')$$,'22023','Image processing is not complete yet.','stale derivative source rejects publication');
reset role;
update private.work_image_derivatives d set source_private_object_path=wi.private_object_path from public.work_images wi where wi.id=d.work_image_id and d.work_image_id='a4000000-0000-4000-8000-000000000002' and d.rendition_key='small';

-- A failed candidate removes only its candidate records and allows a fresh retry.
set local role service_role;
select set_config('test.retry_claim',public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')::text,true);
select lives_ok($$select public.service_fail_work_derivative_publication((current_setting('test.retry_claim')::jsonb->>'operation_id')::uuid,'a1000000-0000-4000-8000-000000000001','copy_failed',true)$$,'failed candidate records cleanup');
reset role;
select is((select count(*) from public.work_publication_derivatives),0::bigint,'failed candidate removes exact derivative publication rows');
set local role service_role;
select set_config('test.republish_claim',public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')::text,true);
select ok((current_setting('test.republish_claim')::jsonb->>'operation_id')<>(current_setting('test.retry_claim')::jsonb->>'operation_id'),'retry claims a fresh candidate');
select lives_ok($$select public.service_record_publication_derivative_copy((current_setting('test.republish_claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000001','small','a1000000-0000-4000-8000-000000000001'); select public.service_record_publication_derivative_copy((current_setting('test.republish_claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000001','large','a1000000-0000-4000-8000-000000000001'); select public.service_record_publication_derivative_copy((current_setting('test.republish_claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000002','small','a1000000-0000-4000-8000-000000000001'); select public.service_record_publication_derivative_copy((current_setting('test.republish_claim')::jsonb->>'operation_id')::uuid,'a4000000-0000-4000-8000-000000000002','large','a1000000-0000-4000-8000-000000000001'); select public.service_finalize_work_publication((current_setting('test.republish_claim')::jsonb->>'operation_id')::uuid,'a1000000-0000-4000-8000-000000000001')$$,'fresh candidate can publish after retry');
select set_config('test.unpublish_op',public.service_begin_work_unpublication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')::text,true);
select is(jsonb_array_length(public.service_list_work_publication_cleanup_paths((current_setting('test.unpublish_op')::jsonb->>'operation_id')::uuid,'a1000000-0000-4000-8000-000000000001')),4,'unpublish snapshots exactly SMALL and LARGE derivative paths');
select lives_ok($$select public.service_record_derivative_public_cleanup((current_setting('test.unpublish_op')::jsonb->>'operation_id')::uuid,'a1000000-0000-4000-8000-000000000001',true,null)$$,'derivative unpublish cleanup completes');
reset role;
select is((select visibility::text from public.works where id='a3000000-0000-4000-8000-000000000001'),'draft','unpublish hides the derivative-backed Work');
select is((select count(*) from public.work_publication_derivatives),0::bigint,'unpublish removes exact derivative cleanup records');
set local role service_role;
select set_config('test.post_unpublish_claim',public.service_claim_work_derivative_publication('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')::text,true);
select is((current_setting('test.post_unpublish_claim')::jsonb->>'status'),'running','republish claims a fresh derivative-backed revision after unpublish');
select lives_ok($$select public.service_fail_work_derivative_publication((current_setting('test.post_unpublish_claim')::jsonb->>'operation_id')::uuid,'a1000000-0000-4000-8000-000000000001','test_cleanup',true)$$,'post-unpublish candidate can be safely cleaned for retry');
reset role;

-- Legacy operation snapshots retain their single registered public path.
insert into public.works(id,owner_profile_id,created_by_account_id,updated_by_account_id,title,year_label,work_type) values ('a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','LEGACY','2025','single-work');
insert into public.work_images(id,work_id,private_object_path,original_filename,mime_type,file_size,sort_order,is_cover,upload_status,original_verified_at,uploaded_by_account_id,updated_by_account_id) values ('a4000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001/a3000000-0000-4000-8000-000000000002/a4000000-0000-4000-8000-000000000003/original.jpg','legacy.jpg','image/jpeg',100,0,true,'ready',now(),'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
insert into public.work_publication_operations(id,work_id,operation_kind,status,publication_revision,actor_account_id,started_at) values ('a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002','unpublish','running','a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',now());
insert into public.work_publication_operation_images(operation_id,work_image_id,private_object_path,public_object_path,mime_type,file_size) values ('a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000001/a3000000-0000-4000-8000-000000000002/a4000000-0000-4000-8000-000000000003/original.jpg','legacy/public.jpg','image/jpeg',100);
set local role service_role;
select is((public.service_list_work_publication_cleanup_paths('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001')->0->>'public_object_path'),'legacy/public.jpg','legacy cleanup returns its single stored public path');
reset role;
select * from finish(); rollback;
