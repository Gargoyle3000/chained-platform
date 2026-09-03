# CHAINED — CURRENT STATE

Last updated: 2026-09-03

## NOW

Current focus: the image-derivative migration is closed; complete and polish core product surfaces before broader rollout. The roadmap is a priority map, not a fixed calendar.

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
- Public multi-image carousel is live and manually validated on Discover, Following and Public Profile; Work detail remains a vertical full-image sequence.
- Published Works can be removed directly from WORKS through `[ DELETE ]` → `[ CONFIRM DELETE ]`; the backend unpublishes, recalls exact public derivatives, and soft-deletes only after cleanup succeeds. A cleanup-pending retry resumes the same lifecycle.
- Public Presentation v1 is live: profile lists use canonical Presentation detail links, and public detail pages show core metadata with optional description and validated external URL. Presentation media and Work links are not yet modeled.

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
- Artist workspace provisioning is live: a fresh official artist invite receives a managed profile, can create a draft Work, finalize images, publish the Work, and publish the profile through Settings.
- Production security validation is complete: anonymous and cross-account private-media access is denied without URL leakage; an existing session loses protected access immediately when its account is suspended and regains it after reactivation. The fresh artist invite → workspace → Work → images → publish → profile-publish flow is also validated.
- Phase 4 public image derivatives are live: verified Works publish exact WebP SMALL and LARGE renditions, SMALL serves public grid/feed contexts, LARGE serves strict Work detail paths, originals remain private, and legacy public paths remain compatible.
- Strict publication requires current-source READY SMALL and LARGE derivatives. Public visitors do not receive `work-originals` or `work-derivative-staging` objects.
- The shared VP8 parser's width/height endian bug is fixed and covered by regression tests. Trusted terminal-failed current-source derivative recovery exists without fabricating READY state or bypassing broker validation.
- The controlled legacy migration is complete: 35/35 backfill-created jobs reached READY, zero active eligible legacy images remain without a lifecycle, and one image under a soft-deleted Work remains intentionally excluded. Existing published Works retained their audited visibility, revisions and public-media state; HEDO MAXXING II was successfully republished through the strict lifecycle.
- Active old and new Works now use the same derivative publication contract. The temporary production smoke environment/key still exists pending cleanup and revocation.

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

## CURRENT HANDOFF

- Production is stable after the Phase 4 public-image derivative rollout.
- Private preview frontend implementation is deployed and production-validated: the browser generates a fixed private WebP derivative before reservation, uploads both server-reserved objects, and finalizes them together. Production smoke covered JPEG and transparent PNG images, including full and partial alpha. Broader browser/device matrix validation remains future hardening.
- Controlled private-preview backfill remains open where still needed before Portfolio `ALL IMAGES / SELECT IMAGES`; it is separate from the completed public-derivative legacy migration.
- Protect the authorized private-media gateway, PDF export, Phase 4 public derivative behavior, and current Discover/Following/Profile geometry.
- Optional drag-follow carousel animation is future polish, not an active bug.
