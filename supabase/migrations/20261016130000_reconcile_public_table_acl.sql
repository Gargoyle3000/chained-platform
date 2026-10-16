-- F2: reconcile existing public tables independently of historical default ACLs.
-- Clear both relation and column grants, including PUBLIC inheritance. Table
-- REVOKE alone does not remove separately granted column privileges. No default
-- ACL, RLS, Storage, function EXECUTE or SECURITY DEFINER change is made here.
--
-- Browser contracts are the explicit migration allowlists, including F1's
-- activity projections, not grants inferred from legacy platform defaults.
-- Preserve the intentional work_images duplicate-cover INSERT compatibility
-- contract (20260803150000); successful uploads still use reservation RPCs.
--
-- Elevated direct access: invite-account/index.ts reads/creates/claims/fails
-- account_invitations and checks public_profiles for live slug collisions.
-- Include SELECT columns used in filters/order as well as returned fields.
-- All other Edge media/worker/Agenda service operations use trusted RPCs;
-- their preliminary account/work/image reads use the caller's credentials.

revoke all privileges on table public.accounts from public, anon, authenticated, service_role;
revoke all privileges (
  id, status, display_name, created_at, updated_at, account_plan, legacy_status,
  onboarding_acknowledged_version
) on table public.accounts from public, anon, authenticated, service_role;

revoke all privileges on table public.account_roles from public, anon, authenticated, service_role;
revoke all privileges (
  id, account_id, role, granted_at, granted_by_account_id, revoked_at, revoked_by_account_id
) on table public.account_roles from public, anon, authenticated, service_role;

revoke all privileges on table public.public_profiles from public, anon, authenticated, service_role;
revoke all privileges (
  id, profile_type, slug, display_name, biography, publication_status, published_at,
  claim_state, primary_controller_account_id, claimed_at, created_by_account_id,
  deleted_by_account_id, created_at, updated_at, deleted_at, purge_after, alternative_name,
  city, country, website_url, social_url, pronouns, public_contact_email, show_works,
  show_presentations, show_agenda, show_cv, show_press
) on table public.public_profiles from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_members from public, anon, authenticated, service_role;
revoke all privileges (
  id, profile_id, account_id, membership_level, status, granted_at, granted_by_account_id,
  revoked_at, revoked_by_account_id, created_at, updated_at
) on table public.profile_members from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_relationships from public, anon, authenticated, service_role;
revoke all privileges (
  id, from_profile_id, to_profile_id, relationship_type, status, starts_on, ends_on,
  created_by_account_id, revoked_at, revoked_by_account_id, created_at, updated_at
) on table public.profile_relationships from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_access_grants from public, anon, authenticated, service_role;
revoke all privileges (
  id, grantor_profile_id, grantee_profile_id, scope, status, granted_at,
  granted_by_account_id, expires_at, revoked_at, revoked_by_account_id, created_at,
  updated_at, expired_at
) on table public.profile_access_grants from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_claims from public, anon, authenticated, service_role;
revoke all privileges (
  id, target_profile_id, claimant_account_id, status, evidence_note, requested_at,
  resolved_at, resolved_by_account_id, created_at, updated_at
) on table public.profile_claims from public, anon, authenticated, service_role;

revoke all privileges on table public.audit_events from public, anon, authenticated, service_role;
revoke all privileges (
  id, actor_account_id, action, target_type, target_id, result, correlation_id, metadata,
  created_at
) on table public.audit_events from public, anon, authenticated, service_role;

revoke all privileges on table public.works from public, anon, authenticated, service_role;
revoke all privileges (
  id, owner_profile_id, created_by_account_id, updated_by_account_id, deleted_by_account_id,
  title, year_sort, year_label, work_type, format_discipline, primary_medium, support_base,
  additional_materials, height, width, depth, dimension_unit, duration_text, edition_text,
  description, collaborator_name, collaborator_url, photo_credit_name, photo_credit_url,
  visibility, published_at, created_at, updated_at, deleted_at, purge_after,
  publication_revision, profile_order
) on table public.works from public, anon, authenticated, service_role;

revoke all privileges on table public.work_images from public, anon, authenticated, service_role;
revoke all privileges (
  id, work_id, private_object_path, public_object_path, original_filename, mime_type,
  file_size, pixel_width, pixel_height, sort_order, is_cover, uploaded_by_account_id,
  updated_by_account_id, deleted_by_account_id, created_at, updated_at, deleted_at,
  upload_status, original_verified_at, failure_code, cleanup_required, cleanup_failure_code,
  deletion_started_at, cleanup_public_object_path, preview_object_path, preview_file_size,
  preview_verified_at, preview_failure_code
) on table public.work_images from public, anon, authenticated, service_role;

