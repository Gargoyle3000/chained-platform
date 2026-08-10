create table public.archive_items (
  account_id uuid not null default auth.uid()
    references public.accounts (id) on delete cascade,
  work_id uuid not null
    references public.works (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint archive_items_pkey primary key (account_id, work_id)
);

comment on table public.archive_items is
  'Private account-to-public-Work archive relationships. Removing a Work from Archive hard-deletes only the relationship.';

create index archive_items_account_created
  on public.archive_items (account_id, created_at desc, work_id);

alter table public.archive_items enable row level security;
alter table public.archive_items force row level security;

revoke all on table public.archive_items from public, anon, authenticated;

grant select (account_id, work_id, created_at)
  on public.archive_items to authenticated;
grant insert (work_id)
  on public.archive_items to authenticated;
grant delete
  on public.archive_items to authenticated;

create policy archive_items_read_own
on public.archive_items
for select
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
);

create policy archive_items_create_own_published_work
on public.archive_items
for insert
to authenticated
with check (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
  and (select private.is_published_work(work_id))
);

create policy archive_items_delete_own
on public.archive_items
for delete
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
);
