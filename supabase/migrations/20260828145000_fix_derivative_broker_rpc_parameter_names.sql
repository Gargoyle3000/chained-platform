-- Phase 3C: PostgREST resolves RPC JSON by parameter name. Preserve the
-- service-only derivative lifecycle while naming broker-facing public wrappers.
create or replace function public.service_claim_work_image_derivative_job(target_job_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_claim_work_image_derivative_job(target_job_id);
$$;

create or replace function public.service_get_work_image_derivative_claim_context(target_job_id uuid, expected_lease_token uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_get_work_image_derivative_claim_context(target_job_id, expected_lease_token);
$$;

create or replace function public.service_fail_work_image_derivative_job(
  target_job_id uuid, expected_lease_token uuid, sanitized_failure_code text,
  sanitized_failure_detail text, retryable boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_fail_work_image_derivative_job(target_job_id, expected_lease_token, sanitized_failure_code, sanitized_failure_detail, retryable);
$$;

create or replace function public.service_complete_work_image_derivative_job(
  target_job_id uuid, expected_lease_token uuid, pipeline text, icc_profile text,
  small_file_size bigint, small_width integer, small_height integer, small_checksum text,
  large_file_size bigint, large_width integer, large_height integer, large_checksum text
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_complete_work_image_derivative_job(
    target_job_id, expected_lease_token, pipeline, icc_profile,
    small_file_size, small_width, small_height, small_checksum,
    large_file_size, large_width, large_height, large_checksum
  );
$$;

revoke all on function public.service_claim_work_image_derivative_job(uuid) from public, anon, authenticated;
revoke all on function public.service_get_work_image_derivative_claim_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_fail_work_image_derivative_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text) from public, anon, authenticated;
grant execute on function public.service_claim_work_image_derivative_job(uuid) to service_role;
grant execute on function public.service_get_work_image_derivative_claim_context(uuid, uuid) to service_role;
grant execute on function public.service_fail_work_image_derivative_job(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text) to service_role;
