-- Phase 1 only: durable internal contracts for future trusted public-image
-- derivatives. No upload finalizer, publication, deletion, Storage policy, or
-- browser contract is changed by this migration.

create type private.work_image_derivative_state as enum (
  'pending', 'processing', 'ready', 'failed'
);

create type private.work_image_derivative_rendition_key as enum (
  'small', 'large'
);

create table private.work_image_derivative_jobs (
  id uuid primary key default gen_random_uuid(),
  work_image_id uuid not null references public.work_images (id) on delete cascade,
  -- A Work-image row is immutable source identity: reservation creates a new row
  -- and exact original path for replacement media. Keep the path snapshot so a
  -- privileged later mutation cannot let an old lease complete a new source.
  source_private_object_path text not null,
  state private.work_image_derivative_state not null default 'pending',
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 3,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_code varchar(80),
  failure_detail varchar(240),
  requested_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_image_derivative_jobs_one_source unique (work_image_id, source_private_object_path),
  constraint work_image_derivative_jobs_attempts_valid check (attempt_count between 0 and max_attempts and max_attempts between 1 and 10),
  constraint work_image_derivative_jobs_failure_code_length check (failure_code is null or char_length(failure_code) between 1 and 80),
  constraint work_image_derivative_jobs_failure_detail_length check (failure_detail is null or char_length(failure_detail) between 1 and 240),
  constraint work_image_derivative_jobs_state_consistent check (
    (state = 'pending' and lease_token is null and lease_expires_at is null and claimed_at is null and completed_at is null)
    or (state = 'processing' and lease_token is not null and lease_expires_at is not null and claimed_at is not null and completed_at is null)
    or (state = 'ready' and lease_token is null and lease_expires_at is null and claimed_at is not null and completed_at is not null)
    or (state = 'failed' and lease_token is null and lease_expires_at is null and completed_at is not null)
  )
);

