-- Security migration coverage: 20261016130000_reconcile_public_table_acl.sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Explicit independent expected contract. Empty strings mean no column access.
-- The matrix checks all 31 tables x all three roles, including PUBLIC/inherited
-- privileges; it must fail if legacy table or column grants survive reconciliation.
create temporary table expected_direct_acl (
  table_name text not null, role_name text not null,
  select_columns text not null, insert_columns text not null,
  update_columns text not null, can_delete boolean not null,
  primary key (table_name, role_name)
);
insert into expected_direct_acl values
  ('accounts', 'anon', '', '', '', false),
  ('accounts', 'authenticated', 'account_plan,created_at,display_name,id,legacy_status,onboarding_acknowledged_version,status,updated_at', '', 'onboarding_acknowledged_version', false),
  ('accounts', 'service_role', '', '', '', false),
  ('account_roles', 'anon', '', '', '', false),
  ('account_roles', 'authenticated', 'account_id,granted_at,id,revoked_at,role', '', '', false),
  ('account_roles', 'service_role', '', '', '', false),
  ('public_profiles', 'anon', 'alternative_name,biography,city,claim_state,country,created_at,display_name,id,profile_type,pronouns,public_contact_email,publication_status,published_at,show_agenda,show_cv,show_presentations,show_press,show_works,slug,social_url,updated_at,website_url', '', '', false),
  ('public_profiles', 'authenticated', 'alternative_name,biography,city,claim_state,country,created_at,display_name,id,profile_type,pronouns,public_contact_email,publication_status,published_at,show_agenda,show_cv,show_presentations,show_press,show_works,slug,social_url,updated_at,website_url', '', 'alternative_name,biography,city,country,display_name,pronouns,public_contact_email,publication_status,show_agenda,show_cv,show_presentations,show_press,show_works,social_url,website_url', false),
  ('public_profiles', 'service_role', 'deleted_at,id,slug', '', '', false),
  ('profile_members', 'anon', '', '', '', false),
  ('profile_members', 'authenticated', 'account_id,created_at,granted_at,id,membership_level,profile_id,revoked_at,status,updated_at', '', '', false),
  ('profile_members', 'service_role', '', '', '', false),
  ('profile_relationships', 'anon', 'created_at,ends_on,from_profile_id,id,relationship_type,starts_on,status,to_profile_id,updated_at', '', '', false),
  ('profile_relationships', 'authenticated', 'created_at,ends_on,from_profile_id,id,relationship_type,starts_on,status,to_profile_id,updated_at', '', '', false),
  ('profile_relationships', 'service_role', '', '', '', false),
  ('profile_access_grants', 'anon', '', '', '', false),
  ('profile_access_grants', 'authenticated', 'created_at,expired_at,expires_at,granted_at,grantee_profile_id,grantor_profile_id,id,revoked_at,scope,status,updated_at', '', '', false),
  ('profile_access_grants', 'service_role', '', '', '', false),
  ('profile_claims', 'anon', '', '', '', false),
  ('profile_claims', 'authenticated', 'claimant_account_id,created_at,id,requested_at,resolved_at,status,target_profile_id,updated_at', '', '', false),
  ('profile_claims', 'service_role', '', '', '', false),
  ('audit_events', 'anon', '', '', '', false),
  ('audit_events', 'authenticated', '', '', '', false),
  ('audit_events', 'service_role', '', '', '', false),
  ('works', 'anon', 'additional_materials,collaborator_name,collaborator_url,created_at,depth,description,dimension_unit,duration_text,edition_text,format_discipline,height,id,owner_profile_id,photo_credit_name,photo_credit_url,primary_medium,profile_order,published_at,support_base,title,updated_at,visibility,width,work_type,year_label,year_sort', '', '', false),
  ('works', 'authenticated', 'additional_materials,collaborator_name,collaborator_url,created_at,depth,description,dimension_unit,duration_text,edition_text,format_discipline,height,id,owner_profile_id,photo_credit_name,photo_credit_url,primary_medium,profile_order,published_at,support_base,title,updated_at,visibility,width,work_type,year_label,year_sort', 'additional_materials,collaborator_name,collaborator_url,depth,description,dimension_unit,duration_text,edition_text,format_discipline,height,owner_profile_id,photo_credit_name,photo_credit_url,primary_medium,support_base,title,width,work_type,year_label,year_sort', 'additional_materials,collaborator_name,collaborator_url,depth,description,dimension_unit,duration_text,edition_text,format_discipline,height,photo_credit_name,photo_credit_url,primary_medium,support_base,title,width,work_type,year_label,year_sort', false),
  ('works', 'service_role', '', '', '', false),
  ('work_images', 'anon', 'created_at,file_size,id,is_cover,mime_type,pixel_height,pixel_width,public_object_path,sort_order,updated_at,work_id', '', '', false),
  ('work_images', 'authenticated', 'created_at,file_size,id,is_cover,mime_type,original_filename,pixel_height,pixel_width,public_object_path,sort_order,updated_at,work_id', 'file_size,id,is_cover,mime_type,original_filename,pixel_height,pixel_width,private_object_path,sort_order,work_id', 'original_filename,pixel_height,pixel_width', false),
  ('work_images', 'service_role', '', '', '', false),
  ('account_invitations', 'anon', '', '', '', false),
  ('account_invitations', 'authenticated', '', '', '', false),
  ('account_invitations', 'service_role', 'approved_account_plan,approved_roles,artist_workspace_display_name,artist_workspace_slug,created_at,email_normalized,expires_at,id,status', 'approved_account_plan,approved_by_account_id,approved_roles,artist_workspace_display_name,artist_workspace_slug,email_normalized', 'failure_code,status', false),
  ('work_publication_operations', 'anon', '', '', '', false),
  ('work_publication_operations', 'authenticated', '', '', '', false),
  ('work_publication_operations', 'service_role', '', '', '', false),
  ('work_publication_operation_images', 'anon', '', '', '', false),
  ('work_publication_operation_images', 'authenticated', '', '', '', false),
  ('work_publication_operation_images', 'service_role', '', '', '', false),
  ('profile_follows', 'anon', '', '', '', false),
  ('profile_follows', 'authenticated', 'account_id,created_at,profile_id', 'account_id,profile_id', '', true),
  ('profile_follows', 'service_role', '', '', '', false),
  ('profile_activities', 'anon', 'activity_type,city,country,description,end_date,external_url,id,owner_profile_id,published_at,show_in_presentations,start_date,title,updated_at,venue_name,visibility', '', '', false),
  ('profile_activities', 'authenticated', 'activity_type,city,country,created_at,deleted_at,description,end_date,external_url,id,include_in_cv,owner_profile_id,published_at,show_in_presentations,start_date,title,updated_at,venue_name,visibility', 'activity_type,city,country,description,end_date,external_url,include_in_cv,owner_profile_id,show_in_presentations,start_date,title,venue_name', 'activity_type,city,country,description,end_date,external_url,include_in_cv,show_in_presentations,start_date,title,venue_name,visibility', false),
  ('profile_activities', 'service_role', '', '', '', false),
  ('activity_occurrences', 'anon', 'activity_id,city_override,created_at,end_date,end_time,id,occurrence_type,owner_profile_id,published_at,show_in_agenda,start_date,start_time,time_zone,title_override,updated_at,venue_name_override,visibility', '', '', false),
  ('activity_occurrences', 'authenticated', 'activity_id,city_override,created_at,deleted_at,end_date,end_time,id,occurrence_type,owner_profile_id,published_at,show_in_agenda,show_in_presentation,start_date,start_time,time_zone,title_override,updated_at,venue_name_override,visibility', 'activity_id,city_override,end_date,end_time,occurrence_type,owner_profile_id,show_in_agenda,show_in_presentation,start_date,start_time,time_zone,title_override,venue_name_override', 'city_override,end_date,end_time,occurrence_type,show_in_agenda,show_in_presentation,start_date,start_time,time_zone,title_override,venue_name_override,visibility', false),
  ('activity_occurrences', 'service_role', '', '', '', false),
  ('cv_categories', 'anon', 'category_type,created_at,display_order,id,is_visible,label,profile_id,updated_at', '', '', false),
  ('cv_categories', 'authenticated', 'category_type,created_at,display_order,id,is_visible,label,profile_id,updated_at', 'category_type,display_order,is_visible,label,profile_id', 'display_order,is_visible,label', false),
  ('cv_categories', 'service_role', '', '', '', false),
  ('cv_entries', 'anon', 'category_id,created_at,display_order,id,is_visible,location_text,organization,source_activity_id,title,updated_at,url,year_label', '', '', false),
  ('cv_entries', 'authenticated', 'category_id,created_at,display_order,id,is_visible,location_text,organization,source_activity_id,title,updated_at,url,year_label', 'category_id,display_order,is_visible,location_text,organization,title,url,year_label', 'category_id,display_order,is_visible,location_text,organization,title,url,year_label', true),
  ('cv_entries', 'service_role', '', '', '', false),
  ('profile_press_items', 'anon', 'author,body,created_at,id,is_visible,owner_profile_id,title,updated_at,url,year_label', '', '', false),
  ('profile_press_items', 'authenticated', 'author,body,created_at,id,is_visible,owner_profile_id,title,updated_at,url,year_label', 'author,body,is_visible,owner_profile_id,title,url,year_label', 'author,body,is_visible,title,url,year_label', true),
  ('profile_press_items', 'service_role', '', '', '', false),
  ('archive_items', 'anon', '', '', '', false),
  ('archive_items', 'authenticated', 'account_id,created_at,origin,work_id', 'work_id', '', true),
  ('archive_items', 'service_role', '', '', '', false),
  ('archive_tags', 'anon', '', '', '', false),
  ('archive_tags', 'authenticated', 'account_id,created_at,id,name', 'name', '', true),
  ('archive_tags', 'service_role', '', '', '', false),
  ('archive_item_tags', 'anon', '', '', '', false),
  ('archive_item_tags', 'authenticated', 'account_id,tag_id,work_id', 'tag_id,work_id', '', true),
  ('archive_item_tags', 'service_role', '', '', '', false),
  ('archive_projects', 'anon', '', '', '', false),
  ('archive_projects', 'authenticated', 'account_id,created_at,description,id,publisher_profile_id,title,updated_at', 'description,title', 'description,title', true),
  ('archive_projects', 'service_role', '', '', '', false),
  ('archive_project_items', 'anon', '', '', '', false),
  ('archive_project_items', 'authenticated', 'account_id,added_at,position,project_id,work_id', '', '', false),
  ('archive_project_items', 'service_role', '', '', '', false),
  ('curated_collections', 'anon', 'description,id,published_at,publisher_profile_id,status,title', '', '', false),
  ('curated_collections', 'authenticated', 'created_at,description,id,project_id,published_at,publisher_profile_id,status,title,updated_at', '', '', false),
  ('curated_collections', 'service_role', '', '', '', false),
  ('work_publication_derivatives', 'anon', '', '', '', false),
  ('work_publication_derivatives', 'authenticated', '', '', '', false),
  ('work_publication_derivatives', 'service_role', '', '', '', false),
  ('presentation_participants', 'anon', 'created_at,display_name,id,is_visible,position,presentation_id,updated_at', '', '', false),
  ('presentation_participants', 'authenticated', 'created_at,display_name,id,is_visible,position,presentation_id,updated_at', '', '', false),
  ('presentation_participants', 'service_role', '', '', '', false),
  ('presentation_works', 'anon', 'created_at,id,is_visible,position,presentation_id,status,updated_at,work_id', '', '', false),
  ('presentation_works', 'authenticated', 'created_at,id,is_visible,position,presentation_id,status,updated_at,work_id', '', '', false),
  ('presentation_works', 'service_role', '', '', '', false),
  ('presentation_cooperators', 'anon', '', '', '', false),
  ('presentation_cooperators', 'authenticated', '', '', '', false),
  ('presentation_cooperators', 'service_role', '', '', '', false),
  ('presentation_participation_consents', 'anon', '', '', '', false),
  ('presentation_participation_consents', 'authenticated', '', '', '', false),
  ('presentation_participation_consents', 'service_role', '', '', '', false),
  ('presentation_agenda_images', 'anon', '', '', '', false),
  ('presentation_agenda_images', 'authenticated', '', '', '', false),
  ('presentation_agenda_images', 'service_role', '', '', '', false);


