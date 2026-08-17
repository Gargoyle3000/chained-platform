\# CHAINED — CURRENT STATE



Last updated: 2026-08-17



\## NOW



Current focus: small visual/mobile polish before returning to larger product work.



\### Mobile visual polish

\- Archive mobile: only SINGLE and GRID.

\- Current mobile SUPERGRID layout should become the new GRID layout.

\- Mobile-only change; desktop/tablet Archive views must remain unchanged.

\- Mobile mixed-ratio GRID images should behave like the balanced desktop GRID, not align awkwardly top-left.

\- PROFILE: reduce excessive whitespace between artist name and navigation.

\- Add slightly more whitespace between `<CHAINED>` and the mobile navigation across pages.

\- Discover SINGLE mobile is good and must not be changed.

\- Dashboard/Works mobile spacing is currently good.

\- Public Profile mobile spacing is currently good.



\## NEXT



\### Work metadata form

Current hierarchy feels awkward / cumbersome:

PRIMARY MEDIUM → SUPPORT/BASE → ADDITIONAL MATERIALS



Materials search/autocomplete works well and should be preserved.



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



