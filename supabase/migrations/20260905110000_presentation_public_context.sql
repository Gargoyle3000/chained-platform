-- Narrow anonymous-safe projections for public Presentation v2 rendering.

create function private.get_public_presentation_participant_summaries(target_presentation_id uuid)
returns table (display_name varchar, linked_profile_slug varchar, linked_profile_display_name varchar)
language sql stable security definer set search_path = ''
as $$
  select display_name, linked_profile_slug, linked_profile_display_name
    from private.get_public_presentation_participants(target_presentation_id);
$$;

create function private.get_public_presentation_program(target_presentation_id uuid)
returns table (title varchar, occurrence_type varchar, start_date date, end_date date, start_time time, end_time time, venue_name varchar, city varchar)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(nullif(trim(ao.title_override), ''), ao.occurrence_type),
    ao.occurrence_type, ao.start_date, ao.end_date, ao.start_time, ao.end_time,
    ao.venue_name_override, ao.city_override
  from public.activity_occurrences as ao
  where ao.activity_id = target_presentation_id
    and ao.deleted_at is null
    and ao.visibility = 'published'
    and ao.published_at is not null
    and ao.show_in_presentation
    and private.is_public_presentation(target_presentation_id)
  order by ao.start_date, ao.start_time nulls last, ao.id;
$$;

create function private.get_public_presentation_works(target_presentation_id uuid)
returns table (work_id uuid, title varchar, year_label varchar, work_type varchar, artist_slug varchar, artist_display_name varchar, public_object_path text, pixel_width integer, pixel_height integer)
language sql stable security definer set search_path = ''
as $$
  select w.id, w.title, w.year_label, w.work_type, p.slug, p.display_name,
         cover.public_object_path, cover.pixel_width, cover.pixel_height
  from public.presentation_works as pw
  join public.works as w on w.id = pw.work_id
  join public.public_profiles as p on p.id = w.owner_profile_id
  join lateral (
    select wi.public_object_path, wi.pixel_width, wi.pixel_height
      from public.work_images as wi
     where wi.work_id = w.id
       and wi.is_cover
       and wi.deleted_at is null
       and wi.public_object_path is not null
     order by wi.id
     limit 1
  ) as cover on true
  where pw.presentation_id = target_presentation_id
    and pw.status = 'accepted'
    and pw.is_visible
    and private.is_public_presentation(target_presentation_id)
    and private.is_published_work(w.id)
    and private.is_published_profile(p.id)
  order by pw.position, pw.id;
$$;

create function public.get_public_presentation_participant_summaries(target_presentation_id uuid)
returns table (display_name varchar, linked_profile_slug varchar, linked_profile_display_name varchar)
language sql stable security definer set search_path = ''
as $$ select * from private.get_public_presentation_participant_summaries(target_presentation_id); $$;

create function public.get_public_presentation_program(target_presentation_id uuid)
returns table (title varchar, occurrence_type varchar, start_date date, end_date date, start_time time, end_time time, venue_name varchar, city varchar)
language sql stable security definer set search_path = ''
as $$ select * from private.get_public_presentation_program(target_presentation_id); $$;

create function public.get_public_presentation_works(target_presentation_id uuid)
returns table (work_id uuid, title varchar, year_label varchar, work_type varchar, artist_slug varchar, artist_display_name varchar, public_object_path text, pixel_width integer, pixel_height integer)
language sql stable security definer set search_path = ''
as $$ select * from private.get_public_presentation_works(target_presentation_id); $$;

revoke all on function private.get_public_presentation_participant_summaries(uuid), private.get_public_presentation_program(uuid), private.get_public_presentation_works(uuid) from public, anon, authenticated;
revoke all on function public.get_public_presentation_participant_summaries(uuid), public.get_public_presentation_program(uuid), public.get_public_presentation_works(uuid) from public;
revoke all on function private.get_public_presentation_participants(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_presentation_participants(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_presentation_participant_summaries(uuid), public.get_public_presentation_program(uuid), public.get_public_presentation_works(uuid) to anon, authenticated;
