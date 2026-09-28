# CHAINED — ROADMAP

Last updated: 2026-09-28

This is a priority map for remaining work, not a deployment record or fixed calendar. Current implementation and deployment status belong in `CHAINED_STATE.md`; established contracts belong in `DECISIONS.md`.

## NOW

- Finish live checks of the current mobile/responsive polish, including Dashboard intermediate widths and the transient mobile page indicator on real devices. Make a short sitewide visual pass at desktop and narrow mobile widths; retain known good Discover SINGLE and original artwork ratios.
- Build a compact, approximately seven-step first-login introduction to the public/private model, DISCOVER and FOLLOW, SELECTOR, TAGS and PROJECTS, Artist Workspace, Work → Presentation → Agenda relationships, publication, and the existing contextual `[ ? ]`. Explain that the interactive global `[+]` enters the Workspace, how Profile and Workspace relate, and which actions are private or public. The introduction is separate from permanent help and cannot be the sole remedy for ambiguous controls; its exact UI remains open.
- Complete signed-in production validation of Dashboard DETAILS, direct PUBLISH and draft-Profile feedback after release; preserve publication validation and truthful processing state during the live check.
- Validate the revised Presentation editor with a signed-in first save and persisted context at desktop and narrow mobile widths. Evaluate whether a direct canonical NEW WORK route can preserve Presentation return/association context without changing authoritative Work ownership; the existing ADD WORK association path is now clearer.
- Validate Discover/Follow GRID request volume and SMALL selection in production after release. Continue targeted Profile, Selector and Presentation delivery measurements before considering a reduced-bandwidth mode; optimize ordinary delivery first.
- Complete the controlled production smoke check of the dedicated Presentation-scoped Agenda image upload/finalize path; representative-Work thumbnail delivery is already visibly confirmed.

## PRE-BETA

- Finish controlled private-preview backfill and coverage verification, then remove any temporary original fallback. Reconcile the editor's approximately 25 MiB/no-AVIF validation with the service/backend's 50 MiB/AVIF contract; check real display and HiDPI needs and a broader browser/device matrix.
- Measure Work derivative queue wait and processing separately from upload finalization through SMALL/LARGE readiness under representative 20/50/100-image bursts. Calibrate worker capacity, polling and long-processing thresholds from measurements.
- Complete a focused RLS, Auth, Storage, Data API and privileged-function security review against actual trust boundaries. Security Advisor warnings on intentional service-only tables or `SECURITY DEFINER` functions require inspection, not automatic classification as defects.
- Add a security-sensitive migration gate for RLS, Storage policies, GRANT/REVOKE, SECURITY DEFINER and privileged helpers. Inspect helper EXECUTE privileges; test intended and wrong actors, bucket/path/input rejection, and existing flows sharing the table or operation. Do not rely on PostgreSQL policy-expression short-circuiting. The 2026-09-27 Agenda/Work upload incident motivates this cross-feature regression gate.
- **Before 2026-10-30:** audit every migration that creates a `public` table for explicit Data API privilege intent. Record required `GRANT`/`REVOKE` access separately for `anon`, `authenticated` and `service_role`; preserve least privilege and RLS, avoid generic CRUD grants, codify this for future migrations, and test clean replay under the new default where practical. Existing tables are not an emergency migration target solely because of the [Supabase default-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- Build the isolated LOCAL → BETA → LIVE release lane before wider beta: `beta.chained.work` with its own Supabase Free project/organisation initially, synthetic accounts/data, separate project refs/secrets and no Production backend access. Use a beta branch, automated tests, fixed smoke loop and reviewed promotion of the same code/migration artifacts to `main` and LIVE; retain a small production post-deploy smoke check. Assess Cloudflare Pages versus Workers with Static Assets (or another suitable Cloudflare setup) for future web delivery, and migrate LIVE off GitHub Pages before paid/commercial service while GitHub remains source/CI.
- Complete operational hardening before wider beta: production capacity and intended Supabase Pro timing, cleanup of temporary smoke credentials/environment, appropriate rate/abuse controls, stronger Admin Console security including 2FA where absent, and a privacy-safe incident/error view. Remove temporary tester analytics when that phase ends.
- Reconcile shared entity, relationship, permission and approval primitives before broader Gallery/Curator access. Resolve Gallery-created unclaimed Artist capacity, entitlement and anti-abuse boundaries so a Gallery account cannot substitute for many independent Artist accounts; retain Artist control over authoritative Works, images and approved changes.
- CV Import extraction and same-page review were production-validated; atomic ADD exists locally. Release the authorized ADD path and perform one controlled production persistence check. Before broader rollout, add durable account-scoped idempotency and quota/entitlement accounting; never persist source PDFs or silently create Presentations.
- Replace the temporary per-user `CV_IMPORT_BETA_USER_IDS` Edge Function secret allowlist with an automatic, security-conscious eligibility rule before wider onboarding. Keep authentication and an active account mandatory; determine the intended CHAINED account/profile eligibility model before implementation. Do not expose CV Import as an unrestricted public function.
- Add a restrained public Profile/People search for eligible CHAINED identities by display name or slug. Presentation management's existing Artist association search is not a general account-discovery surface.
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
- Compact multi-image browsing is shared across Discover, Follow, Public Profile and Selector; public Work Detail intentionally retains its vertical all-image view. Dashboard's narrow Work-ready-to-publish action is implemented without a generic notification system.
