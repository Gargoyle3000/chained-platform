-- CHAINED identity, profiles, delegated management, Works, and Work images.
-- Local foundation only: no Storage buckets, Edge Functions, frontend wiring, or seed Works.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create type public.account_status as enum (
  'active',
  'suspended',
  'disabled'
);

create type public.application_role as enum (
  'private_member',
  'artist',
  'curator',
  'institution',
  'admin'
);

create type public.profile_type as enum (
  'artist',
  'curator',
  'institution'
);

create type public.profile_claim_state as enum (
  'claimed',
  'unclaimed_gallery_managed'
);

create type public.profile_membership_level as enum (
  'owner',
  'manager',
  'editor'
);

create type public.lifecycle_status as enum (
  'active',
  'revoked'
);

create type public.profile_relationship_type as enum (
  'represents',
  'affiliated_with'
);

create type public.access_grant_scope as enum (
  'works_editor',
  'presentations_editor',
  'events_editor',
  'profile_content_editor'
);

create type public.profile_claim_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create type public.publication_status as enum (
  'draft',
  'published'
);

create table public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  status public.account_status not null default 'active',
  display_name varchar(160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_display_name_length
    check (display_name is null or char_length(trim(display_name)) between 1 and 160)
);

create table public.account_roles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  role public.application_role not null,
  granted_at timestamptz not null default now(),
  granted_by_account_id uuid references public.accounts (id) on delete set null,
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id) on delete set null,
  constraint account_roles_revocation_consistent
    check (
      (revoked_at is null and revoked_by_account_id is null)
      or revoked_at is not null
    )
);

create table public.public_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_type public.profile_type not null,
  slug varchar(100) not null,
  display_name varchar(160) not null,
  biography text,
  publication_status public.publication_status not null default 'draft',
  published_at timestamptz,
  claim_state public.profile_claim_state not null default 'claimed',
  primary_controller_account_id uuid references public.accounts (id) on delete restrict,
  claimed_at timestamptz,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  deleted_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_after timestamptz,
  constraint public_profiles_slug_shape
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint public_profiles_display_name_nonempty
    check (char_length(trim(display_name)) between 1 and 160),
  constraint public_profiles_biography_length
    check (biography is null or char_length(biography) <= 20000),
  constraint public_profiles_publication_consistent
    check (
      (publication_status = 'draft' and published_at is null)
      or (publication_status = 'published' and published_at is not null)
    ),
  constraint public_profiles_claim_consistent
    check (
      (
        profile_type = 'artist'
        and (
          (
            claim_state = 'claimed'
            and primary_controller_account_id is not null
            and claimed_at is not null
          )
          or (
            claim_state = 'unclaimed_gallery_managed'
            and primary_controller_account_id is null
            and claimed_at is null
          )
        )
      )
      or (
        profile_type <> 'artist'
        and claim_state = 'claimed'
      )
    ),
  constraint public_profiles_deletion_consistent
    check (
      (
        deleted_at is null
        and purge_after is null
        and deleted_by_account_id is null
      )
      or (
        deleted_at is not null
        and purge_after = deleted_at + interval '30 days'
        and deleted_by_account_id is not null
      )
    )
);

