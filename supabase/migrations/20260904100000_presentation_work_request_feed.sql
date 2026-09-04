-- Dashboard-only pending Work-proposal summaries. This keeps the existing
-- per-Work contract intact while avoiding a browser-side query per Work.

create function private.presentation_work_request_summary_rows(
  target_work_id uuid,
  pending_only boolean
)
returns table (
  association_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  work_id uuid,
  work_title varchar,
  request_status public.presentation_work_status,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pw.id,
    pw.presentation_id,
    pa.title,
    host_profile.display_name,
    pw.work_id,
    w.title,
    pw.status,
    pw.requested_at
  from public.presentation_works as pw
  join public.profile_activities as pa
    on pa.id = pw.presentation_id
   and pa.deleted_at is null
  join public.public_profiles as host_profile
    on host_profile.id = pa.owner_profile_id
   and host_profile.deleted_at is null
  join public.works as w
    on w.id = pw.work_id
   and w.deleted_at is null
  where (target_work_id is null or pw.work_id = target_work_id)
    and private.can_manage_work(pw.work_id)
    and (not pending_only or pw.status = 'pending')
  order by pw.requested_at desc, pw.id;
$$;

create or replace function private.get_work_presentation_request_summaries(
  target_work_id uuid
)
returns table (
  association_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  work_id uuid,
  work_title varchar,
  request_status public.presentation_work_status,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select *
    from private.presentation_work_request_summary_rows(
      target_work_id,
      false
    );
$$;

create function public.get_my_presentation_work_request_summaries()
returns table (
  association_id uuid,
  presentation_id uuid,
  presentation_title varchar,
  presentation_host_display_name varchar,
  work_id uuid,
  work_title varchar,
  request_status public.presentation_work_status,
  requested_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from private.presentation_work_request_summary_rows(
      null,
      true
    );
$$;

revoke all on function private.presentation_work_request_summary_rows(uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.presentation_work_request_summary_rows(uuid, boolean)
  to authenticated;

revoke all on function public.get_my_presentation_work_request_summaries()
  from public, anon;
grant execute on function public.get_my_presentation_work_request_summaries()
  to authenticated;
