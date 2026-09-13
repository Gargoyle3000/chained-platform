-- Edge Functions reach PostgREST through the exposed public schema. The
-- privileged implementations remain private; these service-role-only invoker
-- wrappers make the existing verifier and delivery chain reachable.
create or replace function public.service_get_presentation_agenda_image_upload(target_image_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_get_presentation_agenda_image_upload(target_image_id, actor_account_id);
$$;

create or replace function public.service_mark_presentation_agenda_image_upload(target_image_id uuid, actor_account_id uuid, verified boolean, failure_code text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_mark_presentation_agenda_image_upload(target_image_id, actor_account_id, verified, failure_code);
$$;

create or replace function public.service_finish_presentation_agenda_image_cleanup(target_image_id uuid, actor_account_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.service_finish_presentation_agenda_image_cleanup(target_image_id, actor_account_id);
$$;

create or replace function public.service_get_presentation_agenda_image_removal(target_presentation_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_get_presentation_agenda_image_removal(target_presentation_id, actor_account_id);
$$;

create or replace function public.service_remove_presentation_agenda_image(target_presentation_id uuid, expected_image_id uuid, actor_account_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.service_remove_presentation_agenda_image(target_presentation_id, expected_image_id, actor_account_id);
$$;

create or replace function public.service_get_public_presentation_agenda_image(target_presentation_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.service_get_public_presentation_agenda_image(target_presentation_id);
$$;

revoke all on function public.service_get_presentation_agenda_image_upload(uuid,uuid), public.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text), public.service_finish_presentation_agenda_image_cleanup(uuid,uuid), public.service_get_presentation_agenda_image_removal(uuid,uuid), public.service_remove_presentation_agenda_image(uuid,uuid,uuid), public.service_get_public_presentation_agenda_image(uuid) from public, anon, authenticated;
grant execute on function public.service_get_presentation_agenda_image_upload(uuid,uuid), public.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text), public.service_finish_presentation_agenda_image_cleanup(uuid,uuid), public.service_get_presentation_agenda_image_removal(uuid,uuid), public.service_remove_presentation_agenda_image(uuid,uuid,uuid), public.service_get_public_presentation_agenda_image(uuid) to service_role;
