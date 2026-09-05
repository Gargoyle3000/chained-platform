-- PostgREST resolves RPC JSON bodies by public function argument name.
-- Recreate only the service-only wrappers; the private promotion primitives
-- and their behavior remain unchanged.

drop function public.service_legacy_public_derivative_promotion_plan(uuid, uuid, uuid);
drop function public.service_finalize_legacy_public_derivative_promotion(uuid, uuid, uuid);

create function public.service_legacy_public_derivative_promotion_plan(
  target_work_id uuid,
  target_image_id uuid,
  expected_publication_revision uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.service_legacy_public_derivative_promotion_plan(
    target_work_id,
    target_image_id,
    expected_publication_revision
  );
$$;

create function public.service_finalize_legacy_public_derivative_promotion(
  target_work_id uuid,
  target_image_id uuid,
  expected_publication_revision uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.service_finalize_legacy_public_derivative_promotion(
    target_work_id,
    target_image_id,
    expected_publication_revision
  );
$$;

revoke all on function public.service_legacy_public_derivative_promotion_plan(uuid,uuid,uuid), public.service_finalize_legacy_public_derivative_promotion(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.service_legacy_public_derivative_promotion_plan(uuid,uuid,uuid), public.service_finalize_legacy_public_derivative_promotion(uuid,uuid,uuid) to service_role;
