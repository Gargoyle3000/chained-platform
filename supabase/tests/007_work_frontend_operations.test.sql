begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000001','authenticated','authenticated','frontend-one@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000002','authenticated','authenticated','frontend-two@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000003','authenticated','authenticated','frontend-gallery@example.test',now(),now()),
('00000000-0000-0000-8000-000000000000','71000000-0000-4000-8000-000000000004','authenticated','authenticated','frontend-suspended@example.test',now(),now());

insert into public.accounts (id,status,display_name) values
('71000000-0000-4000-8000-000000000001','active','FRONTEND ONE'),
('71000000-0000-4000-8000-000000000002','active','FRONTEND TWO'),
('71000000-0000-4000-8000-000000000003','active','FRONTEND GALLERY'),
('71000000-0000-4000-8000-000000000004','suspended','FRONTEND SUSPENDED');

insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values
('72000000-0000-4000-8000-000000000001','artist','frontend-one','FRONTEND ONE','published',now(),'claimed','71000000-0000-4000-8000-000000000001',now(),'71000000-0000-4000-8000-000000000001'),
('72000000-0000-4000-8000-000000000002','artist','frontend-two','FRONTEND TWO','published',now(),'claimed','71000000-0000-4000-8000-000000000002',now(),'71000000-0000-4000-8000-000000000002'),
('73000000-0000-4000-8000-000000000001','institution','frontend-gallery','FRONTEND GALLERY','published',now(),'claimed',null,null,'71000000-0000-4000-8000-000000000003');

insert into public.profile_members (profile_id,account_id,membership_level,status) values
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','owner','active'),
('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','owner','active'),
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000004','editor','active'),
('73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','manager','active');

insert into public.profile_access_grants (id,grantor_profile_id,grantee_profile_id,scope,status,granted_by_account_id) values
('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','works_editor','active','71000000-0000-4000-8000-000000000001');

insert into public.works (id,owner_profile_id,created_by_account_id,updated_by_account_id,title,year_sort,year_label,work_type,visibility,published_at) values
('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','FRONTEND DRAFT',2026,'2026','single-work','draft',null),
('75000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','OTHER DRAFT',2026,'2026','single-work','draft',null),
('75000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','PUBLISHED',2026,'2026','single-work','published',now()),
('75000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','DELETE ME',2026,'2026','single-work','draft',null),
('75000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','BUSY',2026,'2026','single-work','draft',null);

insert into public.work_images (id,work_id,private_object_path,public_object_path,original_filename,mime_type,file_size,sort_order,is_cover,uploaded_by_account_id,updated_by_account_id,upload_status,original_verified_at) values
('76000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001/75000000-0000-4000-8000-000000000001/76000000-0000-4000-8000-000000000001/original.jpg',null,'one.jpg','image/jpeg',4,0,true,'71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','ready',now()),
('76000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001/75000000-0000-4000-8000-000000000001/76000000-0000-4000-8000-000000000002/original.jpg',null,'two.jpg','image/jpeg',4,1,false,'71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','ready',now()),
('76000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002/75000000-0000-4000-8000-000000000002/76000000-0000-4000-8000-000000000003/original.jpg',null,'other.jpg','image/jpeg',4,0,true,'71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','ready',now()),
('76000000-0000-4000-8000-000000000004','75000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001/75000000-0000-4000-8000-000000000003/76000000-0000-4000-8000-000000000004/original.jpg','72000000-0000-4000-8000-000000000001/75000000-0000-4000-8000-000000000003/revision/76000000-0000-4000-8000-000000000004.jpg','published.jpg','image/jpeg',4,0,true,'71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','ready',now());

insert into public.work_publication_operations (id,work_id,operation_kind,status,actor_account_id,started_at)
values ('77000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000005','public_cleanup','running','71000000-0000-4000-8000-000000000001',now());

