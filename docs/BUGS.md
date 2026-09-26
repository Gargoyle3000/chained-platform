# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-26

No confirmed active carousel defect remains. The production Discover, Follow and Selector carousels were manually checked on 2026-09-26.

CV Import ADD production release/validation and an Artist-safe terminal derivative recovery path are planned work in `ROADMAP.md`, not confirmed defects in current behavior.

## Resolved incidents
- Carousel validation assertions: two source-text checks had become stale after line-ending and conditional-action changes. The focused carousel file and full frontend suite pass after updating the tests; no product behavior changed.
- Stale soft-deleted Work save feedback: the repository's `not_found` result now remains `THIS WORK IS NOT AVAILABLE` in the editor instead of collapsing into `WORK COULD NOT BE SAVED`.
- Published Work → draft preview disappearance: this did not reproduce in the stateful lifecycle fixture or read-only production audit, and has not recurred. Private source preservation through publish, unpublish and republish remains intact. The separate resolver/request error-classification defect was fixed with safe retry support.
- Work publish-processing readiness feedback: the editor blocks Publish during processing, renders truthful processing/ready/failed states, continues bounded checking beyond the initial active window and refreshes on return. Dashboard projects only an unacknowledged current Work media-ready generation completed after the action lifecycle activated, so pre-existing READY drafts remain silent; `[ NOT NOW ]` explicitly handles that generation without creating a generic notification system.
- CV Import Edge PDF encoding: the bounded Web API `btoa()` encoder is deployed and a real production PDF completed extraction into the validated same-page review without automatic retry or duplicate provider spend.
- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
