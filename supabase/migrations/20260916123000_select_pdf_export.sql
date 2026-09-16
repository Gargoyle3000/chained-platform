-- Private Project SELECT PDFs may use originals only for directly managed Works.
-- This follows the already-applied automatic SELECT migration without changing it.

create or replace function private.service_resolve_authorized_private_work_images(
  actor_account_id uuid, image_ids uuid[], media_purpose text
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare normalized_image_ids uuid[]; requested_count integer; resolved_count integer; image_payload jsonb;
begin
  if media_purpose not in ('preview', 'select_preview', 'select_pdf_export', 'pdf_export') then
    raise exception 'Private media purpose is unavailable.' using errcode = '22023';
  end if;
  select coalesce(array_agg(requested.image_id order by requested.first_position), array[]::uuid[])
    into normalized_image_ids from (
      select supplied.image_id, min(supplied.position) as first_position
      from unnest(coalesce(image_ids, array[]::uuid[])) with ordinality as supplied(image_id, position)
      where supplied.image_id is not null group by supplied.image_id
    ) as requested;
  requested_count := cardinality(normalized_image_ids);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'A private-media request must contain between 1 and 100 unique image IDs.' using errcode = '22023';
  end if;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
    'work_image_id', wi.id,
    'object_path', case when media_purpose in ('preview', 'select_preview') and wi.preview_object_path is not null then wi.preview_object_path else wi.private_object_path end,
    'mime_type', case when media_purpose in ('preview', 'select_preview') and wi.preview_object_path is not null then 'image/webp' else wi.mime_type end,
    'file_size', case when media_purpose in ('preview', 'select_preview') and wi.preview_object_path is not null then wi.preview_file_size else wi.file_size end
  ) order by requested.position), '[]'::jsonb)
    into resolved_count, image_payload
    from unnest(normalized_image_ids) with ordinality as requested(image_id, position)
    join public.work_images as wi on wi.id = requested.image_id
    join public.works as w on w.id = wi.work_id
   where wi.deleted_at is null and wi.upload_status = 'ready' and wi.original_verified_at is not null
     and wi.file_size is not null and w.deleted_at is null
     and (
       (media_purpose in ('select_preview', 'select_pdf_export')
        and exists (select 1 from public.accounts a where a.id = actor_account_id and a.status = 'active')
        and private.account_directly_manages_artist_profile(actor_account_id, w.owner_profile_id))
       or (media_purpose not in ('select_preview', 'select_pdf_export') and private.account_can_manage_work(actor_account_id, w.id))
     )
     and (media_purpose not in ('preview', 'select_preview') or wi.preview_object_path is null or (wi.preview_verified_at is not null and wi.preview_file_size is not null));
  if resolved_count <> requested_count then
    raise exception 'Private media is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object('images', image_payload);
end;
$$;
