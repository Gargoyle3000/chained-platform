# CHAINED — ROADMAP

Last updated: 2026-08-19

## POLISH

- Mobile dashboard:
  - Show 10 recent Works / Presentations initially.
  - If more than 10 exist, show `[ LOAD MORE ]`.
  - Each click reveals 10 more.
  - No infinite scroll.
  - Desktop internal-scroll behavior stays unchanged.

## PRIVATE PREVIEW DERIVATIVES

Before Portfolio image selection, add one lightweight private screen-preview rendition per Work image.

- Originals remain untouched in private `work-originals` and continue serving `pdf_export` and publication copies.
- A deterministic sibling object (likely `preview.webp`) serves editor/Dashboard previews and later visual selectors through the existing authorized gateway.
- The browser contract remains `imageIds + purpose`; `preview` resolves the derivative and `pdf_export` resolves the original.
- Prefer client-side generation while the upload File is already present; do not add a second authorization system.
- New images become `ready` only after trusted validation of both original and preview.
- Publish/unpublish remain unchanged; deletion removes original, preview, and any public copy.
- Existing images require a bounded controlled backfill. A temporary preview-to-original fallback may be used only during that transition and must then be removed.

Preferred sequencing:

1. Backend/Storage foundation: deterministic path, reservation authorization, finalization, deletion, gateway routing, and security tests.
2. Browser generation/upload, retry behavior, and validation alignment.
3. Controlled backfill, coverage verification, and fallback removal.

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

## LATER INTERACTION

- Quiet multi-image Work browsing on Discover, Following and Public Profile only: swipe on mobile, drag/grab and optional invisible click zones on desktop, with no persistent carousel chrome. Keep Work detail as the full image sequence and preserve current card geometry, natural ratios, containment, and lazy secondary-image loading.
