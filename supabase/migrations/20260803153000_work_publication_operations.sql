-- Recoverable publication, unpublication, upload verification, and image deletion.

create type public.work_publication_operation_kind as enum (
  'publish',
  'unpublish',
  'public_cleanup'
);

create type public.work_publication_operation_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed',
  'cleanup_pending'
);

create type public.work_publication_copy_status as enum (
  'pending',
  'created',
  'removed',
  'cleanup_pending'
);

alter table public.works
  add column publication_revision uuid;

alter table public.work_images
  add column cleanup_public_object_path text,
  add constraint work_images_cleanup_public_path_length
    check (cleanup_public_object_path is null or char_length(cleanup_public_object_path) between 1 and 1024),
  add constraint work_images_cleanup_public_path_distinct
    check (cleanup_public_object_path is null or cleanup_public_object_path <> private_object_path);

create table public.work_publication_operations (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete restrict,
  operation_kind public.work_publication_operation_kind not null,
  status public.work_publication_operation_status not null default 'pending',
  idempotency_key uuid,
  publication_revision uuid,
  actor_account_id uuid not null references public.accounts (id) on delete restrict,
  failure_code varchar(80),
  cleanup_required boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint work_publication_operations_revision_consistent
    check (operation_kind <> 'publish' or publication_revision is not null),
  constraint work_publication_operations_failure_code_length
    check (failure_code is null or char_length(failure_code) between 1 and 80),
  constraint work_publication_operations_cleanup_consistent
    check (
      (status = 'cleanup_pending' and cleanup_required)
      or (status <> 'cleanup_pending')
    ),
  constraint work_publication_operations_timestamps_consistent
    check (
      (status = 'pending' and started_at is null and finished_at is null)
      or (status in ('running', 'cleanup_pending') and started_at is not null and finished_at is null)
      or (status in ('succeeded', 'failed') and started_at is not null and finished_at is not null)
    )
);

create table public.work_publication_operation_images (
  operation_id uuid not null references public.work_publication_operations (id) on delete restrict,
  work_image_id uuid not null references public.work_images (id) on delete restrict,
  private_object_path text not null,
  public_object_path text not null,
  mime_type varchar(80) not null,
  file_size bigint not null,
  copy_status public.work_publication_copy_status not null default 'pending',
  updated_at timestamptz not null default now(),
  primary key (operation_id, work_image_id),
  constraint work_publication_operation_images_paths_differ
    check (private_object_path <> public_object_path),
  constraint work_publication_operation_images_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint work_publication_operation_images_file_size_valid
    check (file_size between 1 and 52428800)
);

create unique index work_publication_operations_idempotency
  on public.work_publication_operations (work_id, operation_kind, idempotency_key)
  where idempotency_key is not null;

create unique index work_publication_operations_one_active_per_work
  on public.work_publication_operations (work_id)
  where status in ('pending', 'running', 'cleanup_pending');

create index work_publication_operations_history
  on public.work_publication_operations (work_id, created_at desc, id);

alter table public.work_publication_operations enable row level security;
alter table public.work_publication_operations force row level security;
alter table public.work_publication_operation_images enable row level security;
alter table public.work_publication_operation_images force row level security;

revoke all on public.work_publication_operations from public, anon, authenticated;
revoke all on public.work_publication_operation_images from public, anon, authenticated;

create trigger work_publication_operations_set_updated_at
before update on public.work_publication_operations
for each row execute function private.set_updated_at();

create trigger work_publication_operation_images_set_updated_at
before update on public.work_publication_operation_images
for each row execute function private.set_updated_at();

create function private.account_can_manage_work(
  actor_account_id uuid,
  target_work_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.accounts as a
      join public.works as w on w.id = target_work_id
      join public.public_profiles as artist
        on artist.id = w.owner_profile_id
       and artist.profile_type = 'artist'
       and artist.deleted_at is null
     where a.id = actor_account_id
       and a.status = 'active'
       and w.deleted_at is null
       and (
         exists (
           select 1
             from public.profile_members as direct_member
            where direct_member.profile_id = artist.id
              and direct_member.account_id = actor_account_id
              and direct_member.status = 'active'
              and direct_member.revoked_at is null
         )
         or exists (
           select 1
             from public.profile_access_grants as grant_row
             join public.public_profiles as institution
               on institution.id = grant_row.grantee_profile_id
              and institution.profile_type = 'institution'
              and institution.deleted_at is null
             join public.profile_members as institution_member
               on institution_member.profile_id = institution.id
              and institution_member.account_id = actor_account_id
              and institution_member.status = 'active'
              and institution_member.revoked_at is null
            where grant_row.grantor_profile_id = artist.id
              and grant_row.scope = 'works_editor'
              and grant_row.status = 'active'
              and grant_row.expired_at is null
              and grant_row.revoked_at is null
              and (grant_row.expires_at is null or grant_row.expires_at > statement_timestamp())
         )
       )
  );
