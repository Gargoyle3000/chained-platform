-- The public image handler follows the same current/upcoming Agenda window as
-- the public projection, rather than keeping a past occurrence's image live.
create or replace function private.presentation_has_public_agenda_occurrence(target_presentation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profile_activities pa
    join public.public_profiles p on p.id = pa.owner_profile_id
    join public.activity_occurrences ao on ao.activity_id = pa.id
    where pa.id = target_presentation_id and pa.visibility = 'published' and pa.published_at is not null and pa.deleted_at is null
      and p.publication_status = 'published' and p.published_at is not null and p.deleted_at is null
      and ao.visibility = 'published' and ao.published_at is not null and ao.show_in_agenda and ao.deleted_at is null
      and coalesce(ao.end_date, ao.start_date) >= current_date
  );
$$;

revoke all on function private.presentation_has_public_agenda_occurrence(uuid) from public, anon, authenticated;
