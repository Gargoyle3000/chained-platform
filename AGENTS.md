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
- Before concluding that required local development software is missing, read `docs/DEV_ENVIRONMENT.md` and perform the documented environment discovery.
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
3. For a properly scoped, authorized task, proceed through inspection, narrow implementation, relevant tests, diff review, and result. Do not stop after inspection merely to ask for confirmation when implementation is already authorized. Stop when inspection reveals materially different risk or scope, a genuine unresolved product/architecture decision, missing information that cannot be resolved by inspection, an unauthorized production mutation/deploy/migration/commit/push, or risk to unrelated or sensitive state.

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

## AI/Codex working method

- ChatGPT is the orchestrator and reviewer; Codex is the default executing repository agent. For code work, ChatGPT should provide one complete, copy-paste-ready Codex task rather than requiring the user to relay loose PowerShell commands. Avoid making the human act as a terminal when the agent can execute the work itself.
- For meaningful work, Codex reads `AGENTS.md` and relevant project docs, inspects the current code and working patterns, then reports repository facts, affected files/locations, risks, hypotheses, and the proposed approach before changing anything. Larger or risky tasks start inspection-only and proceed to implementation after review; small, explicit, well-bounded tasks may be implemented directly when authorized.
- Keep changes within scope, run focused validation, inspect the diff, and run `git diff --check`. Commit, push, deploy, reset, and revert only on explicit instruction.
- Model choice has two dimensions: family (`LUNA`, `TERRA`, `SOL`) and reasoning (`LIGHT`, `MEDIUM`, `HIGH`). Always name the combination (for example, `LUNA LIGHT` or `SOL HIGH`), never only “Codex High” or “Medium”. Choose the lightest reliable combination: `LUNA LIGHT` for tiny clear local/documentation tasks; `LUNA/TERRA MEDIUM` for normal focused implementation and debugging; `TERRA HIGH` / `SOL MEDIUM` for complex interaction or important backend/frontend work; and `SOL HIGH` only when repository-wide architecture, security, RLS/Storage/Auth, or difficult debugging genuinely benefits from it. These are guidelines; scale back after heavy work when possible.
- Model selection also considers credits and execution speed. Use `TERRA MEDIUM` as the default for substantive repository work. Prefer `LUNA LIGHT` for documentation, inventory, tiny/local changes, and simple Git work. Use heavier TERRA/SOL modes only when task complexity genuinely requires escalation; `SOL` is not a default and should normally be selected only after harder architecture/security reasoning is identified.
- At each new relevant CHAINED session, read `AGENTS.md` and the relevant project memory, use its decisions and handoff as the starting context, avoid asking the user to reconstruct documented context, and check repository state before technical work.
- At session end, after validation, update only the relevant `CHAINED_STATE.md`, `DECISIONS.md`, `BUGS.md`, or `ROADMAP.md` when the task actually changes current state, decisions, bugs, priorities, or handoff. Keep the handoff sufficient for the next chat, without turning project memory into a changelog.
- Whenever a production external service is added, materially changed, or removed, update `docs/EXTERNAL_SERVICES.txt`.
- For security work, begin with the threat model and trust boundaries, support findings with concrete repository evidence, distinguish confirmed vulnerabilities from hardening suggestions and false positives, make no security-code changes during an inspection-only audit, and test authorization server-side rather than relying on hidden UI.
