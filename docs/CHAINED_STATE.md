# CHAINED — CURRENT STATE

Last updated: 2026-08-20

## NOW

Current focus: pre-tester security/usability review before returning to larger product work.

### Auth UX rollout

- Frontend auth is password-first: email + password login, Forgot password, and one invite/recovery password-update route.
- Magic-link login remains an invitation-only fallback; no public signup exists.
- Hosted redirect allowlist, invite redirect and recovery configuration are deployed and validated in production.
- Public entry is Discover-first: anonymous visitors browse Discover with `<CHAINED>` and `[ LOG IN ]`; Private Access returns with `[ DISCOVER ]`.

### Validated frontend polish

- Archive mobile: only SINGLE and GRID; the former SUPERGRID presentation is now the mobile GRID (validated).
- Mobile-only change; desktop/tablet Archive views must remain unchanged.
- Archive, Discover NOSY and Following mobile mixed-ratio GRID images are centered and balanced without crop/stretch (validated).
- PROFILE mobile name-to-navigation spacing is compact (validated).
- Discover SINGLE mobile is good and must not be changed.
- Dashboard/Works mobile spacing is currently good.
- Public Profile mobile spacing is currently good.
- Mobile Portfolio PDF download works in Android Chrome production; the cross-browser download helper is live.
- Anonymous Discover uses a minimal `<CHAINED>` / `[ LOG IN ]` header; Private Access uses `[ DISCOVER ]`.
- Management pages use the static `+` / `PROFILE LOADING` / `ARTIST ACCOUNT` identity.
- Portfolio Export uses immediate disabled `EXPORTING…` progress and final `PORTFOLIO READY` status.
- Management language uses concise `WORKS`, `PRESENTATIONS`, and `AGENDA` headings.

## DONE — IMPORTANT INFRASTRUCTURE

- Production auth / accounts / RLS operational.
- Work upload, finalize, publish, unpublish and delete-image operational.
- Browser uses current Supabase publishable key.
- Edge Functions use current Supabase secret/publishable key system.
- Legacy anon + service_role API keys disabled.
- Authorized private-media gateway is live; private previews and Portfolio Export are production-validated.
- Strict private Storage policy remains unchanged.
- Portfolio Export v1 is functional.
- Portfolio Export uses `EXPORT PORTFOLIO`, local monotonic progress, disabled `EXPORTING…` feedback, and a final size/tier status.
- Archive + Projects + CURATED implemented.
- Discover + Following implemented.
- Mobile core flows usable.
- Work metadata uses structured MEDIUM and one comma-separated MATERIALS field; legacy material fields are unified on read and migrated when that Work is saved.
- Git working tree clean after API-key migration.

## AFTER EXPORT

- Reuse the same PDF renderer for Archive / Project export.
- Compact pre-tester security and usability pass.
- First 1–2 external testers.

## LATER

- Import.
- People / Search / CHAINED relationships.
- Cloudflare Pages + clean routes.
- Further desktop/tablet polish.
- Additional search/filter improvements.
