# CHAINED — ACTIVE BUGS / BLOCKERS

Last updated: 2026-08-18

## PRE-TESTER BLOCKER

### Private media / PREVIEW UNAVAILABLE

Status: BLOCKED / awaiting Supabase clarification

Authenticated private Work images can return `PREVIEW UNAVAILABLE`, which also prevents reliable Portfolio PDF export.

Established evidence:

- The private object, path, authenticated user, Work/image authorization, JWT, and deployed migrations/policies are valid.
- The PDF renderer is not the cause.
- Removing only `storage.allow_only_operation('object.get_authenticated')` temporarily makes private preview and PDF export work; restoring it restores the failure.
- Supabase support has been contacted.

Do not reopen broad investigation of PDF rendering, paths, missing objects, JWT/session validity, publish/unpublish lifecycle, or deletion history unless new evidence directly contradicts these findings.

This must be resolved before the first external tester.
