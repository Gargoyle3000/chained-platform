-- Restore named RPC parameters for the trusted finalizer. PostgREST resolves
-- RPC calls by JSON field name; this keeps the service-only boundary unchanged.
drop function public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer);

create function public.service_mark_work_image_upload(
  target_image_id uuid, actor_account_id uuid, verified boolean, failure_code text,
  preview_failure boolean, pixel_width integer, pixel_height integer
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_mark_work_image_upload(
    target_image_id, actor_account_id, verified, failure_code, preview_failure,
    pixel_width, pixel_height
  );
$$;

revoke all on function public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.service_mark_work_image_upload(uuid,uuid,boolean,text,boolean,integer,integer) to service_role;