revoke all privileges on table public.account_invitations from public, anon, authenticated, service_role;
revoke all privileges (
  id, email_normalized, status, approved_roles, approved_by_account_id, auth_user_id,
  approved_at, sending_at, sent_at, accepted_at, expires_at, expired_at, revoked_at,
  revoked_by_account_id, failed_at, failure_code, created_at, updated_at,
  artist_workspace_display_name, artist_workspace_slug, approved_account_plan
) on table public.account_invitations from public, anon, authenticated, service_role;

revoke all privileges on table public.work_publication_operations from public, anon, authenticated, service_role;
revoke all privileges (
  id, work_id, operation_kind, status, idempotency_key, publication_revision,
  actor_account_id, failure_code, cleanup_required, created_at, started_at, finished_at,
  updated_at
) on table public.work_publication_operations from public, anon, authenticated, service_role;

revoke all privileges on table public.work_publication_operation_images from public, anon, authenticated, service_role;
revoke all privileges (
  operation_id, work_image_id, private_object_path, public_object_path, mime_type, file_size,
  copy_status, updated_at
) on table public.work_publication_operation_images from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_follows from public, anon, authenticated, service_role;
revoke all privileges (
  account_id, profile_id, created_at
) on table public.profile_follows from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_activities from public, anon, authenticated, service_role;
revoke all privileges (
  id, owner_profile_id, created_by_account_id, updated_by_account_id, deleted_by_account_id,
  title, activity_type, venue_name, city, country, start_date, end_date, description,
  external_url, show_in_presentations, include_in_cv, visibility, published_at, created_at,
  updated_at, deleted_at, purge_after
) on table public.profile_activities from public, anon, authenticated, service_role;

revoke all privileges on table public.activity_occurrences from public, anon, authenticated, service_role;
revoke all privileges (
  id, activity_id, created_by_account_id, updated_by_account_id, deleted_by_account_id,
  occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone,
  venue_name_override, city_override, show_in_agenda, visibility, published_at, created_at,
  updated_at, deleted_at, purge_after, owner_profile_id, show_in_presentation
) on table public.activity_occurrences from public, anon, authenticated, service_role;

revoke all privileges on table public.cv_categories from public, anon, authenticated, service_role;
revoke all privileges (
  id, profile_id, category_type, label, display_order, is_visible, created_at, updated_at
) on table public.cv_categories from public, anon, authenticated, service_role;

revoke all privileges on table public.cv_entries from public, anon, authenticated, service_role;
revoke all privileges (
  id, category_id, source_activity_id, year_label, title, organization, location_text, url,
  display_order, is_visible, created_at, updated_at
) on table public.cv_entries from public, anon, authenticated, service_role;

revoke all privileges on table public.profile_press_items from public, anon, authenticated, service_role;
revoke all privileges (
  id, owner_profile_id, year_label, title, author, body, url, is_visible, created_at,
  updated_at
) on table public.profile_press_items from public, anon, authenticated, service_role;

revoke all privileges on table public.archive_items from public, anon, authenticated, service_role;
revoke all privileges (
  account_id, work_id, created_at, origin
) on table public.archive_items from public, anon, authenticated, service_role;

revoke all privileges on table public.archive_tags from public, anon, authenticated, service_role;
revoke all privileges (
  id, account_id, name, created_at
) on table public.archive_tags from public, anon, authenticated, service_role;

revoke all privileges on table public.archive_item_tags from public, anon, authenticated, service_role;
revoke all privileges (
  account_id, work_id, tag_id
) on table public.archive_item_tags from public, anon, authenticated, service_role;

revoke all privileges on table public.archive_projects from public, anon, authenticated, service_role;
revoke all privileges (
  id, account_id, title, description, publisher_profile_id, created_at, updated_at
) on table public.archive_projects from public, anon, authenticated, service_role;

revoke all privileges on table public.archive_project_items from public, anon, authenticated, service_role;
revoke all privileges (
  account_id, project_id, work_id, position, added_at
) on table public.archive_project_items from public, anon, authenticated, service_role;

revoke all privileges on table public.curated_collections from public, anon, authenticated, service_role;
revoke all privileges (
  id, project_id, publisher_profile_id, title, description, status, published_at, created_at,
  updated_at
) on table public.curated_collections from public, anon, authenticated, service_role;

