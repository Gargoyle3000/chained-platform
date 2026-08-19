\# CHAINED — DECISIONS



Last updated: 2026-08-18



\## Product principles



\- CHAINED is for visual art only.

\- No likes, public view counts, follower counts or popularity ranking.

\- Return value should come from usefulness: Archive, organization, Agenda, profile and network.

\- Keep the interface calm and avoid feature overload.



\## Core structure



\- PORTFOLIO = public artist-facing output.

\- NETWORK = Discover + Following.

\- WORKSPACE = private Archive.



\- Archive is private.

\- Projects organize/select work.

\- CURATED is public output.

\- Presentations and CURATED remain separate concepts.

\- Agenda remains a separate time-based section.



\## Export



\- One fixed professional PDF layout for v1.

\- No templates, branding controls, font choice or layout modes in v1.

\- Cascadia Code is the fixed PDF font for v1.

\- No CHAINED branding inside exported PDFs.

\- Optional opening page: artist name + free title/subtitle.

\- Then selected Works in user-controlled order.

\- One image per page, natural ratio, no crop/stretch.

\- Multiple images from one Work use numbering such as 07A, 07B, 07C.

\- Metadata/index pages come after all images.

\- Missing metadata is omitted.

\- Target file size: safely below 20 MB.

\- Dashboard Works uses temporary export selection.

\- Archive/Projects must later reuse the SAME PDF renderer, not create a second export system.



\## Mobile



\- Discover SINGLE mobile is a reference layout and should not be changed casually.

\- Archive mobile should expose only SINGLE and GRID.

\- Current mobile SUPERGRID becomes the mobile GRID.

\- Desktop/tablet Archive view behaviour remains separate and unchanged unless explicitly requested.

\- Mobile mixed-ratio grids should visually balance images like desktop grids rather than align awkwardly top-left.



\## UI



\- Cascadia Code should render normally; no stretched/distorted lettering.

\- Avoid unnecessary horizontal black separators outside Agenda.

\- Do not hide major view controls inside a dropdown when they benefit from being directly visible.



\## Metadata



\- MEDIUM is the existing structured format/discipline value used for NOSY filtering and navigation; it is not shown on an individual public Work page.

\- MATERIALS is one free comma-separated field in v1, without autocomplete or a dropdown.

\- Material terms are trimmed and de-duplicated case-insensitively for display and future normalized search; legacy material fields are unified on read and migrated when that Work is saved.



\## Technical / security



\- Repository/current code is the technical source of truth.

\- Database resets are avoided unless absolutely necessary.

\- Security is a pre-tester requirement, especially RLS, Storage, auth, uploads and privileged server operations.

\- Browser uses Supabase publishable keys only.

\- Elevated Supabase credentials must never be present client-side.

\- Legacy Supabase anon/service\_role API keys are disabled.



\## Authentication

\- CHAINED admission remains invitation-only with no public signup.

\- Email + password is the primary login method; email magic link remains a secondary fallback.

\- Passwords are handled only by Supabase Auth, and adding a password preserves the existing Auth user/account UUID.

\## Public entry

\- Anonymous visitors enter on Discover with a minimal `<CHAINED>` / `[ LOG IN ]` header.

\- Private Access uses `[ DISCOVER ]` as its public return action; authenticated navigation remains separate.

