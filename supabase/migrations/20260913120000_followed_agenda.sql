create or replace function public.list_followed_agenda()
returns table (
  occurrence_id uuid,
  owner_profile_id uuid,
  activity_id uuid,
  occurrence_type varchar(80),
  title varchar(300),
  start_date date,
  end_date date,
  start_time time without time zone,
  end_time time without time zone,
  time_zone varchar(80),
  venue_name varchar(300),
  city varchar(160),
  country varchar(160),
  external_url text,
  artist_slug varchar(100),
  artist_display_name varchar(160),
  presentation_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ao.id,
    ao.owner_profile_id,
    ao.activity_id,
    ao.occurrence_type,
    coalesce(nullif(trim(ao.title_override), ''), nullif(trim(pa.title), '')),
    ao.start_date,
    ao.end_date,
    ao.start_time,
    ao.end_time,
    ao.time_zone,
    coalesce(nullif(trim(ao.venue_name_override), ''), pa.venue_name),
    coalesce(nullif(trim(ao.city_override), ''), pa.city),
    pa.country,
    case
      when pa.id is not null
        and private.is_public_presentation(pa.id)
        then pa.external_url
      else null
    end,
    p.slug,
    p.display_name,
    case
      when pa.id is not null
        and private.is_public_presentation(pa.id)
        then pa.id
      else null
    end
  from public.profile_follows as follow
  join public.public_profiles as p
    on p.id = follow.profile_id
   and p.profile_type = 'artist'
   and p.publication_status = 'published'
   and p.published_at is not null
  join public.activity_occurrences as ao
    on ao.owner_profile_id = p.id
   and ao.visibility = 'published'
   and ao.published_at is not null
   and ao.show_in_agenda
   and ao.deleted_at is null
  left join public.profile_activities as pa
    on pa.id = ao.activity_id
   and pa.owner_profile_id = ao.owner_profile_id
   and pa.visibility = 'published'
   and pa.published_at is not null
   and pa.deleted_at is null
  where (select private.current_account_is_active())
    and follow.account_id = (select auth.uid())
    and (ao.activity_id is null or pa.id is not null)
    and coalesce(nullif(trim(ao.title_override), ''), nullif(trim(pa.title), '')) <> ''
    and nullif(trim(ao.occurrence_type), '') is not null
  order by ao.start_date asc, ao.start_time asc nulls last, ao.id asc;
$$;

comment on function public.list_followed_agenda() is
  'Returns current-account followed-profile Agenda data using the public Agenda visibility contract.';

revoke all on function public.list_followed_agenda() from public, anon;
grant execute on function public.list_followed_agenda() to authenticated;
