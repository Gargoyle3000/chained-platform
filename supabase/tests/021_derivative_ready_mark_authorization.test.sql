begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_function('public', 'service_mark_work_image_upload', array['uuid','uuid','boolean','text','boolean','integer','integer'], 'named trusted ready-mark overload exists');
select ok(not has_function_privilege('anon', 'public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer)', 'EXECUTE'), 'anon cannot call trusted ready-mark');
select ok(not has_function_privilege('authenticated', 'public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer)', 'EXECUTE'), 'authenticated users cannot call trusted ready-mark');
select ok(has_function_privilege('service_role', 'public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer)', 'EXECUTE'), 'service role can call trusted ready-mark');
select is(
  (select array_to_string(proargnames, ',') collate "C" from pg_proc where oid = 'public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer)'::regprocedure),
  'target_image_id,actor_account_id,verified,failure_code,preview_failure,pixel_width,pixel_height'::text collate "C",
  'trusted ready-mark overload exposes the JSON parameter names used by the finalizer'
);
select * from finish();
rollback;