create table private.work_image_derivatives (
  id uuid primary key default gen_random_uuid(),
  work_image_id uuid not null references public.work_images (id) on delete cascade,
  source_private_object_path text not null,
  rendition_key private.work_image_derivative_rendition_key not null,
  state private.work_image_derivative_state not null default 'pending',
  staging_bucket text not null default 'work-derivative-staging',
  staging_object_path text not null,
  mime_type varchar(80),
  file_size bigint,
  pixel_width integer,
  pixel_height integer,
  checksum_sha256 char(64),
  pipeline_version varchar(80),
  icc_profile_version varchar(80),
  verified_at timestamptz,
  completed_at timestamptz,
  failure_code varchar(80),
  failure_detail varchar(240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_image_derivatives_one_rendition_per_source unique (work_image_id, source_private_object_path, rendition_key),
  constraint work_image_derivatives_staging_path_length check (char_length(staging_object_path) between 1 and 1024),
  constraint work_image_derivatives_file_size_valid check (file_size is null or file_size > 0),
  constraint work_image_derivatives_dimensions_valid check ((pixel_width is null or pixel_width > 0) and (pixel_height is null or pixel_height > 0)),
  constraint work_image_derivatives_checksum_valid check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint work_image_derivatives_failure_code_length check (failure_code is null or char_length(failure_code) between 1 and 80),
  constraint work_image_derivatives_failure_detail_length check (failure_detail is null or char_length(failure_detail) between 1 and 240),
  constraint work_image_derivatives_state_consistent check (
    (state = 'pending' and mime_type is null and file_size is null and pixel_width is null and pixel_height is null and checksum_sha256 is null and verified_at is null and completed_at is null)
    or (state = 'processing' and completed_at is null)
    or (state = 'ready' and mime_type = 'image/webp' and file_size is not null and pixel_width is not null and pixel_height is not null and checksum_sha256 is not null and pipeline_version is not null and icc_profile_version is not null and verified_at is not null and completed_at is not null)
    or (state = 'failed' and completed_at is not null)
  )
);

create index work_image_derivative_jobs_claimable
  on private.work_image_derivative_jobs (available_at, created_at)
  where state in ('pending', 'processing');

create index work_image_derivatives_source
  on private.work_image_derivatives (work_image_id, source_private_object_path);

alter table private.work_image_derivative_jobs enable row level security;
alter table private.work_image_derivative_jobs force row level security;
alter table private.work_image_derivatives enable row level security;
alter table private.work_image_derivatives force row level security;
revoke all on private.work_image_derivative_jobs from public, anon, authenticated;
revoke all on private.work_image_derivatives from public, anon, authenticated;

create trigger work_image_derivative_jobs_set_updated_at
before update on private.work_image_derivative_jobs
for each row execute function private.set_updated_at();

create trigger work_image_derivatives_set_updated_at
before update on private.work_image_derivatives
for each row execute function private.set_updated_at();

-- This table deliberately remains non-readable to browser roles in Phase 1.
-- A later sanitized public view may project only immutable public rendition URLs.
create table public.work_publication_derivatives (
  operation_id uuid not null references public.work_publication_operations (id) on delete restrict,
  publication_revision uuid not null,
  work_image_id uuid not null references public.work_images (id) on delete restrict,
  rendition_key private.work_image_derivative_rendition_key not null,
  source_derivative_id uuid not null references private.work_image_derivatives (id) on delete restrict,
  public_object_path text not null,
  mime_type varchar(80) not null default 'image/webp',
  file_size bigint,
  pixel_width integer,
  pixel_height integer,
  copy_status public.work_publication_copy_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (operation_id, work_image_id, rendition_key),
  unique (public_object_path),
  constraint work_publication_derivatives_path_length check (char_length(public_object_path) between 1 and 1024),
  constraint work_publication_derivatives_mime_type check (mime_type = 'image/webp'),
  constraint work_publication_derivatives_file_size_valid check (file_size is null or file_size > 0),
  constraint work_publication_derivatives_dimensions_valid check ((pixel_width is null or pixel_width > 0) and (pixel_height is null or pixel_height > 0))
);

alter table public.work_publication_derivatives enable row level security;
alter table public.work_publication_derivatives force row level security;
revoke all on public.work_publication_derivatives from public, anon, authenticated;

create trigger work_publication_derivatives_set_updated_at
before update on public.work_publication_derivatives
for each row execute function private.set_updated_at();

create function private.service_enqueue_work_image_derivatives(
  target_image_id uuid,
  actor_account_id uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  image_row public.work_images%rowtype;
  work_row public.works%rowtype;
  job_row private.work_image_derivative_jobs%rowtype;
  source_path text;
begin
  select wi.* into image_row from public.work_images wi where wi.id = target_image_id for update;
  if not found or image_row.deleted_at is not null
     or image_row.upload_status <> 'ready' or image_row.original_verified_at is null
     or not private.account_can_manage_work(actor_account_id, image_row.work_id) then
    raise exception 'The verified image is unavailable.' using errcode = '42501';
  end if;
  select * into work_row from public.works where id = image_row.work_id;
  if not found or work_row.deleted_at is not null then
    raise exception 'The verified image is unavailable.' using errcode = '42501';
  end if;
  source_path := image_row.private_object_path;

  select * into job_row from private.work_image_derivative_jobs
   where work_image_id = image_row.id and source_private_object_path = source_path;
  if found then
    return jsonb_build_object('job_id', job_row.id, 'status', job_row.state, 'idempotent', true);
  end if;

  insert into private.work_image_derivative_jobs (work_image_id, source_private_object_path, requested_by_account_id)
  values (image_row.id, source_path, actor_account_id)
  returning * into job_row;

  insert into private.work_image_derivatives (
    work_image_id, source_private_object_path, rendition_key, staging_object_path
  ) values
    (image_row.id, source_path, 'small', regexp_replace(source_path, '/original[.][^/]+$', '/public-derivatives/small.webp')),
    (image_row.id, source_path, 'large', regexp_replace(source_path, '/original[.][^/]+$', '/public-derivatives/large.webp'));

  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id, metadata)
  values (actor_account_id, 'work_image.derivative_enqueued', 'work_image', image_row.id, job_row.id,
          jsonb_build_object('work_id', image_row.work_id));
  return jsonb_build_object('job_id', job_row.id, 'status', 'pending', 'idempotent', false);
end;
$$;

create function private.service_claim_work_image_derivative_job()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare job_row private.work_image_derivative_jobs%rowtype;
declare image_row public.work_images%rowtype;
begin
  select * into job_row from private.work_image_derivative_jobs
   where (state = 'pending' and available_at <= statement_timestamp())
      or (state = 'processing' and lease_expires_at <= statement_timestamp())
   order by available_at, created_at
   for update skip locked limit 1;
  if not found then return jsonb_build_object('status', 'empty'); end if;

  select * into image_row from public.work_images where id = job_row.work_image_id for update;
  if not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready'
     or image_row.original_verified_at is null or image_row.private_object_path <> job_row.source_private_object_path then
    update private.work_image_derivative_jobs
       set state = 'failed', lease_token = null, lease_expires_at = null, completed_at = statement_timestamp(),
           failure_code = 'source_obsolete', failure_detail = 'The verified source is no longer current.'
     where id = job_row.id;
    update private.work_image_derivatives set state = 'failed', completed_at = statement_timestamp(),
           failure_code = 'source_obsolete', failure_detail = 'The verified source is no longer current.'
     where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
    return jsonb_build_object('status', 'obsolete', 'job_id', job_row.id);
  end if;
  if job_row.attempt_count >= job_row.max_attempts then
    update private.work_image_derivative_jobs set state = 'failed', lease_token = null, lease_expires_at = null,
      completed_at = statement_timestamp(), failure_code = 'attempt_limit_reached', failure_detail = 'The retry limit was reached.' where id = job_row.id;
    return jsonb_build_object('status', 'failed', 'job_id', job_row.id);
  end if;

  update private.work_image_derivative_jobs
     set state = 'processing', attempt_count = attempt_count + 1, lease_token = gen_random_uuid(),
         lease_expires_at = statement_timestamp() + interval '5 minutes', claimed_at = statement_timestamp(),
         failure_code = null, failure_detail = null
   where id = job_row.id returning * into job_row;
  update private.work_image_derivatives set state = 'processing', failure_code = null, failure_detail = null
   where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id, metadata)
  values (job_row.requested_by_account_id, 'work_image.derivative_claimed', 'work_image', job_row.work_image_id, job_row.id,
          jsonb_build_object('attempt', job_row.attempt_count));
  return jsonb_build_object('status', 'processing', 'job_id', job_row.id, 'lease_token', job_row.lease_token,
                            'lease_expires_at', job_row.lease_expires_at);
