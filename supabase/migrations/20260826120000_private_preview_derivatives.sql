-- Private display-preview derivatives. Originals remain authoritative for
-- publication and PDF export; previews are private, exact-path WebP objects.

alter table public.work_images
  add column preview_object_path text,
  add column preview_file_size bigint,
  add column preview_verified_at timestamptz,
  add column preview_failure_code varchar(80),
  add constraint work_images_preview_path_length
    check (preview_object_path is null or char_length(preview_object_path) between 1 and 1024),
  add constraint work_images_preview_file_size_limit
    check (preview_file_size is null or preview_file_size between 1 and 5242880),
  add constraint work_images_preview_failure_code_length
    check (preview_failure_code is null or char_length(preview_failure_code) between 1 and 80),
  add constraint work_images_preview_state_consistent
    check (
      (preview_object_path is null and preview_file_size is null and preview_verified_at is null and preview_failure_code is null)
      or (preview_object_path is not null and preview_file_size is not null)
    ),
  add constraint work_images_ready_preview_verified
    check (
      upload_status <> 'ready'
      or preview_object_path is null
      or preview_verified_at is not null
    );

comment on column public.work_images.preview_object_path
  is 'Trusted private WebP display derivative path; null for legacy original-only images.';
comment on column public.work_images.preview_file_size
  is 'Expected verified byte size of the private WebP preview derivative.';
comment on column public.work_images.preview_verified_at
  is 'Timestamp at which the trusted workflow verified the private preview derivative.';

create function private.validate_work_image_preview_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_profile_id uuid;
  expected_path text;
begin
  select w.owner_profile_id
    into owner_profile_id
    from public.works as w
   where w.id = new.work_id
     and w.deleted_at is null;

  if new.preview_object_path is not null then
    expected_path := lower(owner_profile_id::text) || '/' || lower(new.work_id::text)
      || '/' || lower(new.id::text) || '/preview.webp';
    if owner_profile_id is null
       or new.preview_object_path <> expected_path
       or new.preview_object_path <> lower(new.preview_object_path) then
      raise exception 'Preview paths must use trusted owner, Work, and image UUID segments.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null
     and (
       new.preview_object_path is distinct from old.preview_object_path
       or new.preview_file_size is distinct from old.preview_file_size
       or new.preview_verified_at is distinct from old.preview_verified_at
       or new.preview_failure_code is distinct from old.preview_failure_code
     ) then
    raise exception 'Work-image preview lifecycle fields require a trusted workflow.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger work_images_validate_preview_fields
before insert or update on public.work_images
for each row execute function private.validate_work_image_preview_fields();

