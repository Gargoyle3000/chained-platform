# CHAINED Repository Instructions

## Project

- CHAINED is a curated professional visual-art platform.
- Preserve its minimal, archival, and technical identity.
- The frontend uses static HTML, CSS, and vanilla JavaScript.
- The backend uses Supabase for Auth, Postgres, Storage, RLS, migrations, and Edge Functions.
- Production runs at `https://chained.work`.
- Treat the current repository as the technical source of truth.

## Project memory

- At the start of relevant CHAINED tasks, read `docs/CHAINED_STATE.md` for current priorities and state, `docs/DECISIONS.md` for established product and technical decisions, and `docs/BUGS.md` for active bugs and known investigation boundaries.
- At the start of planning, prioritization, or roadmap-related CHAINED tasks, also read `docs/ROADMAP.md` for planned upcoming work and sequencing.
- Keep the memory roles distinct: `CHAINED_STATE.md` is current state and active focus, `DECISIONS.md` records established decisions, `BUGS.md` records active bugs and blockers, and `ROADMAP.md` records planned upcoming work and sequencing.
- Documentation provides project context but never overrides what the current code does.
- After a task, update only the relevant memory document when the task actually changes current state or priorities, an established decision, or an active bug or blocker; do not update these documents mechanically or turn them into changelogs.
- Update `ROADMAP.md` only when a planned task is added, priority or order materially changes, or a roadmap item is completed or removed; do not turn it into a changelog.
- Keep the memory documents concise and current. Never mark a bug resolved without validation, and do not reopen an investigation path recorded in `BUGS.md` as ruled out unless new evidence justifies it.

## Product principles

- CHAINED is a professional art platform, not a social-media clone.
- Do not introduce likes, view counts, follower counts, popularity metrics, engagement tricks, or gamification.
- Public profiles should function as quiet, image-led “website light” portfolios.
- WORKS are individual works, series, installations as artworks, video, performance, or publications.
- PRESENTATIONS are exhibitions, fairs, screenings, performances, and presentation contexts.
- EVENTS are time-bound agenda entries.
- A collaborator link is attribution and does not grant control over another artist's work.
- Artists retain independent control over their own work records and images.
- Membership or plan status must never become a public rank or status symbol.

## Visual language

- Use only the existing white, black, and `#00D422` green system.
- Use Cascadia Code.
- Do not add rounded cards, shadows, gradients, grey interface panels, or decorative UI unless explicitly requested.
- Preserve generous whitespace and thin functional lines.
- Never crop artwork images unless explicitly requested.
- Preserve original image aspect ratios.
- Preserve the existing restrained, technical visual language.
- Check both desktop and mobile layouts.

## Frontend implementation

- Use semantic HTML, existing CSS, and vanilla JavaScript.
- Do not add frameworks, libraries, package managers, dependencies, or build tools unless explicitly requested.
- Reuse existing patterns before introducing new ones.
- Avoid duplicate IDs, duplicate event handlers, and conflicting CSS overrides.
- Do not use `innerHTML` with user-controlled content.
- Add accessibility labels and use real buttons for interactive controls.
- Normalize safe user input where appropriate instead of rejecting it unnecessarily.
- Limit changes to the files needed for the requested task.
- Preserve working behavior outside the requested scope.

## Supabase and backend

- Inspect existing migrations, repositories, RLS policies, helpers, and Edge Functions before changing backend behavior.
- Never run `supabase db reset` unless explicitly instructed.
- Never delete or recreate production data as a shortcut.
- Prefer targeted migrations and existing repository patterns.
- Do not directly edit production data unless explicitly instructed and the operation has been reviewed.
- Do not deploy migrations or Edge Functions to production unless explicitly instructed.
- Treat production database, Auth, Storage, and deploy operations as high-risk.
- Never expose or print service-role keys, secret keys, tokens, passwords, SMTP credentials, or private environment values.
- Do not move secrets into tracked files.
- Preserve the distinction between private originals and public media.
- Do not weaken RLS or Storage policies merely to make an operation work.
- Authentication in the frontend is not a substitute for database authorization.
- When changing visibility behavior, distinguish clearly between:
  - hidden in the UI;
  - inaccessible through the public API.

## Git safety

- Inspect the working tree before editing.
- Keep unrelated existing changes untouched.
- Never reset, discard, stash, restore, revert, commit, merge, or push unless explicitly instructed.
- Never overwrite another change merely to simplify the current task.
- Prefer small, reviewable diffs.
- After implementation, inspect the diff and run `git diff --check`.
- Do not claim the repository is clean unless it was actually checked.

## Workflow

Before making changes:

1. Inspect the relevant existing files.
2. State briefly:
   - what you found;
   - what you intend to change;
   - which files are likely involved;
   - the main risk;
   - how you will validate the change.
3. Wait for explicit confirmation before editing, unless the user explicitly asks for immediate execution.

During implementation:

- Keep the requested scope narrow.
- Prefer targeted edits over rewrites.
- Do not refactor unrelated code.
- Do not silently add features, abstractions, dependencies, or architecture.
- Follow established repository patterns.
- Flag scope creep rather than absorbing it into the current task.
- If the current code contradicts an assumption, stop and report it before continuing.

## Validation

- Run the smallest relevant test set first.
- Run broader tests only when the change warrants them.
- Test changed pages through the local server where applicable.
- Check desktop layout.
- Check approximately 390px mobile layout.
- Check approximately 320px mobile layout when the change affects responsive behavior.
- For Supabase changes, verify the relevant database, RLS, Storage, or Edge Function behavior rather than relying only on frontend behavior.
- After implementation, report:
  - changed files;
  - important selectors/functions/policies touched;
  - tests or checks performed;
  - any remaining uncertainty.
- Do not say something works unless it was actually verified.

## Working style

- For inspection-only requests, do not modify files.
- Separate facts found in the repository from hypotheses and design suggestions.
- Ask for clarification only when the repository cannot resolve an important ambiguity.
- Prefer concrete repository evidence over assumptions.
- Preserve intentional prototype behavior unless the requested task changes it.
- Do not redesign unrelated sections.
- Do not continue into the next task until the current task has been validated and closed.
