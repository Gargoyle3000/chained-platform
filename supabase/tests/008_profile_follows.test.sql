begin;

create extension if not exists pgtap with schema extensions;
select plan(43);

select has_table('public','profile_follows','private profile follow table exists');
select has_column('public','profile_follows','account_id','follow has an account owner');
select has_column('public','profile_follows','profile_id','follow targets a public profile');
select has_column('public','profile_follows','created_at','follow records creation time');
select col_is_pk('public','profile_follows',array['account_id','profile_id'],'follow identity is the composite primary key');
select has_index('public','profile_follows','profile_follows_pkey','account lookup is indexed by the primary key');
select has_index('public','profile_follows','profile_follows_profile_account','reverse profile lookup is indexed');
select ok((select relrowsecurity from pg_class where oid='public.profile_follows'::regclass),'follow RLS is enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.profile_follows'::regclass),'follow RLS is forced');
select ok(not has_table_privilege('anon','public.profile_follows','SELECT'),'anon has no follow SELECT privilege');
select ok(not has_table_privilege('anon','public.profile_follows','INSERT'),'anon has no follow INSERT privilege');
select ok(not has_table_privilege('anon','public.profile_follows','UPDATE'),'anon has no follow UPDATE privilege');
select ok(not has_table_privilege('anon','public.profile_follows','DELETE'),'anon has no follow DELETE privilege');
select ok(not has_table_privilege('authenticated','public.profile_follows','UPDATE'),'authenticated has no follow UPDATE privilege');
select has_function('public','list_following_feed',array['timestamp with time zone','uuid','integer'],'bounded Following feed RPC exists');
select function_privs_are('public','list_following_feed',array['timestamp with time zone','uuid','integer'],'authenticated',array['EXECUTE'],'only authenticated may execute the feed RPC');
select is_empty($$select table_name from information_schema.tables where table_schema='public' and table_name in ('follower_counts','following_counts')$$,'no follower-count table exists');

insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000001','authenticated','authenticated','follow-active@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000002','authenticated','authenticated','follow-other@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000003','authenticated','authenticated','follow-suspended@example.test',now(),now()),
('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000004','authenticated','authenticated','follow-disabled@example.test',now(),now());

insert into public.accounts (id,status,display_name) values
('81000000-0000-4000-8000-000000000001','active','FOLLOW ACTIVE'),
('81000000-0000-4000-8000-000000000002','active','FOLLOW OTHER'),
('81000000-0000-4000-8000-000000000003','suspended','FOLLOW SUSPENDED'),
('81000000-0000-4000-8000-000000000004','disabled','FOLLOW DISABLED');

insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id,deleted_by_account_id,deleted_at,purge_after) values
('82000000-0000-4000-8000-000000000001','artist','follow-artist-a','FOLLOW ARTIST A','published',now(),'claimed','81000000-0000-4000-8000-000000000001',now(),'81000000-0000-4000-8000-000000000001',null,null,null),
('82000000-0000-4000-8000-000000000002','artist','follow-artist-b','FOLLOW ARTIST B','published',now(),'claimed','81000000-0000-4000-8000-000000000002',now(),'81000000-0000-4000-8000-000000000002',null,null,null),
('82000000-0000-4000-8000-000000000003','artist','follow-artist-c','FOLLOW ARTIST C','published',now(),'claimed','81000000-0000-4000-8000-000000000001',now(),'81000000-0000-4000-8000-000000000001',null,null,null),
('82000000-0000-4000-8000-000000000004','artist','follow-artist-deleted','FOLLOW ARTIST DELETED','published',now(),'claimed','81000000-0000-4000-8000-000000000001',now(),'81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','2026-07-01','2026-07-31');

