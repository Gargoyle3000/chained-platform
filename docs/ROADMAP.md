# CHAINED — ROADMAP

Last updated: 2026-08-31

## POLISH

- Archive SINGLE / GRID should gain the same proven swipe interaction as Discover and Following, while preserving existing view behavior, image ratios, and layout.
- Implement circular media-carousel navigation: last → next returns to first, and first → previous returns to last.
- Add Agenda `[ ALL ]` and `[ FOLLOWING ]` views.
- Use normal prose capitalization and conjunctions for user-facing metadata values, rather than system-style uppercase conjunctions.
- Refine Work detail so a single image prefers a fixed/non-scrolling presentation where the viewport permits it, while multiple images remain scrollable/swipeable and metadata stays accessible on smaller screens.
- Investigate a possible cover-image deletion/state issue observed during testing: non-cover images appeared to delete immediately while the probable cover remained visible until `SAVE AS DRAFT`. This is an observation/hypothesis, not a confirmed root cause.
- Improve stale soft-deleted Work UX: a locally stale save currently collapses `THIS WORK IS NOT AVAILABLE` into generic `WORK COULD NOT BE SAVED`. This does not block private-preview rollout.
- Add an optional, compact `[?]` GUIDE / HELP layer. It should be system-oriented and context-aware (for example Work publication, Archive privacy/projects/tags, or Profile draft/published state), with a possible central GUIDE entry from Settings/navigation. No mandatory onboarding or tutorial.
- Clarify the valid state where a Work is published while its owner profile remains draft/private, for example `WORK PUBLISHED · PROFILE STILL PRIVATE [?]`, optionally linking to Settings. Never auto-publish the profile as a Work-publication side effect.

- Video support direction: support video and video documentation without changing the still, image-led feed. Every video Work requires a cover still for Discover, Following, GRID, Archive overviews and relevant exports; no autoplay or moving thumbnails. Playback belongs on Work detail, with mixed media (for example `IMAGE · IMAGE · VIDEO · IMAGE`) supported later. Prefer external hosting/embed for v1; managed video infrastructure can follow if scale warrants it.

- Mobile dashboard:
  - Show 10 recent Works / Presentations initially.
  - If more than 10 exist, show `[ LOAD MORE ]`.
  - Each click reveals 10 more.
  - No infinite scroll.
  - Desktop internal-scroll behavior stays unchanged.

## PRIVATE PREVIEW DERIVATIVES — DEPLOYED

Before Portfolio image selection, add one lightweight private screen-preview rendition per Work image.

- Originals remain untouched in private `work-originals` and continue serving `pdf_export`; Phase 4 publication copies use verified public derivatives.
- A deterministic sibling object (likely `preview.webp`) serves editor/Dashboard previews and later visual selectors through the existing authorized gateway.
- The browser contract remains `imageIds + purpose`; `preview` resolves the derivative and `pdf_export` resolves the original.
- Prefer client-side generation while the upload File is already present; do not add a second authorization system.
- New images become `ready` only after trusted validation of both original and preview.
- Deletion removes original, preview, and any public derivative copies.
- Existing images require a bounded controlled backfill. A temporary preview-to-original fallback may be used only during that transition and must then be removed.

Preferred sequencing:

1. Backend/Storage foundation: deterministic path, reservation authorization, finalization, deletion, gateway routing, and security tests.
2. Browser generation/upload, retry behavior, and validation alignment — implemented, deployed, and production-validated for JPEG and transparent PNG smoke coverage.
3. Controlled backfill, coverage verification, and fallback removal.

The broader browser/device compatibility matrix remains future hardening; production validation does not imply every browser or platform has been tested.

Implementation should verify the largest real preview display and HiDPI needs before freezing dimensions/quality. Reconcile the current editor validation mismatch (approximately 25 MiB and no AVIF versus the service/backend 50 MiB and AVIF support) during that work.

## PORTFOLIO EXPORT

- Per selected Work, choose `ALL IMAGES` (default) or `SELECT IMAGES` for the export session only. Selection does not modify the Work or stored images, keeps one metadata/index entry, and preserves existing multi-image numbering semantics.
- Implement only after private previews are established; selectors use `purpose: preview`, and only chosen IDs proceed to `purpose: pdf_export`.

## AFTER FIRST TESTERS

- Archive / Project PDF export using the same Portfolio renderer.
- Publications as a separate future profile/content object, not a Presentation: overview of titles, then a dedicated detail page with multiple images, fixed context, and optional publication metadata.
- Optional external profile `SHOP` link only; no CHAINED commerce, products, prices, carts, checkout or payments.
- Import.
- People / Search / CHAINED relationships.
- Cloudflare Pages + clean routes.
- Further desktop/tablet polish.

## COMPLETED / LIVE

- Quiet multi-image Work browsing is live on Discover, Following and Public Profile only: swipe on mobile and drag/grab on desktop, with no persistent carousel chrome. Work detail remains the full image sequence; current card geometry, natural ratios, containment, and lazy secondary-image loading are preserved.
- Phase 4 public image derivatives are live: verified new Works publish exact WebP SMALL (960px maximum long edge) and LARGE (3200px maximum long edge) renditions. SMALL serves public grid/feed contexts, LARGE serves strict Work detail paths, originals remain private, and legacy public paths continue without a bulk backfill.

## OPTIONAL LATER POLISH

- Allow the image to visually track a horizontal drag before settling to the next or previous image. This is optional interaction polish, not a bug or a prerequisite for private preview derivatives.

## PRODUCT DIRECTIONS TO IMPLEMENT

- Build the optional page GUIDE overlay and one-time first-login introduction; finalize copy in the sitewide copy audit.
- Add persistent Profile publication status and the one-time Work-published/Profile-private explanation without changing visibility rules.
- Implement external Vimeo-first video on Work detail: still selection, duration, mixed media, playback lifecycle and still-based PDF representation.
- Implement CHAINED/CHAINED+ limits, upgrade handling and technical abuse ceilings while preserving existing content at limits.
- Add account-type support for UNCHAINED, ARTIST, INSTITUTION teams/subtypes and CURATOR access, with invitation/admission and APPLY/FIRST CHAIN flows.
- Extend CURATED with ordered Works, cover, optional text, privacy-aware unpublishing and Following integration.
- Add the future system-only notification layer and explicit action-required/informational event handling.
- Implement shared Presentations with participant Work links, external identities, documentation images, aliases and claim/merge support.
- Implement Agenda moments, standalone events, cancellation, geography and structured time behavior without RSVP or location permissions.
- Add Publications as a separate documented object with representative images and external links, not hosted PDFs.
- Extend Projects with ordered Work sets and export/select/share workflows, plus tier limits; keep Tags freeform and filter-oriented.
- Add human-reviewed profile claim flows and Artist-controlled APPEARS IN visibility controls.
