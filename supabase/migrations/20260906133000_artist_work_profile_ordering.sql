-- Dashboard Works is the artist-curation source of truth. Positions are scoped
-- to an artist and a year bucket; a NULL year is the explicit UNKNOWN bucket.
alter table public.works
  add column profile_order integer not null default 0
  check (profile_order >= 0);

-- Preserve the visible pre-migration order within every artist/year bucket.
-- The old Dashboard and public Profile comparator was updated_at DESC, id ASC.
alter table public.works disable trigger works_set_updated_at;

with ranked as (
  select
    w.id,
    row_number() over (
      partition by w.owner_profile_id, w.year_sort
      order by w.updated_at desc, w.id asc
    ) - 1 as profile_order
  from public.works as w
  where w.deleted_at is null
)
update public.works as w
   set profile_order = ranked.profile_order
  from ranked
 where w.id = ranked.id;

alter table public.works enable trigger works_set_updated_at;

create index works_active_artist_curation_order
  on public.works (owner_profile_id, year_sort desc nulls last, profile_order asc, id asc)
  where deleted_at is null;

grant select (profile_order) on public.works to anon, authenticated;

create or replace function private.assign_work_profile_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.year_sort is distinct from old.year_sort then
    -- Serialise append/reorder/year-change operations for one artist.
    perform 1
      from public.public_profiles as profile
     where profile.id = new.owner_profile_id
       and profile.profile_type = 'artist'
       and profile.deleted_at is null
     for update;

    if not found then
      raise exception 'Works must be owned by an active artist profile.' using errcode = '23514';
    end if;

    select coalesce(max(work.profile_order) + 1, 0)
      into new.profile_order
      from public.works as work
     where work.owner_profile_id = new.owner_profile_id
       and work.year_sort is not distinct from new.year_sort
       and work.deleted_at is null;
  end if;

  return new;
end;
$$;

create trigger works_assign_profile_order
before insert or update of year_sort on public.works
for each row execute function private.assign_work_profile_order();

create function private.reorder_artist_profile_works(
  target_profile_id uuid,
  target_year_sort integer,
  ordered_work_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
  distinct_count integer;
begin
  if auth.uid() is null
     or not private.current_account_is_active()
     or not private.can_manage_work_owner(target_profile_id) then
    raise exception 'Artist Work order may not be changed.' using errcode = '42501';
  end if;

  -- This lock serialises reorders with insert and year-bucket moves.
  perform 1
    from public.public_profiles as profile
   where profile.id = target_profile_id
     and profile.profile_type = 'artist'
     and profile.deleted_at is null
   for update;
  if not found then
    raise exception 'Artist Work order may not be changed.' using errcode = '42501';
  end if;

  select count(*) into active_count
    from public.works as work
   where work.owner_profile_id = target_profile_id
     and work.year_sort is not distinct from target_year_sort
     and work.deleted_at is null;

  select count(distinct listed.work_id) into distinct_count
    from unnest(coalesce(ordered_work_ids, array[]::uuid[])) as listed(work_id)
   where listed.work_id is not null;

  if active_count = 0
     or coalesce(array_length(ordered_work_ids, 1), 0) <> active_count
     or distinct_count <> active_count
     or exists (
       select 1
         from unnest(ordered_work_ids) as listed(work_id)
         left join public.works as work
           on work.id = listed.work_id
          and work.owner_profile_id = target_profile_id
          and work.year_sort is not distinct from target_year_sort
          and work.deleted_at is null
        where work.id is null
     ) then
    raise exception 'The complete active Work set for one year is required.' using errcode = '23514';
  end if;

  -- Keep every intermediate value out of the final normalised range.
  update public.works as work
     set profile_order = work.profile_order + active_count + 1
   where work.owner_profile_id = target_profile_id
     and work.year_sort is not distinct from target_year_sort
     and work.deleted_at is null;

  update public.works as work
     set profile_order = ordered.ordinality - 1
    from unnest(ordered_work_ids) with ordinality as ordered(work_id, ordinality)
   where work.id = ordered.work_id
     and work.owner_profile_id = target_profile_id
     and work.year_sort is not distinct from target_year_sort
     and work.deleted_at is null;

  insert into public.audit_events (actor_account_id, action, target_type, target_id, result, metadata)
  values (
    auth.uid(),
    'works.profile_order_reordered',
    'profile',
    target_profile_id,
    'succeeded',
    jsonb_build_object('year_sort', target_year_sort, 'work_count', active_count)
  );

  return true;
end;
$$;

create function public.reorder_artist_profile_works(
  target_profile_id uuid,
  target_year_sort integer,
  ordered_work_ids uuid[]
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.reorder_artist_profile_works(
    target_profile_id,
    target_year_sort,
    ordered_work_ids
  );
$$;

revoke all on function private.assign_work_profile_order() from public, anon, authenticated;
revoke all on function private.reorder_artist_profile_works(uuid, integer, uuid[]) from public, anon;
revoke all on function public.reorder_artist_profile_works(uuid, integer, uuid[]) from public, anon;

grant execute on function private.reorder_artist_profile_works(uuid, integer, uuid[]) to authenticated;
grant execute on function public.reorder_artist_profile_works(uuid, integer, uuid[]) to authenticated;