insert into public.works (id,owner_profile_id,created_by_account_id,updated_by_account_id,deleted_by_account_id,title,year_label,work_type,visibility,published_at,deleted_at,purge_after) values
('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null,'A NEWEST','2026','single-work','published','2026-08-03 12:00+00',null,null),
('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null,'A SECOND','2026','single-work','published','2026-08-03 11:00+00',null,null),
('83000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null,'A THIRD','2026','single-work','published','2026-08-03 10:00+00',null,null),
('83000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002',null,'B UNFOLLOWED','2026','single-work','published','2026-08-03 09:00+00',null,null),
('83000000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null,'C HISTORICAL','2026','single-work','published','2026-08-03 08:00+00',null,null),
('83000000-0000-4000-8000-000000000006','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null,'A DRAFT','2026','single-work','draft',null,null,null),
('83000000-0000-4000-8000-000000000007','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',null,'A NO PUBLIC COVER','2026','single-work','published','2026-08-03 07:00+00',null,null),
('83000000-0000-4000-8000-000000000008','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','A DELETED','2026','single-work','published','2026-08-03 06:00+00','2026-07-01','2026-07-31');

insert into public.work_images (id,work_id,private_object_path,public_object_path,original_filename,mime_type,file_size,pixel_width,pixel_height,sort_order,is_cover,uploaded_by_account_id,updated_by_account_id,upload_status,original_verified_at) values
('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001/84000000-0000-4000-8000-000000000001/original.jpg','82000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000001/1/84000000-0000-4000-8000-000000000001.jpg','a1.jpg','image/jpeg',10,100,200,0,true,'81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','ready',now()),
('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000002/84000000-0000-4000-8000-000000000002/original.jpg','82000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000002/1/84000000-0000-4000-8000-000000000002.jpg','a2.jpg','image/jpeg',10,100,200,0,true,'81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','ready',now()),
('84000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000003/84000000-0000-4000-8000-000000000003/original.jpg','82000000-0000-4000-8000-000000000001/83000000-0000-4000-8000-000000000003/1/84000000-0000-4000-8000-000000000003.jpg','a3.jpg','image/jpeg',10,100,200,0,true,'81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','ready',now()),
('84000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000002/83000000-0000-4000-8000-000000000004/84000000-0000-4000-8000-000000000004/original.jpg','82000000-0000-4000-8000-000000000002/83000000-0000-4000-8000-000000000004/1/84000000-0000-4000-8000-000000000004.jpg','b1.jpg','image/jpeg',10,100,200,0,true,'81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','ready',now()),
('84000000-0000-4000-8000-000000000005','83000000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000003/83000000-0000-4000-8000-000000000005/84000000-0000-4000-8000-000000000005/original.jpg','82000000-0000-4000-8000-000000000003/83000000-0000-4000-8000-000000000005/1/84000000-0000-4000-8000-000000000005.jpg','c1.jpg','image/jpeg',10,100,200,0,true,'81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','ready',now());

set constraints all immediate;
set constraints all deferred;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select count(*) from public.profile_follows$$,'42501',null,'anon cannot read private follows');
select throws_ok($$select * from public.list_following_feed()$$,'42501',null,'anon cannot execute Following feed');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,'active account can follow a published profile');
select results_eq($$select profile_id from public.profile_follows$$,$$values ('82000000-0000-4000-8000-000000000001'::uuid)$$,'active account reads only its own follows');
select throws_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001')$$,'23505',null,'duplicate follow fails');
select throws_ok($$insert into public.profile_follows(account_id,profile_id,created_at) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','2020-01-01')$$,'42501',null,'ordinary user cannot write an arbitrary follow timestamp');
select throws_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002')$$,'42501',null,'account cannot follow for another account');

reset role;
update public.public_profiles set publication_status='draft',published_at=null where id='82000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003')$$,'42501',null,'unpublished profile cannot be newly followed');
select throws_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000004')$$,'42501',null,'deleted profile cannot be newly followed');

reset role;
update public.public_profiles set publication_status='published',published_at=now() where id='82000000-0000-4000-8000-000000000003';
insert into public.profile_follows(account_id,profile_id) values
('81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003'),
('81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.profile_follows$$,$$values (1::bigint)$$,'another account cannot read the first account follow graph');
select lives_ok($$delete from public.profile_follows where account_id='81000000-0000-4000-8000-000000000001'$$,'another account delete cannot affect hidden follows');
select results_eq($$select count(*)::bigint from public.profile_follows$$,$$values (1::bigint)$$,'other account retains only its own relationship');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq(
  $$select title from public.list_following_feed()$$,
  $$values ('A NEWEST'::varchar),('A SECOND'::varchar),('A THIRD'::varchar),('C HISTORICAL'::varchar)$$,
  'feed is strict chronology, preserves three same-artist Works, and excludes unfollowed, draft, deleted, and coverless Works'
);
select results_eq(
  $$select title from public.list_following_feed('2026-08-03 11:00+00','83000000-0000-4000-8000-000000000002',13)$$,
  $$values ('A THIRD'::varchar),('C HISTORICAL'::varchar)$$,
  'cursor resumes after the exact published-at and stable Work ID pair'
);
select is_empty($$select public_object_path from public.list_following_feed() where public_object_path like 'private/%'$$,'feed never returns private image paths');

reset role;
update public.public_profiles set publication_status='draft',published_at=null where id='82000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.profile_follows where profile_id='82000000-0000-4000-8000-000000000003'$$,$$values (1::bigint)$$,'unpublished profile remains privately followed');
select is_empty($$select work_id from public.list_following_feed() where title='C HISTORICAL'$$,'unpublished followed profile contributes no feed content');

reset role;
update public.public_profiles set publication_status='published',published_at=now() where id='82000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select count(*)::bigint from public.list_following_feed() where title='C HISTORICAL'$$,$$values (1::bigint)$$,'republished still-followed profile contributes again');
select lives_ok($$delete from public.profile_follows where profile_id='82000000-0000-4000-8000-000000000003'$$,'active account can unfollow its own profile');
select is_empty($$select work_id from public.list_following_feed() where title='C HISTORICAL'$$,'unfollow removes future feed visibility immediately');

reset role;
insert into public.profile_follows(account_id,profile_id) values
('81000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001'),
('81000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is_empty($$select profile_id from public.profile_follows$$,'suspended account cannot read follows');
select throws_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002')$$,'42501',null,'suspended account cannot follow');
select is_empty($$select work_id from public.list_following_feed()$$,'suspended account has no feed');
select lives_ok($$delete from public.profile_follows where profile_id='82000000-0000-4000-8000-000000000001'$$,'suspended delete is safely ineffective');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$insert into public.profile_follows(account_id,profile_id) values ('81000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000002')$$,'42501',null,'disabled account cannot follow');
select is_empty($$select work_id from public.list_following_feed()$$,'disabled account has no feed');

select * from finish();
rollback;
