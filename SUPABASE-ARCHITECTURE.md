# CHAINED Supabase Architecture

Status: architecture and security design only. This document is not an executable migration and does not connect the repository to Supabase.

## 1. Executive recommendation

CHAINED should use Supabase Auth for identity, Postgres for normalized application data, Row Level Security (RLS) as the mandatory authorization boundary, and Supabase Storage for media. The browser may use a publishable key because every exposed table and Storage bucket must be safe under RLS. A Supabase secret key or legacy `service_role` key must never appear in browser code, the repository, build output, logs, prompts, or coding-agent context.

The most important architectural rule is to separate five concepts that the prototype currently implies but does not need to enforce locally:

1. An authenticated account is a person who can sign in.
2. Application roles describe platform capabilities and are many-to-many with accounts.
3. A public profile is a publishable identity belonging to an artist, curator, or organisation.
4. Profile membership grants a human direct management rights for one specific profile.
5. A profile access grant can extend one exact artist-management scope to active members of a delegate gallery/institution profile.
6. Ownership is attached to a profile-owned content record; credits, relationships, and references never grant management rights.

Works should be owned by artist profiles. A gallery, institution, curator, presentation, event, collaborator credit, or archive project may reference a Work without acquiring any right to edit, unpublish, transfer, or delete it.

For media, use two Storage layers:

- a private authoritative bucket containing draft originals;
- a public bucket containing immutable, versioned publication copies.

Publishing is a trusted Supabase Edge Function workflow that validates the Work, creates immutable public copies, records their versioned public paths, and only then changes the database record to `published`. Returning a Work to draft or beginning deletion immediately removes public database access and public copies while retaining private originals through the 30-day recovery window. Already downloaded, cached, mirrored, copied, or screenshotted public media cannot be revoked; CHAINED offers best-effort public recall, not technical revocability.

Public profile and artwork queries must never download all of an artist's Works and filter drafts in JavaScript. RLS and the public query itself must return only published rows. Dashboard queries may return drafts only after validating the active account's direct target membership or complete delegated membership-plus-grant chain.

Works are always owned by artist profiles. A verified gallery can manage an artist profile only through an active, scoped, revocable profile access grant. The requesting staff member must simultaneously have an active personal membership in that gallery profile. A public representation relationship is descriptive and never grants authority.

MVP account admission is invitation-only email magic link: a trusted administrator records approval before Supabase Auth issues the invitation; confirming the invited email activates the application account. There is no public self-registration and no redundant approval step after invitation acceptance. The trusted invitation records the allowed initial non-admin roles, always including `private_member`; Auth user metadata is never an authorization source. Privileged invitations, profile claims, later role assignments, public-copy operations, and permanent purges run through Supabase Edge Functions. The Supabase Dashboard is reserved for emergency, debugging, and controlled administration.

## APPROVED ARCHITECTURAL DECISIONS

| Area | Approved decision |
|---|---|
| Account admission | Invitation-only email magic links. Approval is persisted before Auth sends an invitation; acceptance activates the application account. No public self-registration or second approval gate. Every accepted account receives `private_member`; explicitly approved initial artist, curator, or institution roles may also be granted, but never `admin`. Application status is `active`, `suspended`, or `disabled` and is separate from Auth session state. |
| Media delivery | Private authoritative originals plus immutable, versioned public publication copies. Edge Functions create and remove public copies. Private signed delivery is reserved for possible embargoed/restricted media. |
| Work ownership | Every Work is owned by an artist profile. Accounts, galleries, institutions, curators, credits, and references never own artist Works. |
| Delegated gallery management | An artist profile may grant a gallery profile explicit scopes such as Works, Presentations, Events, or profile-content editing. Staff authority requires both active gallery membership and an active grant. Representation alone grants nothing. |
| Profile claiming | Gallery-managed artist profiles are durable and claimable. A verified claim preserves the profile ID, URL, Works, media, contexts, credits, and relationships; the artist becomes primary controller and controls future gallery access. |
| Work year | Public display uses bounded `year_label`; deterministic sorting/filtering uses nullable `year_sort`. Unknown years sort last. Existing integer years migrate into both fields. |
| Deletion | Thirty-day soft deletion. Public visibility and copies end immediately; private originals and rows remain recoverable until an idempotent trusted purge after `purge_after`. |
| Trusted runtime | Supabase Edge Functions handle all operations needing secret/service-role credentials. Browser code receives only the publishable key. The Dashboard is not the normal application workflow. |
| Discover order | Global: `published_at desc, id` as stable tie-breaker. Profile Works: `year_sort desc nulls last, updated_at desc, id`. Payment and engagement signals never affect order. |
| Agenda | Shared canonical Events, optional coordinates, no required browser geolocation. Public order is `starts_at asc, id`; followed profiles add an authenticated filter, not a ranking signal. |
| Team management | Individual accounts and revocable `owner`/`manager`/`editor` profile memberships only; no shared credentials. Team membership alone never grants represented-artist access. |
| Public media recall | CHAINED removes its public rows/copies and stops issuing new URLs, but cannot revoke downloads, caches, CDN copies awaiting expiry, screenshots, mirrors, or third-party archives. |

## 2. Current repository translated into backend responsibilities

| Prototype area | Current behavior | Supabase responsibility |
|---|---|---|
| `work-store.js` | One IndexedDB `works` object store; metadata and image Blobs are nested in each Work | Normalize Works and image rows; put bytes in Storage; enforce ownership, publication, and timestamps server-side |
| Dashboard Works | Reads every local Work; creates, edits, publishes, drafts, and deletes in the browser | Authenticated managed-profile queries; RLS-authorized mutations; publication workflow; Storage upload lifecycle |
| `public-profile.js` | Calls `getAllWorks()`, then filters `visibility === "published"` in JavaScript | A public query returning published Works only, ordered by `year_sort`, update time, and stable ID while displaying `year_label` |
| `artwork-dynamic.js` | Fetches one local record and rejects drafts in JavaScript | A public single-Work query whose RLS makes a draft indistinguishable from a missing record |
| Agenda | Static duplicate event markup filtered locally by followed artist, city, and type | One canonical Event with participant joins, indexed date/location/type filters, keyset pagination, and deterministic ordering |
| Following | Profile IDs in `localStorage` | Private `follows` rows owned by the authenticated account; unavailable to guests |
| Archive | Saved IDs, project membership, tags, search, and notes implied by local browser state | Private per-account archive rows, projects, project membership, tags, notes, and strict owner-only RLS |
| Public profile routes | One Works route plus structural Presentations, CV, and Press routes | Published profile-scoped queries; each content type remains separate |
| Koos de Vries static profile | Static example Works | Seed/reference data to migrate only after an owning account/profile decision |

The current form already provides useful client-side validation, safe DOM construction, HTTP(S)-only external URLs, ordered images, and a 25 MB JPG/PNG/WEBP limit. These remain valuable user experience checks, but the backend must repeat every security-relevant validation because a caller can bypass the visible interface.

## 3. Design principles and trust vocabulary

### 3.1 Product principles

- Only explicit `published` status creates public visibility.
- Drafts are private to authorized profile managers and selected administrators performing support or moderation.
- Paying never affects reach, search position, Agenda order, or discovery order.
- Do not expose public likes, follower counts, save counts, view counts, or engagement scores.
- Do not calculate popularity rankings, including hidden rankings derived from private behavior.
- Discovery and Agenda use documented deterministic sorts with a stable ID tie-breaker.
- Original artwork aspect ratios are metadata and presentation requirements; image delivery never crops by default.
- A collaborator, participant, presenter, venue, institution, or credit is attribution or context unless a separate management record grants authority.

### 3.2 Trust boundaries

| Concept | Meaning | Security consequence |
|---|---|---|
| `auth.users` identity | Supabase-managed login identity | Never expose this table publicly; application tables reference its UUID |
| `accounts` row | Application state for one authenticated identity | The account may read its row but cannot approve itself or change privileged fields |
| `account_roles` row | Platform capability such as artist or curator | Multiple rows per account; mutations are trusted administrative actions |
| `public_profiles` row | Public-facing artist, curator, or organisation identity | May exist as a draft; being a role holder does not grant access to every profile of that type |
| `profile_members` row | Revocable human-account authority over one profile | Direct authority for that profile; gallery membership is only one half of delegated artist access |
| `profile_relationships` row | Public/descriptive profile relationship such as gallery represents artist | Attribution and discovery only; never used by an authorization policy |
| `profile_access_grants` row | Revocable scope from an artist profile to a gallery/institution profile | Delegated authority only when the caller also has active membership in the delegate profile |
| `owner_profile_id` | Profile that owns a Work, Presentation, Event, CV entry, or Press entry | Direct eligible members or a caller with a complete scoped delegated chain may manage; ownership itself never moves |
| credit/reference join | Acknowledgement or relationship | Never consulted to authorize edits to the referenced record |
| `admin` role | Platform moderation/support authority | Granted only through a trusted administrative path; never self-service |
| Supabase Edge Function | Trusted runtime for invitation, claim, role, publication-copy, purge, and scoped admin operations | May hold narrowly scoped secret/service-role credentials in function secrets; inputs still require validation and audit |
| Browser/Supabase client | Untrusted public or authenticated caller using the publishable key | Visible controls are not authorization; RLS and Storage policies must withstand direct API calls |

Guest is not an application role. A guest is simply a request executing as the Postgres `anon` role without an authenticated account.

## 4. Account, role, profile, and ownership model

### 4.1 Accounts and multiple roles