select results_eq(
  $$select c.relname::text collate "default" from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') order by c.relname$$,
  $$select distinct table_name from expected_direct_acl order by table_name$$,
  'the contract covers exactly the existing 31 public tables'
);
select is(count(*)::integer, 93, 'all 31 tables have expectations for all three roles')
from expected_direct_acl;

-- Effective relation privileges: only the listed RLS-controlled authenticated
-- DELETEs are table-level grants. SELECT/INSERT/UPDATE are always explicit columns.
select is(
  array(select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
    where has_table_privilege(e.role_name::name, c.oid, p) order by p),
  case when e.can_delete then array['DELETE'] else array[]::text[] end,
  e.role_name || ' has exact table-level privileges on ' || e.table_name
)
from expected_direct_acl e join pg_class c on c.oid=to_regclass('public.' || e.table_name)
order by e.table_name, e.role_name;

-- No subset checks: extra columns (including REFERENCES) fail just as missing
-- legitimate columns do. has_column_privilege includes whole-table, PUBLIC and
-- inherited privileges, rather than only looking at explicit attacl entries.
select is(
  array(select a.attname::text from pg_attribute a
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and has_column_privilege(e.role_name::name, c.oid, a.attname, p.operation)
    order by a.attname),
  string_to_array(p.columns, ','),
  e.role_name || ' has exact ' || p.operation || ' columns on ' || e.table_name
)
from expected_direct_acl e join pg_class c on c.oid=to_regclass('public.' || e.table_name)
cross join lateral (values ('SELECT',e.select_columns), ('INSERT',e.insert_columns),
  ('UPDATE',e.update_columns), ('REFERENCES','')) p(operation,columns)
