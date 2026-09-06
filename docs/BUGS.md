# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-06

## Private Work preview diagnostics

- An observed Published Work → return to draft `PREVIEW UNAVAILABLE` incident did not reproduce in the stateful lifecycle fixture or recent read-only production audit: private source preservation through publish, unpublish and republish remains intact.
- The confirmed UI defect was that authorized private-preview resolver/request failures were collapsed into the same unavailable state as genuinely unresolved media. The UI now distinguishes those states and supports a safe retry; monitor for a concrete recurrence with the preserved request category.

## Resolved incidents

- Agenda occurrence publication regression: explicit PUBLISH / UNPUBLISH and independent `show_in_agenda` / `show_in_presentation` behavior are implemented and validated; the prior Gothic Summer state was historic data plus UX ambiguity, not a public query defect.
