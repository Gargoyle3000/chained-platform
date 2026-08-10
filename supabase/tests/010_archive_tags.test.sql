begin;

create extension if not exists pgtap with schema extensions;
select plan(53);

select has_table('public','archive_tags','private Archive tags table exists');
select has_column('public','archive_tags','id','Archive tag has an identifier');
select has_column('public','archive_tags','account_id','Archive tag has an account owner');
select has_column('public','archive_tags','name','Archive tag has a name');
select has_column('public','archive_tags','created_at','Archive tag records when it was created');
select col_is_pk('public','archive_tags',array['id'],'Archive tag identity is its UUID');
select has_index('public','archive_tags','archive_tags_account_name_key','case-insensitive account tag names are unique');
select has_table('public','archive_item_tags','Archive tag membership table exists');
select has_column('public','archive_item_tags','account_id','tag membership has an account owner');
select has_column('public','archive_item_tags','work_id','tag membership targets an archived Work');
select has_column('public','archive_item_tags','tag_id','tag membership targets a tag');
select col_is_pk('public','archive_item_tags',array['account_id','work_id','tag_id'],'membership identity blocks duplicates');
select has_index('public','archive_item_tags','archive_item_tags_pkey','membership primary key is indexed');
select ok((select relrowsecurity from pg_class where oid='public.archive_tags'::regclass),'Archive tag RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.archive_tags'::regclass),'Archive tag RLS is forced');
select ok((select relrowsecurity from pg_class where oid='public.archive_item_tags'::regclass),'Archive tag membership RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.archive_item_tags'::regclass),'Archive tag membership RLS is forced');
select ok(not has_table_privilege('anon','public.archive_tags','SELECT'),'anon has no Archive tag SELECT privilege');
select ok(not has_table_privilege('anon','public.archive_tags','INSERT'),'anon has no Archive tag INSERT privilege');
select ok(not has_table_privilege('anon','public.archive_item_tags','SELECT'),'anon has no membership SELECT privilege');
select ok(not has_table_privilege('anon','public.archive_item_tags','INSERT'),'anon has no membership INSERT privilege');
select ok(not has_table_privilege('authenticated','public.archive_tags','UPDATE'),'authenticated cannot update Archive tags');
select ok(not has_table_privilege('authenticated','public.archive_item_tags','UPDATE'),'authenticated cannot update tag memberships');
select ok(not has_column_privilege('authenticated','public.archive_tags','account_id','INSERT'),'authenticated cannot choose another tag owner');
select ok(not has_column_privilege('authenticated','public.archive_item_tags','account_id','INSERT'),'authenticated cannot choose another membership owner');

insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000001','authenticated','authenticated','archive-tags-a@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','a1000000-0000-4000-8000-000000000002','authenticated','authenticated','archive-tags-b@example.test',now(),now());

insert into public.accounts (id,status,display_name) values
('a1000000-0000-4000-8000-000000000001','active','ARCHIVE TAGS A'),
('a1000000-0000-4000-8000-000000000002','active','ARCHIVE TAGS B');

insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id,deleted_by_account_id,deleted_at,purge_after) values
('a2000000-0000-4000-8000-000000000001','artist','archive-tags-artist','ARCHIVE TAGS ARTIST','published',now(),'claimed','a1000000-0000-4000-8000-000000000001',now(),'a1000000-0000-4000-8000-000000000001',null,null,null);

insert into public.works (id,owner_profile_id,created_by_account_id,updated_by_account_id,deleted_by_account_id,title,year_label,work_type,visibility,published_at,deleted_at,purge_after) values
('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',null,'ARCHIVE TAG WORK','2026','single-work','published',now(),null,null);

insert into public.archive_items(account_id,work_id) values
('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001'),
('a1000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001');

