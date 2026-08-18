\# CHAINED — CURRENT STATE



Last updated: 2026-08-18



\## NOW



Current focus: small visual/mobile polish before returning to larger product work.



\### Auth UX rollout

\- Frontend auth is password-first: email + password login, Forgot password, and one invite/recovery password-update route.

\- Magic-link login remains an invitation-only fallback; no public signup exists.

\- Hosted redirect allowlist, invite redirect and recovery configuration are deployed and validated in production.



\### Mobile visual polish

\- Archive mobile: only SINGLE and GRID; the former SUPERGRID presentation is now the mobile GRID (validated).

\- Former mobile SUPERGRID layout is now the validated mobile GRID presentation.

\- Mobile-only change; desktop/tablet Archive views must remain unchanged.

\- Archive, Discover NOSY and Following mobile mixed-ratio GRID images are centered and balanced without crop/stretch (validated).

\- PROFILE mobile name-to-navigation spacing is compact (validated).

\- Add slightly more whitespace between `<CHAINED>` and the mobile navigation across pages.

\- Discover SINGLE mobile is good and must not be changed.

\- Dashboard/Works mobile spacing is currently good.

\- Public Profile mobile spacing is currently good.



\## BLOCKED — PRE-TESTER



\### Private media / Portfolio Export

Portfolio PDF renderer exists and works.



Current blocker:

authenticated private Work images can return `PREVIEW UNAVAILABLE`, which also prevents reliable Portfolio PDF generation.



The issue has been isolated to Supabase Storage behaviour around:



`storage.allow\_only\_operation('object.get\_authenticated')`



Removing only that condition temporarily made both private preview and PDF export work.



A Supabase support ticket is open.



Portfolio Export must work reliably before the first external tester.



\## DONE — IMPORTANT INFRASTRUCTURE



\- Production auth / accounts / RLS operational.

\- Work upload, finalize, publish, unpublish and delete-image operational.

\- Browser uses current Supabase publishable key.

\- Edge Functions use current Supabase secret/publishable key system.

\- Legacy anon + service\_role API keys disabled.

\- Archive + Projects + CURATED implemented.

\- Discover + Following implemented.

\- Mobile core flows usable.

\- Portfolio PDF renderer implemented.

\- Work metadata uses structured MEDIUM and one comma-separated MATERIALS field; legacy material fields are unified on read and migrated when that Work is saved.

\- Git working tree clean after API-key migration.



\## AFTER EXPORT



\- Harden Portfolio Export with real production images.

\- Reuse the same PDF renderer for Archive / Project export.

\- Compact pre-tester security and usability pass.

\- First 1–2 external testers.



\## LATER



\- Import.

\- People / Search / CHAINED relationships.

\- Cloudflare Pages + clean routes.

\- Further desktop/tablet polish.

\- Additional search/filter improvements.