-- This opt-in reservation keeps the established five-argument reservation
-- contract intact until the browser preview upload is deployed.
create function private.reserve_work_image_upload_with_preview(
  target_work_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_file_size bigint,
  requested_preview_file_size bigint,
  requested_cover boolean
)
returns table (
  work_image_id uuid,
  bucket_id text,
  object_path text,
  mime_type text,
  file_size bigint,
  preview_object_path text,
  preview_mime_type text,
  preview_file_size bigint,
  preview_max_file_size bigint
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
  original_path text;
  preview_path text;
begin
  if actor_id is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'The current account may not reserve an upload for this Work.' using errcode = '42501';
  end if;

  select w.* into target_work from public.works as w where w.id = target_work_id for update;
  if not found or target_work.deleted_at is not null then
    raise exception 'The target Work is unavailable.' using errcode = '22023';
  end if;
  if target_work.visibility <> 'draft' then
    raise exception 'Images may be reserved only for draft Works.' using errcode = '22023';
  end if;
  if requested_filename is null or char_length(trim(requested_filename)) not between 1 and 512 then
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
  if requested_file_size is null or requested_file_size <= 0 or requested_file_size > 52428800 then
    raise exception 'Image file size must be between 1 byte and 50 MiB.' using errcode = '22023';
  end if;
  if requested_preview_file_size is null or requested_preview_file_size <= 0 or requested_preview_file_size > 5242880 then
    raise exception 'Preview file size must be between 1 byte and 5 MiB.' using errcode = '22023';
  end if;

  select coalesce(max(wi.sort_order), -1) + 1,
         not exists (select 1 from public.work_images as first_image where first_image.work_id = target_work_id and first_image.deleted_at is null)
    into next_sort_order, make_cover
    from public.work_images as wi
   where wi.work_id = target_work_id and wi.deleted_at is null;
  make_cover := make_cover or coalesce(requested_cover, false);

  if make_cover then
    update public.work_images set is_cover = false, updated_by_account_id = actor_id,
      updated_at = statement_timestamp()
     where work_id = target_work_id and deleted_at is null and is_cover;
  end if;

  original_path := lower(target_work.owner_profile_id::text) || '/' || lower(target_work_id::text)
    || '/' || lower(image_id::text) || '/original.' || image_extension;
  preview_path := lower(target_work.owner_profile_id::text) || '/' || lower(target_work_id::text)
    || '/' || lower(image_id::text) || '/preview.webp';

  insert into public.work_images (
    id, work_id, private_object_path, original_filename, mime_type, file_size,
    preview_object_path, preview_file_size, sort_order, is_cover, upload_status,
    uploaded_by_account_id, updated_by_account_id
  ) values (
    image_id, target_work_id, original_path, trim(requested_filename), requested_mime_type, requested_file_size,
    preview_path, requested_preview_file_size, next_sort_order, make_cover, 'reserved', actor_id, actor_id
  );

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (actor_id, 'work_image.upload_reserved', 'work_image', image_id, 'succeeded',
          jsonb_build_object('work_id', target_work_id, 'mime_type', requested_mime_type,
            'file_size', requested_file_size, 'preview_mime_type', 'image/webp',
            'preview_file_size', requested_preview_file_size));

  return query select image_id, 'work-originals'::text, original_path, requested_mime_type, requested_file_size,
                      preview_path, 'image/webp'::text, requested_preview_file_size, 5242880::bigint;
end;
$$;

create function public.reserve_work_image_upload_with_preview(
  target_work_id uuid,
  original_filename text,
  mime_type text,
  file_size bigint,
  preview_file_size bigint,
  make_cover boolean
)
returns table (
  work_image_id uuid,
  bucket_id text,
  object_path text,
  mime_type text,
  file_size bigint,
  preview_object_path text,
  preview_mime_type text,
  preview_file_size bigint,
  preview_max_file_size bigint
)
language sql security invoker set search_path = ''
as $$
  select * from private.reserve_work_image_upload_with_preview(
    target_work_id, original_filename, mime_type, file_size, preview_file_size, make_cover
  );
$$;

revoke all on function private.reserve_work_image_upload_with_preview(uuid, text, text, bigint, bigint, boolean) from public, anon;
revoke all on function public.reserve_work_image_upload_with_preview(uuid, text, text, bigint, bigint, boolean) from public, anon;
grant execute on function private.reserve_work_image_upload_with_preview(uuid, text, text, bigint, bigint, boolean) to authenticated;
grant execute on function public.reserve_work_image_upload_with_preview(uuid, text, text, bigint, bigint, boolean) to authenticated;

create or replace function private.can_insert_reserved_work_original(object_name text, object_metadata jsonb)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1 from public.work_images as wi
      join public.works as w on w.id = wi.work_id
       where wi.upload_status = 'reserved'
         and wi.deleted_at is null and w.deleted_at is null and w.visibility = 'draft'
         and private.can_manage_work(w.id)
         and (
           (wi.private_object_path = object_name
             and wi.mime_type = lower(coalesce(object_metadata ->> 'mimetype', ''))
             and coalesce(object_metadata ->> 'contentLength', object_metadata ->> 'size', '') ~ '^[0-9]+$'
             and coalesce(object_metadata ->> 'contentLength', object_metadata ->> 'size')::bigint = wi.file_size)
           or
           (wi.preview_object_path = object_name
             and lower(coalesce(object_metadata ->> 'mimetype', '')) = 'image/webp'
             and coalesce(object_metadata ->> 'contentLength', object_metadata ->> 'size', '') ~ '^[0-9]+$'
             and coalesce(object_metadata ->> 'contentLength', object_metadata ->> 'size')::bigint = wi.preview_file_size)
         )
    );
