-- Private Work-image originals, exact upload reservations, and Storage RLS.

create type public.work_image_upload_status as enum (
  'reserved',
  'ready',
  'failed',
  'deleting',
  'cleanup_pending',
  'deleted'
);

alter table public.work_images
  drop constraint work_images_mime_type_allowed;

alter table public.work_images
  add column upload_status public.work_image_upload_status not null default 'ready',
  add column original_verified_at timestamptz,
  add column failure_code varchar(80),
  add column cleanup_required boolean not null default false,
  add column cleanup_failure_code varchar(80),
  add column deletion_started_at timestamptz,
  add constraint work_images_mime_type_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  add constraint work_images_file_size_limit
    check (file_size is null or file_size <= 52428800),
  add constraint work_images_public_private_paths_differ
    check (public_object_path is null or public_object_path <> private_object_path),
  add constraint work_images_failure_code_length
    check (failure_code is null or char_length(failure_code) between 1 and 80),
  add constraint work_images_cleanup_failure_code_length
    check (cleanup_failure_code is null or char_length(cleanup_failure_code) between 1 and 80),
  add constraint work_images_cleanup_state_consistent
    check (
      (upload_status = 'cleanup_pending' and cleanup_required)
      or (upload_status <> 'cleanup_pending')
    ),
  add constraint work_images_deleted_state_consistent
    check (upload_status <> 'deleted' or deleted_at is not null);

create index work_images_upload_lifecycle
  on public.work_images (work_id, upload_status, sort_order, id)
  where deleted_at is null;

-- The original foundation accepted its legacy prototype path. Historical and
-- committed pgTAP fixtures keep that compatibility, while every new browser
-- reservation below receives only the canonical Storage path.
create or replace function private.prepare_work_image_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  owner_profile_id uuid;
  canonical_base text;
  legacy_base text;
  expected_extension text;
begin
  select w.owner_profile_id
    into owner_profile_id
    from public.works as w
   where w.id = new.work_id
     and w.deleted_at is null;

  if owner_profile_id is null then
    raise exception 'Work images require an active parent Work.'
      using errcode = '23514';
  end if;

  expected_extension := case new.mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/avif' then 'avif'
    else null
  end;

  canonical_base := lower(owner_profile_id::text)
    || '/' || lower(new.work_id::text)
    || '/' || lower(new.id::text)
    || '/original.';
  legacy_base := 'profiles/' || lower(owner_profile_id::text)
    || '/works/' || lower(new.work_id::text)
    || '/images/' || lower(new.id::text)
    || '/source.';

  if expected_extension is null
     or lower(new.private_object_path) not in (
       canonical_base || expected_extension,
       legacy_base || expected_extension,
       case when expected_extension = 'jpg' then legacy_base || 'jpeg' else legacy_base || expected_extension end
     ) then
    raise exception 'Private image paths must use trusted owner, Work, and image UUID segments.'
      using errcode = '23514';
  end if;

  if new.private_object_path <> lower(new.private_object_path) then
    raise exception 'Work image paths must use lowercase canonical text.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.uploaded_by_account_id := actor_id;
      new.updated_by_account_id := actor_id;
      new.deleted_by_account_id := null;
      new.deleted_at := null;
      new.public_object_path := null;
    end if;
  else
    if new.work_id is distinct from old.work_id
       or new.private_object_path is distinct from old.private_object_path then
      raise exception 'A Work image cannot be moved to another Work or private object path.'
        using errcode = '42501';
    end if;

    if actor_id is not null then
      if new.public_object_path is distinct from old.public_object_path
         or new.upload_status is distinct from old.upload_status
         or new.original_verified_at is distinct from old.original_verified_at
         or new.failure_code is distinct from old.failure_code
         or new.cleanup_required is distinct from old.cleanup_required
         or new.cleanup_failure_code is distinct from old.cleanup_failure_code
         or new.deletion_started_at is distinct from old.deletion_started_at
         or new.mime_type is distinct from old.mime_type
         or new.file_size is distinct from old.file_size then
        raise exception 'Work-image media lifecycle fields require a trusted workflow.'
          using errcode = '42501';
      end if;

      new.uploaded_by_account_id := old.uploaded_by_account_id;
      new.updated_by_account_id := actor_id;

      if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_at := now();
        new.deleted_by_account_id := actor_id;
        new.public_object_path := null;
      elsif old.deleted_at is not null then
        if new.deleted_at is distinct from old.deleted_at
           or new.deleted_by_account_id is distinct from old.deleted_by_account_id then
          raise exception 'Deleted Work images require a trusted restore or purge workflow.'
            using errcode = '42501';
        end if;
      else
        new.deleted_at := null;
        new.deleted_by_account_id := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke insert on public.work_images from authenticated;
revoke update (mime_type, file_size) on public.work_images from authenticated;
drop policy work_images_authenticated_insert on public.work_images;

-- Preserve the pre-existing duplicate-cover constraint behavior without
-- restoring a usable direct insert path. The only direct rows admitted by
-- this policy are guaranteed to collide with the active-cover unique index.
-- Successful browser inserts still require the reservation RPC below.
grant insert (
  id, work_id, private_object_path, original_filename, mime_type,
  file_size, pixel_width, pixel_height, sort_order, is_cover
) on public.work_images to authenticated;

create function private.work_has_active_cover(target_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_images
     where work_id = target_work_id
       and deleted_at is null
       and is_cover
  );
$$;

revoke all on function private.work_has_active_cover(uuid) from public, anon;
grant execute on function private.work_has_active_cover(uuid) to authenticated;

create policy work_images_duplicate_cover_constraint_compatibility
on public.work_images
for insert
to authenticated
with check (
  is_cover
  and deleted_at is null
  and public_object_path is null
  and uploaded_by_account_id = (select auth.uid())
  and updated_by_account_id = (select auth.uid())
  and (select private.can_manage_work(work_id))
  and private.work_has_active_cover(work_id)
);

