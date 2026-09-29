# CHAINED — CURRENT STATE

Last updated: 2026-09-28

## CURRENT SYSTEM

This file distinguishes repository implementation from production validation where they differ. Remaining priorities are in `ROADMAP.md`.

### Auth UX rollout

- Frontend auth is password-first: email + password login, Forgot password, and one invite/recovery password-update route.
- Magic-link login remains an invitation-only fallback; no public signup exists.
- Hosted redirect allowlist, invite redirect and recovery configuration are deployed and validated in production.
- The trusted Artist invitation journey is production-validated end-to-end: Admin Console → transactional invite → password-update → Dashboard → ordinary password login. The disposable production test account and its related Auth, account, profile, membership, invitation and test-audit data were removed after validation. The first external Artist, Koos De Vries, completed account setup and reached active use on 2026-09-27; he uploaded real Works with images after the Agenda Storage predicate grant was deployed. Session observations are recorded in `USER_TESTING.md`.
- Trusted account invitations expire after 12 hours in both the database default/approval fallback and Supabase Auth invite/OTP configuration.
- An invite-only Auth session without a password cannot enter Dashboard: the self-scoped `current_account_has_password()` guard redirects to `password-update.html`, and password creation is rechecked server-side before Dashboard access.
- The local onboarding foundation stores an account-level integer acknowledgement version: existing accounts are grandfathered at v1, while accounts created after the migration start at 0. Only self-updates of this preference are permitted; it is never an access or publication gate. A seven-step first-login dialog is implemented on Dashboard for active, password-ready Artists with an owned claimed Workspace and version below 1. SKIP, FINISH and Escape acknowledge v1; failed writes allow retry or page-only dismissal. The acknowledgement migration is deployed to production; the Dashboard dialog remains undeployed and has not been production-validated.
- Root `/` is a quiet session-aware CHAINED splash/router: active sessions continue to Dashboard; anonymous or unavailable sessions continue to the separate timeless, headerless public intro. The intro retains its `[ DISCOVER ]`, `[ AGENDA ]` and `[ PRIVATE ACCESS ]` routes; Discover retains its minimal `<CHAINED>` / `[ LOG IN ]` header. The root router does not intercept direct routes and implements no onboarding.

### Validated frontend polish

