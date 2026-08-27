\# CHAINED — DECISIONS



Last updated: 2026-08-27



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

\- User-facing metadata values use normal prose capitalization and conjunctions, for example `Acrylic, canvas and aluminium frame`; do not render conjunctions such as `AND` in system-style uppercase.

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

\- Anonymous Discover remains the temporary public entry; About/application/admission information may be added later.

\## Management identity

\- Management pages use a static, non-interactive `+` marker with `PROFILE LOADING` / hydrated profile name and `ARTIST ACCOUNT`; the global navigation `+` remains interactive.
\- `PROFILE LOADING` is intentional dry/computer-like product language during identity hydration.

\## Public Work carousel

\- The carousel is public-only and limited to Discover, Following and Public Profile.
\- Work detail remains a full vertical image sequence.
\- The current `is_cover=true` image is first; remaining public images use `sort_order`, then deterministic `id` order.
\- The cover defines fixed stage geometry; secondary ratios use contain behavior with no crop or stretch.
\- No visible arrows, dots or autoplay are required.
\- Media carousels loop circularly: last → next returns to first, and first → previous returns to last.
\- Interaction remains an invisible swipe/drag model with keyboard Left/Right support; no persistent carousel chrome.

\- Work detail with one image should prefer a fixed, non-scrolling visual presentation where the viewport permits it. Work detail with multiple images allows scrolling/swiping through media. Metadata must remain accessible on smaller screens even when a fixed presentation is preferred.

\## Portfolio export images

\- Each selected Work defaults to its cover image. The export session offers `ALL IMAGES` or `SELECT IMAGES`; multiple images may be selected and the cover may be deselected.
\- Selected images retain the Work's media order. Work order is independently changeable for the export. Every selected image gets a PDF page; the first page for a Work gets normal metadata and later pages use compact identification such as `TITLE · 2/3`.
\- Numbering is relative to the images selected for that PDF, not their original positions. There are no saved preferred images or export presets in v1. Preserve native ratio; never crop or stretch.

\## Guide and first login

\- Each relevant page may expose at most one compact `[?]` in a consistent position. It opens a large white page-specific guide with a black outline and an easy `[ X ]` close.
\- A guide briefly defines the page/section, CHAINED-specific concepts and terms, relevant interactions, and privacy/status rules. Obvious generic controls need no explanation. Copy is dry, concise and functional; page feedback such as saving, publishing and errors never depends on the guide.
\- The first login shows one account-level introduction only once per account. It is not a wizard, tutorial or checklist. It explains CHAINED as a tool or possible extension of an artist's practice, not a new social-media platform: no likes, view counts or popularity rankings, and users need not use every part.
\- The introduction explains user-controlled visibility and that a new Artist Profile starts `DRAFT`. It can later be reopened under Settings → ABOUT CHAINED. Exact copy and any early-user note belong to a later sitewide copy audit.

\## Profile and Work publication

\- Artist Profiles start `DRAFT`; Dashboard persistently shows `PROFILE [ DRAFT ]` or `PROFILE [ PUBLISHED ]` and may explain that draft profiles are hidden publicly.
\- Work publication and Profile publication are independent. A Work can be `PUBLISHED` while its Profile is `DRAFT`; do not block the Work or auto-publish the Profile. The Work is not publicly reachable, including by direct URL, until the Profile is published.
\- The first time a Work is published while its Profile remains draft, show one clear explanation that it is published but not publicly visible. Do not ask for confirmation every time and do not repeat the warning after that; persistent status is the ongoing explanation.
\- Publishing the Profile makes already-published Works visible without changing their Work states. Returning the Profile to `DRAFT` hides public content without unpublishing each Work.

\## Video v1

