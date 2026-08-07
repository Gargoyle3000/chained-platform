-- CHAINED profile settings foundation.
--
-- Profile membership_level remains access control only:
-- owner / manager / editor.
--
-- Account plan and legacy status are separate private account concepts.

create type public.account_plan as enum (
  'unchained',
  'chained'
);

create type public.account_legacy_status as enum (
  'first_chain',
  'master_chain'
);


alter table public.accounts
  add column account_plan public.account_plan
    not null default 'unchained',
  add column legacy_status public.account_legacy_status;


create unique index accounts_single_master_chain
  on public.accounts (legacy_status)
  where legacy_status = 'master_chain';


alter table public.public_profiles
  add column alternative_name varchar(160),
  add column city varchar(160),
  add column country varchar(160),
  add column website_url text,
  add column social_url text,
  add column pronouns varchar(160),
  add column public_contact_email varchar(320),

  add column show_works boolean
    not null default true,
  add column show_presentations boolean
    not null default true,
  add column show_agenda boolean
    not null default true,
  add column show_cv boolean
    not null default true,
  add column show_press boolean
    not null default true;


alter table public.public_profiles
  add constraint public_profiles_alternative_name_length
    check (
      alternative_name is null
      or char_length(trim(alternative_name))
        between 1 and 160
    ),

  add constraint public_profiles_city_length
    check (
      city is null
      or char_length(trim(city))
        between 1 and 160
    ),

  add constraint public_profiles_country_length
    check (
      country is null
      or char_length(trim(country))
        between 1 and 160
    ),

  add constraint public_profiles_website_url_length
    check (
      website_url is null
      or char_length(website_url) <= 2048
    ),

  add constraint public_profiles_website_url_http
    check (
      website_url is null
      or website_url ~* '^https?://[^[:space:]]+$'
    ),

  add constraint public_profiles_social_url_length
    check (
      social_url is null
      or char_length(social_url) <= 2048
    ),

  add constraint public_profiles_social_url_http
    check (
      social_url is null
      or social_url ~* '^https?://[^[:space:]]+$'
    ),

  add constraint public_profiles_pronouns_length
    check (
      pronouns is null
      or char_length(trim(pronouns))
        between 1 and 160
    ),

  add constraint public_profiles_contact_email_length
    check (
      public_contact_email is null
      or char_length(trim(public_contact_email))
        between 3 and 320
    );


create function private.can_manage_profile_settings(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and exists (
      select 1
        from public.public_profiles as p
       where p.id = target_profile_id
         and p.profile_type = 'artist'
         and p.deleted_at is null
    )
    and private.has_active_profile_membership(
      target_profile_id,
      'manager'
    );
$$;


create function private.prepare_artist_profile_settings_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_type is distinct from 'artist' then
    return new;
  end if;

  new.display_name :=
    trim(new.display_name);

  new.alternative_name :=
    nullif(trim(new.alternative_name), '');

  new.city :=
    nullif(trim(new.city), '');

  new.country :=
    nullif(trim(new.country), '');

  new.biography :=
    nullif(trim(new.biography), '');

  new.website_url :=
    nullif(trim(new.website_url), '');

  new.social_url :=
    nullif(trim(new.social_url), '');

  new.pronouns :=
    nullif(trim(new.pronouns), '');

  new.public_contact_email :=
    nullif(
      lower(trim(new.public_contact_email)),
      ''
    );

  -- Helpful URL normalisation:
  -- www.example.com -> https://www.example.com
  if new.website_url is not null
     and new.website_url !~* '^[a-z][a-z0-9+.-]*://' then
    new.website_url :=
      'https://' || new.website_url;
  end if;

  if new.social_url is not null
     and new.social_url !~* '^[a-z][a-z0-9+.-]*://' then
    new.social_url :=
      'https://' || new.social_url;
  end if;

  -- publication_status remains the source of truth.
  -- The timestamp is maintained automatically.
  if new.publication_status
       is distinct from old.publication_status then

    if new.publication_status = 'published' then
      new.published_at := now();
    else
      new.published_at := null;
    end if;

  end if;

  return new;
end;
$$;


create trigger public_profiles_prepare_settings
before update of
  display_name,
  alternative_name,
  city,
  country,
  biography,
  website_url,
  social_url,
  pronouns,
  public_contact_email,
  publication_status,
  show_works,
  show_presentations,
  show_agenda,
  show_cv,
  show_press
on public.public_profiles
for each row
execute function private.prepare_artist_profile_settings_row();


create policy public_profiles_settings_update
on public.public_profiles
for update
to authenticated
using (
  private.can_manage_profile_settings(id)
)
with check (
  private.can_manage_profile_settings(id)
);


-- New public profile information can be read under the existing
-- published-profile / managed-profile RLS policies.

grant select (
  alternative_name,
  city,
  country,
  website_url,
  social_url,
  pronouns,
  public_contact_email,
  show_works,
  show_presentations,
  show_agenda,
  show_cv,
  show_press
) on public.public_profiles
to anon, authenticated;


-- Only owner / manager profile settings are writable.
-- published_at is intentionally NOT directly writable.

grant update (
  display_name,
  alternative_name,
  city,
  country,
  biography,
  website_url,
  social_url,
  pronouns,
  public_contact_email,
  publication_status,
  show_works,
  show_presentations,
  show_agenda,
  show_cv,
  show_press
) on public.public_profiles
to authenticated;


-- Account plan information is private to the signed-in account.
-- No UPDATE grant: plans/statuses are controlled by CHAINED,
-- future billing logic, or trusted administration.

grant select (
  account_plan,
  legacy_status
) on public.accounts
to authenticated;


revoke all on function
  private.can_manage_profile_settings(uuid)
  from public, anon;

grant execute on function
  private.can_manage_profile_settings(uuid)
  to authenticated;


revoke all on function
  private.prepare_artist_profile_settings_row()
  from public, anon, authenticated;


comment on column public.accounts.account_plan is
  'Private CHAINED plan: UNCHAINED or CHAINED. Not a public artist status.';

comment on column public.accounts.legacy_status is
  'Optional private legacy/founder account status such as FIRST CHAIN or MASTER CHAIN.';

comment on column public.public_profiles.show_works is
  'Allows the public Works section to appear when public content exists.';

comment on column public.public_profiles.show_presentations is
  'Allows the public Presentations section to appear when public content exists.';

comment on column public.public_profiles.show_agenda is
  'Allows the public Agenda section to appear when public content exists.';

comment on column public.public_profiles.show_cv is
  'Allows the public CV section to appear when public content exists.';

comment on column public.public_profiles.show_press is
  'Allows the public Press section to appear when public content exists.';