-- Phase 3A2: service-only, lease-bound broker context. No completion path is added.
create function private.service_get_work_image_derivative_claim_context(
  target_job_id uuid, expected_lease_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare job_row private.work_image_derivative_jobs%rowtype;
declare image_row public.work_images%rowtype;
begin
  select * into job_row from private.work_image_derivative_jobs where id = target_job_id;
  if not found or job_row.state <> 'processing' or job_row.lease_token is distinct from expected_lease_token
     or job_row.lease_expires_at <= statement_timestamp() then
    raise exception 'The derivative job lease is unavailable.' using errcode = '42501';
  end if;
  select * into image_row from public.work_images where id = job_row.work_image_id;
  if not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready'
     or image_row.original_verified_at is null or image_row.private_object_path <> job_row.source_private_object_path
     or image_row.pixel_width is null or image_row.pixel_height is null then
    raise exception 'The derivative source is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'source_private_object_path', job_row.source_private_object_path,
    'source_mime_type', image_row.mime_type,
    'pixel_width', image_row.pixel_width,
    'pixel_height', image_row.pixel_height,
    'small_staging_object_path', (select staging_object_path from private.work_image_derivatives where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path and rendition_key = 'small'),
    'large_staging_object_path', (select staging_object_path from private.work_image_derivatives where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path and rendition_key = 'large')
  );
end; $$;

create function public.service_get_work_image_derivative_claim_context(uuid, uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_get_work_image_derivative_claim_context($1, $2);
$$;
revoke all on function private.service_get_work_image_derivative_claim_context(uuid,uuid) from public, anon, authenticated;
revoke all on function public.service_get_work_image_derivative_claim_context(uuid,uuid) from public, anon, authenticated;
grant execute on function private.service_get_work_image_derivative_claim_context(uuid,uuid) to service_role;
grant execute on function public.service_get_work_image_derivative_claim_context(uuid,uuid) to service_role;