`accounts.id` should equal `auth.users.id`. A trusted administrator persists a normalized, expiring approval before the trusted runtime asks Supabase Auth to send an invitation. Confirming its email magic link creates/activates the application account as `active`; there is no second approval state. Public email, SMS, anonymous, and general sign-up are disabled. Every activated person receives a private-member capability. Initial non-admin roles may only come from the approved invitation; `raw_user_meta_data`, other caller-controlled metadata, email domains, and self-supplied text are never authorization sources. Additional capability rows may be added independently through trusted workflows:

- `private_member`
- `artist`
- `curator`
- `institution`
- `admin`

An artist who also curates has three rows: private member, artist, and curator. There is no exclusive `accounts.role` column.

A gallery or institution is not a login identity. It is a `public_profiles` row managed by individual human accounts through `profile_members`. The `institution` application role makes an account eligible to receive such membership; it does not grant access to every gallery or institution and does not grant represented-artist access.

### 4.2 Profile membership

Use constrained, active/revoked membership levels:

- `owner`: may manage profile content and membership; at least one owner must remain;
- `manager`: may manage profile and content but not transfer ownership or promote owners;
- `editor`: may create and edit content but not manage profile membership.

If more granular permissions become necessary, add explicit columns or a normalized permission table. Do not place an opaque permission object in JSON.

For a claimed artist profile, the verified artist is the primary controller and has an `owner` membership. Gallery and institution profiles can have several authorized managers. Removing an account must not cascade-delete a profile or its content; membership must be transferred or the profile disabled first.

Membership governs the profile named by `profile_id` only. Gallery staff can act for an artist only when both of these are true at request time:

1. the staff account has an active membership in the gallery profile; and
2. that gallery profile has an active `profile_access_grants` row for the artist profile and requested scope.

Revoking either edge immediately stops inherited authority. Shared credentials and cached browser-side permission decisions are prohibited.

### 4.3 Profile relationships and delegated access

`profile_relationships` describes public/organizational facts such as `represents` or `affiliated_with`. It is never referenced by RLS or a management helper.

`profile_access_grants` is the separate authority mechanism. One row grants one constrained scope from a target artist profile to a delegate gallery/institution profile. Initial scopes are `works_editor`, `presentations_editor`, `events_editor`, and `profile_content_editor`. Grants are explicit, revocable, optionally expiring, and never transitively delegated.

An active `works_editor` grant permits authorized gallery staff to create, edit, soft-delete/restore through the approved workflow, upload/reorder images, and publish/unpublish Works that remain owned by the artist profile. It does not permit ownership transfer, primary-controller changes, owner-membership assignment, claim blocking, unrestricted admin actions, or permanent purge. The corresponding Presentation/Event scopes allow management for the artist profile and links to gallery contexts without changing Work ownership. `profile_content_editor` covers ordinary biography/contact/CV/Press content, not identity-defining slug/type, claim/controller fields, memberships, grants, or deletion/purge.

Paid plans may set documented team-seat, managed-profile, Storage-quota, bulk-upload, workflow, export, Presentation, Event, or press-tool limits. Entitlements are operational limits only. They never participate in publication RLS, Discover/Agenda ordering, recommendations, visibility, or reach.

### 4.4 Profile claim state and claiming

Artist profiles are durable and have explicit `claim_status`: `unclaimed` or `claimed`. An unclaimed profile may be created by a verified gallery through a trusted administrative workflow, receives its permanent UUID/slug, and can be managed only through explicit scoped grants. It is never modeled as temporary.

Claiming uses a trusted Edge Function and a reviewed `profile_claims` record. The function searches existing artist identities before creation, locks the target profile during approval, verifies the claimant, and updates the existing row rather than creating a duplicate. Approval sets the artist account as `primary_controller_account_id`, creates its owner membership, records claim timestamps/audit, and leaves existing IDs, URLs, Works, images, Presentations, Events, credits, and joins unchanged. The artist then reviews, restricts, or revokes gallery grants. A gallery cannot reject a claim, remove the primary controller, or prevent later grant revocation.

### 4.5 Content ownership

- All Works: `owner_profile_id` must reference an artist profile, including Works entered by delegated gallery staff.
- Presentations: owned by an artist, curator, or organisation profile.
- Events: owned by the profile responsible for maintaining the canonical Event record.
- CV and Press entries: owned by the profile on whose page they appear.
- Archive and curator research projects: owned directly by an account because they are private personal workspaces.

`owner_profile_id` is immutable through normal client updates. `created_by_account_id` records the human who entered a record and `updated_by_account_id` records its latest editor; neither grants ownership. Any exceptional ownership correction is a dedicated, audited trusted operation and is never inferred from memberships, relationships, grants, credits, or joins.

## 5. Role and permission matrix

The table describes maximum capability. “Direct” means an active `profile_members` row on the target profile. “Delegated” means active membership in a gallery/institution profile plus an active grant to the target profile for the exact scope. Admin access is limited to the audited support/moderation operation and does not turn administrators into ordinary content authors.

| Capability | Guest | Private member | Artist | Curator | Gallery / institution manager | Admin |
|---|---:|---:|---:|---:|---:|---:|
| Read published profiles | Yes | Yes | Yes | Yes | Yes | Yes |
| Read published Works | Yes | Yes | Yes | Yes | Yes | Yes |
| Read drafts | No | No | Direct artist profile | Direct curator profile only | Direct organisation content; delegated artist content only within scope | Moderation/support only |
| Create Works | No | No | Direct artist profile | No; may reference published/authorized Works | Delegated artist profile with `works_editor` | No ordinary authorship |
| Edit or initiate soft deletion of Works | No | No | Direct artist profile | No access to another artist's Work | Delegated artist profile with `works_editor`; never changes owner or purges | Moderation/support only |
| Create Presentations | No | No | Direct artist profile | Direct curator profile, later | Direct organisation profile or delegated artist profile with `presentations_editor` | No ordinary authorship |
| Create Events | No | No | Direct artist profile | Direct curator profile, later | Direct organisation profile or delegated artist profile with `events_editor` | No ordinary authorship |
| Manage profile/CV/Press content | No | No | Direct artist profile | Direct curator profile, later | Direct organisation profile; delegated artist profile only with `profile_content_editor` | Moderation/support only |
| Follow profiles | No | Yes | Yes | Yes | Yes | Not an admin-specific power |
| Save Works privately | No | Yes | Yes | Yes | Yes | Not an admin-specific power |
| Create private Archive projects | No | Yes | Yes | Yes | Yes | Not an admin-specific power |
| Create curator projects | No | No | Only if also curator | Yes | Only if also curator | No ordinary authorship |
| Manage gallery/institution profile | No | No | Only through direct membership | Only through direct membership | Direct membership only | Support only |
| Manage represented artist profile | No | No | Own direct artist profile | No from representation alone | Only active delegated scope plus active organisation membership | Support only |
| Create/revoke delegated access | No | No | Artist primary controller for own profile | No | Cannot grant itself access; may accept/relinquish operational access | Trusted claim/admin support only |
| Assign ordinary roles | No | No | No | No | No | Trusted admin workflow only |
| Assign admin role | No | No | No | No | No | Separate highest-trust workflow only |
| Moderate content | No | No | No | No | No | Yes, scoped and audited |

Permission evaluation therefore has four separate questions:

1. Is the row publicly visible?
2. Which artist/profile owns it?
3. Does the active account manage that target directly, or is it an active member of a delegate profile with the exact active scope?
4. Is the requested operation explicitly inside that direct/delegated scope and outside protected ownership/claim/purge fields?
5. Is this a platform-administration operation performed through the trusted Edge Function boundary?

## 6. Database conventions

- Use UUID primary keys generated in Postgres, not browser-generated ownership identifiers.
- Use `timestamptz` for instants and store Event timezone separately as an IANA name.
- Use `created_at default now()` and `updated_at`; maintain `updated_at` with a database trigger.
- Trusted insert/update paths derive `created_by_account_id` and `updated_by_account_id` from the authenticated actor; neither audit field grants authority. Never trust submitted owner/account/audit IDs.
- Use constrained text or lookup tables for statuses. Native Postgres enums are avoided where product vocabularies are expected to grow.
- Use `publication_status` constrained to `draft` or `published`, plus `published_at`.
- Recoverable content uses server-set `deleted_at`, `purge_after = deleted_at + interval '30 days'`, and `deleted_by_account_id`. Public and normal dashboard queries require `deleted_at is null`; ordinary updates are denied after deletion.
- Active-only uniqueness uses partial unique indexes such as `where deleted_at is null`, so a retained deleted slug/source row does not unnecessarily block an approved replacement. Identity-preserving restore first checks these active conflicts and fails safely for operator resolution.
- Private relationship rows such as follows and tag assignments can be hard-deleted.
- External URLs accept only absolute `http://` or `https://` values with a hostname. Validate in the browser for feedback and again in a trusted database function or API boundary.
- Text fields have explicit reasonable length limits. MVP descriptions are plain text, not stored HTML.
- Use lower-case normalized slugs and case-insensitive unique indexes.
- Every RLS predicate column and frequent join/filter column receives an index.
- UUID opacity is not authorization; RLS must protect enumerated IDs.

## 7. Minimum viable schema catalog

The catalog includes the requested tables plus justified additions: `profile_relationships` for descriptive public relationships, `profile_access_grants` for scoped delegated authority, `profile_claims` for verified identity-preserving claims, `audit_events` for privileged/delegated action history, `presentation_images` for Presentation media, `disciplines` and `event_disciplines` for scalable Agenda filtering, `archive_project_items` because one saved Work can belong to several projects, and `cv_categories` for an extensible controlled CV vocabulary.

### 7.1 Identity and profiles

