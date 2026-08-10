begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public','archive_items','private Archive table exists');
select has_column('public','archive_items','account_id','Archive item has an account owner');
select has_column('public','archive_items','work_id','Archive item targets a Work');
select has_column('public','archive_items','created_at','Archive item records when it was saved');
select col_is_pk('public','archive_items',array['account_id','work_id'],'Archive identity is the account and Work pair');
select has_index('public','archive_items','archive_items_pkey','Archive primary key blocks duplicate saves');
select has_index('public','archive_items','archive_items_account_created','Archive listing order is indexed');
select ok((select relrowsecurity from pg_class where oid='public.archive_items'::regclass),'Archive RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.archive_items'::regclass),'Archive RLS is forced');
select ok(not has_table_privilege('anon','public.archive_items','SELECT'),'anon has no Archive SELECT privilege');
select ok(not has_table_privilege('anon','public.archive_items','INSERT'),'anon has no Archive INSERT privilege');
select ok(not has_table_privilege('anon','public.archive_items','UPDATE'),'anon has no Archive UPDATE privilege');
select ok(not has_table_privilege('anon','public.archive_items','DELETE'),'anon has no Archive DELETE privilege');
select ok(not has_table_privilege('authenticated','public.archive_items','UPDATE'),'authenticated cannot update Archive rows');
select ok(not has_column_privilege('authenticated','public.archive_items','account_id','INSERT'),'authenticated cannot choose another Archive owner');

insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','archive-active-a@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000002','authenticated','authenticated','archive-active-b@example.test',now(),now());

insert into public.accounts (id,status,display_name) values
('91000000-0000-4000-8000-000000000001','active','ARCHIVE ACTIVE A'),
('91000000-0000-4000-8000-000000000002','active','ARCHIVE ACTIVE B');

insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id,deleted_by_account_id,deleted_at,purge_after) values
('92000000-0000-4000-8000-000000000001','artist','archive-public-artist','ARCHIVE PUBLIC ARTIST','published',now(),'claimed','91000000-0000-4000-8000-000000000001',now(),'91000000-0000-4000-8000-000000000001',null,null,null),
('92000000-0000-4000-8000-000000000002','artist','archive-draft-artist','ARCHIVE DRAFT ARTIST','draft',null,'claimed','91000000-0000-4000-8000-000000000001',now(),'91000000-0000-4000-8000-000000000001',null,null,null);

insert into public.works (id,owner_profile_id,created_by_account_id,updated_by_account_id,deleted_by_account_id,title,year_label,work_type,visibility,published_at,deleted_at,purge_after) values
('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',null,'ARCHIVE PUBLIC WORK','2026','single-work','published',now(),null,null),
('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',null,'ARCHIVE DRAFT WORK','2026','single-work','draft',null,null,null),
('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',null,'ARCHIVE UNPUBLISHED PROFILE WORK','2026','single-work','published',now(),null,null),
('93000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','ARCHIVE DELETED WORK','2026','single-work','published',now(),'2026-08-01','2026-08-31');

set constraints all immediate;
set constraints all deferred;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select count(*) from public.archive_items$$,'42501',null,'anon cannot read Archive items');
select throws_ok($$insert into public.archive_items(work_id) values ('93000000-0000-4000-8000-000000000001')$$,'42501',null,'anon cannot save an Archive item');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is_empty($$select work_id from public.archive_items$$,'a new Archive is empty');
select lives_ok($$insert into public.archive_items(work_id) values ('93000000-0000-4000-8000-000000000001')$$,'active account can save a publicly available Work');
select results_eq($$select account_id, work_id from public.archive_items$$,$$values ('91000000-0000-4000-8000-000000000001'::uuid,'93000000-0000-4000-8000-000000000001'::uuid)$$,'account reads only its saved Work');
select throws_ok($$insert into public.archive_items(work_id) values ('93000000-0000-4000-8000-000000000001')$$,'23505',null,'duplicate Archive save fails');
select throws_ok($$insert into public.archive_items(work_id) values ('93000000-0000-4000-8000-000000000002')$$,'42501',null,'draft Work cannot be saved');
select throws_ok($$insert into public.archive_items(work_id) values ('93000000-0000-4000-8000-000000000003')$$,'42501',null,'Work on an unpublished profile cannot be saved');
select throws_ok($$insert into public.archive_items(work_id) values ('93000000-0000-4000-8000-000000000004')$$,'42501',null,'deleted Work cannot be saved');
select throws_ok($$insert into public.archive_items(account_id,work_id) values ('91000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001')$$,'42501',null,'account cannot save for another account');

reset role;
insert into public.archive_items(account_id,work_id) values
('91000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select account_id from public.archive_items$$,$$values ('91000000-0000-4000-8000-000000000002'::uuid)$$,'account B cannot read account A Archive items');
select lives_ok($$delete from public.archive_items where account_id='91000000-0000-4000-8000-000000000001'$$,'account B delete cannot affect account A Archive items');

reset role;
select results_eq(
  $$select count(*)::bigint from public.archive_items where account_id='91000000-0000-4000-8000-000000000001'$$,
  $$values (1::bigint)$$,
  'account A Archive item still exists after account B delete attempt'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.archive_items$$,$$values (1::bigint)$$,'account B retains only its own Archive item');
select lives_ok($$delete from public.archive_items where work_id='93000000-0000-4000-8000-000000000001'$$,'account B can remove its own Archive item');
select is_empty($$select work_id from public.archive_items$$,'Archive returns to empty after removal');

select * from finish();
rollback;
