# CHAINED Local Development Environment

## Platform

- Windows
- PowerShell is commonly used.

## Repository

`C:\Users\peerv\OneDrive\Bureaublad\Projecten\computery\WEBSITE\CHAINED`

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

### Project tooling

- Supabase CLI/tooling is installed and used by this repository.
- Node.js and npm are installed and used for application and test tooling.
- Git is installed and used for repository history and GitHub integration.
- Google Cloud tooling is used for CHAINED Cloud Run, Cloud Scheduler, Artifact Registry, and Secret Manager operations; discover its current executable location before reporting it unavailable.

### Production operator notes

- Supabase CLI 2.111.0 `db query --output-format json` returns a root JSON array. Operator helpers must accept that machine-readable shape and reject mixed stdout.
- Production server/operator REST access uses current `sb_secret_` API keys. They are server/operator-only and must never enter browser/frontend code; session-local production guards and secrets must not be committed or printed.

### OpenAI / CV Import local development

- Current use is the local CV Import prototype/benchmark in the CHAINED OpenAI API project.
- The restricted Project API key is stored for the current Windows user in Credential Manager as `OPENAI_CHAINED_CV_IMPORT` (username: `CHAINED`). The local launcher injects it only as process-scoped `OPENAI_API_KEY`.
- Secret values never belong in Git, documentation, plaintext `.env` files, CLI arguments, browser code, or logs. The current key requires Responses write permission.
- The local development key and any future production key are separate credentials. A future production integration should use server-side secret handling, likely Supabase Edge Function secrets.
- The implemented, not-yet-deployed CV extraction Edge Function expects a separate server-side `OPENAI_API_KEY`, a comma-separated `CV_IMPORT_BETA_USER_IDS` allowlist, and `ALLOWED_CV_IMPORT_ORIGINS`. Do not configure real values during ordinary local validation or commit them; deployment and secret configuration require separate explicit authorization.
- The API project currently uses prepaid development billing with auto-reload disabled.

### Sensitive local development secrets

When practical, sensitive local development secrets such as API keys, private tokens, and credentials should live in the current Windows user's Credential Manager. Documentation may name the secret identifier, required permission, runtime variable, and setup instructions, but never its value. This convention does not apply to ordinary non-secret configuration.