#### `accounts`

| Item | Definition |
|---|---|
| Purpose | Private application record corresponding one-to-one with `auth.users` |
| Primary key | `id uuid`, also FK to `auth.users(id)` |
| Important fields | `status` (`active`, `suspended`, `disabled`), `display_name`, `created_at`, `updated_at` |
| Ownership/management | Invitation acceptance creates/activates the row; the account may read itself and update non-privileged presentation fields; status is Edge Function/admin only and separate from the Auth session |
| Publication | None |
| Deletion | Account deletion cascades private roles, follows, and Archive data; profile/content transfer must be resolved first |
| Indexes | `status`; unique PK already covers ID |
| Anonymous access | Never |

Do not copy email into public tables unless a separate product requirement emerges. Supabase Auth remains authoritative for login email.

#### `account_roles`

| Item | Definition |
|---|---|
| Purpose | Many-to-many account capability assignment |
| Primary key | `(account_id, role_code)` |
| Foreign keys | `account_id -> accounts.id on delete cascade`; `granted_by_account_id -> accounts.id on delete set null` |
| Important fields | constrained `role_code`, `granted_at`, `granted_by_account_id` |
| Ownership/management | Trusted administrative workflow only; accounts may read their own roles |
| Publication | None |
| Deletion | Hard delete revokes capability; revoking admin requires a higher-trust audited path |
| Indexes | `(role_code, account_id)` in addition to PK |
| Anonymous access | Never |

#### `public_profiles`

| Item | Definition |
|---|---|
| Purpose | Artist, curator, or organisation public identity |
| Primary key | `id uuid` |
| Important FKs | `created_by_account_id`, nullable `primary_controller_account_id`, and `deleted_by_account_id -> accounts.id on delete set null` |
| Important fields | `profile_type` (`artist`, `curator`, `gallery`, `institution`), `slug`, `display_name`, `professional_label`, `biography`, location/website/profile-image fields, `claim_status` (`unclaimed`, `claimed`) for artist profiles, nullable `primary_controller_account_id`, `claimed_at`, publication fields, timestamps, `deleted_at`, `purge_after`, `deleted_by_account_id` |
| Ownership/management | Direct `profile_members` controls ongoing management; artist profile content may additionally permit an exact active delegated scope; creator/audit fields never control access |
| Publication | Draft profiles manager-only; published profiles public |
| Deletion | Soft delete; hard purge restricted while owned content exists |
| Indexes | partial unique `lower(slug)` where not deleted; `(publication_status, profile_type)`; `(claim_status, profile_type)`; location indexes if used |
| Anonymous access | Published, non-deleted public columns only; controller account IDs and claim workflow details are excluded |

#### `profile_members`

| Item | Definition |
|---|---|
| Purpose | Profile-specific authority for individual and multi-manager profiles |
| Primary key | `(profile_id, account_id)` |
| Foreign keys | Profile and member account, both `on delete cascade` after transfer safeguards; inviter/revoker accounts `on delete set null` |
| Important fields | `membership_level`, `status` (`invited`, `active`, `revoked`), `created_at`, `invited_by_account_id`, `accepted_at`, `revoked_at`, `revoked_by_account_id`, `updated_at` |
| Ownership/management | Profile owners manage eligible membership through an audited trusted path; editors/managers cannot promote themselves; artist primary-controller membership has extra removal protection |
| Publication | None; membership is private |
| Deletion | Revoke by status and preserve audit fields; any later privacy-driven hard purge is trusted and still prevents removing the last/primary artist owner without transfer safeguards |
| Indexes | `(account_id, profile_id)`, `(profile_id, membership_level)` |
| Anonymous access | Never |

Membership in a gallery/institution profile governs that profile only. Delegated access helpers must join the caller's currently active membership to a currently active, non-expired access grant on every request; a prior membership or cached role is insufficient.

#### `profile_relationships`

| Item | Definition |
|---|---|
| Purpose | Public/descriptive relationship such as a gallery representing an artist or an artist affiliated with an institution |
| Primary key | `id uuid` |
| Foreign keys | `from_profile_id`, `to_profile_id -> public_profiles.id`; creator/reviewer accounts `on delete set null` |
| Important fields | constrained `relationship_type`, `status`, optional public `label`, `starts_on`, `ends_on`, `created_at`, `updated_at`, `deleted_at` |
| Ownership/management | Trusted or mutually reviewed profile workflow; never an authorization source |
| Publication | Public only when approved and both profiles are published |
| Deletion | Soft-delete; it does not itself create or revoke an access grant |
| Indexes | partial unique active relationship tuple; reverse profile/type indexes |
| Anonymous access | Approved relationships between published profiles only |

#### `profile_access_grants`

| Item | Definition |
|---|---|
| Purpose | One explicit delegated permission scope from a target artist profile to a delegate gallery/institution profile |
| Primary key | `id uuid` |
| Foreign keys | `target_profile_id`, `delegate_profile_id -> public_profiles.id`; granting/revoking accounts `on delete set null` |
| Important fields | constrained `scope_code` (`works_editor`, `presentations_editor`, `events_editor`, `profile_content_editor`), dedicated `status` (`active`, `expired`, `revoked`), optional `expires_at`, explicit `expired_at`, `granted_at`, `granted_by_account_id`, `revoked_at`, `revoked_by_account_id`, `updated_at` |
| Ownership/management | Claimed artist primary controller may grant/revoke; verified admin may establish initial gallery authority for an unclaimed profile; delegate cannot self-grant |
| Publication | Private authorization data; never a public representation claim |
| Deletion | Preserve expired and revoked rows for audit; lifecycle transitions are trusted operations; active query requires status, time validity, active profiles, active caller account, and active delegate membership |
| Indexes | deterministic partial unique declared-active `(target_profile_id, delegate_profile_id, scope_code)` without a wall-clock predicate; trusted replacement creation first marks an equivalent time-expired row `expired`; delegate/scope/target/expiry lookups |
| Anonymous access | Never |

Grant scopes do not chain. A delegate cannot grant its authority onward, change target ownership, primary controller, owner memberships, claim state, privileged roles, or purge content.

#### `profile_claims`

| Item | Definition |
|---|---|
| Purpose | Verified request/audit record for claiming an existing unclaimed artist profile without duplication |
| Primary key | `id uuid` |
| Foreign keys | `profile_id -> public_profiles.id`; `claimant_account_id -> accounts.id`; reviewer `on delete set null` |
| Important fields | `status` (`pending`, `approved`, `rejected`, `cancelled`), minimal evidence reference/notes kept private, `requested_at`, `reviewed_at`, `reviewed_by_account_id`, `created_at`, `updated_at` |
| Ownership/management | Claimant can read own request; creation/review and approval occur through the trusted claim workflow; galleries cannot approve/reject an artist claim |
| Publication | None |
| Deletion | Retain according to security/audit/privacy policy; never cascade a rejected claim into profile deletion |
| Indexes | partial unique pending `(profile_id)` and `(claimant_account_id)` as policy requires; status/review queue indexes |
| Anonymous access | Never |

#### `audit_events`

| Item | Definition |
|---|---|
| Purpose | Append-oriented history for invitation, role, membership, claim, grant, publication, deletion, restore, purge, and moderation actions |
| Primary key | `id uuid` |
| Foreign keys | Nullable actor account/profile and target IDs retained or nulled according to purge/privacy policy |
| Important fields | constrained `action_code`, actor/target identifiers, result, request/correlation ID, minimal structured non-secret metadata, `created_at` |
| Ownership/management | Inserted by trusted functions or narrowly scoped database triggers; read by authorized support/audit roles |
| Publication | Never public |
| Deletion | Append-oriented retention policy; exclude secrets, signed URLs, claim evidence, and content bodies |
| Indexes | `(target_type, target_id, created_at desc)`, `(actor_account_id, created_at desc)`, action/time |
| Anonymous access | Never |

### 7.2 Works

#### `works`

| Item | Definition |
|---|---|
| Purpose | Canonical independently owned artwork record |
| Primary key | `id uuid` |
| Foreign keys | `owner_profile_id -> public_profiles.id`; `created_by_account_id`, `updated_by_account_id`, `deleted_by_account_id -> accounts.id on delete set null` |
| Ownership/management | Always the owning artist profile. Active direct artist members or active gallery staff acting through `works_editor` may manage it; owner is immutable through ordinary browser updates |
| Publication | Draft/published status plus server-set `published_at`; publishing validates the Work and its images |
| Timestamps | Server-set `created_at`, trigger-maintained `updated_at`, nullable `deleted_at` and `purge_after` |
| Deletion | Manager soft-delete followed by retained, idempotent media/database purge |
| Indexes | Profile/dashboard order, partial published order, status, creator; detailed below |
| Anonymous access | Published, non-deleted Works whose owner profile is published |

Example field definitions:

