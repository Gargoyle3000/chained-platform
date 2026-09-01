-- Trusted maintenance recovery for a terminal failed, current-source derivative job.
create function private.service_requeue_failed_work_image_derivatives(
  target_image_id uuid, authoritative_width integer, authoritative_height integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare image_row public.work_images%rowtype; job_row private.work_image_derivative_jobs%rowtype;
begin
  if authoritative_width <= 0 or authoritative_height <= 0 then raise exception 'Trusted dimensions are invalid.' using errcode='22023'; end if;
  select * into image_row from public.work_images where id=target_image_id for update;
  if not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready' or image_row.original_verified_at is null then raise exception 'The verified image is unavailable.' using errcode='42501'; end if;
  select * into job_row from private.work_image_derivative_jobs where work_image_id=image_row.id and source_private_object_path=image_row.private_object_path for update;
  if not found or job_row.state <> 'failed' then raise exception 'The failed derivative job is unavailable.' using errcode='55000'; end if;
  if exists(select 1 from private.work_image_derivatives where work_image_id=image_row.id and source_private_object_path=image_row.private_object_path and state='ready') then raise exception 'A ready derivative set cannot be recovered.' using errcode='55000'; end if;
  if (select count(*) from private.work_image_derivatives where work_image_id=image_row.id and source_private_object_path=image_row.private_object_path and rendition_key in ('small','large')) <> 2 then raise exception 'The derivative set is unavailable.' using errcode='55000'; end if;
  update public.work_images set pixel_width=authoritative_width,pixel_height=authoritative_height,updated_at=statement_timestamp() where id=image_row.id;
  update private.work_image_derivatives set state='pending',mime_type=null,file_size=null,pixel_width=null,pixel_height=null,checksum_sha256=null,pipeline_version=null,icc_profile_version=null,verified_at=null,completed_at=null,failure_code=null,failure_detail=null where work_image_id=image_row.id and source_private_object_path=image_row.private_object_path;
  update private.work_image_derivative_jobs set state='pending',attempt_count=0,available_at=statement_timestamp(),lease_token=null,lease_expires_at=null,claimed_at=null,completed_at=null,failure_code=null,failure_detail=null where id=job_row.id;
  insert into public.audit_events(actor_account_id,action,target_type,target_id,result,correlation_id,metadata) values(job_row.requested_by_account_id,'work_image.derivative_requeued','work_image',image_row.id,'pending',job_row.id,jsonb_build_object('work_id',image_row.work_id,'pixel_width',authoritative_width,'pixel_height',authoritative_height));
  return jsonb_build_object('status','pending','job_id',job_row.id);
end; $$;
create function public.service_requeue_failed_work_image_derivatives(target_image_id uuid, authoritative_width integer, authoritative_height integer) returns jsonb language sql security invoker set search_path='' as $$ select private.service_requeue_failed_work_image_derivatives(target_image_id,authoritative_width,authoritative_height); $$;
revoke all on function private.service_requeue_failed_work_image_derivatives(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.service_requeue_failed_work_image_derivatives(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.service_requeue_failed_work_image_derivatives(uuid,integer,integer) to service_role;
grant execute on function public.service_requeue_failed_work_image_derivatives(uuid,integer,integer) to service_role;