end;
$$;

create function private.service_complete_work_image_derivative_job(
  target_job_id uuid, expected_lease_token uuid, pipeline text, icc_profile text,
  small_file_size bigint, small_width integer, small_height integer, small_checksum text,
  large_file_size bigint, large_width integer, large_height integer, large_checksum text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare job_row private.work_image_derivative_jobs%rowtype;
declare image_row public.work_images%rowtype;
begin
  select * into job_row from private.work_image_derivative_jobs where id = target_job_id for update;
  if not found or job_row.state <> 'processing' or job_row.lease_token is distinct from expected_lease_token
     or job_row.lease_expires_at <= statement_timestamp() then
    raise exception 'The derivative job lease is unavailable.' using errcode = '42501';
  end if;
  select * into image_row from public.work_images where id = job_row.work_image_id for update;
  if not found or image_row.deleted_at is not null or image_row.upload_status <> 'ready'
     or image_row.original_verified_at is null or image_row.private_object_path <> job_row.source_private_object_path then
    raise exception 'The derivative source is no longer current.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(pipeline, ''))) not between 1 and 80
     or char_length(trim(coalesce(icc_profile, ''))) not between 1 and 80
     or small_file_size <= 0 or large_file_size <= 0 or small_width <= 0 or small_height <= 0
     or large_width <= 0 or large_height <= 0
     or small_checksum !~ '^[0-9a-f]{64}$' or large_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'The derivative result is invalid.' using errcode = '22023';
  end if;
  update private.work_image_derivatives set state = 'ready', mime_type = 'image/webp',
    file_size = case rendition_key when 'small' then small_file_size else large_file_size end,
    pixel_width = case rendition_key when 'small' then small_width else large_width end,
    pixel_height = case rendition_key when 'small' then small_height else large_height end,
    checksum_sha256 = case rendition_key when 'small' then small_checksum else large_checksum end,
    pipeline_version = trim(pipeline), icc_profile_version = trim(icc_profile),
    verified_at = statement_timestamp(), completed_at = statement_timestamp(), failure_code = null, failure_detail = null
   where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
  if (select count(*) from private.work_image_derivatives where work_image_id = job_row.work_image_id
        and source_private_object_path = job_row.source_private_object_path and state = 'ready') <> 2 then
    raise exception 'The derivative set is incomplete.' using errcode = '55000';
  end if;
  update private.work_image_derivative_jobs set state = 'ready', lease_token = null, lease_expires_at = null,
    completed_at = statement_timestamp(), failure_code = null, failure_detail = null where id = job_row.id;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, correlation_id, metadata)
  values (job_row.requested_by_account_id, 'work_image.derivative_ready', 'work_image', job_row.work_image_id, job_row.id,
          jsonb_build_object('work_id', image_row.work_id));
  return jsonb_build_object('status', 'ready', 'job_id', job_row.id);
