-- Narrow browser operations required by the Work dashboard integration.

create function private.list_manageable_artist_profiles()
returns table (
  id uuid,
  display_name varchar(160),
  slug varchar(100),
  publication_status public.publication_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.slug, p.publication_status
    from public.public_profiles as p
   where auth.uid() is not null
     and p.profile_type = 'artist'
     and p.deleted_at is null
     and private.can_manage_work_owner(p.id)
   order by lower(p.display_name), p.id;
$$;

create function private.list_managed_work_images(target_work_id uuid)
returns table (
  id uuid,
  work_id uuid,
  private_object_path text,
  public_object_path text,
  original_filename varchar(512),
  mime_type varchar(80),
  file_size bigint,
  pixel_width integer,
  pixel_height integer,
  sort_order integer,
  is_cover boolean,
  upload_status public.work_image_upload_status,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'Work images are unavailable.' using errcode = '42501';
  end if;

  return query
  select wi.id, wi.work_id, wi.private_object_path, wi.public_object_path,
         wi.original_filename, wi.mime_type, wi.file_size, wi.pixel_width,
         wi.pixel_height, wi.sort_order, wi.is_cover, wi.upload_status,
         wi.created_at, wi.updated_at
    from public.work_images as wi
   where wi.work_id = target_work_id
     and wi.deleted_at is null
   order by wi.sort_order, wi.id;
end;
$$;

create function private.reorder_work_images(
  target_work_id uuid,
  ordered_image_ids uuid[],
  cover_image_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
  listed_count integer;
begin
  if auth.uid() is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'Image order may not be changed.' using errcode = '42501';
  end if;

  perform 1
    from public.works as w
   where w.id = target_work_id
     and w.deleted_at is null
     and w.visibility = 'draft'
   for update;
  if not found then
    raise exception 'Only a draft Work may change image order.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.work_publication_operations as operation
     where operation.work_id = target_work_id
       and operation.status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'Image order cannot change during a publication operation.' using errcode = '55000';
  end if;

  select count(*) into active_count
    from public.work_images as wi
   where wi.work_id = target_work_id and wi.deleted_at is null;

  select count(distinct image_id) into listed_count
    from unnest(coalesce(ordered_image_ids, array[]::uuid[])) as listed(image_id)
   where image_id is not null;

  if active_count = 0
     or coalesce(array_length(ordered_image_ids, 1), 0) <> active_count
     or listed_count <> active_count
     or cover_image_id is null
     or not (cover_image_id = any(ordered_image_ids))
     or exists (
       select 1
         from unnest(ordered_image_ids) as listed(image_id)
         left join public.work_images as wi
           on wi.id = listed.image_id
          and wi.work_id = target_work_id
          and wi.deleted_at is null
        where wi.id is null
     ) then
    raise exception 'The complete active image set and one cover are required.' using errcode = '23514';
  end if;

  update public.work_images
     set sort_order = sort_order + active_count + 1,
         is_cover = false
   where work_id = target_work_id
     and deleted_at is null;

  update public.work_images as wi
     set sort_order = ordered.ordinality - 1,
         is_cover = wi.id = cover_image_id
    from unnest(ordered_image_ids) with ordinality as ordered(image_id, ordinality)
   where wi.id = ordered.image_id
     and wi.work_id = target_work_id
     and wi.deleted_at is null;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (auth.uid(), 'work_images.reordered', 'work', target_work_id, 'succeeded', jsonb_build_object('image_count', active_count));
  return true;
end;
$$;

create function private.soft_delete_work(target_work_id uuid)
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
    select 1 from public.work_publication_operations as operation
     where operation.work_id = target_work_id
       and operation.status in ('pending', 'running', 'cleanup_pending')
  ) then
    raise exception 'The Work cannot be deleted during a publication operation.' using errcode = '55000';
  end if;

  return private.begin_work_soft_deletion(target_work_id);
end;
$$;

create function public.list_manageable_artist_profiles()
returns table (id uuid, display_name varchar(160), slug varchar(100), publication_status public.publication_status)
language sql security invoker set search_path = ''
as $$ select * from private.list_manageable_artist_profiles(); $$;

create function public.list_managed_work_images(target_work_id uuid)
returns table (
  id uuid, work_id uuid, private_object_path text, public_object_path text,
  original_filename varchar(512), mime_type varchar(80), file_size bigint,
  pixel_width integer, pixel_height integer, sort_order integer, is_cover boolean,
  upload_status public.work_image_upload_status, created_at timestamptz, updated_at timestamptz
)
language sql security invoker set search_path = ''
as $$ select * from private.list_managed_work_images(target_work_id); $$;

create function public.reorder_work_images(target_work_id uuid, ordered_image_ids uuid[], cover_image_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.reorder_work_images(target_work_id, ordered_image_ids, cover_image_id); $$;

create function public.soft_delete_work(target_work_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.soft_delete_work(target_work_id); $$;

revoke update (sort_order, is_cover) on public.work_images from authenticated;

revoke all on function private.list_manageable_artist_profiles() from public, anon;
revoke all on function private.list_managed_work_images(uuid) from public, anon;
revoke all on function private.reorder_work_images(uuid, uuid[], uuid) from public, anon;
revoke all on function private.soft_delete_work(uuid) from public, anon;

revoke all on function public.list_manageable_artist_profiles() from public, anon;
revoke all on function public.list_managed_work_images(uuid) from public, anon;
revoke all on function public.reorder_work_images(uuid, uuid[], uuid) from public, anon;
revoke all on function public.soft_delete_work(uuid) from public, anon;

grant execute on function public.list_manageable_artist_profiles() to authenticated;
grant execute on function public.list_managed_work_images(uuid) to authenticated;
grant execute on function public.reorder_work_images(uuid, uuid[], uuid) to authenticated;
grant execute on function public.soft_delete_work(uuid) to authenticated;

grant execute on function private.list_manageable_artist_profiles() to authenticated;
grant execute on function private.list_managed_work_images(uuid) to authenticated;
grant execute on function private.reorder_work_images(uuid, uuid[], uuid) to authenticated;
grant execute on function private.soft_delete_work(uuid) to authenticated;
