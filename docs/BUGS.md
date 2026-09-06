# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-06

## Work / media lifecycle regression

- Published Work → return to draft can leave an image/preview unavailable (`preview unavailable`).
- Investigate the publish → draft media-state transition, preservation/restoration of private original and private preview references, and interaction with the public/private derivative lifecycle.

## Resolved incidents

- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
