# CHAINED — CURATOR v1 ARCHITECTURE

Last updated: 2026-10-16

Status: design only. Nothing in this document is implemented unless it is listed under "Existing primitives". It records the repository audit at `6cdbcb5` and the proposed CURATOR v1 model, stages and open decisions. Established decisions live in `DECISIONS.md` (Product perspectives); sequencing lives in `ROADMAP.md` (NOW → CURATOR v1). The current code remains the technical source of truth.

## 1. Product framing

- CHAINED has three intended perspectives onto one shared network: ARTIST, CURATOR, INSTITUTION/GALLERY. ARTIST exists and mainly proves PORTFOLIO. CURATOR is the next product line and tests NETWORK + WORKSPACE. INSTITUTION/GALLERY is parked.
- A curator works with Artists and Works that already exist on CHAINED. There is no upload of external artists, external Works or arbitrary images (no moodboard/Pinterest model).
- The private research workspace is the core of CURATOR v1. Public CURATED output is later and optional; holding the curator role never implies publishing.

## 2. Existing primitives (repository evidence)

| Area | What exists | Reuse for CURATOR v1 |
|---|---|---|
| Accounts / roles | `accounts` = Auth user. `account_roles` is many-to-many with enum `application_role` = `private_member`, `artist`, `curator`, `institution`, `admin` (foundation migration). No exclusive account role column. | Yes: `curator` role row is the curator capability. |
| Profiles | `public_profiles.profile_type` enum `artist`, `curator`, `institution`; non-artist profiles must be `claimed`. `profile_members` (`owner`/`manager`/`editor`) grants direct management. | Yes: a `curator` profile is the curator's identity and future CURATED publisher. |
| Admission | `account_invitations.approved_roles` already accepts `curator`. Artist invites provision a draft Artist profile + owner membership (`20260825214140`) and `CHAINED` plan intent; non-Artist invitations are `UNCHAINED`. The Admin Console and `admin-invite-service.mjs` only send `roles: ["artist"]` with an artist workspace. | Partly: curator invite + provisioning is missing. |
| Artist-only content | Presentations (`profile_activities`) reject non-artist owners by trigger; `can_manage_activity_owner`, CV and Settings helpers require `profile_type = 'artist'`; the only client update policy on `public_profiles` (`public_profiles_settings_update` → `can_manage_profile_settings`) requires an Artist profile, so members cannot edit or publish a curator profile today. | Not in v1. Curator-owned Presentations/CV and curator profile editing are later. |
| Workspace (SELECTOR) | Account-owned, owner-only FORCE-RLS tables: `archive_items` (account × Work, `origin` `saved`/`managed`; insert requires `is_published_work`), `archive_tags` + `archive_item_tags`, `archive_projects` (title ≤160, description ≤2000, `publisher_profile_id`) and `archive_project_items` (ordered `position`, mutated only via `add/remove/reorder_archive_project_items` RPCs with audit events). ALL/PERSONAL/SAVED scopes, search, Tags, mixed ordered Projects, CHAINED SELECT export (external Works use strict public LARGE). | Yes: this is the curator research workspace. No parallel curator tables for Works, Tags or Projects. |
| Save actions | Work-level `[+]` save on Discover, Follow and Work detail (`saved-works.js`, `archive-work-action.mjs`). Not on public Profile. | Yes. |
| Network / discovery | Discover NOSY (Works, MEDIUM filters, artist-spread ordering), Discover FIND ARTISTS (published claimed Artist names/slugs only), `profile_follows` (private account → published profile, drives Follow + Agenda FOLLOW), public Profile and Work detail. | Yes, unchanged. Follow is a reading preference, not a research save. |
| CURATED | `curated_collections` (1:1 with `archive_projects`, `publisher_profile_id`, draft/published), `publish_archive_project` / `depublish_archive_project` (requires a published `curator`/`institution` profile with `editor` membership), `list_published_curated_collection_items` (live join to the private Project's items, published Works only), `curated.html`, Discover CURATED channel, `[ PUBLISH TO CURATED ]` in `archive-project.js`. | Precursor only; see §6. |
| Provenance | Works are always owned by an Artist profile (`works.owner_profile_id`); references never grant control. Workspace rows store only the Work ID. | Yes: live backlinks, no copied metadata. |
| Dashboard / navigation | Primary nav DISCOVER · FOLLOW · SELECTOR · AGENDA · own Profile · `[+]`. Dashboard and its nav (WORKS, PRESENTATIONS, AGENDA, CV, PRESS, SETTINGS) are Artist-only; `dashboard-context.mjs` always labels `ARTIST ACCOUNT` and shows `PROFILE SETUP REQUIRED` without managed Artist profiles. Onboarding dialog is gated to Artists with a claimed workspace. | Needs a perspective layer. |

Observed gaps relevant to CURATOR (facts, not bugs):

- Saved external Works that are unpublished/soft-deleted silently disappear from SELECTOR (public projection); there is no private placeholder. Hard purge cascades the workspace row.
- Workspace RLS checks only an active account, not a role; any active account (including `UNCHAINED`) can technically create SELECTOR rows although `DECISIONS.md` gives `UNCHAINED` no workspace.
- `archive_project_items` references `archive_items (account_id, work_id)`: removing a Work from SELECTOR removes it from every Project, and Project items are tied to the owner's own SELECTOR (a constraint for future shared Projects).
- The existing CURATED path publishes the private Project's live item list and does not implement the `DECISIONS.md` CURATED contract (≥3 visible Works, chosen cover Work, intro/essay/sources, auto-unpublish below 3, Following-once, APPEARS IN). No client path exists today to publish a `curator` profile (see Artist-only content above), so the publish action is unreachable for ordinary accounts.
- There are no notes anywhere in SELECTOR and no way to save an Artist (profile) for research.

## 3. Proposed CURATOR v1 model

### Identity and role

- Capability lives on the account: an active `account_roles.curator` row. Perspective availability is derived from roles plus managed profiles, never from client state.
- Identity lives on a profile: curator admission provisions one `curator` `public_profiles` row (DRAFT, `claimed`, primary controller = the account) with an `owner` membership, mirroring Artist workspace provisioning. In v1 it supplies the display name and is the anchor for later CURATED publication and team membership; it stays DRAFT and has no public page in v1. Its display name is set at invitation; self-service curator profile editing is later (it needs a curator-capable profile update policy).
- No separate curator entity table. A person who is both Artist and Curator is one account with both role rows and both profiles.

### Role switching

- One account, one SELECTOR. Saved Works, Tags and Projects belong to the person, not to a perspective (PERSONAL simply stays empty for curator-only accounts).
- A dual-role account sees a quiet `[ ARTIST ]` / `[ CURATOR ]` switch in the management identity line (replacing the fixed `ARTIST ACCOUNT` label). The choice is a UI preference (browser-local); authorization always recomputes server-side.

### Navigation and dashboard

- Primary nav stays DISCOVER · FOLLOW · SELECTOR · AGENDA · `[+]`. A curator-only account has no own-Profile link in v1 (DRAFT curator profile).
- `[+]` opens the Dashboard in the active perspective. Curator Dashboard (same route, perspective-rendered): identity `<NAME>` / `CURATOR ACCOUNT`; RECENT PROJECTS, RECENTLY SAVED WORKS, SAVED ARTISTS; dashboard nav limited to OVERVIEW · SELECTOR · SETTINGS (account-level only). No WORKS/PRESENTATIONS/CV/PRESS for curator-only accounts in v1.
- Artist first-login onboarding stays Artist-only. A curator introduction is a later, separate onboarding version/decision.

### Finding and saving

- Find: existing Discover NOSY, FIND ARTISTS, Follow, public Profile and Work detail. No new search engine in v1.
- Save Works: existing `[+]` → `archive_items` (`origin = saved`), published Works only.
- Save Artists (new): `[ SAVE ARTIST ]` on public Profile, distinct from FOLLOW (no feed effect). Published Artist profiles only.

### Research projects, ordering, grouping, tags

- Research project = existing SELECTOR Project (`archive_projects`): title, optional description, manual Work order via existing RPCs, mixed sources, CHAINED SELECT export.
- Grouping: Projects plus Tags. No sections or nesting inside a Project in v1 (consistent with "Projects have only small metadata, no nesting").
- Tags: existing private account Tags on saved Works. Artist tags are out of v1.

### Notes

- Private, plain-text, owner-only notes (proposed limit 4000 characters):
  - on a saved Work (`archive_items.note`) — general research note;
  - on a Work in a Project (`archive_project_items.note`) — why it belongs in that context;
  - on a saved Artist (`archive_profile_items.note`).
- Notes are never public, never visible to the Artist, never exported in v1, and never copied into CURATED.

### Comparison / review

- `COMPARE`: select 2–4 Works within a Project and view them side by side using contained, uncropped public/authorized images with their notes. UI-only, no persistence.
- No per-item review states (candidate/shortlist/selected) in v1 unless Peer decides otherwise; longlist/shortlist are separate Projects.

### Provenance and backlinks

- Rows store only Work/profile IDs. Title, Artist name, media and metadata are always read live from the canonical public (or, for own managed Works, authorized) projection with links to the Artist Profile and Work detail. No metadata snapshots/tombstones of other Artists' data.
- Unavailable Work/Artist (unpublished, soft-deleted, Profile unpublished): the curator sees a private `WORK UNAVAILABLE` / `ARTIST UNAVAILABLE` position with only their own note and ordering, via a self-scoped availability projection that returns no Artist metadata. Hard purge cascades the row.

### Permissions and privacy

- All research rows are account-owned, owner-only, active-account-only, FORCE RLS with explicit narrow grants (existing SELECTOR pattern and the public-table grant decision).
- Being saved, noted or researched is invisible to the Artist: no notification, count, list or signal.
- Insert requires a currently published Work / published Artist profile; existing rows survive later unpublication as private placeholders.

### Deletion

- Unsave Work → cascades its Tags, Project memberships and notes (existing cascade; UI must say so once notes exist). Unsave Artist → removes its note.
- Delete Project → removes memberships and Project-item notes only; Works, saves and Tags remain.
- Artist deletes/unpublishes → private placeholder; hard purge removes the row.
- Account deletion cascades all research. Curator role revocation hides the curator perspective; private research remains with the account.

### Future collaboration (not in v1)

- Keep every Project authorization behind `private.can_manage_archive_project` and RPCs so a later "account owner OR active member of the owning curator/institution profile" rule changes one helper.
- Shared/team Projects will need Project items decoupled from the owner's `archive_items` FK and an explicit owning profile; do not add collaborators, comments or project ACLs in v1.

## 4. Likely changes (not written)

Schema / RLS / API:

1. Curator admission: extend invitation provisioning for `curator` → draft `curator` profile + `owner` membership; decide plan intent; `invite-account` Edge Function and Admin Console accept a curator invite. pgTAP for provisioning, slug conflicts and that a curator profile cannot own Works/Presentations or be self-published.
2. Notes: `archive_items.note` with column `UPDATE (note)` grant + own-row update policy; `archive_project_items.note` via a new audited `set_archive_project_item_note` RPC (keeps the RPC-only mutation pattern). Managed rows: the managed-sync trigger delete/reinsert on owner change or deletion clears notes — acceptable but must be tested and documented.
3. Saved Artists: `archive_profile_items (account_id, profile_id, note, created_at)`, PK `(account_id, profile_id)`, insert only for published, non-deleted `artist` profiles, owner-only select/insert/delete/update(note), explicit grants; optional `archive_project_profiles` only if D6 is accepted.
4. Availability projection: self-scoped RPC returning `(work_id | profile_id, available boolean)` only for the caller's own rows.
5. Every new/changed policy, grant and function needs per-migration pgTAP coverage markers (`docs/DEV_ENVIRONMENT.md`) and an updated F2 ACL contract (`tests/public-table-acl.test.mjs` / pgTAP catalog test), with intended and wrong actors (other curator, Artist of the saved Work, anon, suspended account).

Frontend:

1. Pure perspective resolver (roles + managed profiles → available/active perspective) with unit tests; `dashboard-context.mjs` identity label per perspective.
2. Curator Dashboard variant and dual-role switch; artist Dashboard unchanged.
3. SELECTOR: note editing, unavailable placeholders, ARTISTS scope, COMPARE; Profile `[ SAVE ARTIST ]`.
4. Hide `[ PUBLISH TO CURATED ]` until the CURATED stage (D7).
5. `data/contextual-help.mjs` updates for Dashboard (curator), SELECTOR, Profile and Work contexts.

## 5. Implementation sequence

Each stage is small, reviewable and independently releasable; LIVE validation follows the current manual process while BETA is parked.

| Stage | Scope | Acceptance |
|---|---|---|
| C0 Decisions | Peer answers §7 D1–D8. | Answers recorded in `DECISIONS.md`; this doc updated. |
| C1 Admission + identity | Curator invite (Admin Console, Edge Function, DB provisioning of draft curator profile + owner membership, plan intent). | pgTAP: curator invite yields `private_member` + `curator` roles, one draft curator profile, owner membership, no Artist profile; cannot create Works/Presentations or publish the profile; Artist invite unchanged. Migration replay + full pgTAP + `npm run test:migration-security` green. Invited curator completes password setup and reaches Dashboard without `PROFILE SETUP REQUIRED`. |
| C2 Perspective + navigation | Perspective resolver, Curator Dashboard, dual-role switch, hide CURATED publish UI, contextual help. | Unit tests for resolver (artist-only, curator-only, dual, none). Artist Dashboard/onboarding regression tests unchanged. Switch never changes data access. Desktop, ~390px and ~320px checks. |
| C3 Work research | Notes on saved Works and Project items, unavailable placeholders, COMPARE. | pgTAP: owner can read/write own notes; other accounts, the Work's Artist and anon cannot; suspended account denied; unpublish → placeholder without metadata; purge cascades. UI: no `innerHTML` with notes, no crop, CHAINED SELECT excludes notes. |
| C4 Saved Artists | `archive_profile_items`, Profile `[ SAVE ARTIST ]`, SELECTOR ARTISTS scope, optional Project Artists (D6). | pgTAP: only published Artist profiles insertable; owner-only; unpublished Profile → placeholder; saving does not create a follow and is invisible to the Artist. |
| C5 Validation | Focused security review of new grants/functions; LIVE validation with one invited curator; `USER_TESTING.md` notes. | Recorded in `CHAINED_STATE.md`; open items moved to `ROADMAP.md`/`BUGS.md`. |
| Later | CURATED publication, curator public Profile/Presentations, collaboration, curator onboarding intro. | Separate designs. |

## 6. Future CURATED from private research

- CURATED remains a deliberate, separate publication step from a private research Project by an eligible published curator/institution profile; it is never the curator role itself and never automatic.
- Before CURATED is opened, reconcile the existing precursor with the `DECISIONS.md` contract: ≥3 visible Works, chosen cover Work, optional intro/essay/sources, DRAFT/PUBLISHED, silent disappearance of unpublished Works, auto-unpublish below 3, Following-once, APPEARS IN with Artist-side hide.
- Decide whether published CURATED is a live projection of the private Project (current code) or a published snapshot with its own ordered items (re-publish to update). Private notes, Tags and unavailable placeholders never become public either way.

## 7. Open decisions for Peer

- **D1 Curator plan intent:** curator invitations default to `UNCHAINED` today. Recommendation: complimentary `CHAINED` for trusted curator invites, consistent with Artists.
- **D2 Curator profile at admission:** provision a DRAFT curator profile in C1 (recommended) or defer profiles until CURATED.
- **D3 Workspace eligibility:** keep notes/saved Artists/COMPARE available to every workspace account (Artists benefit too; recommended) or make them curator-only. Separately, whether `UNCHAINED` accounts should lose SELECTOR write access to match `DECISIONS.md`.
- **D4 One shared SELECTOR for dual-role accounts** (recommended) versus per-perspective partitioning.
- **D5 Notes:** where notes live (recommended: saved Work, Project item, saved Artist) and the length limit.
- **D6 Project Artists:** allow Artists without a chosen Work in a Project (shortlist) in C4, or derive Project Artists only from its Works (smaller).
- **D7 Existing CURATED precursor:** hide `[ PUBLISH TO CURATED ]` until the CURATED stage (recommended), and later choose live projection vs snapshot.
- **D8 Review states:** none in v1 (recommended) versus a private per-item mark such as SHORTLIST/EXCLUDED.

## 8. Out of scope for CURATOR v1

- Uploading external artists, Works or images; moodboards; web clipping.
- Public CURATED launch, curator public Profile page, curator-owned Presentations/Agenda/CV/Press.
- Collaboration, shared Projects, comments, team roles, invitations to Projects.
- Messaging, notifications to Artists, counts or any signal that a Work/Artist was saved.
- Sections/nesting inside Projects, tasks, deadlines, project management.
- Delegated access to Artist data, requests to Artists, unclaimed Artist creation by curators.
- New search/recommendation engines, relationship discovery beyond FIND ARTISTS.

## 9. Interfaces INSTITUTION/GALLERY must not be blocked by

- Perspective resolver and Dashboard switch must be a list of perspectives (ARTIST, CURATOR, INSTITUTION), not a boolean.
- Research authorization stays behind `can_manage_archive_project` so profile-owned/team Projects can be added; research RLS must not hard-code `profile_type = 'curator'`.
- `institution` profiles are already eligible CURATED publishers; keep CURATED publication keyed by publisher profile + `profile_members`, not by account role.
- Curator admission must reuse the generic role/profile provisioning shape so institution provisioning (one owner, team members, public subtype) can follow.
- Gallery delegation, unclaimed Artists, claims and REQUESTS remain the existing parked designs in `DECISIONS.md`.
