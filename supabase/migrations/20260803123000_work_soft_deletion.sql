-- Keep deleted Works out of ordinary SELECT policies while allowing an
-- authorized account to begin the fixed 30-day recovery workflow.

revoke update (deleted_at) on public.works from authenticated;
revoke update (deleted_at) on public.work_images from authenticated;

create function private.begin_work_soft_deletion(target_work_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  work_deleted boolean;
begin
  if actor_id is null
     or not private.current_account_is_active()
     or not private.can_manage_work(target_work_id) then
    raise exception 'The current account may not delete this Work.'
      using errcode = '42501';
  end if;

  update public.works
     set deleted_at = now()
   where id = target_work_id
     and deleted_at is null;

  work_deleted := found;

  if work_deleted then
    insert into public.audit_events (
      actor_account_id,
      action,
      target_type,
      target_id,
      result,
      metadata
    ) values (
      actor_id,
      'work.soft_deleted',
      'work',
      target_work_id,
      'succeeded',
      jsonb_build_object('recovery_days', 30)
    );
  end if;

  return work_deleted;
end;
$$;

revoke all on function private.begin_work_soft_deletion(uuid) from public;
grant execute on function private.begin_work_soft_deletion(uuid) to authenticated;
