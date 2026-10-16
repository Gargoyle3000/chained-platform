# CHAINED Local Development Environment

## Platform

- Windows
- PowerShell is commonly used.

## Repository

`C:\Dev\CHAINED`

The former OneDrive repository at
`C:\Users\peerv\OneDrive\Bureaublad\Projecten\computery\WEBSITE\CHAINED`
is fallback/archive only and is not the active working copy.

`proofs/` exists locally in the active repository and is intentionally excluded
from Git.

### Historical / conditional Codex Desktop Git limitation

Some past Windows Desktop sandboxes denied Git writes with
`.git/index.lock: Permission denied`. Only if that error actually occurs,
continue inspection, editing, testing, and reporting, and use PowerShell for
separately authorized `git add`, commit, and push. This is not the default
workflow or a CHAINED product bug. Do not change Git permissions or configuration
as a workaround. Staging, commit, push, and deploy require explicit authorization.

## Known tooling

### Docker Desktop

Status: installed and running.

Known application path:

`C:\Users\peerv\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`

Known Docker CLI path:

`C:\Users\peerv\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`

The CLI directory may need to be added temporarily to the current shell PATH; do not infer a permanent machine PATH change from that need.

Docker Desktop provides the local Supabase stack, local PostgreSQL, and pgTAP/database tests.

Important agent rule: failure to resolve `docker` from PATH does not mean Docker Desktop is uninstalled. Distinguish software not installed, installed with a CLI absent from PATH, installed but inaccessible from the current shell, daemon unavailable, permissions issues, and actual application failures.

Runtime lane: on this Windows machine, Docker and local Supabase runtime validation (`npx supabase start`, migration replay, `npx supabase test db`) must run in the Claude SHELL lane, not Codex. Codex's sandbox ACL cannot access the per-user Docker Desktop installation. This is a tooling boundary, not a CHAINED bug; do not change the sandbox policy as a workaround.

The local stack belongs to CODE/TESTS only (code, automated tests, migration replay, pgTAP). It is not a product-validation or release environment; see the release model in `DECISIONS.md`.

### Supabase CLI link

This working copy's untracked `supabase/.temp` link points at the LIVE project ref `jjtobvxjmbnybbxlvnxs`, whose display name is `chained-development`. Linked commands such as `supabase db push` or `supabase functions deploy` therefore target LIVE. Run them only with explicit authorization and after verifying the target ref, especially once a BETA project exists.

### Project tooling

- Supabase CLI/tooling is installed and used by this repository.
- Node.js and npm are installed and used for application and test tooling.
- Git is installed and used for repository history and GitHub integration.
- Google Cloud tooling is used for CHAINED Cloud Run, Cloud Scheduler, Artifact Registry, and Secret Manager operations; discover its current executable location before reporting it unavailable.

### Security-sensitive migration gate

`npm run test:migration-security` inspects only added or modified migration files. It runs automatically before `npm run test:frontend` and requires explicit changed pgTAP coverage for policy changes, RLS mode changes, grants/revokes, `SECURITY DEFINER`, function definitions, `storage.objects` policies and privileged helper functions.

Add or update a file under `supabase/tests/*.test.sql` and include one exact marker for each security-sensitive migration:

```sql
-- Security migration coverage: 20261001090000_example.sql
```

The pgTAP test should prove the intended actor and wrong actors. Storage changes should also reject the wrong bucket, path and input metadata where applicable, and should exercise existing flows that share the table or operation. PostgreSQL may evaluate every applicable policy expression, so tests and policy design must not assume short-circuit evaluation.

By default the gate checks working-tree changes, including untracked files; with no working-tree changes it checks the latest commit. Multi-commit CI or review jobs must set `CHAINED_MIGRATION_GATE_BASE` to the target/base ref, optionally set `CHAINED_MIGRATION_GATE_HEAD`, or pass `--base` and `--head` directly. This is a static review gate and does not replace `npx supabase test db` or a clean local migration replay.

### Production operator notes

- Supabase CLI 2.111.0 `db query --output-format json` returns a root JSON array. Operator helpers must accept that machine-readable shape and reject mixed stdout.
- Production server/operator REST access uses current `sb_secret_` API keys. They are server/operator-only and must never enter browser/frontend code; session-local production guards and secrets must not be committed or printed.

### OpenAI / CV Import local development

- Local use includes the CV Import prototype/benchmark in the CHAINED OpenAI API project; production extraction status is recorded below.
- The restricted Project API key is stored for the current Windows user in Credential Manager as `OPENAI_CHAINED_CV_IMPORT` (username: `CHAINED`). The local launcher injects it only as process-scoped `OPENAI_API_KEY`.
- Secret values never belong in Git, documentation, plaintext `.env` files, CLI arguments, browser code, or logs. The current key requires Responses write permission.
- Keep local development and production credentials separate. Production extraction uses server-side Supabase Edge Function secrets.
- The CV extraction Edge Function is deployed, and extraction plus same-page review are production-validated behind the temporary per-user allowlist. It expects a separate server-side `OPENAI_API_KEY`, a comma-separated `CV_IMPORT_BETA_USER_IDS` allowlist, and `ALLOWED_CV_IMPORT_ORIGINS`. Extraction does not persist CV entries: the atomic ADD path is local and not production-live, and CV Export is local and not production-live. Do not configure real values during ordinary local validation or commit them; deployment and secret configuration require separate explicit authorization.
- The API project currently uses prepaid development billing with auto-reload disabled.

### Sensitive local development secrets

When practical, sensitive local development secrets such as API keys, private tokens, and credentials should live in the current Windows user's Credential Manager. Documentation may name the secret identifier, required permission, runtime variable, and setup instructions, but never its value. This convention does not apply to ordinary non-secret configuration.
