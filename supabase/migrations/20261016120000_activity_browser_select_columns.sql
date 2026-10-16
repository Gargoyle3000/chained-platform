-- F1: RLS limits rows, not columns. Replace the historical browser-wide
-- SELECT grants without changing RLS, write privileges or trusted access.
revoke select on table public.profile_activities from anon, authenticated;
revoke select on table public.activity_occurrences from anon, authenticated;
-- The v2 migration also granted this column separately to anon. Public Program
-- uses get_public_presentation_program(), not a direct read of this flag.
revoke select (show_in_presentation) on public.activity_occurrences from anon;

-- Public Presentation detail, Agenda links and CV navigation.
grant select (
  id, owner_profile_id, title, activity_type, venue_name, city, country,
  start_date, end_date, description, external_url, show_in_presentations,
  visibility, published_at, updated_at
) on public.profile_activities to anon, authenticated;

-- Presentation/Agenda/CV management projections; deleted_at is also referenced
-- by the security-invoker list_followed_agenda() join.
grant select (
  include_in_cv, created_at, deleted_at
) on public.profile_activities to authenticated;

-- Public Agenda and the common Agenda/Program management projection.
grant select (
  id, owner_profile_id, activity_id, occurrence_type, title_override,
  start_date, end_date, start_time, end_time, time_zone, venue_name_override,
  city_override, show_in_agenda, visibility, published_at, created_at, updated_at
) on public.activity_occurrences to anon, authenticated;

-- Program management and the security-invoker list_followed_agenda() filter.
grant select (
  show_in_presentation, deleted_at
) on public.activity_occurrences to authenticated;

-- created_by_account_id, updated_by_account_id, deleted_by_account_id and
-- purge_after are deliberately absent from every browser SELECT projection.
