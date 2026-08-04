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
       where wi.private_object_path = object_name
         and wi.upload_status = 'reserved'
         and wi.deleted_at is null
         and w.deleted_at is null
         and w.visibility = 'draft'
         and private.can_manage_work(w.id)
    );
$$;

comment on function private.can_insert_reserved_work_original(text, jsonb)
  is 'Allows upload only to an exact active reserved Work image path. Stored mime type and size are verified by finalize-work-image-upload after upload.';
