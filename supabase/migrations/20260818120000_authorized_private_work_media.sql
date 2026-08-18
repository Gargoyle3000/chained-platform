-- Atomic, service-only resolution of private Work originals for signed access.

create function private.service_resolve_authorized_private_work_images(
  actor_account_id uuid,
  image_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_image_ids uuid[];
  requested_count integer;
  resolved_count integer;
  image_payload jsonb;
begin
  select coalesce(array_agg(requested.image_id order by requested.first_position), array[]::uuid[])
    into normalized_image_ids
    from (
      select supplied.image_id, min(supplied.position) as first_position
        from unnest(coalesce(image_ids, array[]::uuid[]))
          with ordinality as supplied(image_id, position)
       where supplied.image_id is not null
       group by supplied.image_id
    ) as requested;

  requested_count := cardinality(normalized_image_ids);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'A private-media request must contain between 1 and 100 unique image IDs.'
      using errcode = '22023';
  end if;

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'work_image_id', wi.id,
               'object_path', wi.private_object_path,
               'mime_type', wi.mime_type,
               'file_size', wi.file_size
             )
             order by requested.position
           ),
           '[]'::jsonb
         )
    into resolved_count, image_payload
    from unnest(normalized_image_ids)
      with ordinality as requested(image_id, position)
    join public.work_images as wi
      on wi.id = requested.image_id
    join public.works as w
      on w.id = wi.work_id
   where wi.deleted_at is null
     and wi.upload_status = 'ready'
     and wi.original_verified_at is not null
     and wi.file_size is not null
     and w.deleted_at is null
     and private.account_can_manage_work(actor_account_id, w.id);

  if resolved_count <> requested_count then
    raise exception 'Private media is unavailable.' using errcode = '42501';
  end if;

  return jsonb_build_object('images', image_payload);
end;
$$;

create function public.service_resolve_authorized_private_work_images(
  actor_account_id uuid,
  image_ids uuid[]
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.service_resolve_authorized_private_work_images(actor_account_id, image_ids);
$$;

revoke all on function private.service_resolve_authorized_private_work_images(uuid, uuid[])
  from public, anon, authenticated;
revoke all on function public.service_resolve_authorized_private_work_images(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function private.service_resolve_authorized_private_work_images(uuid, uuid[])
  to service_role;
grant execute on function public.service_resolve_authorized_private_work_images(uuid, uuid[])
  to service_role;

comment on function private.service_resolve_authorized_private_work_images(uuid, uuid[])
  is 'Atomically resolves only fully authorised, ready private Work originals for a trusted media gateway.';
comment on function public.service_resolve_authorized_private_work_images(uuid, uuid[])
  is 'Service-role-only wrapper for authorised private Work original resolution.';
