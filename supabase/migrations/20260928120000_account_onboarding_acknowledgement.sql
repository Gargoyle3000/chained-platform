-- Account-scoped onboarding is UI preference state, never an access gate.
-- A temporary default grandfathers existing rows without firing their UPDATE trigger.
alter table public.accounts
  add column onboarding_acknowledged_version integer not null default 1;

alter table public.accounts
  alter column onboarding_acknowledged_version set default 0,
  add constraint accounts_onboarding_acknowledged_version_nonnegative
    check (onboarding_acknowledged_version >= 0);

grant select (onboarding_acknowledged_version)
  on public.accounts to authenticated;

grant update (onboarding_acknowledged_version)
  on public.accounts to authenticated;

create policy accounts_update_own_onboarding_acknowledgement
on public.accounts
for update
to authenticated
using (
  (select auth.uid()) is not null
  and id = (select auth.uid())
  and status = 'active'
)
with check (
  (select auth.uid()) is not null
  and id = (select auth.uid())
  and status = 'active'
);
