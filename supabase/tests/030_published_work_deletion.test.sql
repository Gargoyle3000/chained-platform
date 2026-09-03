begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users(instance_id,id,aud,role,email,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000001','authenticated','authenticated','published-delete-owner@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','d1000000-0000-4000-8000-000000000002','authenticated','authenticated','published-delete-other@example.test',now(),now());
insert into public.accounts(id,status,display_name) values
('d1000000-0000-4000-8000-000000000001','active','DELETE OWNER'),
('d1000000-0000-4000-8000-000000000002','active','DELETE OTHER');
insert into public.public_profiles(id,profile_type,slug,display_name,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values
('d2000000-0000-4000-8000-000000000001','artist','delete-owner','DELETE OWNER','claimed','d1000000-0000-4000-8000-000000000001',now(),'d1000000-0000-4000-8000-000000000001');
insert into public.profile_members(profile_id,account_id,membership_level,status) values
('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','owner','active');
insert into public.works(id,owner_profile_id,created_by_account_id,updated_by_account_id,title,year_label,work_type,visibility,published_at) values
('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','DRAFT DELETE','2026','single-work','draft',null),
('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','PUBLISHED BLOCK','2026','single-work','published',statement_timestamp()),
('d3000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','PUBLISHED RETRY','2026','single-work','draft',null);

insert into public.work_images(
  id,work_id,private_object_path,preview_object_path,preview_file_size,preview_verified_at,
  original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,
  upload_status,original_verified_at,uploaded_by_account_id,updated_by_account_id
) values (
  'd4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000003',
  'd2000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000003/d4000000-0000-4000-8000-000000000001/original.jpg',
  'd2000000-0000-4000-8000-000000000001/d3000000-0000-4000-8000-000000000003/d4000000-0000-4000-8000-000000000001/preview.webp',
  10,now(),'retry.jpg','image/jpeg',100,1285,2055,0,true,'ready',now(),
  'd1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001'
);
insert into private.work_image_derivatives(
  id,work_image_id,source_private_object_path,rendition_key,state,staging_object_path,
  mime_type,file_size,pixel_width,pixel_height,checksum_sha256,pipeline_version,
  icc_profile_version,verified_at,completed_at
)
select gen_random_uuid(),wi.id,wi.private_object_path,k::private.work_image_derivative_rendition_key,
       'ready',regexp_replace(wi.private_object_path,'/original[.][^/]+$','/public-derivatives/'||k||'.webp'),
       'image/webp',20,1285,2055,repeat('a',64),'p','s',now(),now()
  from public.work_images as wi
 cross join unnest(array['small','large']) as k
 where wi.id = 'd4000000-0000-4000-8000-000000000001';

select has_function('public','service_soft_delete_unpublished_work',array['uuid','uuid'],'trusted published-delete completion RPC exists');
select ok(has_function_privilege('service_role','public.service_soft_delete_unpublished_work(uuid,uuid)','EXECUTE'),'service role can complete the trusted deletion');
select ok(not has_function_privilege('authenticated','public.service_soft_delete_unpublished_work(uuid,uuid)','EXECUTE'),'browser role cannot invoke the trusted deletion RPC');
set local role service_role;
select lives_ok($$select public.service_soft_delete_unpublished_work('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001')$$,'owner can complete draft soft deletion after public cleanup');
reset role;
select ok((select deleted_at is not null and purge_after=deleted_at+interval '30 days' from public.works where id='d3000000-0000-4000-8000-000000000001'),'trusted completion preserves the existing recovery deadline');
select is((select visibility::text from public.works where id='d3000000-0000-4000-8000-000000000001'),'draft','trusted completion does not alter private-media or draft state before hiding the Work');
select is((select count(*) from public.works where id='d3000000-0000-4000-8000-000000000001' and visibility='published' and deleted_at is null),0::bigint,'soft-deleted Work has no public publication state');
set local role service_role;
select throws_ok($$select public.service_soft_delete_unpublished_work('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001')$$,'22023','The Work must be hidden before deletion.','published Work cannot bypass unpublication');
select throws_ok($$select public.service_soft_delete_unpublished_work('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000002')$$,'42501','The Work is unavailable.','unrelated account cannot complete deletion');
reset role;
select is((select deleted_at from public.works where id='d3000000-0000-4000-8000-000000000002'),null::timestamptz,'rejected deletion leaves the published Work intact');
select is((select count(*) from public.audit_events where target_id='d3000000-0000-4000-8000-000000000001' and action='work.soft_deleted'),1::bigint,'trusted completion records the standard soft-delete audit event');

-- A failed public recall keeps a Phase-4 Work hidden. A later delete retry
-- must resume that same snapshot, then delete only after its cleanup succeeds.
set local role service_role;
select set_config('test.retry_publish',public.service_claim_work_derivative_publication('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001')::text,true);
select public.service_record_publication_derivative_copy((current_setting('test.retry_publish')::jsonb->>'operation_id')::uuid,'d4000000-0000-4000-8000-000000000001','small','d1000000-0000-4000-8000-000000000001');
select public.service_record_publication_derivative_copy((current_setting('test.retry_publish')::jsonb->>'operation_id')::uuid,'d4000000-0000-4000-8000-000000000001','large','d1000000-0000-4000-8000-000000000001');
select public.service_finalize_work_publication((current_setting('test.retry_publish')::jsonb->>'operation_id')::uuid,'d1000000-0000-4000-8000-000000000001');
reset role;
select is((select visibility::text from public.works where id='d3000000-0000-4000-8000-000000000003'),'published','retry fixture is Phase-4 published');

set local role service_role;
select set_config('test.first_unpublish',public.service_begin_work_unpublication('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')::text,true);
select set_config('test.first_cleanup_path_count',jsonb_array_length(public.service_list_work_publication_cleanup_paths((current_setting('test.first_unpublish')::jsonb->>'operation_id')::uuid,'d1000000-0000-4000-8000-000000000001'))::text,true);
reset role;
select is(current_setting('test.first_cleanup_path_count'),'2','first delete snapshots both exact derivatives');
set local role service_role;
select public.service_record_derivative_public_cleanup((current_setting('test.first_unpublish')::jsonb->>'operation_id')::uuid,'d1000000-0000-4000-8000-000000000001',false,'transient_storage');
reset role;
select is((select visibility::text from public.works where id='d3000000-0000-4000-8000-000000000003'),'draft','failed recall hides the Work before retry');
select is((select status::text from public.work_publication_operations where id=(current_setting('test.first_unpublish')::jsonb->>'operation_id')::uuid),'cleanup_pending','failed recall leaves its existing cleanup pending');
select is((select deleted_at from public.works where id='d3000000-0000-4000-8000-000000000003'),null::timestamptz,'failed recall does not soft-delete the Work');
select is((select count(*) from public.work_publication_derivatives where work_image_id='d4000000-0000-4000-8000-000000000001'),2::bigint,'failed recall retains derivative cleanup references');

set local role service_role;
select set_config('test.resumed_unpublish',public.service_begin_work_unpublication('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002')::text,true);
select set_config('test.resumed_cleanup_path_count',jsonb_array_length(public.service_list_work_publication_cleanup_paths((current_setting('test.resumed_unpublish')::jsonb->>'operation_id')::uuid,'d1000000-0000-4000-8000-000000000001'))::text,true);
reset role;
select is((current_setting('test.resumed_unpublish')::jsonb->>'status'),'cleanup_pending','retry finds the hidden Work cleanup operation');
select is((current_setting('test.resumed_unpublish')::jsonb->>'operation_id'),(current_setting('test.first_unpublish')::jsonb->>'operation_id'),'retry resumes the original operation snapshot');
select is((select count(*) from public.work_publication_operations where work_id='d3000000-0000-4000-8000-000000000003' and operation_kind='unpublish'),1::bigint,'retry creates no second unpublication operation');
select is(current_setting('test.resumed_cleanup_path_count'),'2','retry uses the original exact derivative paths');
set local role service_role;
select public.service_record_derivative_public_cleanup((current_setting('test.resumed_unpublish')::jsonb->>'operation_id')::uuid,'d1000000-0000-4000-8000-000000000001',true,null);
reset role;
select is((select count(*) from public.work_publication_derivatives where work_image_id='d4000000-0000-4000-8000-000000000001'),0::bigint,'successful retry removes derivative publication references');
select is((select status::text from public.work_publication_operations where id=(current_setting('test.first_unpublish')::jsonb->>'operation_id')::uuid),'succeeded','successful retry completes the original cleanup operation');
set local role service_role;
select public.service_soft_delete_unpublished_work('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001');
reset role;
select ok((select deleted_at is not null and purge_after=deleted_at+interval '30 days' and deleted_by_account_id='d1000000-0000-4000-8000-000000000001' from public.works where id='d3000000-0000-4000-8000-000000000003'),'successful retry completes the standard soft-delete tuple');
select is((select count(*) from public.works where id='d3000000-0000-4000-8000-000000000003' and visibility='published' and deleted_at is null),0::bigint,'retried deletion leaves no active public Work');
select is((select count(*) from public.work_images where id='d4000000-0000-4000-8000-000000000001' and private_object_path like '%/original.jpg' and preview_object_path like '%/preview.webp'),1::bigint,'retried deletion preserves private original and preview recovery media');

select * from finish();
rollback;
