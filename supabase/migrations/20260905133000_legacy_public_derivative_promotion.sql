-- One-time service-only promotion of already verified legacy derivative pairs.
-- It preserves the Work's existing publication revision and historic public object.

create function private.service_legacy_public_derivative_promotion_plan(
  target_work_id uuid,
  target_image_id uuid,
  expected_publication_revision uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  image_row public.work_images%rowtype;
  publish_operation public.work_publication_operations%rowtype;
  small_row private.work_image_derivatives%rowtype;
  large_row private.work_image_derivatives%rowtype;
  expected_small_path text;
  expected_large_path text;
  existing_count integer;
begin
  select * into work_row from public.works where id = target_work_id for update;
  if not found or work_row.deleted_at is not null or work_row.visibility <> 'published'
     or work_row.publication_revision is distinct from expected_publication_revision then
    raise exception 'The published Work revision is unavailable.' using errcode = '42501';
  end if;

  select * into image_row from public.work_images
   where id = target_image_id and work_id = target_work_id for update;
  if not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready'
     or image_row.original_verified_at is null or image_row.public_object_path is null then
    raise exception 'The published image is unavailable.' using errcode = '42501';
  end if;

  expected_small_path := lower(work_row.owner_profile_id::text) || '/' || lower(target_work_id::text)
    || '/' || lower(expected_publication_revision::text) || '/' || lower(target_image_id::text) || '/small.webp';
  expected_large_path := replace(expected_small_path, '/small.webp', '/large.webp');

  select * into small_row from private.work_image_derivatives
   where work_image_id = target_image_id and source_private_object_path = image_row.private_object_path
     and rendition_key = 'small' and state = 'ready' and mime_type = 'image/webp'
     and file_size is not null and pixel_width is not null and pixel_height is not null
     and checksum_sha256 is not null and verified_at is not null;
  select * into large_row from private.work_image_derivatives
   where work_image_id = target_image_id and source_private_object_path = image_row.private_object_path
     and rendition_key = 'large' and state = 'ready' and mime_type = 'image/webp'
     and file_size is not null and pixel_width is not null and pixel_height is not null
     and checksum_sha256 is not null and verified_at is not null;
  if small_row.id is null or large_row.id is null then
    raise exception 'The current derivative pair is unavailable.' using errcode = '55000';
  end if;

  if not exists (select 1 from storage.objects where bucket_id = 'work-derivative-staging' and name = small_row.staging_object_path)
     or not exists (select 1 from storage.objects where bucket_id = 'work-derivative-staging' and name = large_row.staging_object_path) then
    raise exception 'The verified staging derivative pair is unavailable.' using errcode = '55000';
  end if;

  select * into publish_operation from public.work_publication_operations
   where work_id = target_work_id and operation_kind = 'publish' and status = 'succeeded'
     and publication_revision = expected_publication_revision
   order by finished_at desc nulls last, id desc
   limit 1;
  if publish_operation.id is null then
    raise exception 'The historic publication operation is unavailable.' using errcode = '55000';
  end if;

  select count(*) into existing_count from public.work_publication_derivatives
   where work_image_id = target_image_id and publication_revision = expected_publication_revision;
  if existing_count = 2 then
    if image_row.public_object_path = expected_small_path
       and exists (select 1 from public.work_publication_derivatives where operation_id = publish_operation.id and publication_revision = expected_publication_revision and work_image_id = target_image_id and rendition_key = 'small' and source_derivative_id = small_row.id and public_object_path = expected_small_path and mime_type = 'image/webp' and file_size = small_row.file_size and pixel_width = small_row.pixel_width and pixel_height = small_row.pixel_height and copy_status = 'created')
       and exists (select 1 from public.work_publication_derivatives where operation_id = publish_operation.id and publication_revision = expected_publication_revision and work_image_id = target_image_id and rendition_key = 'large' and source_derivative_id = large_row.id and public_object_path = expected_large_path and mime_type = 'image/webp' and file_size = large_row.file_size and pixel_width = large_row.pixel_width and pixel_height = large_row.pixel_height and copy_status = 'created') then
      return jsonb_build_object('status', 'already_promoted', 'work_id', target_work_id, 'image_id', target_image_id, 'publication_revision', expected_publication_revision, 'small', jsonb_build_object('staging_object_path', small_row.staging_object_path, 'public_object_path', expected_small_path, 'mime_type', small_row.mime_type, 'file_size', small_row.file_size, 'pixel_width', small_row.pixel_width, 'pixel_height', small_row.pixel_height, 'checksum_sha256', small_row.checksum_sha256), 'large', jsonb_build_object('staging_object_path', large_row.staging_object_path, 'public_object_path', expected_large_path, 'mime_type', large_row.mime_type, 'file_size', large_row.file_size, 'pixel_width', large_row.pixel_width, 'pixel_height', large_row.pixel_height, 'checksum_sha256', large_row.checksum_sha256));
    end if;
    raise exception 'The existing derivative public state conflicts with promotion.' using errcode = '55000';
  elsif existing_count <> 0 then
    raise exception 'The existing derivative public state conflicts with promotion.' using errcode = '55000';
  end if;

  if image_row.public_object_path = expected_small_path then
    raise exception 'The current public image state conflicts with promotion.' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.work_publication_operations
     where work_id = target_work_id and status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'A conflicting media operation is active.' using errcode = '55000';
  end if;

  return jsonb_build_object('status', 'ready_to_promote', 'work_id', target_work_id, 'image_id', target_image_id, 'publication_revision', expected_publication_revision, 'small', jsonb_build_object('staging_object_path', small_row.staging_object_path, 'public_object_path', expected_small_path, 'mime_type', small_row.mime_type, 'file_size', small_row.file_size, 'pixel_width', small_row.pixel_width, 'pixel_height', small_row.pixel_height, 'checksum_sha256', small_row.checksum_sha256), 'large', jsonb_build_object('staging_object_path', large_row.staging_object_path, 'public_object_path', expected_large_path, 'mime_type', large_row.mime_type, 'file_size', large_row.file_size, 'pixel_width', large_row.pixel_width, 'pixel_height', large_row.pixel_height, 'checksum_sha256', large_row.checksum_sha256));
end;
$$;

create function private.service_finalize_legacy_public_derivative_promotion(
  target_work_id uuid,
  target_image_id uuid,
  expected_publication_revision uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan jsonb;
  publish_operation_id uuid;
  small_derivative_id uuid;
  large_derivative_id uuid;
begin
  plan := private.service_legacy_public_derivative_promotion_plan(target_work_id, target_image_id, expected_publication_revision);
  if plan->>'status' = 'already_promoted' then return plan; end if;

  if not exists (select 1 from storage.objects where bucket_id = 'work-public' and name = plan->'small'->>'public_object_path')
     or not exists (select 1 from storage.objects where bucket_id = 'work-public' and name = plan->'large'->>'public_object_path') then
    raise exception 'The verified public derivative pair is unavailable.' using errcode = '55000';
  end if;

  select id into publish_operation_id from public.work_publication_operations
   where work_id = target_work_id and operation_kind = 'publish' and status = 'succeeded' and publication_revision = expected_publication_revision
   order by finished_at desc nulls last, id desc limit 1;
  select id into small_derivative_id from private.work_image_derivatives
   where work_image_id = target_image_id and source_private_object_path = (select private_object_path from public.work_images where id = target_image_id)
     and rendition_key = 'small' and state = 'ready';
  select id into large_derivative_id from private.work_image_derivatives
   where work_image_id = target_image_id and source_private_object_path = (select private_object_path from public.work_images where id = target_image_id)
     and rendition_key = 'large' and state = 'ready';

  insert into public.work_publication_derivatives (operation_id, publication_revision, work_image_id, rendition_key, source_derivative_id, public_object_path, mime_type, file_size, pixel_width, pixel_height, copy_status)
  values
    (publish_operation_id, expected_publication_revision, target_image_id, 'small', small_derivative_id, plan->'small'->>'public_object_path', 'image/webp', (plan->'small'->>'file_size')::bigint, (plan->'small'->>'pixel_width')::integer, (plan->'small'->>'pixel_height')::integer, 'created'),
    (publish_operation_id, expected_publication_revision, target_image_id, 'large', large_derivative_id, plan->'large'->>'public_object_path', 'image/webp', (plan->'large'->>'file_size')::bigint, (plan->'large'->>'pixel_width')::integer, (plan->'large'->>'pixel_height')::integer, 'created');

  update public.work_images set public_object_path = plan->'small'->>'public_object_path', updated_at = statement_timestamp()
   where id = target_image_id and work_id = target_work_id and public_object_path is distinct from plan->'small'->>'public_object_path';

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
  select uploaded_by_account_id, 'work_image.legacy_public_derivative_promoted', 'work_image', id, 'succeeded', publish_operation_id,
         jsonb_build_object('work_id', work_id, 'publication_revision', expected_publication_revision)
    from public.work_images where id = target_image_id;
  return jsonb_build_object('status', 'promoted', 'work_id', target_work_id, 'image_id', target_image_id, 'publication_revision', expected_publication_revision);
end;
$$;

create or replace function private.service_list_work_publication_cleanup_paths(target_operation_id uuid, actor_account_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('public_object_path', path)), '[]'::jsonb)
    from (
      select d.public_object_path as path
        from public.work_publication_derivatives d
        join public.work_publication_operations derivative_publish on derivative_publish.id = d.operation_id
       join public.work_publication_operations target on target.publication_revision = d.publication_revision
       where target.id = target_operation_id
         and derivative_publish.work_id = target.work_id
         and private.account_can_manage_work($2, target.work_id)
      union
      select snapshot.public_object_path as path
        from public.work_publication_operation_images snapshot
       join public.work_publication_operations target on target.id = target_operation_id
       where snapshot.operation_id = target_operation_id
         and private.account_can_manage_work($2, target.work_id)
      union
      select historic.public_object_path as path
        from public.work_publication_operation_images historic
        join public.work_publication_operations published on published.id = historic.operation_id
        join public.work_publication_operations target on target.id = target_operation_id
       where published.work_id = target.work_id
         and published.operation_kind = 'publish'
         and published.status = 'succeeded'
         and published.publication_revision = target.publication_revision
         and private.account_can_manage_work($2, target.work_id)
    ) paths;
$$;

create function public.service_legacy_public_derivative_promotion_plan(uuid, uuid, uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_legacy_public_derivative_promotion_plan($1, $2, $3);
$$;
create function public.service_finalize_legacy_public_derivative_promotion(uuid, uuid, uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_finalize_legacy_public_derivative_promotion($1, $2, $3);
$$;

revoke all on function private.service_legacy_public_derivative_promotion_plan(uuid,uuid,uuid), private.service_finalize_legacy_public_derivative_promotion(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.service_legacy_public_derivative_promotion_plan(uuid,uuid,uuid), public.service_finalize_legacy_public_derivative_promotion(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function private.service_legacy_public_derivative_promotion_plan(uuid,uuid,uuid), private.service_finalize_legacy_public_derivative_promotion(uuid,uuid,uuid) to service_role;
grant execute on function public.service_legacy_public_derivative_promotion_plan(uuid,uuid,uuid), public.service_finalize_legacy_public_derivative_promotion(uuid,uuid,uuid) to service_role;