| Field | Type/constraint | Current mapping |
|---|---|---|
| `id` | UUID PK | `id`; current string IDs receive a one-time migration map |
| `owner_profile_id` | FK to artist profile, immutable | New ownership boundary |
| `created_by_account_id` | FK to account, server-derived | New audit field |
| `title` | text, required to publish | `title` |
| `year_sort` | nullable integer used only for sorting/filtering | Current integer `year` converted to integer; unknown/ongoing values remain null |
| `year_label` | required-to-publish display text with a sensible maximum such as 32 characters | Current integer `year` converted to the matching string; later supports `2024–2026`, `ONGOING`, `C. 1990`, `UNDATED` without parsing |
| `work_type` | constrained text | `workType` |
| `format_discipline` | constrained text or later lookup | `format` |
| `primary_medium` | text | `primaryMedium` |
| `support_base` | text | `supportBase` |
| `additional_materials` | ordered `text[]`, default empty | comma-separated `additionalMaterials` parsed once |
| `height`, `width`, `depth` | non-negative numeric; depth nullable | matching string fields, preserving decimals |
| `dimension_unit` | constrained `mm`, `cm`, `m`, `in` | `dimensionUnit` |
| `duration_text` | text | `duration`; no false precision is invented |
| `edition_text` | text | `edition` |
| `description` | plain text | `description` |
| `collaborator_name` | text | `collaboratorName` |
| `collaborator_url` | validated HTTP(S) URL | `collaboratorUrl` |
| `photo_credit_name` | text | `photoCreditName` |
| `photo_credit_url` | validated HTTP(S) URL | `photoCreditUrl` |
| `publication_status` | `draft` or `published` | `visibility` |
| `published_at` | timestamptz nullable | New server publication time |
| `created_at`, `updated_at` | server timestamps | `createdAt`, `updatedAt` |
| `deleted_at` | timestamptz nullable | New soft-deletion state |
| `purge_after` | timestamptz nullable, fixed to 30 days after deletion | New recovery deadline |
| `created_by_account_id`, `updated_by_account_id`, `deleted_by_account_id` | server-derived account FKs | New audit fields; never ownership |

Purpose and access summary:

- Owner/manager relationship: immutable artist `owner_profile_id`; either direct artist membership or the two-edge delegated gallery authorization chain for the requested scope.
- Publication: a trusted publish operation validates required title, bounded non-empty `year_label`, type, at least one ready image, and exactly one cover before setting `published`; `year_sort` may be null.
- Deletion: an authorized manager starts soft deletion, sets deletion audit fields, and triggers immediate public-copy removal. Restore is allowed before `purge_after` after conflict/invariant checks. A scheduled Edge Function permanently purges the row/private originals at or after the deadline.
- Useful indexes: `(owner_profile_id, deleted_at, year_sort desc nulls last, updated_at desc, id)`, partial global public `(published_at desc, id)` and profile public `(owner_profile_id, year_sort desc nulls last, updated_at desc, id)` where published and not deleted, `publication_status`, and audit-account indexes.
- Anonymous access: published, non-deleted Work whose owner profile is also published.

Collaborator fields are attribution only. They do not reference `accounts`, do not create membership, and never appear in an authorization policy. A later verified-profile collaborator join may be added, but it must remain separate from ownership.

#### `work_images`

| Item | Definition |
|---|---|
| Purpose | Independent ordered image record for one Work |
| Primary key | `id uuid` |
| Foreign keys | `work_id -> works.id on delete cascade`; `uploaded_by_account_id -> accounts.id on delete set null` |
| Important fields | `private_storage_path`, nullable `public_storage_path`, nullable immutable `public_version`/content hash, `original_filename` metadata only, `mime_type`, `byte_size`, dimensions, `display_order`, `is_cover`, `processing_status`, optional `alt_text`, uploader/updater audit IDs, timestamps |
| Ownership/management | Inherits Work management; uploader ownership alone does not grant Work authority |
| Publication | Public row/path only when parent Work is published and public copy is ready |
| Deletion | Work soft deletion/unpublish clears/removes the public-copy reference and object immediately but retains row/private original; Work hard purge cascades after private-object cleanup |
| Indexes | unique `(work_id, display_order)`; partial unique `(work_id)` where `is_cover`; `(work_id, processing_status)` |
| Anonymous access | Metadata and `public_storage_path` only for published parent Work |

The database guarantees one cover at most with a partial unique index. The publish operation guarantees one cover exactly and normalizes it to `display_order = 0`. Reordering should be one transaction or trusted function so temporary duplicate order values cannot leak.

## 8. Works data and query behavior

### 8.1 Dashboard query

The authenticated dashboard returns non-deleted Works the active account may manage directly or through the live delegated `works_editor` chain. It includes drafts and private image paths or short-lived authenticated preview URLs. Default order remains `updated_at desc, id`. Deleted rows are available only through a separate recoverable-items operation until `purge_after`, not through ordinary edit queries.

### 8.2 Public profile query

The public profile query accepts a profile slug or ID and returns only:

- published profile;
- published, non-deleted Works owned by that profile;
- ready public cover metadata.

Profile Works order is `year_sort desc nulls last, updated_at desc, id`. Public pages display `year_label` exactly and never parse it for sorting. The complete cursor makes pagination stable. This ordering is transparent and contains no engagement, payment, follower, save, or view signal.

Global Discover order is `published_at desc, id`. A later editorial selection must be visibly labelled, independently auditable, and separate from ordinary chronological Discover. Neither ordering may use payment, likes, followers, views, saves, engagement scores, or opaque recommendations.

### 8.3 Public artwork query

The public artwork route fetches one published Work and all ready public images ordered by `display_order asc, id asc`. A missing ID, draft, soft-deleted row, unpublished owner profile, or unauthorized request returns the same unavailable result. This avoids leaking draft existence through different error messages.

### 8.4 Publication transaction boundary

Storage and Postgres cannot be one atomic transaction. Use an explicit state machine:

1. Create or update a draft Work.
2. Reserve image IDs/paths.
3. Upload private originals.
4. Finalize each image after server validation; mark `ready`.
5. A trusted Supabase Edge Function reauthorizes the direct/delegated actor and validates Work and image invariants.
6. Create immutable public copies.
7. Record public paths.
8. Set `publication_status = 'published'` and `published_at` only when every required public copy exists.

Failures leave the Work in draft and mark incomplete images for retry or orphan cleanup. Never publish the database row first and hope media copying succeeds later.

### 8.5 Unpublish, delete, restore, and purge

- **Unpublish:** the Edge Function first removes public database eligibility/stops new public URLs, removes CHAINED-controlled public copies, clears their paths, and retains private originals and the editable draft.
- **Begin deletion:** set `deleted_at`, `purge_after`, and `deleted_by_account_id`; deny normal reads/edits; remove all public copies immediately; retain the row and private originals for recovery.
- **Restore within 30 days:** a trusted operation rechecks actor authority, active-only uniqueness, parent/profile state, image invariants, and grants before clearing deletion fields. It restores as draft and does not recreate public copies until an explicit publish.
- **Permanent purge:** a scheduled Edge Function selects expired rows, records an audit event, removes remaining private objects and dependent rows in a safe order, and then removes the Work. It is idempotent: missing objects/joins count as already removed, retries use the same target/correlation ID, and failure before completion leaves enough state to retry.

Foreign keys cascade only for true dependent records such as image metadata and Work-specific joins. Private Archive items use `on delete set null` plus a minimal private tombstone so an artist purge does not destroy a member's notes. Shared Presentation/Event/profile rows are not cascaded merely because a Work is purged; only their Work join rows are removed. Recovery is not promised after permanent purge.

## 9. Presentations

Presentations are durable contexts in which Works and profiles appear: exhibitions, fairs, screenings, performances, and related presentation contexts. They are not Agenda entries. One Presentation can optionally have one or more time-bound Events.

#### `presentations`

| Item | Definition |
|---|---|
| Purpose | Canonical presentation record |
| Primary key | `id uuid` |
| Foreign keys | `owner_profile_id -> public_profiles.id`; creator/updater/deleter account IDs `on delete set null` |
| Important fields | `title`, constrained `presentation_type`, `description`, `venue_name`, `city`, `region`, `country_code`, `starts_on`, `ends_on`, `external_url`, `publication_status`, `published_at`, timestamps, `deleted_at` |
| Ownership/management | Direct owner-profile members, or active delegated staff with `presentations_editor` when the owner is an artist profile |
| Publication | Trusted validation changes draft to published; anonymous access also requires a published owner profile |
| Deletion | Thirty-day soft delete with immediate public-copy cleanup; trusted idempotent purge later cascades joins/images after private-object cleanup |
| Indexes | `(owner_profile_id, starts_on desc, id)`, partial public date index, `publication_status` |
| Anonymous access | Published, non-deleted rows only |

#### `presentation_images`

| Item | Definition |
|---|---|
| Purpose | Ordered presentation documentation without overloading Work images |
| Primary key | `id uuid` |
| Foreign keys | `presentation_id -> presentations.id on delete cascade`; uploader account `on delete set null` |
| Important fields | Same private/public path, validation, dimensions, order, cover, credit, alt text, processing-state pattern as `work_images` |
| Ownership/management | Inherits Presentation management |
| Publication | Public copy visible only with a published parent |
| Deletion | Queue both objects, then delete row; parent hard purge cascades |
| Indexes | unique `(presentation_id, display_order)`; partial unique cover; processing-state index |
| Anonymous access | Ready metadata/public path for a published parent only |

#### `presentation_works`

| Item | Definition |
|---|---|
| Purpose | Ordered many-to-many inclusion of Works in Presentations |
| Primary key | `(presentation_id, work_id)` |
| Foreign keys | Both cascade on hard deletion |
| Important fields | `display_order`, optional `label_override`, `created_at` |
| Ownership/management | Presentation managers may edit the link, but may link only a Work they manage or a published Work; this never grants Work control |
| Publication | Anonymous visibility requires both linked records to be published and non-deleted |
| Deletion | Link is deleted when either parent is hard-deleted |
| Indexes | unique `(presentation_id, display_order)` where an order is assigned; reverse `(work_id, presentation_id)` |
| Anonymous access | Only through published parents; unpublished Work details stay hidden |

#### `presentation_profiles`

