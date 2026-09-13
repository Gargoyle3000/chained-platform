-- One optional, Presentation-owned Agenda image and one explicit Work fallback.
-- This deliberately does not create a general Presentation media system.

create type public.presentation_agenda_image_status as enum ('reserved', 'ready', 'failed');

create table public.presentation_agenda_images (
  presentation_id uuid primary key references public.profile_activities(id) on delete cascade,
  representative_work_id uuid references public.works(id) on delete set null,
  image_id uuid unique,
  original_object_path text,
  original_filename text,
  mime_type text,
  file_size bigint,
  preview_object_path text,
  preview_file_size bigint,
  upload_status public.presentation_agenda_image_status,
  verified_at timestamptz,
  failure_code varchar(80),
  retired_original_object_path text,
  retired_preview_object_path text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_account_id uuid references public.accounts(id) on delete set null,
  constraint presentation_agenda_image_original_contract check (
    (image_id is null and original_object_path is null and original_filename is null and mime_type is null and file_size is null and preview_object_path is null and preview_file_size is null and upload_status is null and verified_at is null and failure_code is null)
    or (image_id is not null and original_object_path is not null and original_filename is not null and mime_type in ('image/jpeg','image/png','image/webp','image/avif') and file_size between 1 and 52428800 and preview_object_path is not null and preview_file_size between 1 and 5242880 and upload_status is not null)
  ),
  constraint presentation_agenda_image_ready_verified check (upload_status is distinct from 'ready' or verified_at is not null),
  constraint presentation_agenda_image_path_lengths check (
    (original_object_path is null or char_length(original_object_path) between 1 and 1024)
    and (preview_object_path is null or char_length(preview_object_path) between 1 and 1024)
  )
);

