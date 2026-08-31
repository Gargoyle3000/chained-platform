begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select is((select array_to_string(proargnames, ',') from pg_proc where oid = 'public.service_claim_work_image_derivative_job(uuid)'::regprocedure), 'target_job_id', 'CLAIM exposes its PostgREST JSON argument');
select is((select array_to_string(proargnames, ',') from pg_proc where oid = 'public.service_get_work_image_derivative_claim_context(uuid,uuid)'::regprocedure), 'target_job_id,expected_lease_token', 'claim context exposes its PostgREST JSON arguments');
select is((select array_to_string(proargnames, ',') from pg_proc where oid = 'public.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean)'::regprocedure), 'target_job_id,expected_lease_token,sanitized_failure_code,sanitized_failure_detail,retryable', 'FAIL exposes its PostgREST JSON arguments');
select is((select array_to_string(proargnames, ',') from pg_proc where oid = 'public.service_complete_work_image_derivative_job(uuid,uuid,text,text,bigint,integer,integer,text,bigint,integer,integer,text)'::regprocedure), 'target_job_id,expected_lease_token,pipeline,icc_profile,small_file_size,small_width,small_height,small_checksum,large_file_size,large_width,large_height,large_checksum', 'COMPLETE exposes its PostgREST JSON arguments');

select ok(has_function_privilege('service_role', 'public.service_claim_work_image_derivative_job(uuid)', 'EXECUTE'), 'service role can claim');
select ok(has_function_privilege('service_role', 'public.service_get_work_image_derivative_claim_context(uuid,uuid)', 'EXECUTE'), 'service role can read claim context');
select ok(has_function_privilege('service_role', 'public.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'service role can fail');
select ok(has_function_privilege('service_role', 'public.service_complete_work_image_derivative_job(uuid,uuid,text,text,bigint,integer,integer,text,bigint,integer,integer,text)', 'EXECUTE'), 'service role can complete');
select ok(not has_function_privilege('anon', 'public.service_claim_work_image_derivative_job(uuid)', 'EXECUTE'), 'anon cannot claim');
select ok(not has_function_privilege('anon', 'public.service_get_work_image_derivative_claim_context(uuid,uuid)', 'EXECUTE'), 'anon cannot read context');
select ok(not has_function_privilege('anon', 'public.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'anon cannot fail');
select ok(not has_function_privilege('anon', 'public.service_complete_work_image_derivative_job(uuid,uuid,text,text,bigint,integer,integer,text,bigint,integer,integer,text)', 'EXECUTE'), 'anon cannot complete');
select ok(not has_function_privilege('authenticated', 'public.service_claim_work_image_derivative_job(uuid)', 'EXECUTE'), 'browser cannot claim');
select ok(not has_function_privilege('authenticated', 'public.service_get_work_image_derivative_claim_context(uuid,uuid)', 'EXECUTE'), 'browser cannot read context');
select ok(not has_function_privilege('authenticated', 'public.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'browser cannot fail');
select ok(not has_function_privilege('authenticated', 'public.service_complete_work_image_derivative_job(uuid,uuid,text,text,bigint,integer,integer,text,bigint,integer,integer,text)', 'EXECUTE'), 'browser cannot complete');
select * from finish();
rollback;