- Selector mobile: only SINGLE and GRID; the former SUPERGRID presentation is now the mobile GRID (validated).
- This view change is mobile-only; desktop/tablet Selector views remain separate.
- Selector, Discover NOSY and Following mobile mixed-ratio GRID images are centered and balanced without crop/stretch (validated).
- SELECTOR now combines automatic Works from directly managed Artist Profiles with explicitly saved published Works from other Artists. ALL, PERSONAL and SAVED are derived source scopes above user-created Tags; Projects can mix both sources. Managed Works remain available across draft/Profile publication states, use management-authorized private previews where public media is ineligible, and support ordered Projects without duplicating Work records; revocation, Profile deletion or Work deletion removes automatic membership.
- PROFILE mobile name-to-navigation spacing is compact (validated).
- Discover SINGLE mobile is good and must not be changed.
- Dashboard/Works mobile spacing is currently good.
- Public Profile mobile spacing is currently good.
- Mobile Portfolio PDF download works in Android Chrome production; the cross-browser download helper is live.
- Photo Corrector exists as a standalone tool; the planned eligible-account Dashboard TOOLS entry and dedicated tool view are not implemented.
- Anonymous Discover uses a minimal `<CHAINED>` / `[ LOG IN ]` header; Private Access uses `[ DISCOVER ]`.
- Management pages use the static `+` / `PROFILE LOADING` / `ARTIST ACCOUNT` identity; the interactive global Dashboard link displays `[+]` and still opens `dashboard.html`.
- Portfolio Export uses immediate disabled `EXPORTING…` progress and final `PORTFOLIO READY` status.
- Management language uses concise `WORKS`, `PRESENTATIONS`, and `AGENDA` headings.
- Compact multi-image browsing is live on Discover, Follow, Public Profile and Selector: these viewers use the same circular current-image state and compact green accessible `< current/total >` navigation, while preserving swipe/drag and keyboard browsing. The shared CSS now honors the controls' `hidden` state for one-image Works; post-deployment visual verification remains pending. Selector secondary images remain lazily resolved through its existing strict public projection; Project, Tag and export state is unaffected. Public Work Detail intentionally renders all ordered images vertically for close viewing/comparison and has no carousel. The control is UI-only and never enters exports.
- Discover NOSY and Follow progressively append their existing deterministic batches as an unobtrusive end sentinel approaches. Follow retains its cursor RPC; Discover retains its bounded, artist-spread candidate ordering. Dashboard mobile `[ LOAD MORE ]` remains unchanged.
- Dashboard mobile initially shows 10 recent Works and 10 recent Presentations per independent list; `[ LOAD MORE ]` reveals 10 at a time. Wide desktop retains independently scrolling latest lists; the intermediate-width latest section stacks and uses normal page flow.
- In the repository, Latest Updates stacks at 1880px and below, with flexible Work titles and right-aligned no-wrap status above mobile width. Desktop page scrolling uses a native 6px green scrollbar and wide Dashboard lists use native 2px compact scrollbars. A 3px transient green page-position indicator is implemented for coarse-pointer viewports at 700px and below; real-device/live validation remains open.
- New-Artist empty states are quiet and functional: Works, Presentations and Agenda retain direct add actions; CV and Press retain their inline add forms; Selector stays a neutral empty private workspace; and Dashboard hides REQUESTS until an action or a real failure needs attention. Draft profiles remain outside public visibility.
- Signed-in users can access permanent user-invoked contextual `[ ? ]` help throughout relevant CHAINED routes, including Dashboard/Artist workspace and public/network-facing Discover, Follow, Profile, Work, Agenda and Presentation views. The quiet fixed bottom-left utility uses one compact route-specific THIS PAGE / EDIT HERE / CONNECTED TO popup; it is authenticated-only for now, non-navigational, never opens automatically, and `[ ? ]` toggles it open or closed.
- A local ARTIST SEARCH page is linked from Discover and searches only claimed, published Artist Profiles by display name or slug through the existing public `public_profiles` RLS boundary. It selects only names and slugs, links to canonical Profile routes, and does not search accounts. Production release and validation remain pending; broader relationship discovery is later work.
- Published Works can be removed directly from WORKS through `[ DELETE ]` → `[ CONFIRM DELETE ]`; the backend unpublishes, recalls exact public derivatives, and soft-deletes only after cleanup succeeds. A cleanup-pending retry resumes the same lifecycle.
- Public Presentation detail and the v2 trust layer are live. Profile lists use canonical detail links; public detail includes core metadata, optional description/external URL, safe participants, accepted visible Works and Program. Management context, participation consent and Dashboard REQUESTS support co-operator invitations and Work proposals. Presentation documentation/gallery media remains future work.
- The local Presentation editor now uses the shared Work-form layout and sequential base/context/management sections. New drafts explain that related context follows first save; after creation the editor keeps the persisted ID and URL, loads the saved record, and refreshes Participants, Works, Agenda image, Program and co-operator context. Existing public Works are added through Artist selection and the current proposal contract; their records remain Artist controlled. Signed-in visual and first-save checks remain pending.
- Dashboard derives a quiet `WORK READY TO PUBLISH — <TITLE>` action only from a managed Work media-ready generation completed after this narrow lifecycle was activated and not explicitly handled by that account. Existing READY drafts remain silent. `[ DETAILS ]` opens the Work editor without mutation; `[ PUBLISH ]` rechecks readiness and uses the trusted Work publish operation directly, then reconciles the server-backed ready list. `[ NOT NOW ]` acknowledges only the current generation. The action disappears on acknowledgement, publication, deletion, lost management or obsolete media, and a later current ready generation can create a new action. Publication under a draft Profile leaves the Work publicly hidden and is explained inline. Signed-in production validation of the two-path flow remains pending. This is a narrow Work lifecycle, not a generic notification, counter, badge, inbox or read/unread system.
- The Work editor shows `NEW WORK`, `DRAFT` or `PUBLISHED` status with Publish / Unpublish beside it instead of visibility radios. Saved drafts also offer Publish beside Save Draft at the form end; both entry points use the same publication flow, and the bottom action returns attention to the top status/feedback. Published Works keep only Save Changes at the bottom. Ordinary Save Draft / Save Changes preserves publication state; Publish remains subject to existing validation and media readiness. `[ NEW WORK ]` appears near the top only after a successful save and completion of every browser upload/finalization, with no unsaved changes or media failure; independent SMALL/LARGE processing may continue. It opens the canonical new editor without publishing the previous Work. A published Work under a draft Profile shows that it is not yet publicly visible, with a one-time explanation after publication. Dashboard DETAILS still opens this editor.

