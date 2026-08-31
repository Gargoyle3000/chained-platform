-- Expose the existing atomic no-argument claim primitive to the trusted broker
-- without adding another overload to the targeted-claim RPC.
create function public.service_claim_next_work_image_derivative_job()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.service_claim_work_image_derivative_job();
$$;

revoke all on function public.service_claim_next_work_image_derivative_job() from public, anon, authenticated;
grant execute on function public.service_claim_next_work_image_derivative_job() to service_role;