select has_function('public','list_manageable_artist_profiles',array[]::text[],'manageable-profile RPC exists');
select has_function('public','list_managed_work_images',array['uuid'],'managed-image RPC exists');
select has_function('public','reorder_work_images',array['uuid','uuid[]','uuid'],'atomic image-order RPC exists');
select has_function('public','soft_delete_work',array['uuid'],'soft-delete wrapper exists');
select function_privs_are('public','reorder_work_images',array['uuid','uuid[]','uuid'],'authenticated',array['EXECUTE'],'only execute is granted to authenticated');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select id from public.list_manageable_artist_profiles()$$,$$values ('72000000-0000-4000-8000-000000000001'::uuid)$$,'direct artist sees exactly own manageable profile');
select results_eq($$select count(*)::bigint from public.list_managed_work_images('75000000-0000-4000-8000-000000000001')$$,$$values (2::bigint)$$,'direct manager can list exact private-image records');
select lives_ok($$select public.reorder_work_images('75000000-0000-4000-8000-000000000001',array['76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000001']::uuid[],'76000000-0000-4000-8000-000000000002')$$,'direct manager can atomically reorder and set cover');
reset role;
select results_eq($$select id,sort_order,is_cover from public.work_images where work_id='75000000-0000-4000-8000-000000000001' order by sort_order$$,$$values ('76000000-0000-4000-8000-000000000002'::uuid,0,true),('76000000-0000-4000-8000-000000000001'::uuid,1,false)$$,'order and sole cover change together');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.reorder_work_images('75000000-0000-4000-8000-000000000001',array['76000000-0000-4000-8000-000000000001']::uuid[],'76000000-0000-4000-8000-000000000001')$$,'23514',null,'omitted image is rejected');
select throws_ok($$select public.reorder_work_images('75000000-0000-4000-8000-000000000001',array['76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001']::uuid[],'76000000-0000-4000-8000-000000000001')$$,'23514',null,'duplicate image is rejected');
select throws_ok($$select public.reorder_work_images('75000000-0000-4000-8000-000000000001',array['76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003']::uuid[],'76000000-0000-4000-8000-000000000001')$$,'23514',null,'cross-Work image is rejected');
select results_eq($$select id,sort_order,is_cover from public.work_images where work_id='75000000-0000-4000-8000-000000000001' order by sort_order$$,$$values ('76000000-0000-4000-8000-000000000002'::uuid,0,true),('76000000-0000-4000-8000-000000000001'::uuid,1,false)$$,'failed reorder is atomic');
select throws_ok($$select public.reorder_work_images('75000000-0000-4000-8000-000000000003',array['76000000-0000-4000-8000-000000000004']::uuid[],'76000000-0000-4000-8000-000000000004')$$,'42501',null,'published image order cannot change');
select throws_ok($$update public.work_images set sort_order=5 where id='76000000-0000-4000-8000-000000000001'$$,'42501',null,'ordinary users cannot bypass the atomic order RPC');
reset role;
select results_eq($$select owner_profile_id,visibility::text,published_at from public.works where id='75000000-0000-4000-8000-000000000001'$$,$$values ('72000000-0000-4000-8000-000000000001'::uuid,'draft'::text,null::timestamptz)$$,'reorder cannot alter owner or publication fields');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select results_eq($$select id from public.list_manageable_artist_profiles()$$,$$values ('72000000-0000-4000-8000-000000000001'::uuid)$$,'valid works_editor delegate resolves the artist profile');
select lives_ok($$select public.reorder_work_images('75000000-0000-4000-8000-000000000001',array['76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002']::uuid[],'76000000-0000-4000-8000-000000000001')$$,'valid delegate can use atomic order operation');
reset role;
update public.profile_access_grants set status='revoked',revoked_at=now(),revoked_by_account_id='71000000-0000-4000-8000-000000000001' where id='74000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is_empty($$select * from public.list_manageable_artist_profiles()$$,'revoked delegate no longer resolves artist profiles');
select throws_ok($$select public.list_managed_work_images('75000000-0000-4000-8000-000000000001')$$,'42501',null,'revoked delegate loses private image access immediately');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.soft_delete_work('75000000-0000-4000-8000-000000000004')$$,'42501',null,'unrelated authenticated user cannot soft-delete');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is_empty($$select * from public.list_manageable_artist_profiles()$$,'suspended account resolves no profiles');
select throws_ok($$select public.soft_delete_work('75000000-0000-4000-8000-000000000004')$$,'42501',null,'suspended account cannot soft-delete');
reset role;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.soft_delete_work('75000000-0000-4000-8000-000000000004')$$,'42501',null,'anonymous user cannot soft-delete');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.soft_delete_work('75000000-0000-4000-8000-000000000003')$$,'42501',null,'published Work must be unpublished before deletion');
select throws_ok($$select public.soft_delete_work('75000000-0000-4000-8000-000000000005')$$,'55000',null,'active publication operation blocks soft deletion');
select lives_ok($$select public.soft_delete_work('75000000-0000-4000-8000-000000000004')$$,'authorised owner can soft-delete a draft');
reset role;
select ok((select deleted_at is not null and purge_after=deleted_at+interval '30 days' from public.works where id='75000000-0000-4000-8000-000000000004'),'wrapper preserves trusted soft-delete history and deadline');
select ok(not has_table_privilege('authenticated','public.works','DELETE'),'authenticated still has no permanent SQL DELETE');

select * from finish();
rollback;