$$;

revoke all on function private.account_can_manage_work(uuid, uuid) from public, anon, authenticated;
grant usage on schema private to service_role;

create function private.service_get_work_image_upload(
  target_image_id uuid,
  actor_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_row record;
begin
  select wi.id,
         wi.work_id,
         wi.private_object_path,
         wi.mime_type,
         wi.file_size,
         wi.upload_status,
         wi.original_verified_at,
         w.visibility,
         w.deleted_at as work_deleted_at
    into image_row
    from public.work_images as wi
    join public.works as w on w.id = wi.work_id
   where wi.id = target_image_id
     and wi.deleted_at is null;

  if not found
     or not private.account_can_manage_work(actor_account_id, image_row.work_id)
     or image_row.work_deleted_at is not null then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;

  if image_row.visibility <> 'draft' then
    raise exception 'Only draft Work uploads may be finalized.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'work_image_id', image_row.id,
    'work_id', image_row.work_id,
    'bucket_id', 'work-originals',
    'object_path', image_row.private_object_path,
    'mime_type', image_row.mime_type,
    'file_size', image_row.file_size,
    'upload_status', image_row.upload_status,
    'verified', image_row.original_verified_at is not null
  );
end;
$$;

create function private.service_mark_work_image_upload(
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
          jsonb_build_object('work_id', image_row.work_id, 'failure_code', left(coalesce(nullif(trim(sanitized_failure_code), ''), 'verification_failed'), 80)));

  return jsonb_build_object('status', 'failed');
end;
$$;