| Item | Definition |
|---|---|
| Purpose | Participant, organizer, curator, venue, or collaborator attribution |
| Primary key | `(presentation_id, profile_id, relationship_type)` |
| Foreign keys | Presentation and profile cascade on hard deletion |
| Important fields | constrained `relationship_type`, `display_order`, optional public `credit_text`, `created_at` |
| Ownership/management | Presentation managers control attribution; referenced profile receives no Presentation or Work authority |
| Publication | Visible when Presentation and referenced profile are published |
| Deletion | Cascade with either parent |
| Indexes | `(profile_id, relationship_type, presentation_id)`, `(presentation_id, display_order)` |
| Anonymous access | Published associations only |

## 10. Events and a scalable Agenda

An Event is the canonical time-bound Agenda record. `event_profiles` and `event_presentations` are references, not duplicate Event rows and not ownership grants.

#### `events`

| Item | Definition |
|---|---|
| Purpose | Canonical time-bound Agenda entry |
| Primary key | `id uuid` |
| Foreign keys | `owner_profile_id -> public_profiles.id`; creator/updater/deleter account IDs `on delete set null` |
| Important fields | `title`, `starts_at`, `ends_at`, IANA `timezone`, `venue_name`, `address_text`, `city`, `region`, `country_code`, nullable latitude/longitude and derived geography point, constrained `event_type`, `description`, `external_url`, `source_system`, `source_uid`, publication/timestamps/deletion fields |
| Ownership/management | Direct owner-profile members, or active delegated staff with `events_editor` when the owner is an artist profile; participant joins do not confer control |
| Publication | Trusted validation; anonymous access only to published, non-deleted future/current records owned by a published profile |
| Deletion | Thirty-day soft delete; public access ends immediately; trusted purge removes joins after expiry |
| Indexes | partial public `(starts_at, id)` where published/not deleted; `(owner_profile_id, starts_at, id)`; `(event_type, starts_at, id)`; `(country_code, region, city, starts_at, id)`; unique `(source_system, source_uid)` when both exist; optional later GiST geography index |
| Anonymous access | Published columns only; moderation/import metadata stays private |

Require `ends_at is null or ends_at >= starts_at`, a valid two-letter country code when present, bounded coordinates, and an IANA timezone. Store instants as `timestamptz` and retain the named timezone for correct display and daylight-saving interpretation.

#### `event_profiles`

| Item | Definition |
|---|---|
| Purpose | Event participant/organizer/profile attribution |
| Primary key | `(event_id, profile_id, relationship_type)` |
| Foreign keys | Event and profile cascade on hard deletion |
| Important fields | `relationship_type`, `display_order`, `created_at` |
| Ownership/management | Event managers edit; referenced profile gains no Event/Work control |
| Publication | Visible only when Event and profile are published |
| Deletion | Cascade |
| Indexes | `(profile_id, event_id)`, `(event_id, display_order)` |
| Anonymous access | Published associations only |

#### `event_presentations`

| Item | Definition |
|---|---|
| Purpose | Connect one Event occurrence to a durable Presentation context |
| Primary key | `(event_id, presentation_id)` |
| Foreign keys | Both cascade on hard deletion |
| Important fields | `relationship_type`, `created_at` |
| Ownership/management | Event managers create the link only to a managed or published Presentation; no authority transfer |
| Publication | Anonymous join only when both parents are published |
| Deletion | Cascade |
| Indexes | reverse `(presentation_id, event_id)` |
| Anonymous access | Published associations only |

#### `disciplines`

| Item | Definition |
|---|---|
| Purpose | Controlled, stable vocabulary for Agenda discipline filters |
| Primary key | `id smallint` |
| Foreign keys | None |
| Important fields | unique `slug`, `label`, `sort_order`, `is_active`, timestamps |
| Ownership/management | Admin-managed reference data |
| Publication | Active values are public |
| Deletion | Deactivate instead of delete while referenced |
| Indexes | unique slug; `(is_active, sort_order)` |
| Anonymous access | Active values |

#### `event_disciplines`

| Item | Definition |
|---|---|
| Purpose | Many-to-many discipline classification |
| Primary key | `(event_id, discipline_id)` |
| Foreign keys | Event cascades; discipline restricts deletion while used |
| Important fields | `created_at` |
| Ownership/management | Event managers assign active values |
| Publication | Visible with a published Event |
| Deletion | Cascade from Event |
| Indexes | reverse `(discipline_id, event_id)` |
| Anonymous access | For published Events |

### 10.1 Deduplication and shared events

- Reuse one Event ID when multiple profiles share an event; add `event_profiles` rows instead of copying the Event.
- Artist, curator, gallery, and institution participation in the same opening/performance therefore resolves to one canonical Event with multiple profile links.
- Imports must supply a stable `source_system` and `source_uid`; the partial unique pair prevents replay duplicates.
- Before manual creation, show candidates with similar normalized title, start time, city, and venue. Do not enforce a hard semantic hash: legitimate repeated performances can look identical.
- Admin merge should redirect joins to one canonical row and retain a private audit record. A participant credit remains non-authoritative.

### 10.2 Agenda query contract

The public query filters in Postgres/RLS, not in the browser. Supported filters are upcoming/date window, event type, discipline, country/region/city, profile, followed profile IDs for an authenticated account, and normalized text search. Default order is exactly `starts_at asc, id`; use keyset pagination with that complete cursor. Cap date windows/result counts and select only needed columns. The same indexed query shape scales from roughly 100 to 10,000+ accounts without fetching all Events client-side. Coordinates remain nullable; PostGIS/GiST is added only if later radius discovery warrants it. Exact browser geolocation is not required.

The signed-in Following view joins `follows.followed_profile_id` to `event_profiles.profile_id` and/or `events.owner_profile_id`. Guest location preference may stay in local storage as a city/region choice. Do not collect precise location merely to reproduce current Agenda filters.

## 11. CV and Press

#### `cv_categories`

| Item | Definition |
|---|---|
| Purpose | Per-profile ordered CV section headings |
| Primary key | `id uuid` |
| Foreign keys | `profile_id -> public_profiles.id on delete cascade` |
| Important fields | constrained or custom `category_type`, `label`, `display_order`, timestamps |
| Ownership/management | Profile memberships |
| Publication | Public only with a published profile |
| Deletion | Cascade entries or require reassignment before deletion |
| Indexes | unique `(profile_id, display_order)`, `(profile_id, category_type)` |
| Anonymous access | Categories of published profiles |

#### `cv_entries`

| Item | Definition |
|---|---|
| Purpose | Structured, manually ordered CV line |
| Primary key | `id uuid` |
| Foreign keys | `category_id -> cv_categories.id on delete cascade`; optional Presentation/Event/Work references `on delete set null` |
| Important fields | `year_label`, `title`, `organization`, `location_text`, HTTP(S) `url`, `display_order`, timestamps |
| Ownership/management | Inherits category/profile management |
| Publication | Public only through a published profile/category |
| Deletion | Hard delete is acceptable inside profile editing; audit optional later |
| Indexes | unique `(category_id, display_order)`, `(category_id, year_label)` |
| Anonymous access | Entries of published profiles |

Use a constrained `category_type` code for the stable MVP concepts (`exhibition`, `education`, `residency`, `grant`, `award`, `collection`, `teaching`, `publication`, `other`) and `cv_categories` rows for each profile's label and order. This is more evolvable than a native Postgres enum while remaining queryable and validated; arbitrary category text does not replace the stable code.

#### `press_entries`

| Item | Definition |
|---|---|
| Purpose | Press/article/book/review record attached to a profile |
| Primary key | `id uuid` |
| Foreign keys | `profile_id -> public_profiles.id on delete cascade`; optional Work/Presentation `on delete set null` |
| Important fields | `title`, `publication_name`, `author_text`, `published_on`, constrained `media_type`, HTTP(S) `url`, optional plain-text `description` and citation text, `display_order`, publication/timestamps/deletion fields |
| Ownership/management | Profile memberships |
| Publication | Draft/published independently, always bounded by profile publication |
| Deletion | Soft-delete for published records; later purge |
| Indexes | `(profile_id, published_on desc, id)`, partial published index |
| Anonymous access | Published, non-deleted entries for a published profile |

Do not model uploaded third-party articles as a default feature. Store citations and lawful external URLs unless CHAINED has explicit rights and a separate document-security policy.

## 12. Private Following and Archive

#### `follows`

| Item | Definition |
|---|---|
| Purpose | Private account-to-profile follow state |
| Primary key | `(follower_account_id, followed_profile_id)` |
| Foreign keys | Account and profile cascade on hard deletion |
| Important fields | `created_at` |
| Ownership/management | Follower account only |
| Publication | Never public; counts should not be exposed in the MVP |
| Deletion | Unfollow hard-deletes the join |
| Indexes | reverse `(followed_profile_id, follower_account_id)` only if trusted aggregate jobs need it |
| Anonymous access | None |

#### `archive_projects`

| Item | Definition |
|---|---|
| Purpose | Private personal or curator collection/project |
| Primary key | `id uuid` |
| Foreign keys | `owner_account_id -> accounts.id on delete cascade` |
| Important fields | `title`, constrained `project_type`, `description`, timestamps, `deleted_at` |
| Ownership/management | Owner account only in MVP |
| Publication | Private; later sharing requires a separate explicit model |
| Deletion | Soft-delete project; joins purge after retention |
| Indexes | `(owner_account_id, updated_at desc, id)` |
| Anonymous access | None |

#### `archive_items`

