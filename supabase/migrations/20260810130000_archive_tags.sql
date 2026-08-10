-- Private, account-owned organisation for archived works.

create table public.archive_tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid()
    references public.accounts(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint archive_tags_account_id_id_key unique (account_id, id),
  constraint archive_tags_name_not_blank check (char_length(btrim(name)) between 1 and 80)
);

create unique index archive_tags_account_name_key
  on public.archive_tags (account_id, lower(btrim(name)));

create index archive_tags_account_created_idx
  on public.archive_tags (account_id, created_at, id);

create function private.normalize_archive_tag_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  return new;
end;
$$;

create trigger normalize_archive_tag_name
  before insert or update of name on public.archive_tags
  for each row execute function private.normalize_archive_tag_name();

create table public.archive_item_tags (
  account_id uuid not null default auth.uid(),
  work_id uuid not null,
  tag_id uuid not null,
  constraint archive_item_tags_pkey primary key (account_id, work_id, tag_id),
  constraint archive_item_tags_archive_item_fkey
    foreign key (account_id, work_id)
    references public.archive_items(account_id, work_id) on delete cascade,
  constraint archive_item_tags_archive_tag_fkey
    foreign key (account_id, tag_id)
    references public.archive_tags(account_id, id) on delete cascade
);

create index archive_item_tags_account_tag_work_idx
  on public.archive_item_tags (account_id, tag_id, work_id);

alter table public.archive_tags enable row level security;
alter table public.archive_tags force row level security;
alter table public.archive_item_tags enable row level security;
alter table public.archive_item_tags force row level security;

revoke all on table public.archive_tags from public, anon, authenticated;
revoke all on table public.archive_item_tags from public, anon, authenticated;

grant select (account_id, id, name, created_at) on table public.archive_tags to authenticated;
grant insert (name) on table public.archive_tags to authenticated;
grant delete on table public.archive_tags to authenticated;

grant select (account_id, work_id, tag_id) on table public.archive_item_tags to authenticated;
grant insert (work_id, tag_id) on table public.archive_item_tags to authenticated;
grant delete on table public.archive_item_tags to authenticated;

create policy "archive_tags_select_own_active_account"
  on public.archive_tags for select to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());

create policy "archive_tags_insert_own_active_account"
  on public.archive_tags for insert to authenticated
  with check (account_id = auth.uid() and private.current_account_is_active());

create policy "archive_tags_delete_own_active_account"
  on public.archive_tags for delete to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());

create policy "archive_item_tags_select_own_active_account"
  on public.archive_item_tags for select to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());

create policy "archive_item_tags_insert_own_active_account"
  on public.archive_item_tags for insert to authenticated
  with check (account_id = auth.uid() and private.current_account_is_active());

create policy "archive_item_tags_delete_own_active_account"
  on public.archive_item_tags for delete to authenticated
  using (account_id = auth.uid() and private.current_account_is_active());