order by e.table_name, e.role_name, p.operation;

select ok(
  not has_table_privilege(e.role_name::name, c.oid,
    'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION')
  and not exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    and has_column_privilege(e.role_name::name,c.oid,a.attname,
      'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')),
  e.role_name || ' cannot delegate table or column privileges on ' || e.table_name
)
from expected_direct_acl e join pg_class c on c.oid=to_regclass('public.' || e.table_name)
order by e.table_name, e.role_name;

-- Also catch newer relation privilege kinds such as MAINTAIN without requiring
-- that privilege name to be understood by an older local PostgreSQL version.
select ok(not exists (
  select 1 from expected_direct_acl e
  join pg_class c on c.oid=to_regclass('public.' || e.table_name)
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where acl.privilege_type <> 'DELETE'
    and case when acl.grantee=0 then true else pg_has_role(e.role_name::name,acl.grantee,'USAGE') end
), 'no other effective relation ACL kind survives, including inherited legacy grants');
select ok(not exists (
  select 1 from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where c.oid in (select to_regclass('public.' || table_name) from expected_direct_acl)
    and acl.grantee=0
  union all
  select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) acl
  where a.attrelid in (select to_regclass('public.' || table_name) from expected_direct_acl)
    and a.attnum>0 and not a.attisdropped and acl.grantee=0
), 'PUBLIC has no relation or column grants on the reconciled tables');
select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity)
  from pg_class c where c.oid in (select to_regclass('public.' || table_name) from expected_direct_acl)),
  'all 31 public tables retain ENABLE/FORCE RLS');

