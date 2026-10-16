# CHAINED — ROADMAP

Last updated: 2026-10-16

This is a priority map for remaining work, not a deployment record or fixed calendar. Current implementation and deployment status belong in `CHAINED_STATE.md`; established contracts belong in `DECISIONS.md`. Most NOW items are release/validation of existing implementation, not missing features. A commit on `main` is not evidence of external deployment.

## NOW

### Local / pending release

Implemented in the repository; not recorded as released or production-validated.

- Dashboard onboarding frontend (seven-step first-login dialog). After release, smoke-test with the next genuinely new eligible Artist through the normal invitation and password setup: the dialog opens on first Dashboard load, NEXT / BACK work, FINISH or SKIP persists acknowledgement, it does not reopen after logout and ordinary login, and permanent contextual `[ ? ]` help stays separate. Do not reset an existing account's acknowledgement version to simulate a new Artist.
- Revised Presentation editor. After release: signed-in first save and persisted context at desktop and narrow mobile widths.
- CV Import atomic ADD. After release: one controlled production persistence check by an authorized account. Extraction and same-page review are already production-validated (see PRE-BETA for eligibility and accounting).
- CV Export v1. After release: signed-in production check of selection mode and PDF generation/delivery on desktop and mobile.
- Discover FIND ARTISTS lookup. After release: production check that only claimed, published Artist Profiles appear.

### Production validation