### Exports

- DIRECT CHAINED SELECT is live: an active Selector Project opens one export-local image picker and then generates/downloads the PDF directly. It freshly revalidates Project membership; managed own Works use direct-management-authorized private originals, while explicit external saves use strict canonical public LARGE derivatives. Search, Tag and filtered Selector states do not define a CHAINED SELECT.
- Automatic managed Works, including drafts and unpublished Works, participate in private Project export without publication. External saved Works remain subject to public Work/Profile/media eligibility.
- CHAINED SELECT is limited to 20 Works / 40 selected images, has a 19 MiB target and 20 MiB hard maximum, preserves its deterministic artist/year/title/image ordering, and never falls back to private media or legacy JPGs.
- CHAINED SELECT uses CHAINED green only for its cover identity, selector name and artist names. Its index no longer prints raw Work URLs.
- Portfolio uses the same export-local picker principle while retaining its separate authorized private-original `pdf_export` path and neutral PDF styling. Picker previews use authorized private previews, are cached for the lifetime of the picker, and are revoked when it closes.
- CV Export v1 is implemented locally pending release: Dashboard CV enters a same-page temporary selection mode whose defaults mirror `is_visible`; it uses the existing CV ordering, generates a text-based CHAINED PDF and reuses browser-local share/download delivery without database, Storage or provider mutation.

### Recently completed interaction and delivery work

- Agenda occurrences now link eligible public parent Presentations through `presentation.html?id=<activity_id>`; standalone or ineligible occurrences remain unlinked and external URLs remain separate.
- Public Agenda now has `[ ALL ]` and authenticated `[ FOLLOW ]` as the first controls in its navigation column, directly above `FILTER BY CITY`. FOLLOW is a single self-scoped public-visibility projection of actually followed profiles; it is not a separate follow model or notification feed.
- The deployed Presentation-scoped Agenda image system uses `presentation_agenda_images`, a verified dedicated image flow, and one explicit eligible `representative_work_id`; priority is dedicated image → representative Work → text-only, with no inferred first linked Work. Its service-role-only wrappers and public ALL/FOLLOW thumbnail projection validate canonical published Work SMALL paths. Standalone Agenda items remain text-only.
- Agenda-image controls live primarily in Dashboard → Agenda → edit; the Presentation editor shares the same controller. Public representative-Work thumbnail rendering is visibly confirmed in production, and the public Agenda row is DATE → THUMBNAIL → EVENT TEXT → TIME / VENUE. Final controlled production smoke verification of the dedicated-image upload/finalize path remains pending.
- Presentation Work associations are reversible from Presentation edit through the existing trusted removal contract; removal affects only the association and leaves Work, media, publication, Selector membership, Portfolio, participants and Agenda/Program state intact.
- Mobile CHAINED SELECT and Portfolio PDF delivery is explicit and browser-local: PDF READY precedes user-triggered SAVE / SHARE or DOWNLOAD, with no forced viewer/new-tab behavior.
- Selector interaction polish is live: SINGLE is centered, active Projects toggle off through the normal cleanup path, Tag toggle behavior is covered, and Work management menus retain explicit event boundaries. No horizontal Selector browsing or scrollbar architecture was introduced.

## DONE — IMPORTANT INFRASTRUCTURE

