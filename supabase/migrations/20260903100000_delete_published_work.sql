-- Complete an already-hidden Work deletion only through the trusted
-- publication endpoint. Browser draft deletion remains public.soft_delete_work.

-- The original draft primitive predates the deletion-consistency constraint.
-- Keep its authorization and recovery contract, while writing the complete
-- deletion tuple required by that contract.
create or replace function private.begin_work_soft_deletion(target_work_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  work_deleted boolean;
  deleted_at_value timestamptz := statement_timestamp();
begin
  if actor_id is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'The current account may not delete this Work.' using errcode = '42501';
  end if;

  update public.works
     set deleted_at = deleted_at_value,
         purge_after = deleted_at_value + interval '30 days',
         deleted_by_account_id = actor_id
   where id = target_work_id
     and deleted_at is null;

  work_deleted := found;
  if work_deleted then
    insert into public.audit_events (
      actor_account_id, action, target_type, target_id, result, metadata
    ) values (
      actor_id, 'work.soft_deleted', 'work', target_work_id, 'succeeded',
      jsonb_build_object('recovery_days', 30)
    );
  end if;

  return work_deleted;
end;
$$;

-- A browser draft deletion may enter the trusted unpublish route only when
-- this exact recoverable state exists. PDC01 is a stable machine-readable
-- contract; generic active publication operations remain SQLSTATE 55000.
create or replace function private.soft_delete_work(target_work_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'The Work may not be deleted.' using errcode = '42501';
  end if;

  perform 1
    from public.works as w
   where w.id = target_work_id
     and w.deleted_at is null
     and w.visibility = 'draft'
   for update;
  if not found then
    raise exception 'Only a draft Work may be deleted.' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.work_publication_operations as operation
     where operation.work_id = target_work_id
       and operation.operation_kind = 'unpublish'
       and operation.status = 'cleanup_pending'
  ) then
    raise exception 'The Work public cleanup must be resumed before deletion.' using errcode = 'PDC01';
  end if;

  if exists (
    select 1
      from public.work_publication_operations as operation
     where operation.work_id = target_work_id
       and operation.status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'The Work cannot be deleted during a publication operation.' using errcode = '55000';
  end if;

  return private.begin_work_soft_deletion(target_work_id);
end;
$$;

-- A Work hidden by an incomplete unpublication still has public media to
-- recall. Resume that exact operation rather than treating it as an ordinary
-- draft Work and creating a new snapshot.
create or replace function private.service_begin_work_unpublication(
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
    select * into existing_operation
      from public.work_publication_operations
     where work_id = target_work_id
       and operation_kind = 'unpublish'
       and status = 'cleanup_pending'
     for update;
    if found then
      select coalesce(jsonb_agg(jsonb_build_object('public_object_path', public_object_path)), '[]'::jsonb)
        into path_payload
        from public.work_publication_operation_images
       where operation_id = existing_operation.id
         and copy_status in ('created', 'cleanup_pending');
      return jsonb_build_object('operation_id', existing_operation.id, 'status', existing_operation.status,
                                'idempotent', true, 'images', path_payload);
    end if;

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

create or replace function private.service_soft_delete_unpublished_work(
  target_work_id uuid,
  actor_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_row public.works%rowtype;
  deleted_at_value timestamptz := statement_timestamp();
begin
  if not private.account_can_manage_work(actor_account_id, target_work_id) then
    raise exception 'The Work is unavailable.' using errcode = '42501';
  end if;

  select * into work_row
    from public.works
   where id = target_work_id
   for update;

  if not found or work_row.deleted_at is not null then
    raise exception 'The Work is unavailable.' using errcode = '22023';
  end if;

  if work_row.visibility <> 'draft' then
    raise exception 'The Work must be hidden before deletion.' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.work_publication_operations as operation
     where operation.work_id = target_work_id
       and operation.status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'The Work cannot be deleted during a publication operation.' using errcode = '55000';
  end if;

  update public.works
     set deleted_at = deleted_at_value,
         purge_after = deleted_at_value + interval '30 days',
         deleted_by_account_id = actor_account_id
   where id = target_work_id
     and deleted_at is null;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, result, metadata
  ) values (
    actor_account_id, 'work.soft_deleted', 'work', target_work_id, 'succeeded',
    jsonb_build_object('recovery_days', 30)
  );

  return true;
end;
$$;

create or replace function public.service_soft_delete_unpublished_work(
  target_work_id uuid,
  actor_account_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.service_soft_delete_unpublished_work(target_work_id, actor_account_id); $$;

revoke all on function private.service_soft_delete_unpublished_work(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_soft_delete_unpublished_work(uuid, uuid) from public, anon, authenticated;
grant execute on function private.service_soft_delete_unpublished_work(uuid, uuid) to service_role;
grant execute on function public.service_soft_delete_unpublished_work(uuid, uuid) to service_role;
