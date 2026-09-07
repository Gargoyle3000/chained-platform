begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(instance_id,id,aud,role,email,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000001','authenticated','authenticated','readiness-owner@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','e1000000-0000-4000-8000-000000000002','authenticated','authenticated','readiness-other@example.test',now(),now());
insert into public.accounts(id,status,display_name) values
('e1000000-0000-4000-8000-000000000001','active','READINESS OWNER'),
('e1000000-0000-4000-8000-000000000002','active','READINESS OTHER');
insert into public.public_profiles(id,profile_type,slug,display_name,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values
('e2000000-0000-4000-8000-000000000001','artist','readiness-owner','READINESS OWNER','claimed','e1000000-0000-4000-8000-000000000001',now(),'e1000000-0000-4000-8000-000000000001');
insert into public.profile_members(profile_id,account_id,membership_level,status) values
('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','owner','active');
insert into public.works(id,owner_profile_id,created_by_account_id,updated_by_account_id,title,year_sort,year_label,work_type) values
('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','READINESS',2026,'2026','single-work'),
('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','NO IMAGE',2026,'2026','single-work'),
('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','UNVERIFIED',2026,'2026','single-work');
insert into public.work_images(id,work_id,private_object_path,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,upload_status,original_verified_at,uploaded_by_account_id,updated_by_account_id) values
('e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000001/original.jpg','one.jpg','image/jpeg',100,96,64,0,true,'ready',now(),'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001'),
('e4000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000001/e4000000-0000-4000-8000-000000000002/original.jpg','two.jpg','image/jpeg',100,96,64,1,false,'ready',now(),'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001'),
('e4000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000003/e4000000-0000-4000-8000-000000000003/original.jpg','unverified.jpg','image/jpeg',100,96,64,0,true,'reserved',null,'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001');
insert into private.work_image_derivative_jobs(id,work_image_id,source_private_object_path,state,requested_by_account_id) select
gen_random_uuid(),id,private_object_path,'pending','e1000000-0000-4000-8000-000000000001' from public.work_images where work_id='e3000000-0000-4000-8000-000000000001';
insert into private.work_image_derivatives(id,work_image_id,source_private_object_path,rendition_key,state,staging_object_path)
select gen_random_uuid(),wi.id,wi.private_object_path,k::private.work_image_derivative_rendition_key,'pending',regexp_replace(wi.private_object_path,'/original[.][^/]+$','/public-derivatives/'||k||'.webp')
from public.work_images wi cross join unnest(array['small','large']) k where wi.work_id='e3000000-0000-4000-8000-000000000001';

select has_function('public','get_managed_work_publication_readiness',array['uuid'],'managed readiness RPC exists');
select is(
  (select pg_get_function_result('public.get_managed_work_publication_readiness(uuid)'::regprocedure)),
  'TABLE(state text, total_images bigint, ready_images bigint, processing_images bigint, failed_images bigint)',
  'RPC exposes only the safe state and aggregate counts'
);
select ok(not has_function_privilege('anon','public.get_managed_work_publication_readiness(uuid)','EXECUTE'),'anonymous cannot execute readiness RPC');
select ok(has_function_privilege('authenticated','public.get_managed_work_publication_readiness(uuid)','EXECUTE'),'authenticated may execute readiness RPC subject to manager authorization');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous receives no managed readiness');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select * from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')$$,'42501','The Work is unavailable.','unrelated account receives no managed readiness');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select state,total_images,ready_images,processing_images,failed_images from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')$$,$$values ('processing'::text,2::bigint,0::bigint,2::bigint,0::bigint)$$,'pending derivatives aggregate as processing');
reset role;

update private.work_image_derivative_jobs set state='processing',attempt_count=1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes',claimed_at=now() where work_image_id='e4000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select state from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')),'processing','processing job remains processing');
reset role;

