-- Phase 3A1: internal derivative-job leasing and retry lifecycle. No worker or
-- browser-facing capability is introduced here.

create function private.service_claim_work_image_derivative_job(target_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job_row private.work_image_derivative_jobs%rowtype;
declare image_row public.work_images%rowtype;
declare failure text;
begin
  select * into job_row from private.work_image_derivative_jobs where id = target_job_id for update;
  if not found then return jsonb_build_object('status', 'empty'); end if;
  if job_row.state = 'processing' and job_row.lease_expires_at > statement_timestamp() then
    raise exception 'The derivative job is already leased.' using errcode = '42501';
  end if;
  if not ((job_row.state = 'pending' and job_row.available_at <= statement_timestamp())
       or (job_row.state = 'processing' and job_row.lease_expires_at <= statement_timestamp())) then
    return jsonb_build_object('status', 'empty');
  end if;

  select * into image_row from public.work_images where id = job_row.work_image_id for update;
  failure := case
    when not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready'
      or image_row.original_verified_at is null or image_row.private_object_path <> job_row.source_private_object_path
      then 'source_obsolete'
    when image_row.pixel_width is null or image_row.pixel_height is null then 'trusted_dimensions_unavailable'
    else null end;
  if failure is not null then
    update private.work_image_derivative_jobs set state = 'failed', lease_token = null, lease_expires_at = null,
      completed_at = statement_timestamp(), failure_code = failure,
      failure_detail = case when failure = 'source_obsolete' then 'The verified source is no longer current.' else 'Trusted source dimensions are unavailable.' end
      where id = job_row.id;
    update private.work_image_derivatives set state = 'failed', completed_at = statement_timestamp(), failure_code = failure,
      failure_detail = case when failure = 'source_obsolete' then 'The verified source is no longer current.' else 'Trusted source dimensions are unavailable.' end
      where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
    insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
    values (job_row.requested_by_account_id, 'work_image.derivative_failed', 'work_image', job_row.work_image_id, 'failed', job_row.id, jsonb_build_object('failure_code', failure));
    return jsonb_build_object('status', 'obsolete', 'job_id', job_row.id);
  end if;
  if job_row.attempt_count >= job_row.max_attempts then
    update private.work_image_derivative_jobs set state = 'failed', lease_token = null, lease_expires_at = null,
      completed_at = statement_timestamp(), failure_code = 'attempt_limit_reached', failure_detail = 'The retry limit was reached.' where id = job_row.id;
    return jsonb_build_object('status', 'failed', 'job_id', job_row.id);
  end if;

  update private.work_image_derivative_jobs set state = 'processing', attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(), lease_expires_at = statement_timestamp() + interval '5 minutes',
    claimed_at = statement_timestamp(), completed_at = null, failure_code = null, failure_detail = null
    where id = job_row.id returning * into job_row;
  update private.work_image_derivatives set state = 'processing', completed_at = null, failure_code = null, failure_detail = null
    where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id, metadata)
  values (job_row.requested_by_account_id, 'work_image.derivative_claimed', 'work_image', job_row.work_image_id, job_row.id, jsonb_build_object('attempt', job_row.attempt_count));
  return jsonb_build_object('status', 'processing', 'job_id', job_row.id, 'lease_token', job_row.lease_token, 'lease_expires_at', job_row.lease_expires_at);
end; $$;

create or replace function private.service_claim_work_image_derivative_job()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare candidate uuid;
begin
  select id into candidate from private.work_image_derivative_jobs
   where (state = 'pending' and available_at <= statement_timestamp()) or (state = 'processing' and lease_expires_at <= statement_timestamp())
   order by available_at, created_at for update skip locked limit 1;
  if candidate is null then return jsonb_build_object('status', 'empty'); end if;
  return private.service_claim_work_image_derivative_job(candidate);
end; $$;