create function private.reserve_work_image_upload(
  target_work_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_file_size bigint,
  requested_cover boolean
)
returns table (
  work_image_id uuid,
  bucket_id text,
  object_path text,
  mime_type text,
  file_size bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_work public.works%rowtype;
  image_id uuid := gen_random_uuid();
  image_extension text;
  next_sort_order integer;
  make_cover boolean;
begin
  if actor_id is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'The current account may not reserve an upload for this Work.'
      using errcode = '42501';
  end if;

  select w.*
    into target_work
    from public.works as w
   where w.id = target_work_id
   for update;

  if not found or target_work.deleted_at is not null then
    raise exception 'The target Work is unavailable.' using errcode = '22023';
  end if;

  if target_work.visibility <> 'draft' then
    raise exception 'Images may be reserved only for draft Works.' using errcode = '22023';
  end if;

  if requested_filename is null
     or char_length(trim(requested_filename)) not between 1 and 512 then
    raise exception 'A valid original filename is required.' using errcode = '22023';
  end if;

  image_extension := case requested_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/avif' then 'avif'
    else null
  end;

  if image_extension is null then
    raise exception 'Unsupported image MIME type.' using errcode = '22023';
  end if;

  if requested_file_size is null
     or requested_file_size <= 0
     or requested_file_size > 52428800 then
    raise exception 'Image file size must be between 1 byte and 50 MiB.' using errcode = '22023';
  end if;

  select coalesce(max(wi.sort_order), -1) + 1,
         not exists (
           select 1
             from public.work_images as first_image
            where first_image.work_id = target_work_id
              and first_image.deleted_at is null
         )
    into next_sort_order, make_cover
    from public.work_images as wi
   where wi.work_id = target_work_id
     and wi.deleted_at is null;

  make_cover := make_cover or coalesce(requested_cover, false);

  if make_cover then
    update public.work_images
       set is_cover = false,
           updated_by_account_id = actor_id,
           updated_at = statement_timestamp()
     where work_id = target_work_id
       and deleted_at is null
       and is_cover;
  end if;

  insert into public.work_images (
    id,
    work_id,
    private_object_path,
    original_filename,
    mime_type,
    file_size,
    sort_order,
    is_cover,
    upload_status,
    uploaded_by_account_id,
    updated_by_account_id
  ) values (
    image_id,
    target_work_id,
    lower(target_work.owner_profile_id::text) || '/' || lower(target_work_id::text)
      || '/' || lower(image_id::text) || '/original.' || image_extension,
    trim(requested_filename),
    requested_mime_type,
    requested_file_size,
    next_sort_order,
    make_cover,
    'reserved',
    actor_id,
    actor_id
  );

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, result, metadata
  ) values (
    actor_id,
    'work_image.upload_reserved',
    'work_image',
    image_id,
    'succeeded',
    jsonb_build_object('work_id', target_work_id, 'mime_type', requested_mime_type, 'file_size', requested_file_size)
  );

  return query
  select image_id,
         'work-originals'::text,
         lower(target_work.owner_profile_id::text) || '/' || lower(target_work_id::text)
           || '/' || lower(image_id::text) || '/original.' || image_extension,
         requested_mime_type,
         requested_file_size;
end;
$$;

create function public.reserve_work_image_upload(
  target_work_id uuid,
  original_filename text,
  mime_type text,
  file_size bigint,
  make_cover boolean
)
returns table (
  work_image_id uuid,
  bucket_id text,
  object_path text,
  mime_type text,
  file_size bigint
)
language sql
security invoker
set search_path = ''
as $$
  select *
    from private.reserve_work_image_upload(
      target_work_id,
      original_filename,
      mime_type,
      file_size,
      make_cover
    );
$$;

revoke all on function private.reserve_work_image_upload(uuid, text, text, bigint, boolean) from public, anon;
grant execute on function private.reserve_work_image_upload(uuid, text, text, bigint, boolean) to authenticated;
revoke all on function public.reserve_work_image_upload(uuid, text, text, bigint, boolean) from public, anon;
grant execute on function public.reserve_work_image_upload(uuid, text, text, bigint, boolean) to authenticated;

create function private.can_insert_reserved_work_original(
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
         and wi.mime_type = lower(coalesce(object_metadata ->> 'mimetype', ''))
         and coalesce(object_metadata ->> 'contentLength', object_metadata ->> 'size', '') ~ '^[0-9]+$'
         and coalesce(object_metadata ->> 'contentLength', object_metadata ->> 'size')::bigint = wi.file_size
    );
$$;

create function private.can_read_exact_work_original(object_name text)
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
         and wi.upload_status not in ('deleting', 'deleted')
         and wi.deleted_at is null
         and w.deleted_at is null
         and private.can_manage_work(w.id)
    );
$$;

revoke all on function private.can_insert_reserved_work_original(text, jsonb) from public, anon;
revoke all on function private.can_read_exact_work_original(text) from public, anon;
grant execute on function private.can_insert_reserved_work_original(text, jsonb) to authenticated;
grant execute on function private.can_read_exact_work_original(text) to authenticated;

create policy work_originals_insert_exact_reservation
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'work-originals'
  and storage.allow_only_operation('object.upload')
  and private.can_insert_reserved_work_original(name, metadata)
);

create policy work_originals_read_exact_authorised
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-originals'
  and storage.allow_only_operation('object.get_authenticated')
  and private.can_read_exact_work_original(name)
);

comment on function public.reserve_work_image_upload(uuid, text, text, bigint, boolean)
  is 'Reserves one exact immutable private Storage path for an authorised draft Work.';