set constraints all immediate;
set constraints all deferred;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select count(*) from public.archive_tags$$,'42501',null,'anon cannot read Archive tags');
select throws_ok($$insert into public.archive_tags(name) values ('RITUAL')$$,'42501',null,'anon cannot create Archive tags');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is_empty($$select id from public.archive_tags$$,'a new account starts with no tags');
select lives_ok($$insert into public.archive_tags(name) values ('  RITUAL  ')$$,'active account can create its own tag');
select results_eq($$select name from public.archive_tags$$,$$values ('RITUAL'::text)$$,'tag names are trimmed and readable by their owner');
select throws_ok($$insert into public.archive_tags(name) values ('ritual')$$,'23505',null,'case-insensitive duplicate tag names fail');
select lives_ok($$insert into public.archive_tags(name) values ('TEMPORARY')$$,'owner can create another tag');
select lives_ok($$delete from public.archive_tags where name='TEMPORARY'$$,'owner can delete its own tag');
select is_empty($$select id from public.archive_tags where name='TEMPORARY'$$,'deleted own tag no longer appears');
select lives_ok($$insert into public.archive_item_tags(work_id,tag_id) values ('a3000000-0000-4000-8000-000000000001',(select id from public.archive_tags where name='RITUAL'))$$,'owner can assign a tag to an archived Work');
select results_eq($$select work_id, tag_id from public.archive_item_tags$$,$$select 'a3000000-0000-4000-8000-000000000001'::uuid, id from public.archive_tags where name='RITUAL'$$,'owner reads its own tag membership');
select throws_ok($$insert into public.archive_item_tags(work_id,tag_id) values ('a3000000-0000-4000-8000-000000000001',(select id from public.archive_tags where name='RITUAL'))$$,'23505',null,'duplicate tag membership fails');
select lives_ok($$delete from public.archive_item_tags where work_id='a3000000-0000-4000-8000-000000000001'$$,'owner can remove a tag membership');
select is_empty($$select work_id from public.archive_item_tags$$,'removed tag membership no longer appears');
select lives_ok($$insert into public.archive_item_tags(work_id,tag_id) values ('a3000000-0000-4000-8000-000000000001',(select id from public.archive_tags where name='RITUAL'))$$,'owner can restore a tag membership for cascade checks');

reset role;
select set_config(
  'test.archive_tag_id',
  (select id::text from public.archive_tags where account_id='a1000000-0000-4000-8000-000000000001' and name='RITUAL'),
  true
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is_empty($$select id from public.archive_tags$$,'account B cannot read account A tags');
select lives_ok($$delete from public.archive_tags where id=current_setting('test.archive_tag_id')::uuid$$,'account B cannot delete account A tags');

reset role;
select results_eq($$select count(*)::bigint from public.archive_tags where name='RITUAL'$$,$$values (1::bigint)$$,'account A tag remains after account B delete attempt');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok(
  $$insert into public.archive_item_tags(work_id,tag_id)
    values (
      'a3000000-0000-4000-8000-000000000001',
      current_setting('test.archive_tag_id')::uuid
    )$$,
  '23503',
  null,
  'account B cannot assign account A tag'
);
select is_empty($$select work_id from public.archive_item_tags$$,'account B cannot read account A memberships');
select lives_ok($$delete from public.archive_item_tags where work_id='a3000000-0000-4000-8000-000000000001'$$,'account B cannot remove account A membership');

reset role;
select results_eq($$select count(*)::bigint from public.archive_item_tags where account_id='a1000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'account A membership remains after account B delete attempt');
select lives_ok($$delete from public.archive_items where account_id='a1000000-0000-4000-8000-000000000001' and work_id='a3000000-0000-4000-8000-000000000001'$$,'removing an Archive Work succeeds for cascade check');
select results_eq($$select count(*)::bigint from public.archive_tags where account_id='a1000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'removing an Archive Work preserves account tags');
select results_eq($$select count(*)::bigint from public.archive_item_tags where account_id='a1000000-0000-4000-8000-000000000001'$$,$$values (0::bigint)$$,'removing an Archive Work deletes its tag memberships');
insert into public.archive_items(account_id,work_id) values ('a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001');
insert into public.archive_item_tags(account_id,work_id,tag_id)
select 'a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',id from public.archive_tags where name='RITUAL';
select lives_ok($$delete from public.archive_tags where account_id='a1000000-0000-4000-8000-000000000001' and name='RITUAL'$$,'deleting a tag succeeds for cascade check');
select results_eq($$select count(*)::bigint from public.archive_item_tags where account_id='a1000000-0000-4000-8000-000000000001'$$,$$values (0::bigint)$$,'deleting a tag removes its memberships');
select results_eq($$select count(*)::bigint from public.archive_items where account_id='a1000000-0000-4000-8000-000000000001'$$,$$values (1::bigint)$$,'deleting a tag preserves the archived Work');

reset role;
select * from finish();
rollback;