alter table public.presentation_agenda_images enable row level security;
alter table public.presentation_agenda_images force row level security;
revoke all on table public.presentation_agenda_images from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('presentation-agenda-media', 'presentation-agenda-media', false, 52428800, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif'];

create function private.presentation_has_public_agenda_occurrence(target_presentation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profile_activities pa
    join public.public_profiles p on p.id = pa.owner_profile_id
    join public.activity_occurrences ao on ao.activity_id = pa.id
    where pa.id = target_presentation_id and pa.visibility = 'published' and pa.published_at is not null and pa.deleted_at is null
      and p.publication_status = 'published' and p.published_at is not null and p.deleted_at is null
      and ao.visibility = 'published' and ao.published_at is not null and ao.show_in_agenda and ao.deleted_at is null
      and coalesce(ao.end_date, ao.start_date) >= current_date
  );
$$;

create function private.presentation_representative_work_is_eligible(target_presentation_id uuid, target_work_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.presentation_works pw
    join public.works w on w.id = pw.work_id
    join public.work_images wi on wi.work_id = w.id and wi.is_cover and wi.deleted_at is null
    where pw.presentation_id = target_presentation_id and pw.work_id = target_work_id
      and pw.status = 'accepted' and pw.is_visible
      and w.deleted_at is null and w.visibility = 'published'
      and private.is_published_work(w.id)
      and wi.public_object_path = lower(w.owner_profile_id::text) || '/' || lower(w.id::text)
        || '/' || lower(w.publication_revision::text) || '/' || lower(wi.id::text) || '/small.webp'
  );
$$;

create function private.account_can_manage_presentation_content(actor_account_id uuid, target_presentation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts a
    join public.profile_activities pa on pa.id = target_presentation_id and pa.deleted_at is null
    join public.public_profiles owner_profile on owner_profile.id = pa.owner_profile_id and owner_profile.profile_type = 'artist' and owner_profile.deleted_at is null
    where a.id = actor_account_id and a.status = 'active'
      and (
        exists (select 1 from public.profile_members pm where pm.profile_id = pa.owner_profile_id and pm.account_id = actor_account_id and pm.status = 'active' and pm.revoked_at is null)
        or exists (
          select 1
          from public.profile_access_grants pag
          join public.public_profiles institution_profile on institution_profile.id = pag.grantee_profile_id and institution_profile.profile_type = 'institution' and institution_profile.deleted_at is null
          join public.profile_members institution_member on institution_member.profile_id = pag.grantee_profile_id and institution_member.account_id = actor_account_id and institution_member.status = 'active' and institution_member.revoked_at is null
          where pag.grantor_profile_id = pa.owner_profile_id and pag.scope = 'presentations_editor'
            and pag.status = 'active' and pag.revoked_at is null
            and (pag.expires_at is null or pag.expires_at > statement_timestamp())
        )
        or exists (select 1 from public.presentation_cooperators pc where pc.presentation_id = pa.id and pc.invited_account_id = actor_account_id and pc.role = 'co_operator' and pc.status = 'accepted' and pc.revoked_at is null)
      )
  );
$$;

create function private.reserve_presentation_agenda_image_upload(
  target_presentation_id uuid, requested_filename text, requested_mime_type text,
  requested_file_size bigint, requested_preview_file_size bigint
) returns table (image_id uuid, bucket_id text, object_path text, mime_type text, file_size bigint, preview_object_path text, preview_mime_type text, preview_file_size bigint)
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); target public.profile_activities%rowtype; next_image_id uuid := gen_random_uuid(); extension text; original_path text; preview_path text;
begin
  if actor_id is null or not private.current_account_is_active() or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Presentation Agenda image may not be changed.' using errcode = '42501';
  end if;
  select * into target from public.profile_activities where id = target_presentation_id and deleted_at is null for update;
  if not found then raise exception 'The Presentation is unavailable.' using errcode = '22023'; end if;
  if requested_filename is null or char_length(trim(requested_filename)) not between 1 and 512 then raise exception 'A valid image filename is required.' using errcode = '22023'; end if;
  extension := case requested_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/avif' then 'avif' else null end;
  if extension is null or requested_file_size is null or requested_file_size not between 1 and 52428800 or requested_preview_file_size is null or requested_preview_file_size not between 1 and 5242880 then
    raise exception 'The Agenda image upload is invalid.' using errcode = '22023';
  end if;
  if exists (select 1 from public.presentation_agenda_images where presentation_id = target_presentation_id and retired_original_object_path is not null) then
    raise exception 'The previous Agenda image is still being cleaned up.' using errcode = '55000';
  end if;
  original_path := lower(target_presentation_id::text) || '/' || lower(next_image_id::text) || '/original.' || extension;
  preview_path := lower(target_presentation_id::text) || '/' || lower(next_image_id::text) || '/agenda.webp';
  insert into public.presentation_agenda_images as ai (presentation_id, image_id, original_object_path, original_filename, mime_type, file_size, preview_object_path, preview_file_size, upload_status, updated_by_account_id)
  values (target_presentation_id, next_image_id, original_path, trim(requested_filename), requested_mime_type, requested_file_size, preview_path, requested_preview_file_size, 'reserved', actor_id)
  on conflict (presentation_id) do update set
    retired_original_object_path = ai.original_object_path,
    retired_preview_object_path = ai.preview_object_path,
    image_id = excluded.image_id, original_object_path = excluded.original_object_path, original_filename = excluded.original_filename,
    mime_type = excluded.mime_type, file_size = excluded.file_size, preview_object_path = excluded.preview_object_path,
    preview_file_size = excluded.preview_file_size, upload_status = 'reserved', verified_at = null, failure_code = null,
    updated_at = statement_timestamp(), updated_by_account_id = actor_id;
  insert into public.audit_events(actor_account_id, action, target_type, target_id, result, metadata)
  values (actor_id, 'presentation_agenda_image.upload_reserved', 'presentation', target_presentation_id, 'succeeded', jsonb_build_object('mime_type', requested_mime_type, 'file_size', requested_file_size));
  return query select next_image_id, 'presentation-agenda-media'::text, original_path, requested_mime_type, requested_file_size, preview_path, 'image/webp'::text, requested_preview_file_size;
end;
$$;

create function public.reserve_presentation_agenda_image_upload(target_presentation_id uuid, original_filename text, mime_type text, file_size bigint, preview_file_size bigint)
returns table (image_id uuid, bucket_id text, object_path text, mime_type text, file_size bigint, preview_object_path text, preview_mime_type text, preview_file_size bigint)
language sql security invoker set search_path = '' as $$ select * from private.reserve_presentation_agenda_image_upload(target_presentation_id,original_filename,mime_type,file_size,preview_file_size); $$;

