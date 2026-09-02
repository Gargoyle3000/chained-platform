create function private.service_backfill_legacy_work_image_derivatives(target_image_id uuid, authoritative_width integer, authoritative_height integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare image_row public.work_images%rowtype; job_id uuid;
begin
  if authoritative_width <= 0 or authoritative_height <= 0 then raise exception 'Trusted dimensions are invalid.' using errcode='22023'; end if;
  select * into image_row from public.work_images where id=target_image_id for update;
  if not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready' or image_row.original_verified_at is null then raise exception 'The verified image is unavailable.' using errcode='42501'; end if;
  if exists(select 1 from private.work_image_derivative_jobs where work_image_id=image_row.id) then raise exception 'A derivative lifecycle already exists.' using errcode='55000'; end if;
  if exists(select 1 from private.work_image_derivatives where work_image_id=image_row.id) then raise exception 'A derivative lifecycle already exists.' using errcode='55000'; end if;
  update public.work_images set pixel_width=authoritative_width,pixel_height=authoritative_height,updated_at=statement_timestamp() where id=image_row.id;
  insert into private.work_image_derivative_jobs(work_image_id,source_private_object_path,requested_by_account_id) values(image_row.id,image_row.private_object_path,image_row.uploaded_by_account_id) returning id into job_id;
  insert into private.work_image_derivatives(work_image_id,source_private_object_path,rendition_key,staging_object_path) values
    (image_row.id,image_row.private_object_path,'small',regexp_replace(image_row.private_object_path,'/original[.][^/]+$','/public-derivatives/small.webp')),
    (image_row.id,image_row.private_object_path,'large',regexp_replace(image_row.private_object_path,'/original[.][^/]+$','/public-derivatives/large.webp'));
  insert into public.audit_events(actor_account_id,action,target_type,target_id,result,correlation_id,metadata) values(image_row.uploaded_by_account_id,'work_image.derivative_legacy_backfilled','work_image',image_row.id,'pending',job_id,jsonb_build_object('work_id',image_row.work_id,'pixel_width',authoritative_width,'pixel_height',authoritative_height));
  return jsonb_build_object('status','pending','job_id',job_id);
end; $$;
create function public.service_backfill_legacy_work_image_derivatives(uuid,integer,integer) returns jsonb language sql security invoker set search_path='' as $$ select private.service_backfill_legacy_work_image_derivatives($1,$2,$3); $$;
revoke all on function private.service_backfill_legacy_work_image_derivatives(uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.service_backfill_legacy_work_image_derivatives(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.service_backfill_legacy_work_image_derivatives(uuid,integer,integer) to service_role;
grant execute on function public.service_backfill_legacy_work_image_derivatives(uuid,integer,integer) to service_role;
