create policy work_originals_select_upload_returning
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-originals'
  and storage.allow_only_operation('object.upload')
  and private.can_insert_reserved_work_original(name, metadata)
);
