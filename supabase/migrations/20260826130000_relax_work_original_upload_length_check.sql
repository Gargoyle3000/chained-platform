-- Hosted Storage authorizes multipart uploads before the object exists. Its
-- contentLength is the request length (including multipart boundaries), not a
-- trustworthy object byte length. Exact object size remains a trusted-finalize
-- responsibility after Storage has persisted the object.
create or replace function private.can_insert_reserved_work_original(
  object_name text,
  object_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.work_images as wi
        join public.works as w on w.id = wi.work_id
       where wi.upload_status = 'reserved'
         and wi.deleted_at is null
         and w.deleted_at is null
         and w.visibility = 'draft'
         and private.can_manage_work(w.id)
         and (
           (
             wi.private_object_path = object_name
             and wi.mime_type = lower(coalesce(object_metadata ->> 'mimetype', ''))
           )
           or (
             wi.preview_object_path is not null
             and wi.preview_object_path = object_name
             and lower(coalesce(object_metadata ->> 'mimetype', '')) = 'image/webp'
           )
         )
    );
$$;

comment on function private.can_insert_reserved_work_original(text, jsonb)
  is 'Storage upload authorization enforces active manager, draft Work, exact reserved path, and MIME. Multipart request length is not an object size; finalize-work-image-upload verifies stored object size, MIME, extension, and signature before ready.';
