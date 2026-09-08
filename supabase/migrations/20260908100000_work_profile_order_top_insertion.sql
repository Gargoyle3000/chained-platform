-- New Works become the first curated Work in their artist/year bucket. A year
-- change deliberately keeps the existing append-to-destination behavior.
create or replace function private.assign_work_profile_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.year_sort is distinct from old.year_sort then
    -- Serialise inserts, reorders and year-bucket moves for one artist.
    perform 1
      from public.public_profiles as profile
     where profile.id = new.owner_profile_id
       and profile.profile_type = 'artist'
       and profile.deleted_at is null
     for update;

    if not found then
      raise exception 'Works must be owned by an active artist profile.' using errcode = '23514';
    end if;

    if tg_op = 'INSERT' then
      -- Keep positions finite and normalised: make one deterministic space at
      -- the top instead of allocating ever-more-negative values.
      update public.works as work
         set profile_order = work.profile_order + 1
       where work.owner_profile_id = new.owner_profile_id
         and work.year_sort is not distinct from new.year_sort
         and work.deleted_at is null;
      new.profile_order := 0;
    else
      -- A later edit that changes year retains the established append rule.
      select coalesce(max(work.profile_order) + 1, 0)
        into new.profile_order
        from public.works as work
       where work.owner_profile_id = new.owner_profile_id
         and work.year_sort is not distinct from new.year_sort
         and work.deleted_at is null;
    end if;
  end if;

  return new;
end;
$$;