\- Video is an ordinary artistic medium, not a premium type. v1 uses external hosting only, preferably Vimeo; do not support YouTube or native CHAINED video hosting. Keep provider handling extensible for another suitable provider later.
\- Every video item requires a still selected or uploaded by the artist. In a Work carousel it initially behaves like a normal image; clicking it activates that item's player. Mixed order such as `IMAGE · IMAGE · VIDEO · IMAGE` and multiple videos within normal media limits are allowed.
\- Video playback exists on Work detail only. Discover, Following, GRID, Archive overviews and similar views use stills, never autoplay or moving thumbnails. Swiping away stops playback; provider fullscreen controls are sufficient.
\- Duration is required metadata for video. PDF export uses the still plus `VIDEO + DURATION` and may include the external URL; no default QR code. No native hosting is planned unless later demand and economics justify it.

\## Products and account types

\- CHAINED is free: maximum 10 Works including drafts, maximum 5 media items per Work, maximum 3 Projects, unlimited Tags, normal Profile/CV/Agenda/Presentations/Press and Discover/Following access, and video within normal limits. It has no Portfolio Export, Archive Export or bulk import.
\- At the 10-Work limit, existing Works are never hidden, locked or held hostage. Users may view, edit, publish, unpublish and delete them; only `[ NEW WORK ]` is blocked until a Work is deleted or the account upgrades. Explain the limit plainly.
\- CHAINED+ is €7/month or €70/year, with product-facing effectively unlimited Works and Projects, more generous media capacity, Portfolio/Archive export, import and later professional personalization. A high technical abuse/fair-use ceiling may exist later but is not a normal product-facing limit.
\- Payment never buys ranking, reach, boosts, visibility or admission privileges.
\- Anonymous visitors may view public content without an account. `UNCHAINED` is a viewer account for Follow, Following and personal Agenda only; it has no Artist workspace. `ARTIST` uses CHAINED or CHAINED+. `INSTITUTION` has one primary owner, individually logged-in team members and a public subtype such as GALLERY, MUSEUM, PROJECT SPACE, ARTIST-RUN or FOUNDATION; public UI shows the subtype directly, not `INSTITUTION > GALLERY`. `CURATOR` works with existing CHAINED Artists/Works and exists relatively early; Artists do not automatically gain CURATED creation rights.

\## Admission and FIRST CHAIN

\- The first approximately 50 users are manually invited by Peer; personal rollout may include studio visits and iPad onboarding. `FIRST CHAIN` is private account history, never a public prestige badge.
\- FIRST CHAIN users may retain useful rights or benefits without paying, and private account history may later show `FIRST CHAIN · 2026`; exact permanent benefits remain a future decision.
\- Later, an `UNCHAINED` account may request professional access through `APPLY` with `PENDING`, `IN REVIEW`, `APPROVED` or `DECLINED` states. Admission is independent from payment; paying cannot bypass review. Review concerns a real artistic, curatorial or institutional practice, not a rigid taste jury, and four years of activity is not an absolute rule. A broader jury/review mechanism can be added only if scale requires it.

\## CURATED and communication

\- CURATED is an ordered/contextual selection of existing Works created by CURATOR or INSTITUTION, with at least 3 visible Works. It has a chosen Work as cover, no auto-collage, and optional short intro (about 100–200 words), optional essay/notes and optional sources/references; Works remain the main visual body and no arbitrary text blocks appear between them.
\- CURATED has `DRAFT`/`PUBLISHED` state. Artist Work title, media and metadata remain authoritative. A public Work may be included without prior permission, while the Artist may hide that APPEARS IN → CURATED link on their own representation; hiding it does not remove the Work from CURATED.
\- If an Artist unpublishes a Work, it silently disappears for public viewers; no `WORK UNAVAILABLE` placeholder is shown. Curators see the missing position privately. A published CURATED automatically unpublishes below 3 visible Works. A new CURATED may enter Following once; later edits do not repost it.
\- There is no user-to-user DM or chat. Contact uses public email/contact links and the user's mail client. Future notifications are system → user only: action-required events (invites, claims, access, payment/security), informational events (for example ADDED TO CURATED), and never direct page feedback such as `WORK SAVED` or `UPLOAD FAILED`. No follow notifications, follower/following counts, public follower graph or activity notifications duplicating Following.

