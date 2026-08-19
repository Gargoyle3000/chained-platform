# CHAINED — ROADMAP

Last updated: 2026-08-19

## PRE-TESTER

1. Mobile Portfolio PDF download bug: investigate Android Chrome download triggering separately; desktop export and the PDF renderer are working.
2. Logged-out Discover header: align anonymous Discover with the established logged-in header without redesigning the working header.
3. Portfolio Export copy/status polish:
   - use `EXPORT PORTFOLIO` instead of `GENERATE PORTFOLIO`;
   - provide local progress feedback and prevent repeated clicks;
   - remove the obsolete document-title error, keeping any guidance local to title-page controls.
4. Dashboard / `+` management-page exploration: reconsider visible naming and presentation without deciding on a label yet; preserve the conceptual link to the `+` navigation.
5. Mobile management/profile spacing: reduce the name-area to upper-navigation/`+` gap without changing the already-adjusted name → pronounce or pronounce → follow spacing.

## POLISH

- Mobile dashboard:
  - Show 10 recent Works / Presentations initially.
  - If more than 10 exist, show `[ LOAD MORE ]`.
  - Each click reveals 10 more.
  - No infinite scroll.
  - Desktop internal-scroll behavior stays unchanged.

## PORTFOLIO EXPORT

- Per selected Work, choose `ALL IMAGES` (default) or `SELECT IMAGES` for the export session only. Selection does not modify the Work or stored images, keeps one metadata/index entry, and preserves existing multi-image numbering semantics.

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