-- Synthetic service adapter fixtures only; all changes roll back.
insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','c5100000-0000-4000-8000-000000000001','authenticated','authenticated','acl-admin@example.test',now(),now()),
  ('00000000-0000-0000-0000-000000000000','c5100000-0000-4000-8000-000000000002','authenticated','authenticated','acl-member@example.test',now(),now());
insert into public.accounts (id,status,display_name) values
  ('c5100000-0000-4000-8000-000000000001','active','ACL ADMIN'),
  ('c5100000-0000-4000-8000-000000000002','active','ACL MEMBER');
insert into public.account_roles (account_id,role) values
  ('c5100000-0000-4000-8000-000000000001','private_member'),
  ('c5100000-0000-4000-8000-000000000001','admin'),
  ('c5100000-0000-4000-8000-000000000002','private_member');
insert into public.public_profiles (id,profile_type,slug,display_name,primary_controller_account_id,claimed_at)
values ('c5200000-0000-4000-8000-000000000001','artist','acl-existing-artist','ACL ARTIST','c5100000-0000-4000-8000-000000000001',now());

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select id from public.account_invitations$$,'42501',null,'anon cannot read invitations');
select throws_ok($$insert into public.account_invitations (email_normalized,approved_by_account_id)
  values ('acl-wrong-anon@example.test','c5100000-0000-4000-8000-000000000001')$$,
  '42501',null,'anon cannot approve invitations');
select throws_ok($$select deleted_at from public.public_profiles$$,'42501',null,'anon cannot use the service slug-lookup deletion column');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"c5100000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select id from public.account_invitations$$,'42501',null,'even an authenticated admin cannot read invitations directly');
select throws_ok($$insert into public.account_invitations (email_normalized,approved_by_account_id)
  values ('acl-wrong-admin@example.test','c5100000-0000-4000-8000-000000000001')$$,
  '42501',null,'authenticated admin still needs the trusted invitation adapter');
