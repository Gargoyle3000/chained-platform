-- Work-specific publish-ready attention is deliberately narrow: it records an
-- account's explicit handling of one current media generation. It is not a
-- generic notification, inbox, badge, or read/unread subsystem.

create table private.work_publish_ready_acknowledgements (
  account_id uuid not null references public.accounts (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  ready_generation_at timestamptz not null,
  acknowledged_at timestamptz not null default statement_timestamp(),
  primary key (account_id, work_id)
);

alter table private.work_publish_ready_acknowledgements enable row level security;
alter table private.work_publish_ready_acknowledgements force row level security;
revoke all on table private.work_publish_ready_acknowledgements from public, anon, authenticated;

-- This one-row activation boundary prevents existing, deliberately retained
-- READY drafts from becoming actions when this feature is first deployed.
-- Only a media generation completing after activation can begin this narrow
-- Work lifecycle. It is not notification storage.
create table private.work_publish_ready_action_activation (
  singleton boolean primary key default true check (singleton),
  ready_generation_not_before timestamptz not null
);

alter table private.work_publish_ready_action_activation enable row level security;
alter table private.work_publish_ready_action_activation force row level security;
revoke all on table private.work_publish_ready_action_activation from public, anon, authenticated;

insert into private.work_publish_ready_action_activation (
  singleton,
  ready_generation_not_before
)
values (
  true,
  statement_timestamp()
);

-- One canonical current-source readiness calculation. The internal ready
-- generation is the latest completion time among the current image sources;
-- it is available only to trusted server-side callers.
create function private.work_publication_readiness_snapshot(target_work_id uuid)
returns table (
  state text,
  total_images bigint,
  ready_images bigint,
  processing_images bigint,
  failed_images bigint,
  ready_generation_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  cover_count bigint;
  invalid_images bigint;
begin
  select * into work_row
    from public.works
   where id = target_work_id
     and deleted_at is null;

  if not found then
    return;
  end if;

  with current_images as (
    select
      wi.id,
      wi.is_cover,
      wi.upload_status,
      wi.original_verified_at,
      wi.file_size,
      wi.private_object_path,
      exists (
        select 1
          from private.work_image_derivative_jobs job
         where job.work_image_id = wi.id
           and job.source_private_object_path = wi.private_object_path
           and job.state = 'failed'
      ) or exists (
        select 1
          from private.work_image_derivatives derivative
         where derivative.work_image_id = wi.id
           and derivative.source_private_object_path = wi.private_object_path
           and derivative.state = 'failed'
      ) as has_failure,
      exists (
        select 1
          from private.work_image_derivative_jobs job
         where job.work_image_id = wi.id
           and job.source_private_object_path = wi.private_object_path
           and job.state in ('pending', 'processing')
      ) or exists (
        select 1
          from private.work_image_derivatives derivative
         where derivative.work_image_id = wi.id
           and derivative.source_private_object_path = wi.private_object_path
           and derivative.state in ('pending', 'processing')
      ) as has_processing,
      (
        select count(distinct derivative.rendition_key)
          from private.work_image_derivatives derivative
         where derivative.work_image_id = wi.id
           and derivative.source_private_object_path = wi.private_object_path
           and derivative.rendition_key in ('small', 'large')
           and derivative.state = 'ready'
           and derivative.mime_type = 'image/webp'
      ) = 2 as derivative_pair_ready,
      coalesce(
        (
          select job.completed_at
            from private.work_image_derivative_jobs job
           where job.work_image_id = wi.id
             and job.source_private_object_path = wi.private_object_path
             and job.state = 'ready'
        ),
        (
          select max(derivative.completed_at)
            from private.work_image_derivatives derivative
           where derivative.work_image_id = wi.id
             and derivative.source_private_object_path = wi.private_object_path
             and derivative.rendition_key in ('small', 'large')
             and derivative.state = 'ready'
             and derivative.mime_type = 'image/webp'
        )
      ) as image_ready_generation_at
    from public.work_images wi
    where wi.work_id = target_work_id
      and wi.deleted_at is null
  ), classified as (
    select
      is_cover,
      image_ready_generation_at,
      case
        when upload_status <> 'ready'
          or original_verified_at is null
          or file_size is null
          or private_object_path is null then 'invalid'
        when has_failure then 'failed'
        when derivative_pair_ready then 'ready'
        when has_processing then 'processing'
        else 'invalid'
      end as image_state
    from current_images
  )
  select
    count(*),
    count(*) filter (where image_state = 'ready'),
    count(*) filter (where image_state = 'processing'),
    count(*) filter (where image_state = 'failed'),
    count(*) filter (where image_state = 'invalid'),
    count(*) filter (where is_cover),
    max(image_ready_generation_at) filter (where image_state = 'ready')
  into total_images, ready_images, processing_images, failed_images, invalid_images, cover_count, ready_generation_at
  from classified;

  state := case
    when nullif(btrim(coalesce(work_row.title, '')), '') is null
      or nullif(btrim(coalesce(work_row.year_label, '')), '') is null
      or work_row.year_sort is null
      or nullif(btrim(coalesce(work_row.work_type, '')), '') is null
      or total_images = 0
      or cover_count <> 1
      or invalid_images > 0
      or exists (
        select 1
          from public.work_publication_operations operation
         where operation.work_id = target_work_id
           and operation.status in ('pending', 'running', 'cleanup_pending')
      ) then 'prerequisite_invalid'
    when failed_images > 0 then 'failed'
    when ready_images = total_images then 'ready'
    else 'processing'
  end;

  if state <> 'ready' then
    ready_generation_at := null;
  end if;

  return next;
end;
$$;

-- Preserve the established single-Work browser contract while sourcing its
-- readiness classification from the same snapshot used by Dashboard actions.
create or replace function private.get_managed_work_publication_readiness(target_work_id uuid)
returns table (
  state text,
  total_images bigint,
  ready_images bigint,
  processing_images bigint,
  failed_images bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.can_manage_work(target_work_id) then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  return query
  select snapshot.state,
         snapshot.total_images,
         snapshot.ready_images,
         snapshot.processing_images,
         snapshot.failed_images
    from private.work_publication_readiness_snapshot(target_work_id) snapshot;
end;
$$;

create function public.list_my_work_publish_ready_actions()
returns table (
  work_id uuid,
  work_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.current_account_is_active() then
    return;
  end if;

  return query
  with manageable_drafts as materialized (
    select work.id,
           work.title
      from private.list_manageable_artist_profiles() manageable_profile
      join public.works work
        on work.owner_profile_id = manageable_profile.id
     where work.deleted_at is null
       and work.visibility = 'draft'
  )
  select manageable_work.id,
         manageable_work.title::text
    from manageable_drafts manageable_work
    cross join private.work_publish_ready_action_activation activation
    cross join lateral private.work_publication_readiness_snapshot(manageable_work.id) snapshot
    left join private.work_publish_ready_acknowledgements acknowledgement
      on acknowledgement.account_id = (select auth.uid())
     and acknowledgement.work_id = manageable_work.id
   where snapshot.state = 'ready'
     and snapshot.ready_generation_at is not null
     and snapshot.ready_generation_at > activation.ready_generation_not_before
     and (
       acknowledgement.ready_generation_at is null
       or acknowledgement.ready_generation_at < snapshot.ready_generation_at
     )
   order by lower(manageable_work.title), manageable_work.id;
end;
$$;

create function public.acknowledge_my_work_publish_ready_action(target_work_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  snapshot record;
  activation_at timestamptz;
begin
  if (select auth.uid()) is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  select * into work_row
    from public.works
   where id = target_work_id
     and deleted_at is null;

  if not found or work_row.visibility <> 'draft' then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  select activation.ready_generation_not_before
    into activation_at
    from private.work_publish_ready_action_activation activation
   where activation.singleton;

  if not found then
    raise exception 'The Work is not ready to publish.' using errcode = '22023';
  end if;

  select * into snapshot
    from private.work_publication_readiness_snapshot(target_work_id);

  if not found
     or snapshot.state <> 'ready'
     or snapshot.ready_generation_at is null
     or snapshot.ready_generation_at <= activation_at then
    raise exception 'The Work is not ready to publish.' using errcode = '22023';
  end if;

  insert into private.work_publish_ready_acknowledgements (
    account_id,
    work_id,
    ready_generation_at
  )
  values (
    (select auth.uid()),
    target_work_id,
    snapshot.ready_generation_at
  )
  on conflict (account_id, work_id) do update
    set ready_generation_at = greatest(
          private.work_publish_ready_acknowledgements.ready_generation_at,
          excluded.ready_generation_at
        ),
        acknowledged_at = statement_timestamp();

  return true;
end;
$$;

revoke all on function private.work_publication_readiness_snapshot(uuid) from public, anon, authenticated;
revoke all on function private.get_managed_work_publication_readiness(uuid) from public, anon;
revoke all on function public.get_managed_work_publication_readiness(uuid) from public, anon;
revoke all on function public.list_my_work_publish_ready_actions() from public, anon;
revoke all on function public.acknowledge_my_work_publish_ready_action(uuid) from public, anon;
grant execute on function private.get_managed_work_publication_readiness(uuid) to authenticated;
grant execute on function public.get_managed_work_publication_readiness(uuid) to authenticated;
grant execute on function public.list_my_work_publish_ready_actions() to authenticated;
grant execute on function public.acknowledge_my_work_publish_ready_action(uuid) to authenticated;

comment on table private.work_publish_ready_acknowledgements is
  'Per-account acknowledgement of one current Work media-ready generation; not a generic notification subsystem.';
comment on table private.work_publish_ready_action_activation is
  'One-time activation boundary for Work publish-ready actions; existing READY drafts before activation remain silent.';
comment on function public.list_my_work_publish_ready_actions() is
  'Safe current-account projection of actionable draft Works whose current post-activation media-ready generation has not been explicitly acknowledged.';