| Item | Definition |
|---|---|
| Purpose | One account's saved Work plus private notes |
| Primary key | `id uuid` |
| Foreign keys | `owner_account_id -> accounts.id on delete cascade`; `work_id -> works.id on delete set null` |
| Important fields | private `notes`, optional private tombstone title/artist/cover reference, timestamps |
| Ownership/management | Owner account only |
| Publication | Never public |
| Deletion | Hard-delete on unsave; Work deletion nulls reference without deleting private notes |
| Indexes | unique `(owner_account_id, work_id)` while Work exists; `(owner_account_id, updated_at desc)` |
| Anonymous access | None |

#### `archive_project_items`

| Item | Definition |
|---|---|
| Purpose | Many-to-many assignment of one saved item to multiple projects |
| Primary key | `(project_id, archive_item_id)` |
| Foreign keys | Both cascade |
| Important fields | `display_order`, `created_at` |
| Ownership/management | Both parents must belong to `auth.uid()`'s account |
| Publication | Private |
| Deletion | Cascade |
| Indexes | `(archive_item_id, project_id)`, `(project_id, display_order)` |
| Anonymous access | None |

#### `archive_tags`

| Item | Definition |
|---|---|
| Purpose | Private account-owned tag vocabulary |
| Primary key | `id uuid` |
| Foreign keys | `owner_account_id -> accounts.id on delete cascade` |
| Important fields | normalized `name`, display `label`, timestamps |
| Ownership/management | Owner account only |
| Publication | Private |
| Deletion | Hard-delete cascades tag joins |
| Indexes | unique `(owner_account_id, normalized_name)` |
| Anonymous access | None |

#### `archive_item_tags`

| Item | Definition |
|---|---|
| Purpose | Many-to-many private tag assignment |
| Primary key | `(archive_item_id, tag_id)` |
| Foreign keys | Both cascade |
| Important fields | `created_at` |
| Ownership/management | Item and tag must have the same owner account equal to the caller |
| Publication | Private |
| Deletion | Cascade |
| Indexes | reverse `(tag_id, archive_item_id)` |
| Anonymous access | None |

The current local-storage data can be imported after sign-in with explicit consent. Resolve each saved Work against a stable Work UUID; never upload browser notes or projects automatically before the account is authenticated and the user confirms migration.

## 13. Storage architecture

### 13.1 Options

| Option | Strengths | Risks and costs |
|---|---|---|
| Separate private originals and public delivery copies **(recommended)** | Authoritative originals remain protected; public `<img>` delivery is simple and cacheable; public files can be immutable and optimized later | Publishing/unpublishing requires copying and cleanup; a public URL already fetched may remain cached temporarily |
| Private bucket only with signed URLs | One authoritative object; time-bounded access; suitable for drafts and sensitive originals | Anonymous galleries need a trusted signer or server route; URL refresh adds complexity; an issued URL works until expiry and caches can delay revocation |

The approved design uses two buckets:

- `private-originals`: private, authoritative Work, Presentation, and profile uploads/dashboard previews.
- `public-media`: public, immutable, publication-specific copies only.

Recommended paths are generated from trusted IDs, never from filenames:

```text
private-originals/profiles/{profile_id}/works/{work_id}/{image_id}/source.{ext}
public-media/profiles/{profile_id}/works/{work_id}/{image_id}/{content_hash_or_version}.{ext}
private-originals/profiles/{profile_id}/presentations/{presentation_id}/{image_id}/source.{ext}
public-media/profiles/{profile_id}/presentations/{presentation_id}/{image_id}/{content_hash_or_version}.{ext}
private-originals/profiles/{profile_id}/avatar/{image_id}/source.{ext}
public-media/profiles/{profile_id}/avatar/{content_hash_or_version}.{ext}
```

If Press images are approved later, use the same private-source/public-copy pattern under `profiles/{profile_id}/press/{press_entry_id}/{image_id}/...`; add an explicit image record and rights metadata rather than placing an untracked URL on `press_entries`.

Immutable public names permit long-lived cache headers without stale in-place replacement. A publication Edge Function copies a validated private object to a new public version and atomically completes the database publication state only after all required copies exist. Unpublish/delete functions stop database-level public access and new URL generation before removing CHAINED-controlled public objects. Soft deletion retains private originals until the 30-day purge; unpublishing without deletion retains them indefinitely as draft media.

This is best-effort public recall. CHAINED cannot delete files already downloaded, browser caches, CDN copies awaiting expiry, screenshots, mirrors, or third-party archives. Normal published artwork media is therefore not technically revocable. Future embargoed/restricted material may use private signed delivery with deliberately short expiries.

### 13.2 Upload and validation boundary

The browser may upload directly only after an authorized reservation creates the image ID and expected path. Database/Storage authorization re-evaluates either direct target membership or the active delegate-membership-plus-scope chain. Storage RLS verifies the private bucket, reserved object name, target profile, content record, and uploader; a gallery employee cannot invent a represented artist path. Do not allow unrestricted inserts, bucket listing, path changes, or `upsert`.

Enforce JPG, PNG, and WEBP; maximum 25 MB; no SVG. Configure bucket MIME/size restrictions, then finalize through trusted code that independently verifies object ownership/path, byte count, detected file signature/decodability, declared MIME, dimensions, and quota. Client checks remain usability checks, not security. Consider malware scanning before public copy creation. Original filenames are inert metadata and must never become HTML or a path.

On failed or abandoned reservations, a scheduled Edge Function removes unreferenced private objects after a grace period. Soft deletion immediately invokes idempotent public cleanup; permanent purge removes private objects and rows after `purge_after`. Missing objects are treated as already cleaned and every attempt is audited. Operational logs record IDs and outcomes, not credentials, signed URLs, claim evidence, filenames, or image content.

### 13.3 Media access

- Guests receive only `public-media` paths belonging to published records.
- Authenticated managers receive short-lived signed URLs for private originals after database authorization.
- Private paths, bucket inventory, and signed URLs never appear in public table responses.
- Secret/service-role credentials exist only in Supabase Edge Function secrets. They are never embedded in browser JavaScript, committed, logged, included in prompts/screenshots/fixtures, returned in responses, or exposed to coding agents. The Dashboard is emergency/controlled administration only.

## 14. Authentication and onboarding

### 14.1 Approved MVP flow

```text
TRUSTED ADMIN APPROVES PERSON
→ INVITATION SENT
→ USER OPENS EMAIL MAGIC LINK
→ ACCOUNT ACTIVATED
```

Public self-registration is unavailable. A normalized `account_invitations` record with deterministic `approved`, `sending`, `sent`, `accepted`, `expired`, `revoked`, or `failed` lifecycle state exists before Auth sends mail. The short `sending` claim makes concurrent Edge Function retries single-dispatch; it remains actionable only until the invitation expires. Confirming a still-valid sent invitation creates/activates the `accounts` row as `active` and assigns `private_member`; there is no redundant approval step. Explicitly approved initial artist, curator, or institution roles may be added in the same transaction. Accepted and other terminal invitation rows remain audit history and do not permanently block a later legitimate approval. `active`/`suspended`/`disabled` is application state separate from whether an Auth token exists. Policies deny suspended/disabled accounts even if a previously issued session has not expired.

An ordinary invitation can assign only its explicitly approved initial `private_member`, artist, curator, or institution roles. It can never assign `admin`; later roles and all profile memberships remain separate trusted decisions. Do not infer roles from Auth metadata, email domains, or self-supplied text. The first hosted administrator is established by a separate, controlled deployment bootstrap procedure—never a permanent public endpoint. Gallery/institution profiles are managed by individual Auth accounts, never shared passwords or synthetic Auth users.

Future frontend passwordless login must call the Supabase magic-link/OTP sign-in API with `shouldCreateUser: false`, so a login attempt cannot become an account-registration path. Frontend Auth integration is outside this phase.

Artist profile claiming is also distinct from account approval. An already invited/active claimant follows the verified claim workflow for the existing artist profile. Approval updates that profile in place and establishes primary-controller membership without issuing a second account-approval step.

### 14.2 Browser-safe actions

The anon/publishable key may be present in the client. RLS must make it safe. Browser operations can:

- sign in/out and refresh the current session;
- update limited fields on the caller's own account;
- manage rows for direct profiles or delegated scopes only when RLS validates the complete live authorization chain;
- create and manage the caller's private follows and Archive;
- reserve and upload to an authorized private media path;
- read public data through server-filtered public queries.

### 14.3 Trusted-only actions

The following use audited Supabase Edge Functions with narrowly scoped secrets:

- approve/send/revoke invitations and suspend/disable/delete Auth users; the invitation Edge Function authenticates the caller, requires an active account plus active `admin` role, then uses its server credential only after authorization;
- grant/revoke global roles and profile-owner memberships;
- verify/complete profile claims and establish initial unclaimed-profile gallery grants;
- perform protected grant/controller/ownership operations and moderation overrides;
- publish/unpublish, create/delete public media copies, inspect/scan uploads, merge duplicate Events, restore, and permanently purge;
- perform other scoped administration requiring secret/service-role credentials.

The Supabase Dashboard is reserved for emergency operations, debugging, controlled administration, migrations, and repair—not the normal application workflow. Enable appropriate email-link expiry, redirect allowlists, invitation/rate controls, and MFA for admins. Never treat hidden dashboard controls as authorization.

## 15. Row Level Security strategy

Enable RLS on every table exposed by the Data API, including all join tables. Revoke broad grants before adding the minimum grants and policies. Views must obey caller RLS (`security_invoker` where supported); security-definer functions must use an empty/fixed `search_path`, schema-qualified objects, least privileges, and explicit execute grants.