\## Presentations and Agenda

\- A Presentation is a shared durable context where possible, not a duplicate per Artist. The host/creator controls overall data; Artists attach their own authoritative Works. External Artists and Institutions may be represented, with aliases and later claim/merge preserving relationships.
\- Presentations may contain documentation/exhibition images that are not Works and never become Discover Works. One series-level photo credit is sufficient by default. Presentations remain public/history after their date; participants control whether they surface them on their own Profile, and incorrect associations can be reported/corrected. One Presentation may contain multiple Agenda moments such as OPENING, ARTIST TALK and FINISSAGE, including a single moment for a one-evening event.
\- Agenda moments feed Agenda automatically; no duplicate entry is required. Standalone Agenda items are allowed, including events hosted by Institutions not yet on CHAINED. Personal Agenda comes from followed accounts; Agenda supports `[ ALL ]` and `[ FOLLOWING ]` views. There is no RSVP/GOING/INTERESTED system and CHAINED does not track attendance intent.
\- Start/end times may be optional where appropriate. Changing only a time does not notify or repost/reorder an event when its date is unchanged; changing the date changes chronological placement. `CANCELLED` is supported. Past events leave active Agenda but remain in Presentation/history. Use structured CITY/COUNTRY for later filters; do not add `ONLINE`/`HYBRID`, location permissions or “events near you”. FOLLOWING is newly published content/context; AGENDA is scheduled happenings.

\## Press, Publications and Archive

\- PRESS is external media about the practice: compact title/outlet/date/URL metadata, optional author, no required image, no automatic APPEARS IN and no Following post.
\- PUBLICATION is a genuine publication object with representative/documentation images and metadata such as title/year/author/editor/publisher/description/ISBN/link. It may connect to Artists, Works and Presentations and meaningfully participate in APPEARS IN and Following. Do not host publication PDFs or build a full book-digitization library; prefer object/cover/spread images plus an external link.
\- TAGS are freeform Work descriptors and filters, unlimited for all tiers; combinations intersect where applicable and Tags have no manual presentation order. PROJECTS are ordered Work sets/contexts: a Work may belong to multiple Projects, manual Work order matters, removing a Project never removes Works, and Projects support export/select/share workflows.
\- Projects have only small metadata (title, optional note and date/period), no nesting, tasks, collaborators or project-management system. CHAINED allows 3 Projects and CHAINED+ effectively unlimited. General Archive uses sorting/filtering rather than permanent manual order. Incomplete private Works may be saved; publishing is stricter.

\## Unclaimed, APPEARS IN and FOLLOW

\- External Artist/Institution identities may exist through legitimate Presentation context. Public UI does not show `UNCLAIMED`, does not label them `UNCHAINED`, and does not show a public `IS THIS YOU?` or claim button; a minimal identity/context page is sufficient.
\- Claim starts from the claimant's Dashboard/Settings via `CLAIM EXISTING PROFILE` and is initially human-reviewed. Suggested states are `CLAIM REQUESTED`, `IN REVIEW`, `APPROVED`, `TRANSFER IN PROGRESS`, `CLAIMED` and `DECLINED`. Identity, history and Presentation relations remain after claim. Institution-entered Works are not forced into an Artist's Works; the Artist may choose `ADD TO MY WORKS` or `IGNORE`. Aliases/duplicates can be merged during human/admin handling. Do not automatically email referenced external identities.
\- APPEARS IN connects a Work to meaningful PRESENTATION, CURATED or PUBLICATION context; it is discovery, not a count/status/popularity metric. An Artist may hide an individual APPEARS IN entry on their own Work/Profile representation, but this does not erase the legitimate source context and is not an automatic CV dump.
\- FOLLOW exists only to construct personal Following and Agenda. There are no follower counts, following counts, public follower graph or follow notifications. Unfollow happens from the encountered account/profile. Follow is not a social-status mechanic.