$$;

create or replace function private.can_read_exact_work_original(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1 from public.work_images as wi
      join public.works as w on w.id = wi.work_id
       where object_name in (wi.private_object_path, wi.preview_object_path)
         and wi.upload_status not in ('deleting', 'deleted')
         and wi.deleted_at is null and w.deleted_at is null and private.can_manage_work(w.id)
    );
$$;

create or replace function private.service_get_work_image_upload(target_image_id uuid, actor_account_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare image_row record;
begin
  select wi.id, wi.work_id, wi.private_object_path, wi.mime_type, wi.file_size,
         wi.preview_object_path, wi.preview_file_size, wi.preview_verified_at,
         wi.upload_status, wi.original_verified_at, w.visibility, w.deleted_at as work_deleted_at
    into image_row
    from public.work_images as wi join public.works as w on w.id = wi.work_id
   where wi.id = target_image_id and wi.deleted_at is null;
  if not found or not private.account_can_manage_work(actor_account_id, image_row.work_id)
     or image_row.work_deleted_at is not null then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;
  if image_row.visibility <> 'draft' then
    raise exception 'Only draft Work uploads may be finalized.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'work_image_id', image_row.id, 'work_id', image_row.work_id, 'bucket_id', 'work-originals',
    'object_path', image_row.private_object_path, 'mime_type', image_row.mime_type,
    'file_size', image_row.file_size, 'preview_object_path', image_row.preview_object_path,
    'preview_mime_type', case when image_row.preview_object_path is null then null else 'image/webp' end,
    'preview_file_size', image_row.preview_file_size, 'upload_status', image_row.upload_status,
    'verified', image_row.original_verified_at is not null
      and (image_row.preview_object_path is null or image_row.preview_verified_at is not null),
    'preview_required', image_row.preview_object_path is not null,
    'preview_verified', image_row.preview_verified_at is not null
  );
end;
$$;

