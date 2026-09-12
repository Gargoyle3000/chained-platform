# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-12

## CV Import ADD persistence

- Real PDF extraction and same-page review are now proven in production. The atomic ADD implementation exists locally but remains open until its migration/frontend release and one controlled production persistence test succeed.
- ADD must remain one profile-authorized transaction with exact duplicate protection. Imported records are ordinary manual `cv_entries` with `source_activity_id = null`; no PDF, provider metadata, unsupported section, Presentation or Agenda state may be persisted.

## Terminal Work image derivative recovery

- The Work editor now detects terminal current-source derivative failure, reports `IMAGE PROCESSING FAILED`, and keeps Publish unavailable. Recovery remains trusted service-role maintenance only; there is no reviewed artist-safe retry/reprocess contract or editor action yet. Keep this open until that narrow recovery path is authorized and validated without exposing service-role capabilities.

## Resolved incidents
- Published Work → draft preview disappearance: this did not reproduce in the stateful lifecycle fixture or read-only production audit, and has not recurred. Private source preservation through publish, unpublish and republish remains intact. The separate resolver/request error-classification defect was fixed with safe retry support.
- Work publish-processing readiness feedback: the editor now blocks Publish during processing, renders truthful processing/ready/failed states, continues bounded checking beyond the initial active window and refreshes on return. The remaining product polish is a quiet Dashboard `WORK READY TO PUBLISH` action when processing completes after navigation away.
- CV Import Edge PDF encoding: the bounded Web API `btoa()` encoder is deployed and a real production PDF completed extraction into the validated same-page review without automatic retry or duplicate provider spend.
- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
