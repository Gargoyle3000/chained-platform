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