- Dashboard DETAILS, direct PUBLISH and draft-Profile feedback: signed-in check; preserve publication validation and truthful processing state. (The Work editor's readiness feedback is already validated.)
- Discover/Follow GRID request volume and SMALL selection: anonymous production network check. Continue targeted Profile, Selector and Presentation delivery measurements before considering a reduced-bandwidth mode.
- Dedicated Presentation-scoped Agenda image upload/finalize path: controlled production smoke. (Representative-Work Agenda thumbnail delivery is already validated.)
- One-image carousel: production smoke that one-image Works show no `< current/total >` control on Discover, Follow, Public Profile and Selector.
- Mobile/responsive polish: live checks of Dashboard intermediate widths and the transient mobile page indicator on real devices; short sitewide desktop/narrow-mobile pass. Retain known good Discover SINGLE and original artwork ratios.

### Product decisions and reconciliation

- **Publish-intent contract/code discrepancy (unresolved):** `DECISIONS.md` requires retaining a user's Publish intent and automatically continuing after media READY, but current code returns during processing and later only refreshes controls/feedback. Peer must choose whether to implement retained automatic intent or revise the decision. The code describes current behavior; `DECISIONS.md` records the established contract and is intentionally unchanged. No product direction is chosen by this docs sync.
- Optional: evaluate a direct canonical NEW WORK route that preserves Presentation return/association context without changing authoritative Work ownership. Independent of the Presentation editor release validation above.

## PRE-BETA

- Finish controlled private-preview backfill and coverage verification, then remove any temporary original fallback. Validate the remaining browser/format/HiDPI matrix for editor image handling: real display and HiDPI needs and a broader browser/device set, including formats such as AVIF where relevant. Reconcile editor and backend limits only if validation shows a gap.
- Measure Work derivative queue wait and processing separately from upload finalization through SMALL/LARGE readiness under representative 20/50/100-image bursts. Calibrate worker capacity, polling and long-processing thresholds from measurements.
- Complete a focused RLS, Auth, Storage, Data API and privileged-function security review against actual trust boundaries. Security Advisor warnings on intentional service-only tables or `SECURITY DEFINER` functions require inspection, not automatic classification as defects.
- **Before 2026-10-30 (historical migration audit):** future-migration privilege intent is already codified in `DECISIONS.md`. Still open: the historical audit of every migration that creates a `public` table, recording required `GRANT`/`REVOKE` access separately for `anon`, `authenticated` and `service_role`, and a clean-replay test under the new default where practical. Preserve least privilege and RLS and avoid generic CRUD grants. Existing tables are not an emergency migration target solely because of the [Supabase default-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- Build the isolated LOCAL → BETA → LIVE release lane before wider beta: `beta.chained.work` with its own Supabase Free project/organisation initially, synthetic accounts/data, separate project refs/secrets and no Production backend access. Use a beta branch, automated tests, fixed smoke loop and reviewed promotion of the same code/migration artifacts to `main` and LIVE; retain a small production post-deploy smoke check. Assess Cloudflare Pages versus Workers with Static Assets (or another suitable Cloudflare setup) for future web delivery, and migrate LIVE off GitHub Pages before paid/commercial service while GitHub remains source/CI.
- Complete operational hardening before wider beta: production capacity and intended Supabase Pro timing, cleanup of temporary smoke credentials/environment, appropriate rate/abuse controls, stronger Admin Console security including 2FA where absent, and a privacy-safe incident/error view. Remove temporary tester analytics when that phase ends.
- Reconcile shared entity, relationship, permission and approval primitives before broader Gallery/Curator access. Resolve Gallery-created unclaimed Artist capacity, entitlement and anti-abuse boundaries so a Gallery account cannot substitute for many independent Artist accounts; retain Artist control over authoritative Works, images and approved changes.
- CV Import eligibility and accounting (open): before broader rollout, add durable account-scoped idempotency and quota/entitlement accounting; never persist source PDFs or silently create Presentations. Replace the temporary per-user `CV_IMPORT_BETA_USER_IDS` Edge Function secret allowlist with an automatic, security-conscious eligibility rule; keep authentication and an active account mandatory, determine the intended CHAINED account/profile eligibility model first, and do not expose CV Import as an unrestricted public function.
- Broader relationship discovery, Profile claiming and Gallery/Curator access beyond FIND ARTISTS remain later work.
- Define a reviewed artist-safe recovery contract for terminal Work derivative failures; the current trusted service maintenance path and truthful editor failure state do not provide an Artist retry action.

## LATER

### Tools, media and content

- Make CHAINED TOOLS an eligible-account Dashboard feature: Dashboard → TOOLS → dedicated tool view. Photo Corrector is the first concrete tool, with Crop as a later enhancement; possible other tools are PDF Compressor, Image Resizer/Compressor, Contact Sheet and perhaps PDF merge/split. Prefer client-side processing; do not store or upload media unless a specific future tool needs server processing. Tool pricing, quotas and subscriptions are undecided.
- Add Vimeo-first external video to Work detail with a required still, duration, mixed media, playback lifecycle and still-based PDF representation. Feeds and compact views remain still and image-led, with no autoplay.
- Add PUBLICATIONS as distinct objects with representative images, metadata and optional external links, connected to relevant Artists, Works and Presentations; do not fold them into Presentations or host publication PDFs.
- Extend Presentations and Agenda beyond the live association/occurrence system: documentation images, external identities and claim/merge, further Work/Presentation/Agenda crosslinks, multiple structured moments, cancellation, geography and time rules. Preserve standalone Agenda entries and independent Agenda/Presentation visibility.
- Extend private Projects beyond the existing ordered selection and CHAINED SELECT export with deliberate sharing/publication and tier constraints. Ordinary Artist Projects do not automatically become public CURATED content.

### Network and accounts

- Keep DISCOVER/NOSY centered on Works and Artist practices. Evolve CURATED around intentionally published curatorial/institutional material; eligible published Projects and Presentations may eventually participate. FOLLOW may later distinguish Artist Work activity from followed Curator/Institution Projects and Presentations. The public model and UX remain to be designed.
- Extend the initial public Profile search into deliberate CHAINED relationship discovery, with human-reviewed Profile claiming, provenance, aliases, delegated capabilities and proposed-change approval. Extend account/profile types to Gallery, Curator and Institution teams/subtypes using shared permissions; do not grant a collaborator control over another Artist's Work.
- Implement account/product limits, CHAINED/CHAINED+ upgrade handling and technical abuse ceilings without turning plan status into public rank or hiding existing content at a limit. Add a narrow system-only notification layer for action-required and informational events, without social metrics or DMs.
- Consider a Profile external SHOP link only; CHAINED does not become a commerce platform.

### Site and interaction polish

- Add GRID and SINGLE Work view modes to public Profile. Separately investigate title/Series browsing and its proper data model; identical title strings alone must not define a Series.
- Consider an optional reduced-bandwidth mode only if the normal image-delivery audit shows a need and after ordinary delivery has been optimized; its product name and behavior are open.
- Run a sitewide product-language audit, preserving deliberate CHAINED terminology while removing prototype or generic startup copy. Audit URL fields and normalize safe inputs such as `www.example.com` to HTTPS.
- Continue specific desktop/tablet/mobile geometry work only where live checks show a gap: header/navigation rhythm, Dashboard/Works top spacing, public Profile links, Discover GRID and restrained horizontal sidescroll interaction. Optional carousel drag-follow animation remains polish, not a bug.
- Consider clean routes after the current product surfaces and operational work are stable.

## COMPLETED / LIVE

- Root `/` is a session-aware centered `<CHAINED>` splash/router: active session → Dashboard, anonymous/unavailable session → public intro. Direct routes remain independent; this is not onboarding.
- Password-first invitation-only Auth, Admin Console trusted Artist invitation, password-creation guard and immutable complimentary `CHAINED` plan intent are implemented. The first external Artist completed onboarding and active use on 2026-09-27; Work image uploads were live-verified after that day's Storage privilege fix.
- SELECTOR is the private collection workspace: managed own Works, including drafts, appear automatically; external published Works are explicitly saved. ALL/PERSONAL/SAVED, Tags, mixed-source ordered Projects and direct CHAINED SELECT PDF export are implemented. Portfolio remains a separate authorized private-original export.
- Public Work SMALL/LARGE derivatives, strict publication, private preview generation/gateway and Work publish/unpublish/delete lifecycles are implemented. Public legacy derivative promotion is complete; private-preview backfill is a separate remaining task.
- Presentation management and public detail, Work associations, participants, host/presented-by semantics, manager/co-operator access, requests and independent Agenda occurrence visibility are implemented. Agenda supports standalone entries, ALL/FOLLOW, dedicated image or explicit eligible representative Work fallback, then text-only.
- Contextual `[ ? ]` is permanent, signed-in and user-invoked across relevant routes. Discover and Follow progressively append deterministic batches while scrolling; Dashboard mobile retains separate manual LOAD MORE lists.
- The repository includes Dashboard intermediate-width Latest Updates stacking and collision-safe Work rows, a native 6px desktop page scrollbar, native 2px Dashboard compact scrollbar, and a transient 3px CHAINED-green mobile page indicator. Live device checks remain in NOW.
- A repository-level security migration gate is implemented locally. Changed policy, RLS, grant/revoke, function, `SECURITY DEFINER`, Storage-policy and privileged-helper SQL requires an explicitly marked changed pgTAP regression test before frontend validation can pass; database tests remain the authoritative behavior check.
- Compact multi-image browsing is shared across Discover, Follow, Public Profile and Selector; public Work Detail intentionally retains its vertical all-image view. Dashboard's narrow Work-ready-to-publish action is implemented without a generic notification system.