create function private.set_presentation_representative_work(target_presentation_id uuid, target_work_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or not private.current_account_is_active() or not private.can_manage_presentation_content(target_presentation_id) then raise exception 'The Presentation representative Work may not be changed.' using errcode = '42501'; end if;
  if target_work_id is not null and not private.presentation_representative_work_is_eligible(target_presentation_id, target_work_id) then raise exception 'The representative Work must be an eligible linked Work.' using errcode = '22023'; end if;
  insert into public.presentation_agenda_images(presentation_id, representative_work_id, updated_by_account_id) values(target_presentation_id,target_work_id,actor_id)
  on conflict(presentation_id) do update set representative_work_id = excluded.representative_work_id, updated_at = statement_timestamp(), updated_by_account_id = actor_id;
  return true;
end;
$$;
create function public.set_presentation_representative_work(target_presentation_id uuid, target_work_id uuid) returns boolean language sql security invoker set search_path = '' as $$ select private.set_presentation_representative_work(target_presentation_id,target_work_id); $$;

create function private.can_insert_reserved_presentation_agenda_media(object_name text, object_metadata jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_account_is_active() and exists (
    select 1 from public.presentation_agenda_images ai
    where ai.upload_status = 'reserved' and (ai.original_object_path = object_name or ai.preview_object_path = object_name)
      and private.can_manage_presentation_content(ai.presentation_id)
      and ((ai.original_object_path = object_name and ai.mime_type = lower(coalesce(object_metadata->>'mimetype','')) and coalesce(object_metadata->>'contentLength',object_metadata->>'size','') ~ '^[0-9]+$' and coalesce(object_metadata->>'contentLength',object_metadata->>'size')::bigint = ai.file_size)
        or (ai.preview_object_path = object_name and lower(coalesce(object_metadata->>'mimetype','')) = 'image/webp' and coalesce(object_metadata->>'contentLength',object_metadata->>'size','') ~ '^[0-9]+$' and coalesce(object_metadata->>'contentLength',object_metadata->>'size')::bigint = ai.preview_file_size))
  );
$$;
create policy presentation_agenda_media_insert_exact_reservation on storage.objects for insert to authenticated with check (bucket_id = 'presentation-agenda-media' and storage.allow_only_operation('object.upload') and private.can_insert_reserved_presentation_agenda_media(name, metadata));

create function private.service_get_presentation_agenda_image_upload(target_image_id uuid, actor_account_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ai public.presentation_agenda_images%rowtype;
begin
  select * into ai from public.presentation_agenda_images where image_id = target_image_id for update;
  if not found or not private.account_can_manage_presentation_content(actor_account_id, ai.presentation_id) then raise exception 'The Agenda image is unavailable.' using errcode = '42501'; end if;
  return jsonb_build_object('image_id',ai.image_id,'bucket_id','presentation-agenda-media','object_path',ai.original_object_path,'mime_type',ai.mime_type,'file_size',ai.file_size,'preview_object_path',ai.preview_object_path,'preview_file_size',ai.preview_file_size,'upload_status',ai.upload_status,'verified',ai.verified_at is not null);
end;
$$;

create function private.service_mark_presentation_agenda_image_upload(target_image_id uuid, actor_account_id uuid, verified boolean, failure_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ai public.presentation_agenda_images%rowtype;
begin
  select * into ai from public.presentation_agenda_images where image_id = target_image_id for update;
  if not found or not private.account_can_manage_presentation_content(actor_account_id, ai.presentation_id) then raise exception 'The Agenda image is unavailable.' using errcode = '42501'; end if;
  if ai.upload_status = 'ready' and verified then return jsonb_build_object('status','ready','idempotent',true,'retired_paths',jsonb_build_array()); end if;
  update public.presentation_agenda_images set upload_status = case when verified then 'ready'::public.presentation_agenda_image_status else 'failed'::public.presentation_agenda_image_status end, verified_at = case when verified then statement_timestamp() else null end, failure_code = case when verified then null else left(coalesce(failure_code,'verification_failed'),80) end, updated_at = statement_timestamp(), updated_by_account_id = actor_account_id where presentation_id = ai.presentation_id;
  return jsonb_build_object('status',case when verified then 'ready' else 'failed' end,'idempotent',false,'retired_paths',jsonb_build_array(ai.retired_original_object_path,ai.retired_preview_object_path));
end;
$$;

create function private.service_finish_presentation_agenda_image_cleanup(target_image_id uuid, actor_account_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.presentation_agenda_images ai set retired_original_object_path = null, retired_preview_object_path = null, updated_at = statement_timestamp(), updated_by_account_id = actor_account_id
  where ai.image_id = target_image_id and private.account_can_manage_presentation_content(actor_account_id, ai.presentation_id);
  if not found then raise exception 'The Agenda image is unavailable.' using errcode = '42501'; end if;
  return true;
end;
$$;

create function private.service_get_presentation_agenda_image_removal(target_presentation_id uuid, actor_account_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ai public.presentation_agenda_images%rowtype;
begin
  select * into ai from public.presentation_agenda_images where presentation_id = target_presentation_id for update;
  if not found or not private.account_can_manage_presentation_content(actor_account_id, target_presentation_id) then raise exception 'The Agenda image is unavailable.' using errcode = '42501'; end if;
  if ai.image_id is null then raise exception 'The Agenda image is unavailable.' using errcode = '22023'; end if;
  return jsonb_build_object('image_id',ai.image_id,'paths',jsonb_build_array(ai.original_object_path,ai.preview_object_path,ai.retired_original_object_path,ai.retired_preview_object_path));
end;
$$;

create function private.service_remove_presentation_agenda_image(target_presentation_id uuid, expected_image_id uuid, actor_account_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ai public.presentation_agenda_images%rowtype;
begin
  select * into ai from public.presentation_agenda_images where presentation_id = target_presentation_id for update;
  if not found or not private.account_can_manage_presentation_content(actor_account_id, target_presentation_id) then raise exception 'The Agenda image is unavailable.' using errcode = '42501'; end if;
  if ai.image_id is distinct from expected_image_id then raise exception 'The Agenda image changed during removal.' using errcode = '55000'; end if;
  update public.presentation_agenda_images set image_id=null, original_object_path=null, original_filename=null, mime_type=null, file_size=null, preview_object_path=null, preview_file_size=null, upload_status=null, verified_at=null, failure_code=null, retired_original_object_path=null, retired_preview_object_path=null, updated_at=statement_timestamp(), updated_by_account_id=actor_account_id where presentation_id=target_presentation_id;
  return true;
end;
$$;

create function public.get_managed_presentation_agenda_image_context(target_presentation_id uuid)
returns table (has_dedicated_image boolean, representative_work_id uuid, work_id uuid, work_title text) language sql security definer set search_path = '' as $$
  select ai.image_id is not null and ai.upload_status = 'ready', ai.representative_work_id, pw.work_id, w.title
  from public.profile_activities pa
  left join public.presentation_agenda_images ai on ai.presentation_id=pa.id
  left join public.presentation_works pw on pw.presentation_id=pa.id and pw.status='accepted' and pw.is_visible
  left join public.works w on w.id=pw.work_id
  where pa.id=target_presentation_id and private.can_manage_presentation_content(pa.id)
    and (pw.work_id is null or private.presentation_representative_work_is_eligible(pa.id,pw.work_id));
$$;

create function private.resolve_public_presentation_agenda_thumbnail(target_presentation_id uuid)
returns table (thumbnail_kind text, dedicated_image_id uuid, dedicated_updated_at timestamptz, work_public_object_path text) language sql stable security definer set search_path = '' as $$
  select case when ai.image_id is not null and ai.upload_status='ready' then 'dedicated' when private.presentation_representative_work_is_eligible(pa.id,ai.representative_work_id) then 'work' else null end,
    case when ai.image_id is not null and ai.upload_status='ready' then ai.image_id else null end,
    case when ai.image_id is not null and ai.upload_status='ready' then ai.updated_at else null end,
    case when private.presentation_representative_work_is_eligible(pa.id,ai.representative_work_id) then wi.public_object_path else null end
  from public.profile_activities pa
  left join public.presentation_agenda_images ai on ai.presentation_id=pa.id
  left join public.work_images wi on wi.work_id=ai.representative_work_id and wi.is_cover and wi.deleted_at is null
  where pa.id=target_presentation_id and private.presentation_has_public_agenda_occurrence(pa.id);
$$;

create function private.service_get_public_presentation_agenda_image(target_presentation_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('preview_object_path', ai.preview_object_path)
  from public.presentation_agenda_images ai
  where ai.presentation_id = target_presentation_id and ai.upload_status = 'ready'
    and private.presentation_has_public_agenda_occurrence(ai.presentation_id);
$$;

-- The Edge Functions call PostgREST's exposed public RPC schema. Keep the
-- privileged implementations private and expose only service-role wrappers.
create function public.service_get_presentation_agenda_image_upload(target_image_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_get_presentation_agenda_image_upload(target_image_id, actor_account_id);
$$;

create function public.service_mark_presentation_agenda_image_upload(target_image_id uuid, actor_account_id uuid, verified boolean, failure_code text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_mark_presentation_agenda_image_upload(target_image_id, actor_account_id, verified, failure_code);
$$;

create function public.service_finish_presentation_agenda_image_cleanup(target_image_id uuid, actor_account_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.service_finish_presentation_agenda_image_cleanup(target_image_id, actor_account_id);
$$;

create function public.service_get_presentation_agenda_image_removal(target_presentation_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.service_get_presentation_agenda_image_removal(target_presentation_id, actor_account_id);
$$;

create function public.service_remove_presentation_agenda_image(target_presentation_id uuid, expected_image_id uuid, actor_account_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.service_remove_presentation_agenda_image(target_presentation_id, expected_image_id, actor_account_id);
$$;

create function public.service_get_public_presentation_agenda_image(target_presentation_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.service_get_public_presentation_agenda_image(target_presentation_id);
$$;

create function public.get_public_agenda_thumbnail_contexts(target_presentation_ids uuid[])
returns table (presentation_id uuid, thumbnail_kind text, dedicated_image_id uuid, dedicated_updated_at timestamptz, work_public_object_path text)
language sql stable security definer set search_path = '' as $$
  select pa.id, resolved.thumbnail_kind, resolved.dedicated_image_id, resolved.dedicated_updated_at, resolved.work_public_object_path
  from public.profile_activities pa cross join lateral private.resolve_public_presentation_agenda_thumbnail(pa.id) resolved
  where pa.id = any(target_presentation_ids);
$$;

drop function public.list_followed_agenda();
create function public.list_followed_agenda()
returns table (
  occurrence_id uuid, owner_profile_id uuid, activity_id uuid, occurrence_type varchar(80), title varchar(300),
  start_date date, end_date date, start_time time without time zone, end_time time without time zone, time_zone varchar(80),
  venue_name varchar(300), city varchar(160), country varchar(160), external_url text, artist_slug varchar(100), artist_display_name varchar(160), presentation_id uuid,
  thumbnail_kind text, dedicated_image_id uuid, dedicated_updated_at timestamptz, work_public_object_path text
)
language sql stable security invoker set search_path = '' as $$
  select ao.id, ao.owner_profile_id, ao.activity_id, ao.occurrence_type,
    coalesce(nullif(trim(ao.title_override), ''), nullif(trim(pa.title), '')), ao.start_date, ao.end_date, ao.start_time, ao.end_time, ao.time_zone,
    coalesce(nullif(trim(ao.venue_name_override), ''), pa.venue_name), coalesce(nullif(trim(ao.city_override), ''), pa.city), pa.country,
    case when pa.id is not null and private.is_public_presentation(pa.id) then pa.external_url else null end,
    p.slug, p.display_name, case when pa.id is not null and private.is_public_presentation(pa.id) then pa.id else null end,
    thumbnail.thumbnail_kind, thumbnail.dedicated_image_id, thumbnail.dedicated_updated_at, thumbnail.work_public_object_path
  from public.profile_follows follow
  join public.public_profiles p on p.id=follow.profile_id and p.profile_type='artist' and p.publication_status='published' and p.published_at is not null
  join public.activity_occurrences ao on ao.owner_profile_id=p.id and ao.visibility='published' and ao.published_at is not null and ao.show_in_agenda and ao.deleted_at is null
  left join public.profile_activities pa on pa.id=ao.activity_id and pa.owner_profile_id=ao.owner_profile_id and pa.visibility='published' and pa.published_at is not null and pa.deleted_at is null
  left join lateral private.resolve_public_presentation_agenda_thumbnail(pa.id) thumbnail on pa.id is not null
  where (select private.current_account_is_active()) and follow.account_id=(select auth.uid()) and (ao.activity_id is null or pa.id is not null)
    and coalesce(nullif(trim(ao.title_override), ''), nullif(trim(pa.title), '')) <> '' and nullif(trim(ao.occurrence_type), '') is not null
  order by ao.start_date asc, ao.start_time asc nulls last, ao.id asc;
$$;

revoke all on function private.presentation_has_public_agenda_occurrence(uuid), private.presentation_representative_work_is_eligible(uuid,uuid), private.account_can_manage_presentation_content(uuid,uuid), private.reserve_presentation_agenda_image_upload(uuid,text,text,bigint,bigint), private.set_presentation_representative_work(uuid,uuid), private.can_insert_reserved_presentation_agenda_media(text,jsonb), private.service_get_presentation_agenda_image_upload(uuid,uuid), private.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text), private.service_finish_presentation_agenda_image_cleanup(uuid,uuid), private.service_get_presentation_agenda_image_removal(uuid,uuid), private.service_remove_presentation_agenda_image(uuid,uuid,uuid), private.resolve_public_presentation_agenda_thumbnail(uuid), private.service_get_public_presentation_agenda_image(uuid) from public, anon, authenticated;
revoke all on function public.service_get_presentation_agenda_image_upload(uuid,uuid), public.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text), public.service_finish_presentation_agenda_image_cleanup(uuid,uuid), public.service_get_presentation_agenda_image_removal(uuid,uuid), public.service_remove_presentation_agenda_image(uuid,uuid,uuid), public.service_get_public_presentation_agenda_image(uuid) from public, anon, authenticated;
revoke all on function public.reserve_presentation_agenda_image_upload(uuid,text,text,bigint,bigint), public.set_presentation_representative_work(uuid,uuid), public.get_managed_presentation_agenda_image_context(uuid), public.get_public_agenda_thumbnail_contexts(uuid[]) from public, anon;
grant execute on function public.reserve_presentation_agenda_image_upload(uuid,text,text,bigint,bigint), public.set_presentation_representative_work(uuid,uuid), public.get_managed_presentation_agenda_image_context(uuid) to authenticated;
grant execute on function public.get_public_agenda_thumbnail_contexts(uuid[]) to anon, authenticated;
revoke all on function public.list_followed_agenda() from public, anon;
grant execute on function public.list_followed_agenda() to authenticated;
grant execute on function private.reserve_presentation_agenda_image_upload(uuid,text,text,bigint,bigint), private.set_presentation_representative_work(uuid,uuid), private.resolve_public_presentation_agenda_thumbnail(uuid) to authenticated;
grant execute on function private.service_get_presentation_agenda_image_upload(uuid,uuid), private.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text), private.service_finish_presentation_agenda_image_cleanup(uuid,uuid), private.service_get_presentation_agenda_image_removal(uuid,uuid), private.service_remove_presentation_agenda_image(uuid,uuid,uuid), private.service_get_public_presentation_agenda_image(uuid) to service_role;
grant execute on function public.service_get_presentation_agenda_image_upload(uuid,uuid), public.service_mark_presentation_agenda_image_upload(uuid,uuid,boolean,text), public.service_finish_presentation_agenda_image_cleanup(uuid,uuid), public.service_get_presentation_agenda_image_removal(uuid,uuid), public.service_remove_presentation_agenda_image(uuid,uuid,uuid), public.service_get_public_presentation_agenda_image(uuid) to service_role;
