# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-08

## Private Work preview diagnostics

- An observed Published Work → return to draft `PREVIEW UNAVAILABLE` incident did not reproduce in the stateful lifecycle fixture or recent read-only production audit: private source preservation through publish, unpublish and republish remains intact.
- The confirmed UI defect was that authorized private-preview resolver/request failures were collapsed into the same unavailable state as genuinely unresolved media. The UI now distinguishes those states and supports a safe retry; monitor for a concrete recurrence with the preserved request category.

## Terminal Work image derivative recovery

- The Work editor now detects terminal current-source derivative failure, reports `IMAGE PROCESSING FAILED`, and keeps Publish unavailable. Recovery remains trusted service-role maintenance only; there is no reviewed artist-safe retry/reprocess contract or editor action yet. Keep this open until that narrow recovery path is authorized and validated without exposing service-role capabilities.

## Work publish-processing readiness feedback

- Production testing showed two readiness-feedback failures after `SAVE DRAFT`: the editor could suppress the authoritative `processing`, `ready`, or `failed` result, and the original five-second watcher stopped after its 120-second active window even when the server was still legitimately processing. The Work itself remained safely saved, but Publish could stay disabled without current feedback until a hard refresh. Keep this open until the editor always renders the authoritative stage, continues with bounded low-frequency checks after the initial window, refreshes on return to the page, and offers a truthful manual check. Required states include `CHECKING IMAGE PROCESSING`, `WORK SAVED · PREPARING IMAGES FOR PUBLISH`, `WORK SAVED · IMAGES ARE TAKING LONGER TO PREPARE`, `IMAGE PROCESSING FAILED`, or the existing prerequisite message; `READY TO PUBLISH` must enable Publish. The same behaviour applies when reopening a saved draft.

## Resolved incidents
- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
