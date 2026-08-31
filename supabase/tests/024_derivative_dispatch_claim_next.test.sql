begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_function('public', 'service_claim_next_work_image_derivative_job', 'unique broker-facing claim-next wrapper exists');
select ok(has_function_privilege('service_role', 'public.service_claim_next_work_image_derivative_job()', 'EXECUTE'), 'service role can claim next');
select ok(not has_function_privilege('anon', 'public.service_claim_next_work_image_derivative_job()', 'EXECUTE'), 'anon cannot claim next');
select ok(not has_function_privilege('authenticated', 'public.service_claim_next_work_image_derivative_job()', 'EXECUTE'), 'browser cannot claim next');

select * from finish();
rollback;
