# CHAINED — USER TESTING

Chronological notes from real-user sessions. Observations are evidence; interpretations, questions and possible actions are provisional. Current implementation belongs in `CHAINED_STATE.md`, priorities in `ROADMAP.md`, established contracts in `DECISIONS.md`, and confirmed defects in `BUGS.md`.

## 2026-09-27 — External Artist test 01 — Koos De Vries

### Successful flows

Koos completed invitation/password onboarding and reached active Artist use. Work uploads initially failed, then he created real Works with images after the production Storage privilege hotfix. CV Import initially denied access; it worked after his account was manually added to the temporary beta allowlist. These changes in availability happened during the same session.

### Findings

1. **Work publication controls.** Observation: EDIT WORK offers DRAFT / PUBLISHED radio controls and bottom SAVE DRAFT / PUBLISH WORK actions; Koos experienced duplicated publication control. Interpretation/question: publication appears as both a field and an action. Possible action: investigate one clearer status/action model, perhaps STATUS plus PUBLISH / UNPUBLISH, without treating that design as settled.

2. **Photo Corrector Crop.** Observation: Crop would help. Interpretation/question: this extends the existing tool. Possible action: add Crop to later Photo Corrector / TOOLS work.

3. **Interactive global `+`.** Observation: Koos did not recognize the global `+` as the Dashboard/Artist Workspace entry and read `PROFILE +` as a possible account/status marker. Interpretation/question: the interactive global control needs a clearer affordance; the static `+` in management-page identity is a separate element. Possible action: explain Workspace entry in first-login onboarding and investigate `[+]` for the interactive control without committing to that syntax.

4. **Continue to another Work.** Observation: after creating/uploading a Work, Koos wanted to start the next while images process; the present path is Dashboard `+` → WORKS → NEW WORK. Interpretation/question: a continuation may be safe after upload acceptance, depending on the asynchronous lifecycle. Possible action: investigate a direct new-Work action with truthful processing state; do not imply an unfinished upload can be abandoned.

5. **WORK READY TO PUBLISH.** Observation: the Dashboard action was unclear; Koos found REQUESTS clearer. It opens EDIT WORK at the top, while its publish action is at the bottom. Interpretation/question: the action's intent and the editor's publication control may be too far apart. Possible action: clarify REVIEW / PUBLISH or direct Publish where the existing validation contract allows it, and investigate status/action near the editor top. A small popup is an option, not a decision; this does not call for generic notifications.

6. **One-image carousel.** Observation: Peer saw `< >` controls without a useful count on a one-image Work; the exact route was not recorded. Interpretation/question: this conflicts with the established one-image rule. Repository inspection found shared controls use `hidden`, while their CSS assigns `display` without a matching hidden rule, so this remains possible. Possible action: investigate and fix the shared compact control across relevant routes; tracked as an active bug.

7. **Find accounts/profiles.** Observation: a user needs an obvious way to find CHAINED profiles. Interpretation/question: Presentation management's Artist search serves association, not general public discovery. Possible action: start with public eligible Profile/People search by display name or slug, without expanding it into global Work/Presentation full-text search.

8. **Presentation editor density.** Observation: Koos and Peer found PRESENTATION less calm and legible than WORKS. Interpretation/question: its Participants, co-operators, Works, Agenda image and Program contexts add many inline actions, and section numbering/order is inconsistent in the current page. Possible action: audit the Presentation editor against Work and simplify hierarchy while retaining capabilities.

9. **New Presentation context discoverability.** Observation: the initial NEW PRESENTATION page gives little indication that Participants, co-operators, Works and Program can be added. Interpretation/question: context sections start hidden and depend on an existing Presentation ID. The current save handler assigns that ID but does not call the context refresh that reveals the sections; the first-save transition needs verification. Possible action: improve discoverability and the transition after first save. Inline guidance, automatic transition, immediate draft creation and a different editor structure remain options.

10. **Works in a Presentation.** Observation/question: could the Presentation flow offer a more direct path to add or create Works in context? Current management searches Artists and associates existing public Works after a Presentation exists. Possible action: investigate a clearer association/creation route while keeping each Work's authoritative record and Artist control intact.

11. **Video v1.** Observation: video remains wanted. Interpretation/question: its contract is already established in `DECISIONS.md`: external hosting (preferably Vimeo), required still, still-only compact surfaces, Work Detail playback, no autoplay, and still-based PDF representation. Possible action: retain the existing later implementation item; no new video decision is needed.

12. **Profile view modes.** Observation: public Profile would benefit from GRID and SINGLE Work viewing. Interpretation/question: series/title browsing is a separate, later product and data-model question. Possible action: plan GRID / SINGLE parity, then investigate genuine Series navigation; do not infer Series by identical title strings.

13. **Slow connection and images.** Observation: Koos has roughly 8 Mbit/s internet and image loading felt slow; other sites are slow for him too. Interpretation/question: this is not yet evidence of a CHAINED-specific defect. Possible action: measure derivative choice (SMALL/LARGE), responsive sizes, lazy/eager loading, concurrency and transfer size on representative Profile/feed views. Consider progressive or reduced-bandwidth behavior only after normal delivery is optimized; no mode name is decided.

14. **First-login introduction.** Observation: the test exposed confusion about the Workspace entry and public/private model. Interpretation/question: the planned compact, approximately seven-step introduction should explain Profile versus Workspace and which actions are private or public, but permanent controls must also be clear. Possible action: refine the existing onboarding item using these findings; contextual `[ ? ]` remains separate.

15. **CV Import access.** Observation: `CV IMPORT IS NOT ENABLED FOR THIS ACCOUNT` appeared because production `cv-import-extract` still uses `CV_IMPORT_BETA_USER_IDS`; import worked after Koos was manually added. Interpretation/question: this manual step will not scale to eligible early users. Possible action: follow the existing pre-beta eligibility replacement item while retaining authentication and active-account checks.

16. **Work image upload incident.** Observation: uploads initially failed because the Presentation Agenda Storage INSERT predicate lacked authenticated EXECUTE. After production migration `20260927082536_grant_agenda_storage_insert_predicate.sql`, Koos uploaded real Works with images. Interpretation/question: the specific incident is resolved and live verified. Possible action: retain its resolution in `BUGS.md`; no duplicate active task is needed.
