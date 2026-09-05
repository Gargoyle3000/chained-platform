-- Dashboard management scope: owned Presentations and accepted co-operator
-- contexts, without exposing raw co-operator records to the browser.

create function private.get_managed_presentation_summaries()
returns table (
  id uuid,
  owner_profile_id uuid,
  title varchar,
  activity_type varchar,
  venue_name varchar,
  city varchar,
  country varchar,
  start_date date,
  end_date date,
  show_in_presentations boolean,
  include_in_cv boolean,
  visibility public.publication_status,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  management_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pa.id,
    pa.owner_profile_id,
    pa.title,
    pa.activity_type,
    pa.venue_name,
    pa.city,
    pa.country,
    pa.start_date,
    pa.end_date,
    pa.show_in_presentations,
    pa.include_in_cv,
    pa.visibility,
    pa.published_at,
    pa.created_at,
    pa.updated_at,
    case
      when private.can_manage_activity_owner(pa.owner_profile_id)
        then 'owner'
      else 'cooperator'
    end as management_role
  from public.profile_activities as pa
  where pa.deleted_at is null
    and (
      private.can_manage_activity_owner(pa.owner_profile_id)
      or private.is_accepted_presentation_cooperator(pa.id)
    )
  order by pa.start_date desc nulls last, pa.updated_at desc, pa.id;
$$;

create function public.get_managed_presentation_summaries()
returns table (
  id uuid,
  owner_profile_id uuid,
  title varchar,
  activity_type varchar,
  venue_name varchar,
  city varchar,
  country varchar,
  start_date date,
  end_date date,
  show_in_presentations boolean,
  include_in_cv boolean,
  visibility public.publication_status,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  management_role text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_managed_presentation_summaries();
$$;

revoke all on function private.get_managed_presentation_summaries()
  from public, anon, authenticated;
revoke all on function public.get_managed_presentation_summaries()
  from public, anon;

grant execute on function private.get_managed_presentation_summaries()
  to authenticated;
grant execute on function public.get_managed_presentation_summaries()
  to authenticated;

comment on function public.get_managed_presentation_summaries() is
  'Safe Dashboard projection of Presentations the caller can manage as owner or accepted co-operator.';