revoke all privileges on table public.work_publication_derivatives from public, anon, authenticated, service_role;
revoke all privileges (
  operation_id, publication_revision, work_image_id, rendition_key, source_derivative_id,
  public_object_path, mime_type, file_size, pixel_width, pixel_height, copy_status,
  created_at, updated_at
) on table public.work_publication_derivatives from public, anon, authenticated, service_role;

revoke all privileges on table public.presentation_participants from public, anon, authenticated, service_role;
revoke all privileges (
  id, presentation_id, linked_profile_id, display_name, position, is_visible,
  created_by_account_id, updated_by_account_id, created_at, updated_at
) on table public.presentation_participants from public, anon, authenticated, service_role;

revoke all privileges on table public.presentation_works from public, anon, authenticated, service_role;
revoke all privileges (
  id, presentation_id, work_id, position, is_visible, status, requested_by_account_id,
  requested_at, decided_by_account_id, decided_at, created_at, updated_at
) on table public.presentation_works from public, anon, authenticated, service_role;

revoke all privileges on table public.presentation_cooperators from public, anon, authenticated, service_role;
revoke all privileges (
  id, presentation_id, invited_account_id, invited_profile_id, role, status,
  invited_by_account_id, invited_at, responded_at, revoked_at, revoked_by_account_id,
  created_at, updated_at
) on table public.presentation_cooperators from public, anon, authenticated, service_role;

revoke all privileges on table public.presentation_participation_consents from public, anon, authenticated, service_role;
revoke all privileges (
  id, participant_id, linked_profile_id, status, requested_by_account_id, requested_at,
  decided_by_account_id, decided_at, revoked_by_account_id, revoked_at, created_at,
  updated_at
) on table public.presentation_participation_consents from public, anon, authenticated, service_role;

revoke all privileges on table public.presentation_agenda_images from public, anon, authenticated, service_role;
revoke all privileges (
  presentation_id, representative_work_id, image_id, original_object_path, original_filename,
  mime_type, file_size, preview_object_path, preview_file_size, upload_status, verified_at,
  failure_code, retired_original_object_path, retired_preview_object_path, created_at,
  updated_at, updated_by_account_id
) on table public.presentation_agenda_images from public, anon, authenticated, service_role;

-- Rebuild the explicit direct Data API contract; every omitted privilege is denied.

-- accounts
grant select (
  id, status, display_name, created_at, updated_at, account_plan, legacy_status,
  onboarding_acknowledged_version
) on table public.accounts to authenticated;
grant update (
  onboarding_acknowledged_version
) on table public.accounts to authenticated;

-- account_roles
grant select (
  id, account_id, role, granted_at, revoked_at
) on table public.account_roles to authenticated;

-- public_profiles
grant select (
  id, profile_type, slug, display_name, biography, publication_status, published_at,
  claim_state, created_at, updated_at, alternative_name, city, country, website_url,
  social_url, pronouns, public_contact_email, show_works, show_presentations, show_agenda,
  show_cv, show_press
) on table public.public_profiles to anon;
grant select (
  id, profile_type, slug, display_name, biography, publication_status, published_at,
  claim_state, created_at, updated_at, alternative_name, city, country, website_url,
  social_url, pronouns, public_contact_email, show_works, show_presentations, show_agenda,
  show_cv, show_press
) on table public.public_profiles to authenticated;
grant update (
  display_name, biography, publication_status, alternative_name, city, country, website_url,
  social_url, pronouns, public_contact_email, show_works, show_presentations, show_agenda,
  show_cv, show_press
) on table public.public_profiles to authenticated;
grant select (
  id, slug, deleted_at
) on table public.public_profiles to service_role;

-- profile_members
grant select (
  id, profile_id, account_id, membership_level, status, granted_at, revoked_at, created_at,
  updated_at
) on table public.profile_members to authenticated;

-- profile_relationships
grant select (
  id, from_profile_id, to_profile_id, relationship_type, status, starts_on, ends_on,
  created_at, updated_at
) on table public.profile_relationships to anon;
grant select (
  id, from_profile_id, to_profile_id, relationship_type, status, starts_on, ends_on,
  created_at, updated_at
) on table public.profile_relationships to authenticated;

-- profile_access_grants
grant select (
  id, grantor_profile_id, grantee_profile_id, scope, status, granted_at, expires_at,
  revoked_at, created_at, updated_at, expired_at
) on table public.profile_access_grants to authenticated;

-- profile_claims
grant select (
  id, target_profile_id, claimant_account_id, status, requested_at, resolved_at, created_at,
  updated_at
) on table public.profile_claims to authenticated;

-- audit_events
-- No direct access for anon, authenticated or service_role; trusted routes only.

