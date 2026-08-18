# CHAINED — CURRENT STATE

Last updated: 2026-08-18

## NOW

Current focus: small visual/mobile polish before returning to larger product work.

### Auth UX rollout

- Frontend auth is password-first: email + password login, Forgot password, and one invite/recovery password-update route.
- Magic-link login remains an invitation-only fallback; no public signup exists.
- Hosted redirect allowlist, invite redirect and recovery configuration are deployed and validated in production.

### Mobile visual polish

- Archive mobile: only SINGLE and GRID; the former SUPERGRID presentation is now the mobile GRID (validated).
- Former mobile SUPERGRID layout is now the validated mobile GRID presentation.
- Mobile-only change; desktop/tablet Archive views must remain unchanged.
- Archive, Discover NOSY and Following mobile mixed-ratio GRID images are centered and balanced without crop/stretch (validated).
- PROFILE mobile name-to-navigation spacing is compact (validated).
- Add slightly more whitespace between `<CHAINED>` and the mobile navigation across pages.
- Discover SINGLE mobile is good and must not be changed.
- Dashboard/Works mobile spacing is currently good.
- Public Profile mobile spacing is currently good.

## DONE — IMPORTANT INFRASTRUCTURE

- Production auth / accounts / RLS operational.
- Work upload, finalize, publish, unpublish and delete-image operational.
- Browser uses current Supabase publishable key.
- Edge Functions use current Supabase secret/publishable key system.
- Legacy anon + service_role API keys disabled.
- Authorized private-media gateway is live; private previews and Portfolio Export are production-validated.
- Strict private Storage policy remains unchanged.
- Portfolio Export v1 is functional.
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