end;
$$;

create function private.service_fail_work_image_derivative_job(
  target_job_id uuid, expected_lease_token uuid, sanitized_failure_code text, sanitized_failure_detail text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare job_row private.work_image_derivative_jobs%rowtype;
declare safe_code text := left(coalesce(nullif(trim(sanitized_failure_code), ''), 'processing_failed'), 80);
declare safe_detail text := left(coalesce(nullif(trim(sanitized_failure_detail), ''), 'The derivative processor failed.'), 240);
begin
  select * into job_row from private.work_image_derivative_jobs where id = target_job_id for update;
  if not found or job_row.state <> 'processing' or job_row.lease_token is distinct from expected_lease_token
     or job_row.lease_expires_at <= statement_timestamp() then
    raise exception 'The derivative job lease is unavailable.' using errcode = '42501';
  end if;
  update private.work_image_derivative_jobs set state = 'failed', lease_token = null, lease_expires_at = null,
    completed_at = statement_timestamp(), failure_code = safe_code, failure_detail = safe_detail where id = job_row.id;
  update private.work_image_derivatives set state = 'failed', completed_at = statement_timestamp(),
    failure_code = safe_code, failure_detail = safe_detail
   where work_image_id = job_row.work_image_id and source_private_object_path = job_row.source_private_object_path;
  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, correlation_id, metadata)
  values (job_row.requested_by_account_id, 'work_image.derivative_failed', 'work_image', job_row.work_image_id, 'failed', job_row.id,
          jsonb_build_object('failure_code', safe_code));
  return jsonb_build_object('status', 'failed', 'job_id', job_row.id);
end;
$$;

create function public.service_enqueue_work_image_derivatives(target_image_id uuid, actor_account_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_enqueue_work_image_derivatives(target_image_id, actor_account_id); $$;
create function public.service_claim_work_image_derivative_job()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_claim_work_image_derivative_job(); $$;
create function public.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_complete_work_image_derivative_job($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12); $$;
create function public.service_fail_work_image_derivative_job(uuid, uuid, text, text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.service_fail_work_image_derivative_job($1,$2,$3,$4); $$;

revoke all on function private.service_enqueue_work_image_derivatives(uuid, uuid) from public, anon, authenticated;
revoke all on function private.service_claim_work_image_derivative_job() from public, anon, authenticated;
revoke all on function private.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text) from public, anon, authenticated;
revoke all on function private.service_fail_work_image_derivative_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.service_enqueue_work_image_derivatives(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_claim_work_image_derivative_job() from public, anon, authenticated;
revoke all on function public.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text) from public, anon, authenticated;
revoke all on function public.service_fail_work_image_derivative_job(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.service_enqueue_work_image_derivatives(uuid, uuid) to service_role;
grant execute on function private.service_claim_work_image_derivative_job() to service_role;
grant execute on function private.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text) to service_role;
grant execute on function private.service_fail_work_image_derivative_job(uuid, uuid, text, text) to service_role;
grant execute on function public.service_enqueue_work_image_derivatives(uuid, uuid) to service_role;
grant execute on function public.service_claim_work_image_derivative_job() to service_role;
grant execute on function public.service_complete_work_image_derivative_job(uuid, uuid, text, text, bigint, integer, integer, text, bigint, integer, integer, text) to service_role;
grant execute on function public.service_fail_work_image_derivative_job(uuid, uuid, text, text) to service_role;

comment on table private.work_image_derivative_jobs is 'Internal durable jobs for future trusted public-image processing. Phase 1 does not dispatch them.';
comment on table private.work_image_derivatives is 'Internal trusted SMALL/LARGE public-derivative records. Staging paths are server-owned.';
comment on table public.work_publication_derivatives is 'Internal publication-revision asset contract; no Phase 1 publication behavior reads it.';
