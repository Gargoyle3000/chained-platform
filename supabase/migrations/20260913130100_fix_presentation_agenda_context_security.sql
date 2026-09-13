-- Keeps the managed context behind its authorization predicate while the
-- backing state remains RLS-forced and has no browser table grants.
create or replace function public.get_managed_presentation_agenda_image_context(target_presentation_id uuid)
returns table (has_dedicated_image boolean, representative_work_id uuid, work_id uuid, work_title text)
language sql security definer set search_path = '' as $$
  select ai.image_id is not null and ai.upload_status = 'ready', ai.representative_work_id, pw.work_id, w.title
  from public.profile_activities pa
  left join public.presentation_agenda_images ai on ai.presentation_id=pa.id
  left join public.presentation_works pw on pw.presentation_id=pa.id and pw.status='accepted' and pw.is_visible
  left join public.works w on w.id=pw.work_id
  where pa.id=target_presentation_id and private.can_manage_presentation_content(pa.id)
    and (pw.work_id is null or private.presentation_representative_work_is_eligible(pa.id,pw.work_id));
$$;

revoke all on function public.get_managed_presentation_agenda_image_context(uuid) from public, anon;
grant execute on function public.get_managed_presentation_agenda_image_context(uuid) to authenticated;