update private.work_image_derivatives set state='ready',mime_type='image/webp',file_size=20,pixel_width=96,pixel_height=64,checksum_sha256=repeat('a',64),pipeline_version='p',icc_profile_version='s',verified_at=now(),completed_at=now() where work_image_id='e4000000-0000-4000-8000-000000000001';
update private.work_image_derivative_jobs set state='ready',attempt_count=1,lease_token=null,lease_expires_at=null,claimed_at=now(),completed_at=now() where work_image_id='e4000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select state,ready_images,processing_images from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')$$,$$values ('processing'::text,1::bigint,1::bigint)$$,'multiple images aggregate one ready and one processing image');
reset role;

update private.work_image_derivatives set state='ready',mime_type='image/webp',file_size=20,pixel_width=96,pixel_height=64,checksum_sha256=repeat('b',64),pipeline_version='p',icc_profile_version='s',verified_at=now(),completed_at=now() where work_image_id='e4000000-0000-4000-8000-000000000002';
update private.work_image_derivative_jobs set state='ready',lease_token=null,lease_expires_at=null,completed_at=now() where work_image_id='e4000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select state,total_images,ready_images,processing_images,failed_images from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')$$,$$values ('ready'::text,2::bigint,2::bigint,0::bigint,0::bigint)$$,'complete current-source SMALL and LARGE pairs are ready');
reset role;

update private.work_image_derivative_jobs set state='failed',lease_token=null,lease_expires_at=null,completed_at=now(),failure_code='test_failure' where work_image_id='e4000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select state,ready_images,failed_images from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')$$,$$values ('failed'::text,1::bigint,1::bigint)$$,'terminal current-source job failure blocks the aggregate');
reset role;

update private.work_image_derivative_jobs set state='ready',failure_code=null where work_image_id='e4000000-0000-4000-8000-000000000002';
update private.work_image_derivatives set state='failed',failure_code='test_failure' where work_image_id='e4000000-0000-4000-8000-000000000002' and rendition_key='large';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select state from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')),'failed','terminal current-source derivative failure blocks the aggregate');
reset role;

update private.work_image_derivatives set state='ready',failure_code=null where work_image_id='e4000000-0000-4000-8000-000000000002' and rendition_key='large';
update public.work_images set is_cover=false where work_id='e3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select state from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')),'prerequisite_invalid','invalid cover state is not classified as processing');
select is((select state from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000002')),'prerequisite_invalid','missing image is not classified as processing');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select state from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000003')),'prerequisite_invalid','unverified source is not classified as processing');
reset role;

insert into public.work_publication_operations(work_id,operation_kind,status,publication_revision,actor_account_id)
values ('e3000000-0000-4000-8000-000000000001','publish','pending',gen_random_uuid(),'e1000000-0000-4000-8000-000000000001');
update private.work_image_derivatives
   set state='pending',mime_type=null,file_size=null,pixel_width=null,pixel_height=null,
       checksum_sha256=null,pipeline_version=null,icc_profile_version=null,verified_at=null,completed_at=null
 where work_image_id='e4000000-0000-4000-8000-000000000002'
   and rendition_key='large';
update private.work_image_derivative_jobs
   set state='pending',attempt_count=0,claimed_at=null,completed_at=null
 where work_image_id='e4000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select state from public.get_managed_work_publication_readiness('e3000000-0000-4000-8000-000000000001')),'prerequisite_invalid','an active publication lifecycle is not mislabeled as derivative processing');
reset role;

select is((select count(*) from information_schema.routines where routine_schema='public' and routine_name='get_managed_work_publication_readiness'),1::bigint,'one public readiness entry point exists');
select ok(not has_function_privilege('anon','private.get_managed_work_publication_readiness(uuid)','EXECUTE'),'anonymous cannot execute private readiness helper');
select ok(has_function_privilege('authenticated','private.get_managed_work_publication_readiness(uuid)','EXECUTE'),'authenticated wrapper may invoke the private helper');

select * from finish();
rollback;