create function private.service_mark_work_image_upload(
  target_image_id uuid, actor_account_id uuid, verified boolean,
  sanitized_failure_code text, preview_failure boolean
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  image_row public.work_images%rowtype;
  safe_code text := left(coalesce(nullif(trim(sanitized_failure_code), ''), 'verification_failed'), 80);
begin
  select * into image_row from public.work_images where id = target_image_id for update;
  if not found or image_row.deleted_at is not null or not private.account_can_manage_work(actor_account_id, image_row.work_id) then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;
  if verified and image_row.upload_status = 'ready' and image_row.original_verified_at is not null
     and (image_row.preview_object_path is null or image_row.preview_verified_at is not null) then
    return jsonb_build_object('status', 'ready', 'idempotent', true);
  end if;
  if image_row.upload_status not in ('reserved', 'failed') then
    raise exception 'The image upload is not finalizable.' using errcode = '22023';
  end if;
  if verified then
    if image_row.preview_object_path is null then
      raise exception 'Preview-aware completion requires a reserved preview.' using errcode = '22023';
    end if;
    update public.work_images set upload_status = 'ready', original_verified_at = statement_timestamp(),
      preview_verified_at = statement_timestamp(), failure_code = null, preview_failure_code = null,
      cleanup_required = false, cleanup_failure_code = null, updated_by_account_id = actor_account_id
     where id = target_image_id;
    insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
    values (actor_account_id, 'work_image.upload_verified', 'work_image', target_image_id,
            jsonb_build_object('work_id', image_row.work_id, 'preview_verified', true));
    return jsonb_build_object('status', 'ready', 'idempotent', false);
  end if;
  update public.work_images set upload_status = 'failed', failure_code = safe_code,
    original_verified_at = null,
    preview_verified_at = null,
    preview_failure_code = case when preview_failure then safe_code else null end,
    updated_by_account_id = actor_account_id where id = target_image_id;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (actor_account_id, 'work_image.upload_failed', 'work_image', target_image_id, 'failed',
          jsonb_build_object('work_id', image_row.work_id, 'failure_code', safe_code,
            'preview_failure', preview_failure));
  return jsonb_build_object('status', 'failed');
end;
$$;

create function public.service_mark_work_image_upload(
  target_image_id uuid, actor_account_id uuid, verified boolean,
  failure_code text, preview_failure boolean
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_mark_work_image_upload(target_image_id, actor_account_id, verified, failure_code, preview_failure); $$;

revoke all on function private.service_mark_work_image_upload(uuid, uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.service_mark_work_image_upload(uuid, uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function private.service_mark_work_image_upload(uuid, uuid, boolean, text, boolean) to service_role;
grant execute on function public.service_mark_work_image_upload(uuid, uuid, boolean, text, boolean) to service_role;

-- Preserve the legacy completion API for original-only reservations during the
-- staged rollout, but never let the pre-preview Edge Function complete a row
-- that explicitly reserved a preview derivative.
create or replace function private.service_mark_work_image_upload(
  target_image_id uuid,
  actor_account_id uuid,
  verified boolean,
  sanitized_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_row public.work_images%rowtype;
begin
  select * into image_row
    from public.work_images
   where id = target_image_id
   for update;

  if not found or image_row.deleted_at is not null
     or not private.account_can_manage_work(actor_account_id, image_row.work_id) then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;

  if verified and image_row.preview_object_path is not null then
    raise exception 'Preview-aware uploads require preview verification.' using errcode = '22023';
  end if;

  if verified and image_row.upload_status = 'ready' and image_row.original_verified_at is not null then
    return jsonb_build_object('status', 'ready', 'idempotent', true);
  end if;

  if image_row.upload_status not in ('reserved', 'failed') then
    raise exception 'The image upload is not finalizable.' using errcode = '22023';
  end if;

  if verified then
    update public.work_images
       set upload_status = 'ready',
           original_verified_at = statement_timestamp(),
           failure_code = null,
           cleanup_required = false,
           cleanup_failure_code = null,
           updated_by_account_id = actor_account_id
     where id = target_image_id;

    insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
    values (actor_account_id, 'work_image.upload_verified', 'work_image', target_image_id,
            jsonb_build_object('work_id', image_row.work_id));

    return jsonb_build_object('status', 'ready', 'idempotent', false);
  end if;

  update public.work_images
     set upload_status = 'failed',
         failure_code = left(coalesce(nullif(trim(sanitized_failure_code), ''), 'verification_failed'), 80),
         original_verified_at = null,
         updated_by_account_id = actor_account_id
   where id = target_image_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (actor_account_id, 'work_image.upload_failed', 'work_image', target_image_id, 'failed',
          jsonb_build_object('work_id', image_row.work_id,
            'failure_code', left(coalesce(nullif(trim(sanitized_failure_code), ''), 'verification_failed'), 80)));

  return jsonb_build_object('status', 'failed');
end;
$$;

create or replace function public.service_mark_work_image_upload(
  target_image_id uuid,
  actor_account_id uuid,
  verified boolean,
  failure_code text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.service_mark_work_image_upload(target_image_id, actor_account_id, verified, failure_code);
$$;

revoke all on function private.service_mark_work_image_upload(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.service_mark_work_image_upload(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function private.service_mark_work_image_upload(uuid, uuid, boolean, text) to service_role;
grant execute on function public.service_mark_work_image_upload(uuid, uuid, boolean, text) to service_role;

create or replace function private.service_begin_work_image_deletion(target_image_id uuid, actor_account_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare image_row public.work_images%rowtype; work_row public.works%rowtype;
declare remaining_count integer; replacement_cover_id uuid; stale_public_path text;
begin
  select * into image_row from public.work_images where id = target_image_id for update;
  if not found or not private.account_can_manage_work(actor_account_id, image_row.work_id) then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;
  select * into work_row from public.works where id = image_row.work_id for update;
  if work_row.deleted_at is not null or work_row.visibility <> 'draft' then
    raise exception 'Images may be deleted only from active draft Works.' using errcode = '22023';
  end if;
  if exists (select 1 from public.work_publication_operations where work_id = image_row.work_id and status in ('pending', 'running', 'cleanup_pending')) then
    raise exception 'A publication operation is active.' using errcode = '55000';
  end if;
  if image_row.upload_status in ('deleting', 'cleanup_pending', 'deleted') or image_row.deleted_at is not null then
    return jsonb_build_object('status', image_row.upload_status, 'idempotent', true,
      'private_object_path', image_row.private_object_path, 'preview_object_path', image_row.preview_object_path,
      'public_object_path', image_row.cleanup_public_object_path);
  end if;
  select count(*) into remaining_count from public.work_images
   where work_id = image_row.work_id and deleted_at is null and id <> target_image_id;
  if image_row.is_cover and remaining_count > 0 then
    select id into replacement_cover_id from public.work_images
     where work_id = image_row.work_id and deleted_at is null and id <> target_image_id order by sort_order, id limit 1;
    update public.work_images set is_cover = true, updated_by_account_id = actor_account_id where id = replacement_cover_id;
  end if;
  stale_public_path := image_row.public_object_path;
  update public.work_images set upload_status = 'deleting', deletion_started_at = statement_timestamp(),
    deleted_at = statement_timestamp(), deleted_by_account_id = actor_account_id, public_object_path = null,
    cleanup_public_object_path = stale_public_path, cleanup_required = true, failure_code = null,
    cleanup_failure_code = null, is_cover = false, updated_by_account_id = actor_account_id where id = target_image_id;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (actor_account_id, 'work_image.deletion_started', 'work_image', target_image_id,
          jsonb_build_object('work_id', image_row.work_id, 'was_only_image', remaining_count = 0));
  return jsonb_build_object('status', 'deleting', 'idempotent', false,
    'private_object_path', image_row.private_object_path, 'preview_object_path', image_row.preview_object_path,
    'public_object_path', stale_public_path);
end;
$$;

create function private.service_resolve_authorized_private_work_images(
  actor_account_id uuid, image_ids uuid[], media_purpose text
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare normalized_image_ids uuid[]; requested_count integer; resolved_count integer; image_payload jsonb;
begin
  if media_purpose not in ('preview', 'pdf_export') then
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
    'object_path', case when media_purpose = 'preview' and wi.preview_object_path is not null then wi.preview_object_path else wi.private_object_path end,
    'mime_type', case when media_purpose = 'preview' and wi.preview_object_path is not null then 'image/webp' else wi.mime_type end,
    'file_size', case when media_purpose = 'preview' and wi.preview_object_path is not null then wi.preview_file_size else wi.file_size end
  ) order by requested.position), '[]'::jsonb)
    into resolved_count, image_payload
    from unnest(normalized_image_ids) with ordinality as requested(image_id, position)
    join public.work_images as wi on wi.id = requested.image_id
    join public.works as w on w.id = wi.work_id
   where wi.deleted_at is null and wi.upload_status = 'ready' and wi.original_verified_at is not null
     and wi.file_size is not null and w.deleted_at is null and private.account_can_manage_work(actor_account_id, w.id)
     and (media_purpose <> 'preview' or wi.preview_object_path is null or (wi.preview_verified_at is not null and wi.preview_file_size is not null));
  if resolved_count <> requested_count then
    raise exception 'Private media is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object('images', image_payload);
end;
$$;

create function public.service_resolve_authorized_private_work_images(actor_account_id uuid, image_ids uuid[], media_purpose text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.service_resolve_authorized_private_work_images(actor_account_id, image_ids, media_purpose); $$;

revoke all on function private.service_resolve_authorized_private_work_images(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.service_resolve_authorized_private_work_images(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function private.service_resolve_authorized_private_work_images(uuid, uuid[], text) to service_role;
grant execute on function public.service_resolve_authorized_private_work_images(uuid, uuid[], text) to service_role;

comment on function private.service_resolve_authorized_private_work_images(uuid, uuid[], text)
  is 'Atomically resolves authorised private previews or authoritative originals for the trusted media gateway.';