create function private.service_claim_work_publication(
  target_work_id uuid,
  actor_account_id uuid,
  requested_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  existing_operation public.work_publication_operations%rowtype;
  new_operation_id uuid := gen_random_uuid();
  revision_id uuid := gen_random_uuid();
  image_count integer;
  cover_count integer;
  unready_count integer;
  image_payload jsonb;
begin
  if not private.account_can_manage_work(actor_account_id, target_work_id) then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  select * into work_row from public.works where id = target_work_id for update;
  if not found or work_row.deleted_at is not null then
    raise exception 'The Work is unavailable.' using errcode = '22023';
  end if;

  if requested_idempotency_key is not null then
    select * into existing_operation
      from public.work_publication_operations
     where work_id = target_work_id
       and operation_kind = 'publish'
       and idempotency_key = requested_idempotency_key;

    if found then
      return jsonb_build_object(
        'operation_id', existing_operation.id,
        'status', existing_operation.status,
        'idempotent', true,
        'images', coalesce((
          select jsonb_agg(jsonb_build_object(
            'work_image_id', oi.work_image_id,
            'private_object_path', oi.private_object_path,
            'public_object_path', oi.public_object_path,
            'mime_type', oi.mime_type,
            'file_size', oi.file_size,
            'copy_status', oi.copy_status
          ) order by wi.sort_order, wi.id)
          from public.work_publication_operation_images oi
          join public.work_images wi on wi.id = oi.work_image_id
          where oi.operation_id = existing_operation.id
        ), '[]'::jsonb)
      );
    end if;
  end if;

  if work_row.visibility = 'published' then
    return jsonb_build_object('status', 'published', 'idempotent', true, 'images', '[]'::jsonb);
  end if;

  if exists (
    select 1 from public.work_publication_operations
     where work_id = target_work_id
       and status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'A conflicting media operation is active.' using errcode = '55000';
  end if;

  select count(*),
         count(*) filter (where is_cover),
         count(*) filter (where upload_status <> 'ready' or original_verified_at is null or file_size is null)
    into image_count, cover_count, unready_count
    from public.work_images
   where work_id = target_work_id
     and deleted_at is null;

  if image_count = 0 then
    raise exception 'Publication requires at least one image.' using errcode = '22023';
  end if;
  if cover_count <> 1 then
    raise exception 'Publication requires exactly one cover image.' using errcode = '22023';
  end if;
  if unready_count <> 0 then
    raise exception 'Every image must be verified before publication.' using errcode = '22023';
  end if;

  insert into public.work_publication_operations (
    id, work_id, operation_kind, status, idempotency_key,
    publication_revision, actor_account_id, started_at
  ) values (
    new_operation_id, target_work_id, 'publish', 'running', requested_idempotency_key,
    revision_id, actor_account_id, statement_timestamp()
  );

  insert into public.work_publication_operation_images (
    operation_id, work_image_id, private_object_path, public_object_path,
    mime_type, file_size
  )
  select new_operation_id,
         wi.id,
         wi.private_object_path,
         lower(work_row.owner_profile_id::text) || '/' || lower(target_work_id::text)
           || '/' || lower(revision_id::text) || '/' || lower(wi.id::text) || '.'
           || case wi.mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
                  when 'image/webp' then 'webp' when 'image/avif' then 'avif' end,
         wi.mime_type,
         wi.file_size
    from public.work_images wi
   where wi.work_id = target_work_id
     and wi.deleted_at is null
   order by wi.sort_order, wi.id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id, metadata)
  values (actor_account_id, 'work.publication_started', 'work', target_work_id, new_operation_id,
          jsonb_build_object('image_count', image_count));

  select jsonb_agg(jsonb_build_object(
           'work_image_id', oi.work_image_id,
           'private_object_path', oi.private_object_path,
           'public_object_path', oi.public_object_path,
           'mime_type', oi.mime_type,
           'file_size', oi.file_size,
           'copy_status', oi.copy_status
         ) order by wi.sort_order, wi.id)
    into image_payload
    from public.work_publication_operation_images oi
    join public.work_images wi on wi.id = oi.work_image_id
   where oi.operation_id = new_operation_id;

  return jsonb_build_object(
    'operation_id', new_operation_id,
    'status', 'running',
    'idempotent', false,
    'images', image_payload
  );
exception
  when unique_violation then
    raise exception 'A conflicting media operation is active.' using errcode = '55000';
end;
$$;

create function private.service_record_publication_copy(
  target_operation_id uuid,
  target_image_id uuid,
  actor_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.work_publication_operations%rowtype;
begin
  select * into operation_row
    from public.work_publication_operations
   where id = target_operation_id
   for update;

  if not found or operation_row.operation_kind <> 'publish'
     or operation_row.status <> 'running'
     or not private.account_can_manage_work(actor_account_id, operation_row.work_id) then
    raise exception 'The publication operation is unavailable.' using errcode = '42501';
  end if;

  update public.work_publication_operation_images
     set copy_status = 'created'
   where operation_id = target_operation_id
     and work_image_id = target_image_id
     and copy_status in ('pending', 'created');

  return found;
end;
$$;

create function private.service_finalize_work_publication(
  target_operation_id uuid,
  actor_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.work_publication_operations%rowtype;
  expected_count integer;
  created_count integer;
  active_count integer;
begin
  select * into operation_row
    from public.work_publication_operations
   where id = target_operation_id
   for update;

  if not found or operation_row.operation_kind <> 'publish'
     or not private.account_can_manage_work(actor_account_id, operation_row.work_id) then
    raise exception 'The publication operation is unavailable.' using errcode = '42501';
  end if;

  if operation_row.status = 'succeeded' then
    return jsonb_build_object('status', 'published', 'idempotent', true);
  end if;
  if operation_row.status <> 'running' then
    raise exception 'The publication operation cannot be finalized.' using errcode = '55000';
  end if;

  select count(*), count(*) filter (where copy_status = 'created')
    into expected_count, created_count
    from public.work_publication_operation_images
   where operation_id = target_operation_id;

  select count(*) into active_count
    from public.work_images
   where work_id = operation_row.work_id
     and deleted_at is null
     and upload_status = 'ready'
     and original_verified_at is not null;

  if expected_count = 0 or created_count <> expected_count or active_count <> expected_count
     or exists (
       select 1
         from public.work_images wi
        where wi.work_id = operation_row.work_id
          and wi.deleted_at is null
          and not exists (
            select 1 from public.work_publication_operation_images oi
             where oi.operation_id = target_operation_id
               and oi.work_image_id = wi.id
          )
     ) then
    raise exception 'The publication copy set is incomplete.' using errcode = '55000';
  end if;

  update public.work_images wi
     set public_object_path = oi.public_object_path,
         updated_by_account_id = actor_account_id
    from public.work_publication_operation_images oi
   where oi.operation_id = target_operation_id
     and oi.work_image_id = wi.id;

  update public.works
     set publication_revision = operation_row.publication_revision,
         visibility = 'published',
         published_at = statement_timestamp(),
         updated_by_account_id = actor_account_id
   where id = operation_row.work_id
     and deleted_at is null;

  if not found then
    raise exception 'The Work is unavailable.' using errcode = '55000';
  end if;

  update public.work_publication_operations
     set status = 'succeeded',
         cleanup_required = false,
         failure_code = null,
         finished_at = statement_timestamp()
   where id = target_operation_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id, metadata)
  values (actor_account_id, 'work.published', 'work', operation_row.work_id, target_operation_id,
          jsonb_build_object('image_count', expected_count));

  return jsonb_build_object('status', 'published', 'idempotent', false);
end;
$$;

create function private.service_fail_work_publication(
  target_operation_id uuid,
  actor_account_id uuid,
  sanitized_failure_code text,
  cleanup_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.work_publication_operations%rowtype;
  next_status public.work_publication_operation_status;
  safe_code text := left(coalesce(nullif(trim(sanitized_failure_code), ''), 'publication_failed'), 80);
begin
  select * into operation_row from public.work_publication_operations
   where id = target_operation_id for update;
  if not found or operation_row.operation_kind <> 'publish'
     or not private.account_can_manage_work(actor_account_id, operation_row.work_id) then
    raise exception 'The publication operation is unavailable.' using errcode = '42501';
  end if;

  if operation_row.status in ('failed', 'succeeded') then
    return jsonb_build_object('status', operation_row.status, 'idempotent', true);
  end if;

  next_status := case when cleanup_complete then 'failed' else 'cleanup_pending' end;
  update public.work_publication_operations
     set status = next_status,
         failure_code = safe_code,
         cleanup_required = not cleanup_complete,
         finished_at = case when cleanup_complete then statement_timestamp() else null end
   where id = target_operation_id;

  update public.work_publication_operation_images
     set copy_status = (case when cleanup_complete then 'removed' else 'cleanup_pending' end)::public.work_publication_copy_status
   where operation_id = target_operation_id
     and copy_status <> 'pending';

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
  values (actor_account_id, 'work.publication_failed', 'work', operation_row.work_id, 'failed', target_operation_id,
          jsonb_build_object('failure_code', safe_code, 'cleanup_state', case when cleanup_complete then 'completed' else 'pending' end));

  if cleanup_complete then
    insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id)
    values (actor_account_id, 'work.public_cleanup_completed', 'work', operation_row.work_id, target_operation_id);
  else
    insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id)
    values (actor_account_id, 'work.public_cleanup_pending', 'work', operation_row.work_id, 'pending', target_operation_id);
  end if;

  return jsonb_build_object('status', next_status, 'cleanup_required', not cleanup_complete);
end;
$$;

create function private.service_begin_work_unpublication(
  target_work_id uuid,
  actor_account_id uuid,
  requested_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  existing_operation public.work_publication_operations%rowtype;
  new_operation_id uuid := gen_random_uuid();
  path_payload jsonb;
begin
  if not private.account_can_manage_work(actor_account_id, target_work_id) then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  select * into work_row from public.works where id = target_work_id for update;
  if not found or work_row.deleted_at is not null then
    raise exception 'The Work is unavailable.' using errcode = '22023';
  end if;

  if requested_idempotency_key is not null then
    select * into existing_operation
      from public.work_publication_operations
     where work_id = target_work_id
       and operation_kind = 'unpublish'
       and idempotency_key = requested_idempotency_key;
    if found then
      select coalesce(jsonb_agg(jsonb_build_object('public_object_path', public_object_path)), '[]'::jsonb)
        into path_payload
        from public.work_publication_operation_images
       where operation_id = existing_operation.id
         and copy_status in ('created', 'cleanup_pending');
      return jsonb_build_object('operation_id', existing_operation.id, 'status', existing_operation.status,
                                'idempotent', true, 'images', path_payload);
    end if;
  end if;

  if work_row.visibility = 'draft' then
    return jsonb_build_object('status', 'already_hidden', 'idempotent', true, 'images', '[]'::jsonb);
  end if;

  if exists (
    select 1 from public.work_publication_operations
     where work_id = target_work_id and status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'A conflicting media operation is active.' using errcode = '55000';
  end if;

  insert into public.work_publication_operations (
    id, work_id, operation_kind, status, idempotency_key,
    publication_revision, actor_account_id, started_at
  ) values (
    new_operation_id, target_work_id, 'unpublish', 'running', requested_idempotency_key,
    work_row.publication_revision, actor_account_id, statement_timestamp()
  );

  insert into public.work_publication_operation_images (
    operation_id, work_image_id, private_object_path, public_object_path,
    mime_type, file_size, copy_status
  )
  select new_operation_id, wi.id, wi.private_object_path, wi.public_object_path,
         wi.mime_type, wi.file_size, 'created'
    from public.work_images wi
   where wi.work_id = target_work_id
     and wi.deleted_at is null
     and wi.public_object_path is not null;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id)
  values (actor_account_id, 'work.unpublication_started', 'work', target_work_id, new_operation_id);

  update public.work_images
     set public_object_path = null,
         updated_by_account_id = actor_account_id
   where work_id = target_work_id
     and deleted_at is null;

  update public.works
     set visibility = 'draft',
         published_at = null,
         publication_revision = null,
         updated_by_account_id = actor_account_id
   where id = target_work_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id)
  values (actor_account_id, 'work.unpublished', 'work', target_work_id, new_operation_id);

  select coalesce(jsonb_agg(jsonb_build_object('public_object_path', public_object_path)), '[]'::jsonb)
    into path_payload
    from public.work_publication_operation_images
   where operation_id = new_operation_id;

  return jsonb_build_object('operation_id', new_operation_id, 'status', 'running',
                            'idempotent', false, 'images', path_payload);
exception when unique_violation then
  raise exception 'A conflicting media operation is active.' using errcode = '55000';
end;
$$;

create function private.service_record_public_cleanup(
  target_operation_id uuid,
  actor_account_id uuid,
  cleanup_complete boolean,
  sanitized_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.work_publication_operations%rowtype;
  safe_code text := case when cleanup_complete then null else left(coalesce(nullif(trim(sanitized_failure_code), ''), 'cleanup_failed'), 80) end;
begin
  select * into operation_row from public.work_publication_operations
   where id = target_operation_id for update;
  if not found or operation_row.operation_kind not in ('unpublish', 'public_cleanup')
     or not private.account_can_manage_work(actor_account_id, operation_row.work_id) then
    raise exception 'The cleanup operation is unavailable.' using errcode = '42501';
  end if;

  if operation_row.status = 'succeeded' then
    return jsonb_build_object('status', 'succeeded', 'idempotent', true, 'cleanup_required', false);
  end if;

  update public.work_publication_operations
     set status = (case when cleanup_complete then 'succeeded' else 'cleanup_pending' end)::public.work_publication_operation_status,
         cleanup_required = not cleanup_complete,
         failure_code = safe_code,
         finished_at = case when cleanup_complete then statement_timestamp() else null end
   where id = target_operation_id;

  update public.work_publication_operation_images
     set copy_status = (case when cleanup_complete then 'removed' else 'cleanup_pending' end)::public.work_publication_copy_status
   where operation_id = target_operation_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
  values (actor_account_id,
          case when cleanup_complete then 'work.public_cleanup_completed' else 'work.public_cleanup_pending' end,
          'work', operation_row.work_id,
          case when cleanup_complete then 'succeeded' else 'pending' end,
          target_operation_id,
          case when cleanup_complete then '{}'::jsonb else jsonb_build_object('failure_code', safe_code) end);

  return jsonb_build_object('status', case when cleanup_complete then 'succeeded' else 'cleanup_pending' end,
                            'cleanup_required', not cleanup_complete, 'idempotent', false);
end;
$$;

create function private.service_begin_work_image_deletion(
  target_image_id uuid,
  actor_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_row public.work_images%rowtype;
  work_row public.works%rowtype;
  remaining_count integer;
  replacement_cover_id uuid;
  stale_public_path text;
begin
  select * into image_row from public.work_images where id = target_image_id for update;
  if not found or not private.account_can_manage_work(actor_account_id, image_row.work_id) then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;

  select * into work_row from public.works where id = image_row.work_id for update;
  if work_row.deleted_at is not null or work_row.visibility <> 'draft' then
    raise exception 'Images may be deleted only from active draft Works.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.work_publication_operations
     where work_id = image_row.work_id and status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'A publication operation is active.' using errcode = '55000';
  end if;

  if image_row.upload_status in ('deleting', 'cleanup_pending', 'deleted') or image_row.deleted_at is not null then
    return jsonb_build_object(
      'status', image_row.upload_status,
      'idempotent', true,
      'private_object_path', image_row.private_object_path,
      'public_object_path', image_row.cleanup_public_object_path
    );
  end if;

  select count(*) into remaining_count
    from public.work_images
   where work_id = image_row.work_id
     and deleted_at is null
     and id <> target_image_id;

  if image_row.is_cover and remaining_count > 0 then
    select id into replacement_cover_id
      from public.work_images
     where work_id = image_row.work_id
       and deleted_at is null
       and id <> target_image_id
     order by sort_order, id
     limit 1;

    update public.work_images
       set is_cover = true,
           updated_by_account_id = actor_account_id
     where id = replacement_cover_id;
  end if;

  stale_public_path := image_row.public_object_path;
  update public.work_images
     set upload_status = 'deleting',
         deletion_started_at = statement_timestamp(),
         deleted_at = statement_timestamp(),
         deleted_by_account_id = actor_account_id,
         public_object_path = null,
         cleanup_public_object_path = stale_public_path,
         cleanup_required = true,
         failure_code = null,
         cleanup_failure_code = null,
         is_cover = false,
         updated_by_account_id = actor_account_id
   where id = target_image_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, metadata)
  values (actor_account_id, 'work_image.deletion_started', 'work_image', target_image_id,
          jsonb_build_object('work_id', image_row.work_id, 'was_only_image', remaining_count = 0));

  return jsonb_build_object('status', 'deleting', 'idempotent', false,
                            'private_object_path', image_row.private_object_path,
                            'public_object_path', stale_public_path);
end;
$$;

create function private.service_finish_work_image_deletion(
  target_image_id uuid,
  actor_account_id uuid,
  cleanup_complete boolean,
  sanitized_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_row public.work_images%rowtype;
  safe_code text := case when cleanup_complete then null else left(coalesce(nullif(trim(sanitized_failure_code), ''), 'cleanup_failed'), 80) end;
begin
  select * into image_row from public.work_images where id = target_image_id for update;
  if not found or not private.account_can_manage_work(actor_account_id, image_row.work_id) then
    raise exception 'The image is unavailable.' using errcode = '42501';
  end if;

  if image_row.upload_status = 'deleted' and cleanup_complete then
    return jsonb_build_object('status', 'deleted', 'idempotent', true, 'cleanup_required', false);
  end if;
  if image_row.upload_status not in ('deleting', 'cleanup_pending') then
    raise exception 'The image deletion is not active.' using errcode = '55000';
  end if;

  update public.work_images
     set upload_status = (case when cleanup_complete then 'deleted' else 'cleanup_pending' end)::public.work_image_upload_status,
         cleanup_required = not cleanup_complete,
         cleanup_failure_code = safe_code,
         cleanup_public_object_path = case when cleanup_complete then null else cleanup_public_object_path end,
         updated_by_account_id = actor_account_id
   where id = target_image_id;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (actor_account_id,
          case when cleanup_complete then 'work_image.deleted' else 'work_image.cleanup_pending' end,
          'work_image', target_image_id,
          case when cleanup_complete then 'succeeded' else 'pending' end,
          case when cleanup_complete then jsonb_build_object('work_id', image_row.work_id)
               else jsonb_build_object('work_id', image_row.work_id, 'failure_code', safe_code) end);

  return jsonb_build_object('status', case when cleanup_complete then 'deleted' else 'cleanup_pending' end,
                            'cleanup_required', not cleanup_complete, 'idempotent', false);
end;
$$;

-- Exposed-schema wrappers are SECURITY INVOKER and service-role only. The
-- privileged implementations remain in the non-exposed private schema.
create function public.service_get_work_image_upload(target_image_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_get_work_image_upload(target_image_id, actor_account_id); $$;

create function public.service_mark_work_image_upload(target_image_id uuid, actor_account_id uuid, verified boolean, failure_code text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_mark_work_image_upload(target_image_id, actor_account_id, verified, failure_code); $$;

create function public.service_claim_work_publication(target_work_id uuid, actor_account_id uuid, idempotency_key uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_claim_work_publication(target_work_id, actor_account_id, idempotency_key); $$;

create function public.service_record_publication_copy(target_operation_id uuid, target_image_id uuid, actor_account_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.service_record_publication_copy(target_operation_id, target_image_id, actor_account_id); $$;

create function public.service_finalize_work_publication(target_operation_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_finalize_work_publication(target_operation_id, actor_account_id); $$;

create function public.service_fail_work_publication(target_operation_id uuid, actor_account_id uuid, failure_code text, cleanup_complete boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_fail_work_publication(target_operation_id, actor_account_id, failure_code, cleanup_complete); $$;

create function public.service_begin_work_unpublication(target_work_id uuid, actor_account_id uuid, idempotency_key uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_begin_work_unpublication(target_work_id, actor_account_id, idempotency_key); $$;

create function public.service_record_public_cleanup(target_operation_id uuid, actor_account_id uuid, cleanup_complete boolean, failure_code text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_record_public_cleanup(target_operation_id, actor_account_id, cleanup_complete, failure_code); $$;

create function public.service_begin_work_image_deletion(target_image_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_begin_work_image_deletion(target_image_id, actor_account_id); $$;

create function public.service_finish_work_image_deletion(target_image_id uuid, actor_account_id uuid, cleanup_complete boolean, failure_code text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_finish_work_image_deletion(target_image_id, actor_account_id, cleanup_complete, failure_code); $$;

revoke all on function private.service_get_work_image_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_mark_work_image_upload(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function private.service_claim_work_publication(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_record_publication_copy(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_finalize_work_publication(uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_fail_work_publication(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.service_begin_work_unpublication(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_record_public_cleanup(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function private.service_begin_work_image_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_finish_work_image_deletion(uuid, uuid, boolean, text) from public, anon, authenticated;

grant execute on function private.service_get_work_image_upload(uuid, uuid) to service_role;
grant execute on function private.service_mark_work_image_upload(uuid, uuid, boolean, text) to service_role;
grant execute on function private.service_claim_work_publication(uuid, uuid, uuid) to service_role;
grant execute on function private.service_record_publication_copy(uuid, uuid, uuid) to service_role;
grant execute on function private.service_finalize_work_publication(uuid, uuid) to service_role;
grant execute on function private.service_fail_work_publication(uuid, uuid, text, boolean) to service_role;
grant execute on function private.service_begin_work_unpublication(uuid, uuid, uuid) to service_role;
grant execute on function private.service_record_public_cleanup(uuid, uuid, boolean, text) to service_role;
grant execute on function private.service_begin_work_image_deletion(uuid, uuid) to service_role;
grant execute on function private.service_finish_work_image_deletion(uuid, uuid, boolean, text) to service_role;

revoke all on function public.service_get_work_image_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_mark_work_image_upload(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.service_claim_work_publication(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_record_publication_copy(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_finalize_work_publication(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_fail_work_publication(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.service_begin_work_unpublication(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_record_public_cleanup(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.service_begin_work_image_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_finish_work_image_deletion(uuid, uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.service_get_work_image_upload(uuid, uuid) to service_role;
grant execute on function public.service_mark_work_image_upload(uuid, uuid, boolean, text) to service_role;
grant execute on function public.service_claim_work_publication(uuid, uuid, uuid) to service_role;
grant execute on function public.service_record_publication_copy(uuid, uuid, uuid) to service_role;
grant execute on function public.service_finalize_work_publication(uuid, uuid) to service_role;
grant execute on function public.service_fail_work_publication(uuid, uuid, text, boolean) to service_role;
grant execute on function public.service_begin_work_unpublication(uuid, uuid, uuid) to service_role;
grant execute on function public.service_record_public_cleanup(uuid, uuid, boolean, text) to service_role;
grant execute on function public.service_begin_work_image_deletion(uuid, uuid) to service_role;
grant execute on function public.service_finish_work_image_deletion(uuid, uuid, boolean, text) to service_role;