create function private.service_fail_work_image_derivative_job(
  target_job_id uuid, expected_lease_token uuid, sanitized_failure_code text, sanitized_failure_detail text, retryable boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare job_row private.work_image_derivative_jobs%rowtype;
declare safe_code text := left(coalesce(nullif(trim(sanitized_failure_code), ''), 'processing_failed'), 80);
declare safe_detail text := left(coalesce(nullif(trim(sanitized_failure_detail), ''), 'The derivative processor failed.'), 240);
declare retry_at timestamptz;
begin
  select * into job_row from private.work_image_derivative_jobs where id = target_job_id for update;
  if not found or job_row.state <> 'processing' or job_row.lease_token is distinct from expected_lease_token or job_row.lease_expires_at <= statement_timestamp() then
    raise exception 'The derivative job lease is unavailable.' using errcode = '42501';
  end if;
  if retryable and job_row.attempt_count < job_row.max_attempts then
    retry_at := statement_timestamp() + case job_row.attempt_count when 1 then interval '1 minute' when 2 then interval '10 minutes' else interval '10 minutes' end;
    update private.work_image_derivative_jobs set state = 'pending', lease_token = null, lease_expires_at = null, claimed_at = null,
      completed_at = null, available_at = retry_at, failure_code = safe_code, failure_detail = safe_detail where id = job_row.id;
    update private.work_image_derivatives set state = 'pending', completed_at = null, failure_code = safe_code, failure_detail = safe_detail
      where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
    insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
    values (job_row.requested_by_account_id, 'work_image.derivative_retry', 'work_image', job_row.work_image_id, 'pending', job_row.id, jsonb_build_object('failure_code', safe_code, 'attempt', job_row.attempt_count));
    return jsonb_build_object('status', 'pending', 'job_id', job_row.id, 'available_at', retry_at);
  end if;
  update private.work_image_derivative_jobs set state = 'failed', lease_token = null, lease_expires_at = null,
    completed_at = statement_timestamp(), failure_code = safe_code, failure_detail = safe_detail where id = job_row.id;
  update private.work_image_derivatives set state = 'failed', completed_at = statement_timestamp(), failure_code = safe_code, failure_detail = safe_detail
    where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
  values (job_row.requested_by_account_id, 'work_image.derivative_failed', 'work_image', job_row.work_image_id, 'failed', job_row.id, jsonb_build_object('failure_code', safe_code));
  return jsonb_build_object('status', 'failed', 'job_id', job_row.id);
end; $$;

create or replace function private.service_fail_work_image_derivative_job(
  target_job_id uuid, expected_lease_token uuid, sanitized_failure_code text, sanitized_failure_detail text default null
) returns jsonb language sql security definer set search_path = '' as $$ select private.service_fail_work_image_derivative_job($1,$2,$3,$4,false); $$;

create function private.service_reconcile_work_image_derivative_jobs(max_jobs integer default 25)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('status', 'ok', 'job_ids', coalesce(jsonb_agg(id), '[]'::jsonb))
  from (
    select id from private.work_image_derivative_jobs
    where ((state = 'pending' and available_at <= statement_timestamp()) or (state = 'processing' and lease_expires_at <= statement_timestamp()))
    order by available_at, created_at limit greatest(1, least(coalesce(max_jobs,25),25))
  ) eligible;
$$;

create function public.service_claim_work_image_derivative_job(uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.service_claim_work_image_derivative_job($1); $$;
create function public.service_fail_work_image_derivative_job(uuid, uuid, text, text, boolean) returns jsonb language sql security invoker set search_path = '' as $$ select private.service_fail_work_image_derivative_job($1,$2,$3,$4,$5); $$;
create function public.service_reconcile_work_image_derivative_jobs(integer) returns jsonb language sql security invoker set search_path = '' as $$ select private.service_reconcile_work_image_derivative_jobs($1); $$;

revoke all on function private.service_claim_work_image_derivative_job(uuid) from public, anon, authenticated;
revoke all on function private.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function private.service_reconcile_work_image_derivative_jobs(integer) from public, anon, authenticated;
revoke all on function public.service_claim_work_image_derivative_job(uuid) from public, anon, authenticated;
revoke all on function public.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.service_reconcile_work_image_derivative_jobs(integer) from public, anon, authenticated;
grant execute on function private.service_claim_work_image_derivative_job(uuid) to service_role;
grant execute on function private.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean) to service_role;
grant execute on function private.service_reconcile_work_image_derivative_jobs(integer) to service_role;
grant execute on function public.service_claim_work_image_derivative_job(uuid) to service_role;
grant execute on function public.service_fail_work_image_derivative_job(uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.service_reconcile_work_image_derivative_jobs(integer) to service_role;
