# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-07

## Private Work preview diagnostics

- An observed Published Work → return to draft `PREVIEW UNAVAILABLE` incident did not reproduce in the stateful lifecycle fixture or recent read-only production audit: private source preservation through publish, unpublish and republish remains intact.
- The confirmed UI defect was that authorized private-preview resolver/request failures were collapsed into the same unavailable state as genuinely unresolved media. The UI now distinguishes those states and supports a safe retry; monitor for a concrete recurrence with the preserved request category.

## Terminal Work image derivative recovery

- The Work editor now detects terminal current-source derivative failure, reports `IMAGE PROCESSING FAILED`, and keeps Publish unavailable. Recovery remains trusted service-role maintenance only; there is no reviewed artist-safe retry/reprocess contract or editor action yet. Keep this open until that narrow recovery path is authorized and validated without exposing service-role capabilities.

## Resolved incidents

- Work publish-processing UX: an authenticated manager-only aggregate readiness RPC now distinguishes `ready`, `processing`, `failed`, and `prerequisite_invalid`; the editor separates successful Work persistence from publication, polls processing state once every five seconds for up to two minutes, and handles the authoritative `media_processing` publish race without reporting a false save failure. Focused database, Edge, multi-image, error-boundary, and watcher-lifecycle validation passes.
- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
