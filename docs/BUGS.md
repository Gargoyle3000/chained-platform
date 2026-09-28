# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-28

## Opaque-RGBA Work derivative rejection — local fix, production validation pending

- A verified PNG Work original (the 2026-09-28 `Green` upload) reached the derivative worker, but its SMALL/LARGE job failed on attempt 1 with `processing_failed`. The PNG has an alpha channel whose pixels are all opaque. The processor checked `metadata.hasAlpha` and rejected Sharp's valid opaque WebP as `alpha_not_preserved`; the worker's bounded failure-code list reduced that internal code to `processing_failed`.
- The local processor now uses Sharp pixel statistics once per source and requires derivative alpha only when the source contains actual transparency. Focused Linux tests cover opaque four-channel PNG, transparent PNG, three-channel PNG, and successful worker completion without a broker failure. Bounded worker diagnostics retain the internal processor code and stage without logging signed URLs or private paths.
- The processor image has not been deployed. Production validation, including the previously failed Work's separate trusted recovery path, remains open; no production retry was performed during this fix.

## Existing database-suite validation assertions

- The local full pgTAP suite still fails two older assertions in `001_chained_foundation_schema.test.sql` (fixed allowlist of public SECURITY DEFINER functions) and `020_derivative_staging_foundation.test.sql` (assumes every browser Storage policy references `work-originals`). Both predate this grant-only migration and need separate test review; the Storage INSERT behavior is covered by `039_storage_insert_policy_grants.test.sql`.

The production multi-image Discover, Follow and Selector carousels were manually checked on 2026-09-26. The one-image visibility fix below still needs post-deployment visual smoke checks.

CV Import ADD production release/validation and an Artist-safe terminal derivative recovery path are planned work in `ROADMAP.md`, not confirmed defects in current behavior.

## Resolved incidents
- One-image compact Work carousel controls (2026-09-27): Peer observed `< >` without a useful count on a one-image Work; the exact route was not recorded. Discover, Follow, Public Profile and Selector all instantiate the same controls before async image-count resolution. The shared JS marked their container/buttons `hidden`, but `styles.css` assigned explicit `display` values that overrode native hidden styling. Scoped `[hidden]` rules now keep both container and buttons out of view until multi-image resolution reveals them. Focused tests cover the CSS contract, one-image async resolution, two-image `1/2` and `2/2` controls, circular navigation and Public Work Detail's separate renderer; the full frontend suite passes. Production visual verification remains pending.
- Work image upload Storage privilege (2026-09-27): the Agenda INSERT policy called `private.can_insert_reserved_presentation_agenda_media(text,jsonb)` without authenticated EXECUTE, causing unrelated `work-originals` uploads to fail with `42501`. Forward migration `20260927082536_grant_agenda_storage_insert_predicate.sql` granted only that privilege and was applied to production on 2026-09-27. Koos De Vries, a real second Artist, subsequently uploaded Works with images successfully; the incident is live verified. Local pgTAP had reproduced the failure before the grant and passed after it.
- Carousel validation assertions: two source-text checks had become stale after line-ending and conditional-action changes. The focused carousel file and full frontend suite pass after updating the tests; no product behavior changed.
- Stale soft-deleted Work save feedback: the repository's `not_found` result now remains `THIS WORK IS NOT AVAILABLE` in the editor instead of collapsing into `WORK COULD NOT BE SAVED`.
- Published Work → draft preview disappearance: this did not reproduce in the stateful lifecycle fixture or read-only production audit, and has not recurred. Private source preservation through publish, unpublish and republish remains intact. The separate resolver/request error-classification defect was fixed with safe retry support.
- Work publish-processing readiness feedback: the editor blocks Publish during processing, renders truthful processing/ready/failed states, continues bounded checking beyond the initial active window and refreshes on return. Dashboard projects only an unacknowledged current Work media-ready generation completed after the action lifecycle activated, so pre-existing READY drafts remain silent; `[ NOT NOW ]` explicitly handles that generation without creating a generic notification system.
- CV Import Edge PDF encoding: the bounded Web API `btoa()` encoder is deployed and a real production PDF completed extraction into the validated same-page review without automatic retry or duplicate provider spend.
- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