- Production auth / accounts / RLS operational.
- Work upload, finalize, publish, unpublish and delete-image operational.
- Browser uses current Supabase publishable key.
- Edge Functions use current Supabase secret/publishable key system.
- Legacy anon + service_role API keys disabled.
- Authorized private-media gateway is live; private previews and Portfolio Export are production-validated.
- Strict private Storage policy remains unchanged.
- Portfolio Export v1 is functional.
- Portfolio Export uses `EXPORT PORTFOLIO`, local monotonic progress, disabled `EXPORTING…` feedback, and a final size/tier status.
- Selector and ordered Projects are implemented; the existing CURATED surface does not yet provide the planned published Curator/Institution Project and Presentation model.
- Discover + Following implemented.
- Mobile core flows usable.
- Work metadata uses structured MEDIUM and one comma-separated MATERIALS field; legacy material fields are unified on read and migrated when that Work is saved.
- Artist workspace provisioning is live: a fresh official artist invite receives a managed profile, can create a draft Work, finalize images, publish the Work, and publish the profile through Settings.
- Trusted Artist admission now carries server-derived, invitation-immutable `CHAINED` plan intent. Existing-account complimentary upgrades are active-admin-to-active-account, service-only, upgrade-only and audited; the plan is not billing, a payment state or a publishing-approval flag.
- `invite-account` keeps strict origin CORS while allowing the standard Supabase client headers, and records only privacy-safe stage/status diagnostics for unexpected internal failures. Its least-privilege Artist-slug lookup has `service_role` SELECT only on `public_profiles.id`, `slug` and `deleted_at`, never table-level SELECT.
- Targeted production security validation found anonymous and cross-account private-media access denied without URL leakage; an existing session loses protected access immediately when its account is suspended and regains it after reactivation. The fresh artist invite → workspace → Work → images → publish → profile-publish flow is also validated. A broader pre-beta security review remains open.
- Phase 4 public image derivatives are live: verified Works publish exact WebP SMALL and LARGE renditions, SMALL serves public grid/feed contexts, LARGE serves strict Work detail paths, originals remain private, and legacy public paths remain compatible.
- Strict publication requires current-source READY SMALL and LARGE derivatives. Public visitors do not receive `work-originals` or `work-derivative-staging` objects.
- The shared VP8 parser's width/height endian bug is fixed and covered by regression tests. Trusted terminal-failed current-source derivative recovery exists without fabricating READY state or bypassing broker validation.
- The controlled legacy migration is complete: 35/35 backfill-created jobs reached READY, zero active eligible legacy images remain without a lifecycle, and one image under a soft-deleted Work remains intentionally excluded. Existing published Works retained their audited visibility, revisions and public-media state; HEDO MAXXING II was successfully republished through the strict lifecycle.
- Active old and new Works now use the same derivative publication contract. The last documented temporary production smoke environment/key needs a current-state check and cleanup/revocation if still present.
- The one-time legacy public-media promotion is complete: 9 published Works / 29 images now have canonical SMALL and LARGE publication derivatives. Historic legacy objects remain only for cleanup compatibility; promotion is idempotent and did not alter publication, Selector, Project or Presentation relations.

## CURRENT HANDOFF

- Production is stable after the Phase 4 public-image derivative rollout.
- Private preview frontend implementation is deployed and production-validated: the browser generates a fixed private WebP derivative before reservation, uploads both server-reserved objects, and finalizes them together. Production smoke covered JPEG and transparent PNG images, including full and partial alpha. Broader browser/device matrix validation remains future hardening.
- Controlled private-preview backfill remains open where still needed; it is separate from the completed public-derivative legacy migration.
- CV Import extraction and same-page review were production-validated. The extraction Edge Function currently requires the authenticated user ID in the `CV_IMPORT_BETA_USER_IDS` secret allowlist; a real Artist's access worked after manual inclusion. The atomic ADD path exists locally but its production persistence has not been validated or released. CV Export is also implemented locally pending release. Neither ADD nor CV Export is recorded here as production-live.
- Protect the authorized private-media gateway, PDF export, Phase 4 public derivative behavior, and current Discover/Following/Profile geometry.
- Optional drag-follow carousel animation is future polish, not an active bug.
