-- A Work association is presentation context. It is not a participant record.
-- Foreign Works still require their own manager's later decision.

create or replace function private.propose_presentation_work(
  target_presentation_id uuid,
  target_work_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  work_owner_profile_id uuid;
  association_id uuid;
  association_status public.presentation_work_status;
  next_position integer;
  caller_manages_work boolean;
begin
  if actor_id is null
     or not private.can_manage_presentation_content(target_presentation_id) then
    raise exception 'The Work may not be proposed to this Presentation.'
      using errcode = '42501';
  end if;

  perform 1 from public.profile_activities
   where id = target_presentation_id and deleted_at is null for update;
  select w.owner_profile_id
    into work_owner_profile_id
    from public.works as w
   where w.id = target_work_id
     and w.deleted_at is null
   for update;

  if work_owner_profile_id is null then
    raise exception 'The Work is unavailable.' using errcode = '22023';
  end if;

  caller_manages_work := private.can_manage_work(target_work_id);
  if not caller_manages_work
     and not private.is_published_work(target_work_id) then
    raise exception 'A foreign Work must be public before it can be proposed.'
      using errcode = '42501';
  end if;

  select pw.id, pw.status
    into association_id, association_status
    from public.presentation_works as pw
   where pw.presentation_id = target_presentation_id
     and pw.work_id = target_work_id
   for update;

  if association_id is not null and association_status in ('pending', 'accepted') then
    return association_id;
  end if;

  if association_id is null then
    select coalesce(max(pw.position) + 1, 0)
      into next_position
      from public.presentation_works as pw
     where pw.presentation_id = target_presentation_id;

    insert into public.presentation_works (
      presentation_id, work_id, position, status,
      requested_by_account_id, decided_by_account_id, decided_at
    ) values (
      target_presentation_id, target_work_id, next_position,
      case
        when caller_manages_work then 'accepted'::public.presentation_work_status
        else 'pending'::public.presentation_work_status
      end,
      actor_id,
      case when caller_manages_work then actor_id else null end,
      case when caller_manages_work then now() else null end
    ) returning id into association_id;
  else
    update public.presentation_works
       set status = case
             when caller_manages_work then 'accepted'::public.presentation_work_status
             else 'pending'::public.presentation_work_status
           end,
           is_visible = true,
           requested_by_account_id = actor_id,
           requested_at = now(),
           decided_by_account_id = case when caller_manages_work then actor_id else null end,
           decided_at = case when caller_manages_work then now() else null end,
           updated_at = now()
     where id = association_id;
  end if;

  insert into public.audit_events (
    actor_account_id, action, target_type, target_id, result, metadata
  ) values (
    actor_id, 'presentation.work_proposed', 'presentation_work', association_id,
    case when caller_manages_work then 'accepted' else 'pending' end,
    jsonb_build_object(
      'presentation_id', target_presentation_id,
      'work_id', target_work_id
    )
  );
  return association_id;
end;
$$;

comment on function private.propose_presentation_work(uuid, uuid) is
  'Proposes a public foreign Work for its manager to decide, independently of Presentation participant records.';