-- works
grant select (
  id, owner_profile_id, title, year_sort, year_label, work_type, format_discipline,
  primary_medium, support_base, additional_materials, height, width, depth, dimension_unit,
  duration_text, edition_text, description, collaborator_name, collaborator_url,
  photo_credit_name, photo_credit_url, visibility, published_at, created_at, updated_at,
  profile_order
) on table public.works to anon;
grant select (
  id, owner_profile_id, title, year_sort, year_label, work_type, format_discipline,
  primary_medium, support_base, additional_materials, height, width, depth, dimension_unit,
  duration_text, edition_text, description, collaborator_name, collaborator_url,
  photo_credit_name, photo_credit_url, visibility, published_at, created_at, updated_at,
  profile_order
) on table public.works to authenticated;
grant insert (
  owner_profile_id, title, year_sort, year_label, work_type, format_discipline,
  primary_medium, support_base, additional_materials, height, width, depth, dimension_unit,
  duration_text, edition_text, description, collaborator_name, collaborator_url,
  photo_credit_name, photo_credit_url
) on table public.works to authenticated;
grant update (
  title, year_sort, year_label, work_type, format_discipline, primary_medium, support_base,
  additional_materials, height, width, depth, dimension_unit, duration_text, edition_text,
  description, collaborator_name, collaborator_url, photo_credit_name, photo_credit_url
) on table public.works to authenticated;

-- work_images
grant select (
  id, work_id, public_object_path, mime_type, file_size, pixel_width, pixel_height,
  sort_order, is_cover, created_at, updated_at
) on table public.work_images to anon;
grant select (
  id, work_id, public_object_path, original_filename, mime_type, file_size, pixel_width,
  pixel_height, sort_order, is_cover, created_at, updated_at
) on table public.work_images to authenticated;
grant insert (
  id, work_id, private_object_path, original_filename, mime_type, file_size, pixel_width,
  pixel_height, sort_order, is_cover
) on table public.work_images to authenticated;
grant update (
  original_filename, pixel_width, pixel_height
) on table public.work_images to authenticated;

-- account_invitations
grant select (
  id, email_normalized, status, approved_roles, expires_at, created_at,
  artist_workspace_display_name, artist_workspace_slug, approved_account_plan
) on table public.account_invitations to service_role;
grant insert (
  email_normalized, approved_roles, approved_by_account_id, artist_workspace_display_name,
  artist_workspace_slug, approved_account_plan
) on table public.account_invitations to service_role;
grant update (
  status, failure_code
) on table public.account_invitations to service_role;

-- work_publication_operations
-- No direct access for anon, authenticated or service_role; trusted routes only.

-- work_publication_operation_images
-- No direct access for anon, authenticated or service_role; trusted routes only.

-- profile_follows
grant select (
  account_id, profile_id, created_at
) on table public.profile_follows to authenticated;
grant insert (
  account_id, profile_id
) on table public.profile_follows to authenticated;
grant delete on table public.profile_follows to authenticated;

-- profile_activities
grant select (
  id, owner_profile_id, title, activity_type, venue_name, city, country, start_date,
  end_date, description, external_url, show_in_presentations, visibility, published_at,
  updated_at
) on table public.profile_activities to anon;
grant select (
  id, owner_profile_id, title, activity_type, venue_name, city, country, start_date,
  end_date, description, external_url, show_in_presentations, include_in_cv, visibility,
  published_at, created_at, updated_at, deleted_at
) on table public.profile_activities to authenticated;
grant insert (
  owner_profile_id, title, activity_type, venue_name, city, country, start_date, end_date,
  description, external_url, show_in_presentations, include_in_cv
) on table public.profile_activities to authenticated;
grant update (
  title, activity_type, venue_name, city, country, start_date, end_date, description,
  external_url, show_in_presentations, include_in_cv, visibility
) on table public.profile_activities to authenticated;

-- activity_occurrences
grant select (
  id, activity_id, occurrence_type, title_override, start_date, end_date, start_time,
  end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility,
  published_at, created_at, updated_at, owner_profile_id
) on table public.activity_occurrences to anon;
grant select (
  id, activity_id, occurrence_type, title_override, start_date, end_date, start_time,
  end_time, time_zone, venue_name_override, city_override, show_in_agenda, visibility,
  published_at, created_at, updated_at, deleted_at, owner_profile_id, show_in_presentation
) on table public.activity_occurrences to authenticated;
grant insert (
  activity_id, occurrence_type, title_override, start_date, end_date, start_time, end_time,
  time_zone, venue_name_override, city_override, show_in_agenda, owner_profile_id,
  show_in_presentation
) on table public.activity_occurrences to authenticated;
grant update (
  occurrence_type, title_override, start_date, end_date, start_time, end_time, time_zone,
  venue_name_override, city_override, show_in_agenda, visibility, show_in_presentation
) on table public.activity_occurrences to authenticated;

