# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-26

## Frontend carousel test assertions

- `node --test tests/public-work-carousel.test.mjs` currently fails two assertions: “every compact Work viewer uses shared circular state, controls, and contained hit areas” and “compact carousel counter precedes SELECT action on Discover, Follow, and Archive.” The failures reproduce in isolation (2026-09-26).
- The affected test and viewer behavior need focused investigation before claiming a product regression or changing the shared carousel. This is a validation blocker, not evidence that public image navigation is broken in the browser.

CV Import ADD production release/validation and an Artist-safe terminal derivative recovery path are planned work in `ROADMAP.md`, not confirmed defects in current behavior.

## Resolved incidents
- Stale soft-deleted Work save feedback: the repository's `not_found` result now remains `THIS WORK IS NOT AVAILABLE` in the editor instead of collapsing into `WORK COULD NOT BE SAVED`.
- Published Work → draft preview disappearance: this did not reproduce in the stateful lifecycle fixture or read-only production audit, and has not recurred. Private source preservation through publish, unpublish and republish remains intact. The separate resolver/request error-classification defect was fixed with safe retry support.
- Work publish-processing readiness feedback: the editor blocks Publish during processing, renders truthful processing/ready/failed states, continues bounded checking beyond the initial active window and refreshes on return. Dashboard projects only an unacknowledged current Work media-ready generation completed after the action lifecycle activated, so pre-existing READY drafts remain silent; `[ NOT NOW ]` explicitly handles that generation without creating a generic notification system.
- CV Import Edge PDF encoding: the bounded Web API `btoa()` encoder is deployed and a real production PDF completed extraction into the validated same-page review without automatic retry or duplicate provider spend.
- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