Centralize authorization in reviewed helpers that first require the caller's application account to be `active`. Direct management checks an active `profile_members` row on the target. Delegated management checks, at request time, both an active caller membership in the delegate gallery/institution profile and an explicitly `active`, non-revoked, non-expired `profile_access_grants` row from the target artist profile for the exact operation scope. Expiry remains a real-time authorization condition even when a trusted lifecycle sweep has not yet persisted `expired` status. Keep helpers small; index every join/status/scope column and verify plans with `EXPLAIN` at 10,000+ account/event-scale fixtures.

No authorization helper may consult `profile_relationships`, collaborator credits, Presentation/Event participation, payment/plan data, or audit creator/updater IDs. Revoked membership or grant must fail on the very next database request; do not encode delegated access into long-lived JWT claims.

Illustrative policy intent only—this is not executable migration SQL:

```sql
-- Public record
SELECT works
WHERE publication_status = 'published'
  AND deleted_at IS NULL
  AND owner_profile_is_published(owner_profile_id);

-- Managed record: helper means direct membership OR the complete live
-- delegate-membership + scoped-grant chain for 'works_editor'.
ALL works
USING account_is_active()
  AND deleted_at IS NULL
  AND can_manage_target(owner_profile_id, 'works_editor')
WITH CHECK account_is_active()
  AND owner_profile_is_artist(owner_profile_id)
  AND can_manage_target(owner_profile_id, 'works_editor');

-- Private account row
ALL archive_items
USING owner_account_id = (SELECT auth.uid())
WITH CHECK owner_account_id = (SELECT auth.uid());

-- Private upload path
INSERT storage.objects
WHERE bucket_id = 'private-originals'
  AND reserved_path_is_authorized(name, (SELECT auth.uid()), 'works_editor');
```

These examples communicate invariants only. Implementation must use column grants and trusted functions/triggers to prevent ordinary updates to `owner_profile_id`, owner account, claim/controller state, creator/deleter IDs, roles, memberships, grant principals/scope, account status, publication timestamps, deletion deadlines, and Storage paths. `updated_by_account_id` is derived from the session, never accepted from the payload. Publication/unpublication and permanent purge are Edge Function operations that reauthorize the actor and write audits.

Direct artist members manage their artist profile according to membership level. Gallery staff manage their gallery profile through direct membership. They manage an artist target only through the separate active scope chain. A representation relationship cannot satisfy the helper. A revoked employee loses access because their membership is joined on each call; a revoked grant stops every employee of the delegate profile. A gallery cannot change artist ownership, claim status, primary controller, owner membership, or permanently purge through delegated policies.

Claim approval locks the target profile, verifies it is still unclaimed and that no conflicting claimed identity exists, then updates that same row, adds the artist owner membership, and audits the transition. Partial unique identity/slug constraints and a pending-claim constraint prevent parallel duplicate creation/claiming. Ordinary browser code cannot perform the transition.

### 15.1 Policy summary

| Data | Anonymous read | Authenticated read/write |
|---|---|---|
| Published profiles, Works, Presentations, Events, CV, Press | Explicit published/non-deleted projection only | Same public access plus non-deleted managed drafts through direct or exact delegated scope |
| Account/profile membership/global roles | None, except caller-safe account projection | Caller can read own effective access; privileged writes use Edge Functions; no self-promotion |
| Profile relationships | Approved relationships between published profiles | Descriptive management workflow only; never permissions |
| Profile access grants/claims | None | Caller-safe views as needed; create/approve/revoke protected by artist-controller/trusted workflows and audit |
| Follows and Archive | None | Owner account only; all cross-parent ownership checked |
| Private originals | None | Authorized profile managers through short-lived access/reserved uploads |
| Public media | Object delivery public | Public copy lifecycle trusted-only |

Normal browser sessions do not receive an admin bypass. Administrative Edge Functions validate the caller, read trusted database role/account state, authorize one scoped operation, and use their secret only inside the function. Role assignment is never based on editable user metadata or ordinary client writes. Every authenticated policy checks indexed application account status so suspension/disablement ends database access even if an Auth token remains valid.

RLS is the primary data boundary. Input constraints, foreign keys, column grants, immutable-authority triggers, rate limits, Storage restrictions, short session lifetimes for privileged accounts, logs, backups, and tests are defense in depth.

## 16. Threat model and required tests

| Threat | Asset at risk | Primary prevention | Verification |
|---|---|---|---|
| Guest guesses draft UUID | Draft metadata/media | Published-only RLS; no private path in public response | anon select by known draft ID returns no row/object |
| Authenticated user calls REST directly | Another profile's content | Active-account, direct/delegated-scope RLS and immutable owner columns | cross-account CRUD test for every managed table |
| Gallery claims representation implies access | Artist profile/Works | `profile_relationships` excluded from all authorization helpers | create approved relationship without grant; every artist mutation stays denied |
| Gallery edits an ungranted artist | Artist ownership/content | Require active delegate membership and exact active target grant | test no grant, wrong target, and wrong scope against direct REST/Storage calls |
| Revoked gallery employee retains access | Artist/gallery content | Join current active membership on every request; no long-lived delegated JWT claim | revoke membership during session; next DB/Storage/Edge operation fails |
| Revoked/expired gallery grant retains access | Artist content | Join live grant status/expiry for every operation | revoke/expire grant; all gallery employees immediately lose that scope |
| Gallery changes Work owner/controller | Artist independence | Immutable columns, protected Edge operations, grant-scope exclusions | attempt owner/controller/owner-membership changes with valid `works_editor` grant |
| Profile claim takeover or duplicate | Stable artist identity and catalog | Trusted verification, row lock, pending/identity uniqueness, update-in-place | parallel claims/creation attempts produce one profile; gallery cannot approve or block claim |
| User changes owner/role in payload | Authority | Column grants plus trusted assignment functions | update attempts fail even when other fields are editable |
| Attribution used as access | Artist control | Attribution tables/fields excluded from policy logic | collaborator cannot edit linked Work |
| Join-table IDOR | Archive or participant relationships | Validate both parent owners and RLS on joins | mix IDs from two accounts and expect denial |
| Malicious/oversized upload | Storage, viewers, cost | Reservation, bucket limits, signature decode, quota, optional scan | MIME spoof, polyglot, >25 MB, SVG, wrong path tests |
| Object path enumeration | Private originals | Private bucket and object RLS; opaque UUID paths | list/download as guest and unrelated member denied |
| Unpublished image stays reachable | Artist control | Stop public DB access/new URLs, delete controlled public copies, retain private original | test unpublish/delete object cleanup plus documented best-effort recall limitation |
| Purge destroys recoverable data early or corrupts relations | Artist catalog/private originals | Server-set 30-day deadline, trusted idempotent job, ordered cleanup/audit | retry before/after partial object/row deletion; no purge before deadline; restore-before-deadline test |
| Stored XSS through title/filename/URL | Visitors/admins | DOM text APIs, URL scheme validation, CSP | payload corpus renders as text; `javascript:` rejected |
| Unsafe external URL redirects | Visitor identity/device | Accept absolute HTTP(S) only; safe link attributes; no executable schemes | reject relative, credential-bearing, `data:`, `file:`, and `javascript:` cases |
| Enumeration via different errors | Draft existence/accounts | Uniform unavailable responses and rate limits | compare timing/status for missing versus private IDs |
| Stolen privileged session | Platform data | MFA, short-lived session, revocation/suspension check, audit | revoke/suspend drill |
| Leaked secret/service key | Entire project | Edge Function secrets only; never browser/log/prompt/screenshot/fixture/response; rotation and scans | repository/build-output/function-log scan and rotation drill |
| Over-privileged admin or function | Entire project | Least privilege, audit trail, reviewed definer functions | permission inventory and quarterly access review |
| Coding agent reads production credentials | Entire project | Never place secrets in repo/prompts/agent environment; sandbox scopes | CI/config checks and documented operator procedure |

Test policies using at least guest, private member, two unrelated artists, claimed artist owner, unclaimed gallery-managed artist profile, active and revoked gallery staff, wrong-scope/expired/revoked grants, curator, gallery/institution manager, suspended/disabled account, and admin contexts. Every table needs positive and negative select/insert/update/delete tests; published/draft/deleted parent combinations must be tested on every join and view. Query tests also assert exact Discover/profile/Agenda ordering and demonstrate that plan/payment and all engagement fields cannot alter visibility or rank.

## 17. Client adapter for the static prototype

Preserve the current pages and introduce a data-provider seam rather than coupling every page to Supabase calls:

```text
window.ChainedWorkStore
  -> IndexedDbWorkStore     (current prototype/offline fixture)
  -> SupabaseWorkStore      (authenticated dashboard and public provider)
```

Keep the current method shape during migration where it is safe, but split public and managed reads:

- `getManagedWorks(profileId)`, `getManagedWork(workId)`
- `getPublishedWorks(profileSlug, cursor)`, `getPublishedWork(workId)`
- `createWork`, `updateWork`, `deleteWork`
- `reserveWorkImage`, `finalizeWorkImage`, `reorderWorkImages`, `removeWorkImage`
- `publishWork`, `unpublishWork`, `restoreWork` as Edge Function calls; permanent purge is never a browser method
- equivalent Presentation/Event/Profile/Archive methods as those pages are connected

The adapter maps database `snake_case` to the existing client `camelCase`, converts timestamps explicitly, and returns normalized error categories without exposing policy details. Current `year` becomes public `yearLabel` plus nullable `yearSort`; during route migration the provider may expose `year: yearLabel` as a read-only compatibility alias for existing renderers. The editor must ultimately expose label and optional sort value separately and must never derive `yearSort` by parsing arbitrary label text. `getAllWorks()` must not back public pages: public methods query published rows under anon RLS. Dashboard methods require an active session, target profile, and server-authorized direct/delegated context.