-- cv_categories
grant select (
  id, profile_id, category_type, label, display_order, is_visible, created_at, updated_at
) on table public.cv_categories to anon;
grant select (
  id, profile_id, category_type, label, display_order, is_visible, created_at, updated_at
) on table public.cv_categories to authenticated;
grant insert (
  profile_id, category_type, label, display_order, is_visible
) on table public.cv_categories to authenticated;
grant update (
  label, display_order, is_visible
) on table public.cv_categories to authenticated;

-- cv_entries
grant select (
  id, category_id, source_activity_id, year_label, title, organization, location_text, url,
  display_order, is_visible, created_at, updated_at
) on table public.cv_entries to anon;
grant select (
  id, category_id, source_activity_id, year_label, title, organization, location_text, url,
  display_order, is_visible, created_at, updated_at
) on table public.cv_entries to authenticated;
grant insert (
  category_id, year_label, title, organization, location_text, url, display_order, is_visible
) on table public.cv_entries to authenticated;
grant update (
  category_id, year_label, title, organization, location_text, url, display_order, is_visible
) on table public.cv_entries to authenticated;
grant delete on table public.cv_entries to authenticated;

-- profile_press_items
grant select (
  id, owner_profile_id, year_label, title, author, body, url, is_visible, created_at,
  updated_at
) on table public.profile_press_items to anon;
grant select (
  id, owner_profile_id, year_label, title, author, body, url, is_visible, created_at,
  updated_at
) on table public.profile_press_items to authenticated;
grant insert (
  owner_profile_id, year_label, title, author, body, url, is_visible
) on table public.profile_press_items to authenticated;
grant update (
  year_label, title, author, body, url, is_visible
) on table public.profile_press_items to authenticated;
grant delete on table public.profile_press_items to authenticated;

-- archive_items
grant select (
  account_id, work_id, created_at, origin
) on table public.archive_items to authenticated;
grant insert (
  work_id
) on table public.archive_items to authenticated;
grant delete on table public.archive_items to authenticated;

-- archive_tags
grant select (
  id, account_id, name, created_at
) on table public.archive_tags to authenticated;
grant insert (
  name
) on table public.archive_tags to authenticated;
grant delete on table public.archive_tags to authenticated;

-- archive_item_tags
grant select (
  account_id, work_id, tag_id
) on table public.archive_item_tags to authenticated;
grant insert (
  work_id, tag_id
) on table public.archive_item_tags to authenticated;
grant delete on table public.archive_item_tags to authenticated;

-- archive_projects
grant select (
  id, account_id, title, description, publisher_profile_id, created_at, updated_at
) on table public.archive_projects to authenticated;
grant insert (
  title, description
) on table public.archive_projects to authenticated;
grant update (
  title, description
) on table public.archive_projects to authenticated;
grant delete on table public.archive_projects to authenticated;

-- archive_project_items
grant select (
  account_id, project_id, work_id, position, added_at
) on table public.archive_project_items to authenticated;

-- curated_collections
grant select (
  id, publisher_profile_id, title, description, status, published_at
) on table public.curated_collections to anon;
grant select (
  id, project_id, publisher_profile_id, title, description, status, published_at, created_at,
  updated_at
) on table public.curated_collections to authenticated;

-- work_publication_derivatives
-- No direct access for anon, authenticated or service_role; trusted routes only.

-- presentation_participants
grant select (
  id, presentation_id, display_name, position, is_visible, created_at, updated_at
) on table public.presentation_participants to anon;
grant select (
  id, presentation_id, display_name, position, is_visible, created_at, updated_at
) on table public.presentation_participants to authenticated;

-- presentation_works
grant select (
  id, presentation_id, work_id, position, is_visible, status, created_at, updated_at
) on table public.presentation_works to anon;
grant select (
  id, presentation_id, work_id, position, is_visible, status, created_at, updated_at
) on table public.presentation_works to authenticated;

-- presentation_cooperators
-- No direct access for anon, authenticated or service_role; trusted routes only.

-- presentation_participation_consents
-- No direct access for anon, authenticated or service_role; trusted routes only.

-- presentation_agenda_images
-- No direct access for anon, authenticated or service_role; trusted routes only.
