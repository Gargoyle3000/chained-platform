-- Safe authenticated readiness projection for managed Work publication.

create function private.get_managed_work_publication_readiness(target_work_id uuid)
returns table (
  state text,
  total_images bigint,
  ready_images bigint,
  processing_images bigint,
  failed_images bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  cover_count bigint;
  invalid_images bigint;
begin
  if (select auth.uid()) is null
     or not private.can_manage_work(target_work_id) then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  select * into work_row
    from public.works
   where id = target_work_id
     and deleted_at is null;

  if not found then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  with current_images as (
    select
      wi.id,
      wi.is_cover,
      wi.upload_status,
      wi.original_verified_at,
      wi.file_size,
      wi.private_object_path,
      exists (
        select 1
          from private.work_image_derivative_jobs job
         where job.work_image_id = wi.id
           and job.source_private_object_path = wi.private_object_path
           and job.state = 'failed'
      ) or exists (
        select 1
          from private.work_image_derivatives derivative
         where derivative.work_image_id = wi.id
           and derivative.source_private_object_path = wi.private_object_path
           and derivative.state = 'failed'
      ) as has_failure,
      exists (
        select 1
          from private.work_image_derivative_jobs job
         where job.work_image_id = wi.id
           and job.source_private_object_path = wi.private_object_path
           and job.state in ('pending', 'processing')
      ) or exists (
        select 1
          from private.work_image_derivatives derivative
         where derivative.work_image_id = wi.id
           and derivative.source_private_object_path = wi.private_object_path
           and derivative.state in ('pending', 'processing')
      ) as has_processing,
      (
        select count(distinct derivative.rendition_key)
          from private.work_image_derivatives derivative
         where derivative.work_image_id = wi.id
           and derivative.source_private_object_path = wi.private_object_path
           and derivative.rendition_key in ('small', 'large')
           and derivative.state = 'ready'
           and derivative.mime_type = 'image/webp'
      ) = 2 as derivative_pair_ready
    from public.work_images wi
    where wi.work_id = target_work_id
      and wi.deleted_at is null
  ), classified as (
    select
      is_cover,
      case
        when upload_status <> 'ready'
          or original_verified_at is null
          or file_size is null
          or private_object_path is null then 'invalid'
        when has_failure then 'failed'
        when derivative_pair_ready then 'ready'
        when has_processing then 'processing'
        else 'invalid'
      end as image_state
    from current_images
  )
  select
    count(*),
    count(*) filter (where image_state = 'ready'),
    count(*) filter (where image_state = 'processing'),
    count(*) filter (where image_state = 'failed'),
    count(*) filter (where image_state = 'invalid'),
    count(*) filter (where is_cover)
  into total_images, ready_images, processing_images, failed_images, invalid_images, cover_count
  from classified;

  state := case
    when nullif(btrim(coalesce(work_row.title, '')), '') is null
      or nullif(btrim(coalesce(work_row.year_label, '')), '') is null
      or work_row.year_sort is null
      or nullif(btrim(coalesce(work_row.work_type, '')), '') is null
      or total_images = 0
      or cover_count <> 1
      or invalid_images > 0
      or exists (
        select 1
          from public.work_publication_operations operation
         where operation.work_id = target_work_id
           and operation.status in ('pending', 'running', 'cleanup_pending')
      ) then 'prerequisite_invalid'
    when failed_images > 0 then 'failed'
    when ready_images = total_images then 'ready'
    else 'processing'
  end;

  return next;
end;
$$;

create function public.get_managed_work_publication_readiness(target_work_id uuid)
returns table (
  state text,
  total_images bigint,
  ready_images bigint,
  processing_images bigint,
  failed_images bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_managed_work_publication_readiness(target_work_id);
$$;

revoke all on function private.get_managed_work_publication_readiness(uuid) from public, anon;
revoke all on function public.get_managed_work_publication_readiness(uuid) from public, anon;
grant execute on function private.get_managed_work_publication_readiness(uuid) to authenticated;
grant execute on function public.get_managed_work_publication_readiness(uuid) to authenticated;

comment on function public.get_managed_work_publication_readiness(uuid) is
  'Safe aggregate publication readiness for an authenticated manager of one Work; exposes no media paths, jobs, or failure details.';