select throws_ok($$update public.account_invitations set status='sending'$$,
  '42501',null,'authenticated admin cannot claim dispatch directly');
select throws_ok($$select deleted_at from public.public_profiles$$,'42501',null,'authenticated cannot use the service-only deletion column');

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select results_eq($$select id from public.public_profiles where slug='acl-existing-artist' and deleted_at is null limit 1$$,
  $$values ('c5200000-0000-4000-8000-000000000001'::uuid)$$,
  'service slug collision lookup retains all projection/filter columns, including draft profiles');
select throws_ok($$select * from public.public_profiles$$,'42501',null,'service cannot read whole profiles');
select throws_ok($$select biography from public.public_profiles$$,'42501',null,'service cannot read unrelated profile columns');
select throws_ok($$update public.public_profiles set slug='unexpected'$$,'42501',null,'service cannot write profiles directly');
select lives_ok($$insert into public.account_invitations
  (email_normalized,approved_roles,approved_account_plan,artist_workspace_display_name,artist_workspace_slug,approved_by_account_id)
  values ('acl-new-artist@example.test',array['private_member','artist']::public.application_role[],'chained','ACL NEW ARTIST','acl-new-artist','c5100000-0000-4000-8000-000000000001')
  returning id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug$$,
  'service preserves the exact invite-account approval payload and returned projection');
select is((select count(*) from public.account_invitations where email_normalized='acl-new-artist@example.test'
  and status in ('approved','sending','sent')),1::bigint,'service approval actually persisted');
select lives_ok($$select id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug
  from public.account_invitations where email_normalized='acl-new-artist@example.test' and status in ('approved','sending','sent')
  order by created_at desc limit 1$$,'service preserves actionable email retry lookup and ordering');
select lives_ok($$select id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug
  from public.account_invitations where artist_workspace_slug='acl-new-artist' and status in ('approved','sending','sent')
  order by created_at desc limit 1$$,'service preserves actionable workspace slug conflict lookup');
select lives_ok($$select id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug
  from public.account_invitations where id=(select id from public.account_invitations where email_normalized='acl-new-artist@example.test') limit 1$$,
  'service preserves invitation re-read by ID');
select lives_ok($$update public.account_invitations set status='sending'
  where email_normalized='acl-new-artist@example.test' and status='approved'
  returning id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug$$,
  'service preserves dispatch claim and complete returning projection');
select is((select status::text from public.account_invitations where email_normalized='acl-new-artist@example.test'),
  'sending','service dispatch claim actually changed the invitation');
select lives_ok($$update public.account_invitations set status='failed',failure_code='auth_invite_failed'
  where email_normalized='acl-new-artist@example.test' and status in ('approved','sending','sent')$$,
  'service preserves the failure status/code write without SELECT on failure_code');
select is((select status::text from public.account_invitations where email_normalized='acl-new-artist@example.test'),
  'failed','service failure write actually changed the invitation');
select throws_ok($$insert into public.account_invitations (email_normalized,approved_by_account_id)
  values ('acl-wrong-approver@example.test','c5100000-0000-4000-8000-000000000002')$$,
  '42501',null,'service still cannot approve with a non-admin actor');
select throws_ok($$select * from public.account_invitations$$,'42501',null,'service has no whole-table invitation read');
select throws_ok($$select auth_user_id from public.account_invitations$$,'42501',null,'service cannot read unrelated invitation linkage columns');
select throws_ok($$update public.account_invitations set auth_user_id=null$$,'42501',null,'service cannot write Auth linkage directly');
select throws_ok($$delete from public.account_invitations$$,'42501',null,'service cannot delete invitation history');
select throws_ok($$select id from public.works$$,'42501',null,'service media flows have no direct Work access');
select throws_ok($$select id from public.work_images$$,'42501',null,'service media flows have no direct Work image access');
select throws_ok($$select presentation_id from public.presentation_agenda_images$$,'42501',null,'service Agenda flows have no direct Agenda image access');
select is(public.service_get_public_presentation_agenda_image('c5300000-0000-4000-8000-000000000001')::text,
  null::text,'service Agenda RPC still executes its definer-backed table read');

reset role;
select * from finish();
rollback;
