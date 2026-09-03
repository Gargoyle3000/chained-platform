# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-09-03

## Published Work deletion flow

- A published Work cannot currently be deleted directly from WORKS even though DELETE is visible. The user must enter EDIT, unpublish/save as draft, return, and then delete.
- Desired: `[ DELETE ]` → `[ CONFIRM DELETE ]` in the same action position, with safe backend unpublish, exact public cleanup, and Work soft-delete.

## Presentation detail 404

- A Presentation link for Gothic Summer returned 404 from the live product. Investigate Presentation routing/detail implementation generally rather than hardcoding that Presentation.
- Anything presented as a clickable Presentation must resolve to a functioning public detail surface or intentionally not appear clickable.