Image Blob persistence moves out of IndexedDB into Storage. The form can keep its current client previews and selection behavior; save creates the draft, reserves image rows, uploads private originals, finalizes them, and then optionally invokes the publication Edge Function. Unpublish/delete/restore similarly call trusted functions. Retain pending upload state locally so a transient failure can retry without silently creating duplicate rows.

Use one client/session module and one event-listener registration per page. It observes Auth state but also fetches application account status/effective profile access; an Auth session alone is not authorization. Invitation, role, claim, protected grant, publication, cleanup, and purge clients call narrow Edge Function endpoints. Never embed the secret/service key. The publishable key is not a secret, but it is safe only when database and Storage RLS have been verified.

Concretely, `work-store.js` becomes the provider façade or is replaced by a compatible provider module. The Dashboard scripts and `dashboard-work-edit.html` can remain mostly unchanged apart from authentication/loading/error states and the new upload calls. `public-profile.js` and `artwork-dynamic.js` must replace broad local reads with the dedicated published methods. `agenda.js`, `following.js`, and the Archive scripts move to their own Supabase providers in later phases; their HTML and CSS need not be redesigned.

## 18. Phased migration plan

| Phase | Objective | Files or systems affected and test conditions | Rollback / failure consideration |
|---|---|---|---|
| 1. Architecture approval | Approve the recorded decisions and ownership/delegation/publication boundaries | This document only; review every current field, route, profile state, grant scope, account type, and permission | Revise documentation; no runtime state exists |
| 2. Development project | Create a non-production Supabase project and operator procedures | Supabase organization/project, regional/data policy, secret manager, backups, logging; verify no key enters the repository | Delete/recreate the isolated project; production frontend is disconnected |
| 3. Schema and migrations | Encode accounts/roles, durable claimable profiles, memberships, relationships, scoped grants, claims/audit, Works/images, year/deletion fields, constraints/indexes | Reviewed migration files in a later implementation task; validate artist-only Work ownership, active-only uniqueness, 30-day deadlines, claim concurrency, and rollback in disposable DB | Restore project snapshot or use reviewed remediation; never improvise against production |
| 4. RLS enablement | Make exposed data deny-by-default and implement direct plus two-edge delegated authorization | Grants/policies/helpers/test harness; positive/negative CRUD for unrelated artist, relationship-only gallery, wrong scope, revoked staff/grant, immutable owner, draft/deleted states | No client connection until all policy tests pass; revert disposable migration/restore snapshot |
| 5. Edge Function trust boundary | Implement narrow invitation, role, claim, publication/unpublication, cleanup, restore, purge, and scoped-admin functions | Function secrets, authentication/authorization, idempotency and audit; verify secrets never enter browser/logs/responses and Dashboard is not required in normal flow | Disable each endpoint independently, rotate secrets, and preserve retry state/audit IDs |
| 6. Storage buckets/policies | Prove `private-originals`, immutable `public-media`, reservation/validation, immediate public cleanup, retained private recovery | Storage/policies/media Edge Functions; test spoofed gallery paths, MIME, >25 MB, drafts, unpublish/delete, restore, purge retries, cache disclosure | Keep IndexedDB authoritative; remove isolated objects/functions and recreate test buckets if policy history is uncertain |
| 7. Authentication | Enable admin-sent invitation magic links with no public registration or second approval gate | Auth templates/redirects/expiry/rate/MFA; test invitation acceptance activates account, sign-out, suspended/disabled denial with live token | Disable invitations/provider; no production data depends on Auth yet |
| 8. Account/profile onboarding and claiming | Assign trusted roles/memberships, create stable unclaimed gallery-managed profiles, and claim them in place | Identity/claim/grant tables and Edge Functions; test duplicate prevention, artist primary control, preserved IDs/relations, gallery grant review/revocation, no self-promotion | Revoke erroneous grants/roles through trusted operation; claim corrections remain audited, never create replacement profiles |
| 9. Work-store adapter | Add provider seam and managed/public/Edge methods without redesigning pages | Later store/auth/Dashboard script changes; test local/Supabase providers, delegated context, `yearLabel`/`yearSort`, retry/idempotency, no secret key | Feature flag returns to IndexedDB; retain local data |
| 10. Seed Works migration | Transform seeds with stable mapping and verified artist owner | Reviewed import tooling/Postgres/Storage; current integer year populates both year fields; compare all fields, counts, hashes, order, cover, publication state | Idempotent manifest supports batch removal; sources untouched |
| 11. Multi-account security test | Validate direct, delegated, revoked, claim, deletion and malicious API workflows | Guest/member/two artists/gallery staff/revoked staff/wrong grants/suspended/disabled/admin; REST/Storage/Edge tests plus 10,000-account/event query plans | Block promotion; reset isolated fixtures only from manifest |
| 12. Public route connection | Replace client-side draft filtering and enforce approved deterministic orders | Later `public-profile.js`, `artwork-dynamic.js`, Discover/provider config; verify missing/draft parity, exact global/profile order, year labels, desktop/390/320 | Provider flag restores static/local rendering while DB remains |
| 13. Dashboard pilot and MVP launch gate | Pilot direct artist and delegated gallery create/edit/delete/draft/publish/claim/revoke/recovery workflows | Dashboard/provider/Edge integration and monitoring; test Storage/DB partial failures, backup restore, key rotation, immediate cleanup, 30-day purge simulation | Restrict pilot profiles; disable provider/publication functions; preserve recovery state |
| 14. Later domain rollout | Connect Presentations, shared Events/Agenda, Following, Archive, CV, Press, geography and labelled editorial selections | Domain policies/providers/scripts; test canonical-event dedupe, `starts_at,id` pagination, scopes, public/private split, desktop/390/320 | Release route/domain at a time and retain fallback until verified |

Each data phase runs in a non-production environment first. Reconcile row counts, foreign keys, image hashes/sizes, cover/order invariants, publication state, and rendered routes before advancing. Keep a source-to-target manifest and never delete browser-local data as part of an automatic import.

## 19. MVP versus later

| MVP implementation boundary | Later, without blocking the MVP schema |
|---|---|
| Invitation-only magic links, active/suspended/disabled application accounts, multiple trusted role rows; invitation is approval | Self-service applications, social login, expanded onboarding automation |
| Claimed and durable unclaimed artist profiles; primary artist controller and identity-preserving claim records | Richer claim-evidence/support UI and automated identity matching |
| Individual gallery memberships plus scoped artist access grants and revocation enforced in RLS, even if team-management UI is minimal | Full multi-user gallery/institution administration UI, seat/bulk/workflow plan tooling |
| Works and independent ordered Work images | Presentation management and images; Work relationships |
| Draft/published lifecycle and trusted private-original/public-copy flow | Advanced derivatives, embargoes, video transcoding, richer media-rights workflows |
| Public profile Works rendering and public artwork route | Events, shared Agenda publication, following-based Agenda filters, geographic refinement |
| Guest published reads and direct/delegated dashboard reads/writes with immutable artist ownership | Following, private Archive/projects/tags/notes, curator projects and visibly labelled public curated selections |
| Complete RLS/Storage policy suite, audit trail for privileged MVP operations, backup/restore | CV and Press management/imports; expanded moderation/audit product UI |

Identity, membership, relationship, grant, claim, and audit schema must exist in the MVP because artist ownership and safe gallery delegation depend on their separation. Rich team-management, paid workflow, Presentation, Agenda, and research interfaces may ship later. Avoid speculative generic content tables, permission JSON, PostGIS, or shared-project ACLs in the first release.

Keep optional extensions disabled until the associated query and operating need exists. PostGIS is the likely first extension for radius discovery; full-text/trigram search should be added only after measuring current text-query requirements.

## 20. Operational invariants

- Secret/service-role credentials exist only in Edge Function secrets and controlled emergency operator tools, never frontend code, repository/build output, logs, prompts, screenshots, fixtures, browser responses, or coding-agent context.
- Schema changes are reviewed, versioned migrations when implementation begins; this document is not an executable migration.
- Privileged operations write actor, target IDs, action, timestamp, and outcome to an append-oriented audit log without sensitive payloads.
- Direct/delegated authorization is recalculated from active account, membership, target, and grant rows for every request; representation and payment are never authority.
- Soft deletion ends ordinary/public access and controlled public copies immediately; private recovery lasts until the fixed 30-day deadline, after which idempotent purge is final.
- Discover, profile, and Agenda query tests assert their approved deterministic order and the absence of payment/engagement inputs.
- Backups are enabled and restores are rehearsed. Storage object recovery needs its own policy; database backup alone is insufficient.
- Public data exports omit private IDs/paths, email, follow/save state, drafts, notes, moderation details, and precise account activity.
- Accessibility, desktop, 390 px, and 320 px checks remain release gates. Artwork stays uncropped unless explicitly requested.

## 21. Authoritative Supabase references

Implementation should be rechecked against the then-current official documentation:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Storage object ownership](https://supabase.com/docs/guides/storage/security/ownership)
- [Storage bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Private bucket downloads and signed URLs](https://supabase.com/docs/guides/storage/serving/downloads)
- [Smart CDN behavior](https://supabase.com/docs/guides/storage/cdn/smart-cdn)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Auth users and trusted invitations](https://supabase.com/docs/guides/auth/users)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Custom claims and RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Database indexes](https://supabase.com/docs/guides/database/postgres/indexes)
- [PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)

## OPEN DECISIONS FOR PEER

None. All product and security questions addressed by this revision are recorded in `APPROVED ARCHITECTURAL DECISIONS`; no unresolved decision currently blocks Supabase implementation.
