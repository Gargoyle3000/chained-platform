-- Phase 3: private, server-owned derivative staging. Publication remains unchanged.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-derivative-staging', 'work-derivative-staging', false, 52428800, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/webp'];

-- This overload is called only by the trusted finalizer. It preserves successful
-- original/preview completion even when derivative preparation is unavailable.
create function private.service_mark_work_image_upload(
  target_image_id uuid, actor_account_id uuid, verified boolean, failure_code text,
  preview_failure boolean, trusted_pixel_width integer, trusted_pixel_height integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result := private.service_mark_work_image_upload(target_image_id, actor_account_id, verified, failure_code, preview_failure);
  if verified and result->>'status' = 'ready' then
    if trusted_pixel_width is not null and trusted_pixel_height is not null and trusted_pixel_width > 0 and trusted_pixel_height > 0 then
      update public.work_images set pixel_width = trusted_pixel_width, pixel_height = trusted_pixel_height where id = target_image_id;
    end if;
    perform private.service_enqueue_work_image_derivatives(target_image_id, actor_account_id);
  end if;
  return result;
end; $$;

create function public.service_mark_work_image_upload(
  uuid, uuid, boolean, text, boolean, integer, integer
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_mark_work_image_upload($1,$2,$3,$4,$5,$6,$7);
$$;
revoke all on function public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer) to service_role;

comment on table private.work_image_derivatives is 'Phase 3 private staging records; browser roles have no bucket or RPC access.';
