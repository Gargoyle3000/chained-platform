create table public.profile_follows (
  account_id uuid not null
    references public.accounts (id) on delete cascade,
  profile_id uuid not null
    references public.public_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_follows_pkey primary key (account_id, profile_id)
);

comment on table public.profile_follows is
  'Private immutable account-to-public-profile follow relationships. Unfollow hard-deletes the relationship.';

create index profile_follows_profile_account
  on public.profile_follows (profile_id, account_id);

alter table public.profile_follows enable row level security;
alter table public.profile_follows force row level security;

revoke all on table public.profile_follows from public, anon, authenticated;

grant select (account_id, profile_id, created_at)
  on public.profile_follows to authenticated;
grant insert (account_id, profile_id)
  on public.profile_follows to authenticated;
grant delete
  on public.profile_follows to authenticated;

create policy profile_follows_read_own
on public.profile_follows
for select
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
);

create policy profile_follows_create_own_published
on public.profile_follows
for insert
to authenticated
with check (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
  and (select private.is_published_profile(profile_id))
);

create policy profile_follows_delete_own
on public.profile_follows
for delete
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
);

create function public.list_following_feed(
  feed_cursor_published_at timestamptz default null,
  feed_cursor_work_id uuid default null,
  feed_page_size integer default 13
)
returns table (
  work_id uuid,
  title varchar(300),
  year_label varchar(32),
  published_at timestamptz,
  artist_display_name varchar(160),
  artist_slug varchar(100),
  public_object_path text,
  pixel_width integer,
  pixel_height integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    w.title,
    w.year_label,
    w.published_at,
    p.display_name,
    p.slug,
    wi.public_object_path,
    wi.pixel_width,
    wi.pixel_height
  from public.profile_follows as follow
  join public.public_profiles as p
    on p.id = follow.profile_id
   and p.publication_status = 'published'
  join public.works as w
    on w.owner_profile_id = p.id
   and w.visibility = 'published'
   and w.published_at is not null
  join public.work_images as wi
    on wi.work_id = w.id
   and wi.is_cover = true
   and wi.public_object_path is not null
  where (select private.current_account_is_active())
    and follow.account_id = (select auth.uid())
    and (
      (
        feed_cursor_published_at is null
        and feed_cursor_work_id is null
      )
      or (
        feed_cursor_published_at is not null
        and feed_cursor_work_id is not null
        and (
          w.published_at < feed_cursor_published_at
          or (
            w.published_at = feed_cursor_published_at
            and w.id > feed_cursor_work_id
          )
        )
      )
    )
  order by w.published_at desc, w.id asc
  limit least(greatest(coalesce(feed_page_size, 13), 1), 25);
$$;

comment on function public.list_following_feed(timestamptz, uuid, integer) is
  'Returns a bounded private Following feed ordered by published_at desc and Work ID asc.';

revoke all on function public.list_following_feed(timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.list_following_feed(timestamptz, uuid, integer)
  to authenticated;