create table public.profile_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.public_profiles (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  membership_level public.profile_membership_level not null,
  status public.lifecycle_status not null default 'active',
  granted_at timestamptz not null default now(),
  granted_by_account_id uuid references public.accounts (id) on delete set null,
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_members_lifecycle_consistent
    check (
      (status = 'active' and revoked_at is null and revoked_by_account_id is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create table public.profile_relationships (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  to_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  relationship_type public.profile_relationship_type not null,
  status public.lifecycle_status not null default 'active',
  starts_on date,
  ends_on date,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_relationships_distinct_profiles
    check (from_profile_id <> to_profile_id),
  constraint profile_relationships_dates_ordered
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint profile_relationships_lifecycle_consistent
    check (
      (status = 'active' and revoked_at is null and revoked_by_account_id is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create table public.profile_access_grants (
  id uuid primary key default gen_random_uuid(),
  grantor_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  grantee_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  scope public.access_grant_scope not null,
  status public.lifecycle_status not null default 'active',
  granted_at timestamptz not null default now(),
  granted_by_account_id uuid references public.accounts (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_access_grants_distinct_profiles
    check (grantor_profile_id <> grantee_profile_id),
  constraint profile_access_grants_expiry_after_grant
    check (expires_at is null or expires_at > granted_at),
  constraint profile_access_grants_lifecycle_consistent
    check (
      (status = 'active' and revoked_at is null and revoked_by_account_id is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create table public.profile_claims (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  claimant_account_id uuid not null references public.accounts (id) on delete restrict,
  status public.profile_claim_status not null default 'pending',
  evidence_note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_claims_evidence_length
    check (evidence_note is null or char_length(evidence_note) <= 4000),
  constraint profile_claims_resolution_consistent
    check (
      (status = 'pending' and resolved_at is null and resolved_by_account_id is null)
      or (status = 'cancelled' and resolved_at is not null)
      or (
        status in ('approved', 'rejected')
        and resolved_at is not null
        and resolved_by_account_id is not null
      )
    )
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid references public.accounts (id) on delete set null,
  action varchar(100) not null,
  target_type varchar(80) not null,
  target_id uuid,
  result varchar(40) not null default 'succeeded',
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_nonempty
    check (char_length(trim(action)) between 1 and 100),
  constraint audit_events_target_type_nonempty
    check (char_length(trim(target_type)) between 1 and 80),
  constraint audit_events_result_nonempty
    check (char_length(trim(result)) between 1 and 40),
  constraint audit_events_metadata_object
    check (
      jsonb_typeof(metadata) = 'object'
      and octet_length(metadata::text) <= 8192
    )
);

create table public.works (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.public_profiles (id) on delete restrict,
  created_by_account_id uuid references public.accounts (id) on delete set null,
  updated_by_account_id uuid references public.accounts (id) on delete set null,
  deleted_by_account_id uuid references public.accounts (id) on delete set null,
  title varchar(300) not null default '',
  year_sort integer,
  year_label varchar(32) not null default '',
  work_type varchar(80) not null default '',
  format_discipline varchar(120),
  primary_medium text,
  support_base text,
  additional_materials text[] not null default '{}'::text[],
  height numeric(12, 3),
  width numeric(12, 3),
  depth numeric(12, 3),
  dimension_unit varchar(8),
  duration_text varchar(160),
  edition_text varchar(160),
  description text,
  collaborator_name varchar(300),
  collaborator_url text,
  photo_credit_name varchar(300),
  photo_credit_url text,
  visibility public.publication_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  purge_after timestamptz,
  constraint works_title_length
    check (char_length(trim(title)) <= 300),
  constraint works_year_sort_range
    check (year_sort is null or year_sort between -10000 and 10000),
  constraint works_year_label_length
    check (char_length(trim(year_label)) <= 32),
  constraint works_work_type_length
    check (char_length(trim(work_type)) <= 80),
  constraint works_dimensions_nonnegative
    check (
      (height is null or height >= 0)
      and (width is null or width >= 0)
      and (depth is null or depth >= 0)
    ),
  constraint works_dimension_unit_allowed
    check (dimension_unit is null or dimension_unit in ('mm', 'cm', 'm', 'in')),
  constraint works_description_length
    check (description is null or char_length(description) <= 50000),
  constraint works_external_url_lengths
    check (
      (collaborator_url is null or char_length(collaborator_url) <= 2048)
      and (photo_credit_url is null or char_length(photo_credit_url) <= 2048)
    ),
  constraint works_publication_consistent
    check (
      (
        visibility = 'draft'
        and published_at is null
      )
      or (
        visibility = 'published'
        and published_at is not null
        and char_length(trim(title)) between 1 and 300
        and char_length(trim(year_label)) between 1 and 32
        and char_length(trim(work_type)) between 1 and 80
      )
    ),
  constraint works_deletion_consistent
    check (
      (
        deleted_at is null
        and purge_after is null
        and deleted_by_account_id is null
      )
      or (
        deleted_at is not null
        and purge_after = deleted_at + interval '30 days'
        and deleted_by_account_id is not null
      )
    )
);

create table public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  private_object_path text not null,
  public_object_path text,
  original_filename varchar(512) not null,
  mime_type varchar(80) not null,
  file_size bigint,
  pixel_width integer,
  pixel_height integer,
  sort_order integer not null,
  is_cover boolean not null default false,
  uploaded_by_account_id uuid references public.accounts (id) on delete set null,
  updated_by_account_id uuid references public.accounts (id) on delete set null,
  deleted_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_images_private_path_length
    check (char_length(private_object_path) between 1 and 1024),
  constraint work_images_public_path_length
    check (public_object_path is null or char_length(public_object_path) between 1 and 1024),
  constraint work_images_filename_length
    check (char_length(original_filename) between 1 and 512),
  constraint work_images_path_not_filename
    check (private_object_path <> original_filename),
  constraint work_images_mime_type_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint work_images_file_size_positive
    check (file_size is null or file_size > 0),
  constraint work_images_dimensions_positive
    check (
      (pixel_width is null or pixel_width > 0)
      and (pixel_height is null or pixel_height > 0)
    ),
  constraint work_images_sort_order_nonnegative
    check (sort_order >= 0),
  constraint work_images_deletion_consistent
    check (
      (deleted_at is null and deleted_by_account_id is null)
      or (deleted_at is not null and deleted_by_account_id is not null)
    ),
  constraint work_images_public_path_for_live_rows
    check (deleted_at is null or public_object_path is null)
);

create unique index account_roles_one_active_role
  on public.account_roles (account_id, role)
  where revoked_at is null;

create index account_roles_role_account
  on public.account_roles (role, account_id)
  where revoked_at is null;

create index accounts_status
  on public.accounts (status, id);

create unique index public_profiles_active_slug
  on public.public_profiles (lower(slug))
  where deleted_at is null;

create index public_profiles_public_listing
  on public.public_profiles (profile_type, id)
  where publication_status = 'published' and deleted_at is null;

create index public_profiles_claim_queue
  on public.public_profiles (claim_state, id)
  where profile_type = 'artist' and deleted_at is null;

create unique index profile_members_one_active_membership
  on public.profile_members (profile_id, account_id)
  where status = 'active' and revoked_at is null;

create index profile_members_account_access
  on public.profile_members (account_id, profile_id, membership_level)
  where status = 'active' and revoked_at is null;

create index profile_members_profile_level
  on public.profile_members (profile_id, membership_level, account_id)
  where status = 'active' and revoked_at is null;

create unique index profile_relationships_one_active_equivalent
  on public.profile_relationships (from_profile_id, to_profile_id, relationship_type)
  where status = 'active' and revoked_at is null;

create index profile_relationships_reverse
  on public.profile_relationships (to_profile_id, relationship_type, from_profile_id)
  where status = 'active' and revoked_at is null;

create unique index profile_access_grants_one_unrevoked_scope
  on public.profile_access_grants (grantor_profile_id, grantee_profile_id, scope)
  where status = 'active' and revoked_at is null;

create index profile_access_grants_delegate_lookup
  on public.profile_access_grants (grantee_profile_id, scope, grantor_profile_id, expires_at)
  where status = 'active' and revoked_at is null;

create index profile_access_grants_grantor_lookup
  on public.profile_access_grants (grantor_profile_id, scope, grantee_profile_id, expires_at)
  where status = 'active' and revoked_at is null;

create unique index profile_claims_one_pending_per_profile
  on public.profile_claims (target_profile_id)
  where status = 'pending';

create unique index profile_claims_one_pending_per_claimant
  on public.profile_claims (claimant_account_id)
  where status = 'pending';

create index profile_claims_review_queue
  on public.profile_claims (status, requested_at, id);

create index audit_events_target_history
  on public.audit_events (target_type, target_id, created_at desc);

create index audit_events_actor_history
  on public.audit_events (actor_account_id, created_at desc);

create index works_dashboard_order
  on public.works (
    owner_profile_id,
    year_sort desc nulls last,
    updated_at desc,
    id
  )
  where deleted_at is null;

create index works_profile_public_order
  on public.works (
    owner_profile_id,
    year_sort desc nulls last,
    updated_at desc,
    id
  )
  where visibility = 'published' and deleted_at is null;

create index works_global_publication_order
  on public.works (published_at desc, id)
  where visibility = 'published' and deleted_at is null;

create index works_created_by
  on public.works (created_by_account_id, created_at desc)
  where deleted_at is null;

create unique index work_images_one_active_sort_order
  on public.work_images (work_id, sort_order)
  where deleted_at is null;

create unique index work_images_one_active_cover
  on public.work_images (work_id)
  where is_cover and deleted_at is null;

create index work_images_active_order
  on public.work_images (work_id, sort_order, id)
  where deleted_at is null;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.enforce_profile_relationship_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_type public.profile_type;
  to_type public.profile_type;
begin
  select p.profile_type
    into from_type
    from public.public_profiles as p
   where p.id = new.from_profile_id
     and p.deleted_at is null;

  select p.profile_type
    into to_type
    from public.public_profiles as p
   where p.id = new.to_profile_id
     and p.deleted_at is null;

  if from_type is null or to_type is null then
    raise exception 'Profile relationships require two active profiles.'
      using errcode = '23514';
  end if;

  if new.relationship_type = 'represents'
     and (from_type <> 'institution' or to_type <> 'artist') then
    raise exception 'A represents relationship must point from an institution profile to an artist profile.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function private.enforce_profile_access_grant_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grantor_type public.profile_type;
  grantee_type public.profile_type;
begin
  select p.profile_type
    into grantor_type
    from public.public_profiles as p
   where p.id = new.grantor_profile_id
     and p.deleted_at is null;

  select p.profile_type
    into grantee_type
    from public.public_profiles as p
   where p.id = new.grantee_profile_id
     and p.deleted_at is null;

  if grantor_type <> 'artist' or grantee_type <> 'institution' then
    raise exception 'Delegated access must run from an artist profile to an institution profile.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function private.enforce_profile_claim_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type public.profile_type;
  target_claim_state public.profile_claim_state;
begin
  select p.profile_type, p.claim_state
    into target_type, target_claim_state
    from public.public_profiles as p
   where p.id = new.target_profile_id
     and p.deleted_at is null;

  if target_type <> 'artist'
     or target_claim_state <> 'unclaimed_gallery_managed' then
    raise exception 'Claims may target only active unclaimed gallery-managed artist profiles.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function private.prepare_work_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  owner_type public.profile_type;
begin
  select p.profile_type
    into owner_type
    from public.public_profiles as p
   where p.id = new.owner_profile_id
     and p.deleted_at is null;

  if owner_type <> 'artist' then
    raise exception 'Works must be owned by an active artist profile.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.created_by_account_id := actor_id;
      new.updated_by_account_id := actor_id;
      new.deleted_by_account_id := null;
      new.deleted_at := null;
      new.purge_after := null;
      new.visibility := 'draft';
      new.published_at := null;
    end if;
  else
    if new.owner_profile_id is distinct from old.owner_profile_id then
      raise exception 'Work ownership cannot be changed by an ordinary update.'
        using errcode = '42501';
    end if;

    if actor_id is not null then
      new.created_by_account_id := old.created_by_account_id;
      new.updated_by_account_id := actor_id;

      if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_at := now();
        new.purge_after := new.deleted_at + interval '30 days';
        new.deleted_by_account_id := actor_id;

        update public.work_images
           set public_object_path = null,
               updated_by_account_id = actor_id,
               updated_at = now()
         where work_id = old.id
           and deleted_at is null;
      elsif old.deleted_at is not null then
        if new.deleted_at is distinct from old.deleted_at
           or new.purge_after is distinct from old.purge_after
           or new.deleted_by_account_id is distinct from old.deleted_by_account_id then
          raise exception 'Deleted Works require a trusted restore or purge workflow.'
            using errcode = '42501';
        end if;
      else
        new.deleted_at := null;
        new.purge_after := null;
        new.deleted_by_account_id := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create function private.prepare_work_image_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  owner_profile_id uuid;
  expected_base text;
begin
  select w.owner_profile_id
    into owner_profile_id
    from public.works as w
   where w.id = new.work_id
     and w.deleted_at is null;

  if owner_profile_id is null then
    raise exception 'Work images require an active parent Work.'
      using errcode = '23514';
  end if;

  expected_base := 'profiles/' || owner_profile_id::text
    || '/works/' || new.work_id::text
    || '/images/' || new.id::text
    || '/source.';

  if lower(new.private_object_path) not in (
    expected_base || 'jpg',
    expected_base || 'jpeg',
    expected_base || 'png',
    expected_base || 'webp'
  ) then
    raise exception 'Private image paths must use trusted profile, Work, and image UUID segments.'
      using errcode = '23514';
  end if;

  if (new.mime_type = 'image/jpeg' and lower(new.private_object_path) not like '%.jpg'
      and lower(new.private_object_path) not like '%.jpeg')
     or (new.mime_type = 'image/png' and lower(new.private_object_path) not like '%.png')
     or (new.mime_type = 'image/webp' and lower(new.private_object_path) not like '%.webp') then
    raise exception 'Image MIME type and trusted object-path extension must agree.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.uploaded_by_account_id := actor_id;
      new.updated_by_account_id := actor_id;
      new.deleted_by_account_id := null;
      new.deleted_at := null;
      new.public_object_path := null;
    end if;
  else
    if new.work_id is distinct from old.work_id
       or new.private_object_path is distinct from old.private_object_path then
      raise exception 'A Work image cannot be moved to another Work or private object path.'
        using errcode = '42501';
    end if;

    if actor_id is not null then
      new.uploaded_by_account_id := old.uploaded_by_account_id;
      new.updated_by_account_id := actor_id;

      if old.deleted_at is null and new.deleted_at is not null then
        new.deleted_at := now();
        new.deleted_by_account_id := actor_id;
        new.public_object_path := null;
      elsif old.deleted_at is not null then
        if new.deleted_at is distinct from old.deleted_at
           or new.deleted_by_account_id is distinct from old.deleted_by_account_id then
          raise exception 'Deleted Work images require a trusted restore or purge workflow.'
            using errcode = '42501';
        end if;
      else
        new.deleted_at := null;
        new.deleted_by_account_id := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create function private.check_work_image_cover_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_work_id uuid := coalesce(new.work_id, old.work_id);
  active_image_count integer;
  active_cover_count integer;
begin
  select count(*), count(*) filter (where wi.is_cover)
    into active_image_count, active_cover_count
    from public.work_images as wi
   where wi.work_id = target_work_id
     and wi.deleted_at is null;

  if active_image_count > 0 and active_cover_count <> 1 then
    raise exception 'A Work with active images must have exactly one active cover image.'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.enforce_profile_relationship_types() from public;
revoke all on function private.enforce_profile_access_grant_types() from public;
revoke all on function private.enforce_profile_claim_target() from public;
revoke all on function private.prepare_work_row() from public;
revoke all on function private.prepare_work_image_row() from public;
revoke all on function private.check_work_image_cover_integrity() from public;

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function private.set_updated_at();

create trigger public_profiles_set_updated_at
before update on public.public_profiles
for each row execute function private.set_updated_at();

create trigger profile_members_set_updated_at
before update on public.profile_members
for each row execute function private.set_updated_at();

create trigger profile_relationships_set_updated_at
before update on public.profile_relationships
for each row execute function private.set_updated_at();

create trigger profile_relationships_enforce_types
before insert or update of from_profile_id, to_profile_id, relationship_type
on public.profile_relationships
for each row execute function private.enforce_profile_relationship_types();

create trigger profile_access_grants_set_updated_at
before update on public.profile_access_grants
for each row execute function private.set_updated_at();

create trigger profile_access_grants_enforce_types
before insert or update of grantor_profile_id, grantee_profile_id, scope
on public.profile_access_grants
for each row execute function private.enforce_profile_access_grant_types();

create trigger profile_claims_set_updated_at
before update on public.profile_claims
for each row execute function private.set_updated_at();

create trigger profile_claims_enforce_target
before insert or update of target_profile_id
on public.profile_claims
for each row execute function private.enforce_profile_claim_target();

create trigger works_set_updated_at
before update on public.works
for each row execute function private.set_updated_at();

create trigger works_prepare_row
before insert or update on public.works
for each row execute function private.prepare_work_row();

create trigger work_images_set_updated_at
before update on public.work_images
for each row execute function private.set_updated_at();

create trigger work_images_prepare_row
before insert or update on public.work_images
for each row execute function private.prepare_work_image_row();

create constraint trigger work_images_require_exactly_one_cover
after insert or update or delete on public.work_images
deferrable initially deferred
for each row execute function private.check_work_image_cover_integrity();

create function private.current_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
        from public.accounts as a
       where a.id = auth.uid()
         and a.status = 'active'
    );
$$;

create function private.has_active_profile_membership(
  target_profile_id uuid,
  required_level public.profile_membership_level default 'editor'
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
        from public.profile_members as pm
       where pm.profile_id = target_profile_id
         and pm.account_id = auth.uid()
         and pm.status = 'active'
         and pm.revoked_at is null
         and case pm.membership_level
               when 'owner' then 3
               when 'manager' then 2
               when 'editor' then 1
             end
             >= case required_level
                  when 'owner' then 3
                  when 'manager' then 2
                  when 'editor' then 1
                end
    );
$$;

create function private.has_delegated_scope(
  target_artist_profile_id uuid,
  required_scope public.access_grant_scope
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
        from public.profile_access_grants as pag
        join public.public_profiles as artist_profile
          on artist_profile.id = pag.grantor_profile_id
         and artist_profile.profile_type = 'artist'
         and artist_profile.deleted_at is null
        join public.public_profiles as institution_profile
          on institution_profile.id = pag.grantee_profile_id
         and institution_profile.profile_type = 'institution'
         and institution_profile.deleted_at is null
        join public.profile_members as pm
          on pm.profile_id = pag.grantee_profile_id
         and pm.account_id = auth.uid()
         and pm.status = 'active'
         and pm.revoked_at is null
       where pag.grantor_profile_id = target_artist_profile_id
         and pag.scope = required_scope
         and pag.status = 'active'
         and pag.revoked_at is null
         and (pag.expires_at is null or pag.expires_at > now())
    );
$$;

create function private.can_read_managed_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_account_is_active()
    and (
      private.has_active_profile_membership(target_profile_id, 'editor')
      or exists (
        select 1
          from public.profile_access_grants as pag
          join public.profile_members as pm
            on pm.profile_id = pag.grantee_profile_id
           and pm.account_id = auth.uid()
           and pm.status = 'active'
           and pm.revoked_at is null
         where pag.grantor_profile_id = target_profile_id
           and pag.status = 'active'
           and pag.revoked_at is null
           and (pag.expires_at is null or pag.expires_at > now())
      )
    );
$$;

create function private.can_manage_work_owner(target_artist_profile_id uuid)
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
       where p.id = target_artist_profile_id
         and p.profile_type = 'artist'
         and p.deleted_at is null
    )
    and (
      private.has_active_profile_membership(target_artist_profile_id, 'editor')
      or private.has_delegated_scope(target_artist_profile_id, 'works_editor')
    );
$$;

create function private.can_manage_work(target_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.works as w
     where w.id = target_work_id
       and w.deleted_at is null
       and private.can_manage_work_owner(w.owner_profile_id)
  );
$$;

create function private.is_published_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.public_profiles as p
     where p.id = target_profile_id
       and p.publication_status = 'published'
       and p.deleted_at is null
  );
$$;

create function private.is_published_work(target_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.works as w
     where w.id = target_work_id
       and w.visibility = 'published'
       and w.deleted_at is null
       and private.is_published_profile(w.owner_profile_id)
  );
$$;

revoke all on function private.current_account_is_active() from public;
revoke all on function private.has_active_profile_membership(uuid, public.profile_membership_level) from public;
revoke all on function private.has_delegated_scope(uuid, public.access_grant_scope) from public;
revoke all on function private.can_read_managed_profile(uuid) from public;
revoke all on function private.can_manage_work_owner(uuid) from public;
revoke all on function private.can_manage_work(uuid) from public;
revoke all on function private.is_published_profile(uuid) from public;
revoke all on function private.is_published_work(uuid) from public;

grant usage on schema private to anon, authenticated;

grant execute on function private.is_published_profile(uuid) to anon, authenticated;
grant execute on function private.is_published_work(uuid) to anon, authenticated;
grant execute on function private.current_account_is_active() to authenticated;
grant execute on function private.has_active_profile_membership(uuid, public.profile_membership_level) to authenticated;
grant execute on function private.has_delegated_scope(uuid, public.access_grant_scope) to authenticated;
grant execute on function private.can_read_managed_profile(uuid) to authenticated;
grant execute on function private.can_manage_work_owner(uuid) to authenticated;
grant execute on function private.can_manage_work(uuid) to authenticated;

revoke all on table public.accounts from anon, authenticated;
revoke all on table public.account_roles from anon, authenticated;
revoke all on table public.public_profiles from anon, authenticated;
revoke all on table public.profile_members from anon, authenticated;
revoke all on table public.profile_relationships from anon, authenticated;
revoke all on table public.profile_access_grants from anon, authenticated;
revoke all on table public.profile_claims from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
revoke all on table public.works from anon, authenticated;
revoke all on table public.work_images from anon, authenticated;

grant select (id, status, display_name, created_at, updated_at)
  on public.accounts to authenticated;

grant select (id, account_id, role, granted_at, revoked_at)
  on public.account_roles to authenticated;

grant select (
  id,
  profile_type,
  slug,
  display_name,
  biography,
  publication_status,
  published_at,
  claim_state,
  created_at,
  updated_at
) on public.public_profiles to anon, authenticated;

grant select (
  id,
  profile_id,
  account_id,
  membership_level,
  status,
  granted_at,
  revoked_at,
  created_at,
  updated_at
) on public.profile_members to authenticated;

grant select (
  id,
  from_profile_id,
  to_profile_id,
  relationship_type,
  status,
  starts_on,
  ends_on,
  created_at,
  updated_at
) on public.profile_relationships to anon, authenticated;

grant select (
  id,
  grantor_profile_id,
  grantee_profile_id,
  scope,
  status,
  granted_at,
  expires_at,
  revoked_at,
  created_at,
  updated_at
) on public.profile_access_grants to authenticated;

grant select (
  id,
  target_profile_id,
  claimant_account_id,
  status,
  requested_at,
  resolved_at,
  created_at,
  updated_at
) on public.profile_claims to authenticated;

grant select (
  id,
  owner_profile_id,
  title,
  year_sort,
  year_label,
  work_type,
  format_discipline,
  primary_medium,
  support_base,
  additional_materials,
  height,
  width,
  depth,
  dimension_unit,
  duration_text,
  edition_text,
  description,
  collaborator_name,
  collaborator_url,
  photo_credit_name,
  photo_credit_url,
  visibility,
  published_at,
  created_at,
  updated_at
) on public.works to anon, authenticated;

grant insert (
  owner_profile_id,
  title,
  year_sort,
  year_label,
  work_type,
  format_discipline,
  primary_medium,
  support_base,
  additional_materials,
  height,
  width,
  depth,
  dimension_unit,
  duration_text,
  edition_text,
  description,
  collaborator_name,
  collaborator_url,
  photo_credit_name,
  photo_credit_url
) on public.works to authenticated;

grant update (
  title,
  year_sort,
  year_label,
  work_type,
  format_discipline,
  primary_medium,
  support_base,
  additional_materials,
  height,
  width,
  depth,
  dimension_unit,
  duration_text,
  edition_text,
  description,
  collaborator_name,
  collaborator_url,
  photo_credit_name,
  photo_credit_url
) on public.works to authenticated;

grant select (
  id,
  work_id,
  public_object_path,
  mime_type,
  file_size,
  pixel_width,
  pixel_height,
  sort_order,
  is_cover,
  created_at,
  updated_at
) on public.work_images to anon;

grant select (
  id,
  work_id,
  public_object_path,
  original_filename,
  mime_type,
  file_size,
  pixel_width,
  pixel_height,
  sort_order,
  is_cover,
  created_at,
  updated_at
) on public.work_images to authenticated;

grant insert (
  id,
  work_id,
  private_object_path,
  original_filename,
  mime_type,
  file_size,
  pixel_width,
  pixel_height,
  sort_order,
  is_cover
) on public.work_images to authenticated;

grant update (
  original_filename,
  mime_type,
  file_size,
  pixel_width,
  pixel_height,
  sort_order,
  is_cover
) on public.work_images to authenticated;

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.account_roles enable row level security;
alter table public.account_roles force row level security;
alter table public.public_profiles enable row level security;
alter table public.public_profiles force row level security;
alter table public.profile_members enable row level security;
alter table public.profile_members force row level security;
alter table public.profile_relationships enable row level security;
alter table public.profile_relationships force row level security;
alter table public.profile_access_grants enable row level security;
alter table public.profile_access_grants force row level security;
alter table public.profile_claims enable row level security;
alter table public.profile_claims force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
alter table public.works enable row level security;
alter table public.works force row level security;
alter table public.work_images enable row level security;
alter table public.work_images force row level security;

create policy accounts_read_own
on public.accounts
for select
to authenticated
using (
  (select auth.uid()) is not null
  and id = (select auth.uid())
);

create policy account_roles_read_own
on public.account_roles
for select
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
);

create policy public_profiles_guest_read_published
on public.public_profiles
for select
to anon
using (
  publication_status = 'published'
  and deleted_at is null
);

create policy public_profiles_authenticated_read
on public.public_profiles
for select
to authenticated
using (
  (
    publication_status = 'published'
    and deleted_at is null
  )
  or (
    deleted_at is null
    and (select private.can_read_managed_profile(id))
  )
);

create policy profile_members_read_own
on public.profile_members
for select
to authenticated
using (
  (select private.current_account_is_active())
  and account_id = (select auth.uid())
);

create policy profile_relationships_guest_read_published
on public.profile_relationships
for select
to anon
using (
  status = 'active'
  and revoked_at is null
  and (select private.is_published_profile(from_profile_id))
  and (select private.is_published_profile(to_profile_id))
);

create policy profile_relationships_authenticated_read
on public.profile_relationships
for select
to authenticated
using (
  (
    status = 'active'
    and revoked_at is null
    and (select private.is_published_profile(from_profile_id))
    and (select private.is_published_profile(to_profile_id))
  )
  or (select private.can_read_managed_profile(from_profile_id))
  or (select private.can_read_managed_profile(to_profile_id))
);

create policy profile_access_grants_read_relevant
on public.profile_access_grants
for select
to authenticated
using (
  (select private.current_account_is_active())
  and (
    (select private.has_active_profile_membership(grantor_profile_id, 'editor'))
    or (select private.has_active_profile_membership(grantee_profile_id, 'editor'))
  )
);

create policy profile_claims_read_own
on public.profile_claims
for select
to authenticated
using (
  (select private.current_account_is_active())
  and claimant_account_id = (select auth.uid())
);

create policy works_guest_read_published
on public.works
for select
to anon
using (
  visibility = 'published'
  and deleted_at is null
  and (select private.is_published_profile(owner_profile_id))
);

create policy works_authenticated_read
on public.works
for select
to authenticated
using (
  (
    visibility = 'published'
    and deleted_at is null
    and (select private.is_published_profile(owner_profile_id))
  )
  or (
    deleted_at is null
    and (select private.can_manage_work_owner(owner_profile_id))
  )
);

create policy works_authenticated_insert
on public.works
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select private.current_account_is_active())
  and visibility = 'draft'
  and published_at is null
  and deleted_at is null
  and created_by_account_id = (select auth.uid())
  and updated_by_account_id = (select auth.uid())
  and (select private.can_manage_work_owner(owner_profile_id))
);

create policy works_authenticated_update
on public.works
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and (select private.can_manage_work_owner(owner_profile_id))
)
with check (
  (select auth.uid()) is not null
  and (select private.can_manage_work_owner(owner_profile_id))
  and updated_by_account_id = (select auth.uid())
);

create policy work_images_guest_read_published
on public.work_images
for select
to anon
using (
  deleted_at is null
  and public_object_path is not null
  and (select private.is_published_work(work_id))
);

create policy work_images_authenticated_read
on public.work_images
for select
to authenticated
using (
  (
    deleted_at is null
    and public_object_path is not null
    and (select private.is_published_work(work_id))
  )
  or (
    deleted_at is null
    and (select private.can_manage_work(work_id))
  )
);

create policy work_images_authenticated_insert
on public.work_images
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and deleted_at is null
  and public_object_path is null
  and uploaded_by_account_id = (select auth.uid())
  and updated_by_account_id = (select auth.uid())
  and (select private.can_manage_work(work_id))
);

create policy work_images_authenticated_update
on public.work_images
for update
to authenticated
using (
  (select auth.uid()) is not null
  and deleted_at is null
  and (select private.can_manage_work(work_id))
)
with check (
  (select auth.uid()) is not null
  and updated_by_account_id = (select auth.uid())
  and (select private.can_manage_work(work_id))
);
