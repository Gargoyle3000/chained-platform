import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Presentation editor wires profile-only context management without a client-side account scan", async () => {
  const [page, script] = await Promise.all([
    readFile(new URL("../dashboard-presentation-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-presentation-form.js", import.meta.url), "utf8")
  ]);

  for (const id of [
    "presentation-participants-section",
    "presentation-cooperators-section",
    "presentation-works-section",
    "presentation-program-section"
  ]) assert.match(page, new RegExp(`id=\\"${id}\\"`));

  assert.equal((page.match(/<form\b/gi) || []).length, 1);
  assert.match(page, /<div class="presentation-context-add" id="presentation-participant-add">/);
  assert.match(page, /<div class="presentation-context-add" id="presentation-cooperator-invite">/);
  assert.match(page, /<div class="presentation-context-add" id="presentation-program-add">/);
  assert.match(page, /id="presentation-work-profile-search"/);
  assert.match(page, /id="presentation-work-profile-results"/);
  assert.match(page, /ADD EXISTING PUBLIC WORKS BY CHAINED ARTISTS/);
  assert.match(page, /name="show-in-presentations"/);
  assert.match(page, /name="include-in-cv"/);

  assert.match(script, /listManagedParticipants\(currentPresentationId\)/);
  assert.match(script, /createParticipant\(currentPresentationId/);
  assert.match(script, /updateParticipant\(/);
  assert.match(script, /reorderParticipants\(/);
  assert.match(script, /removeParticipant\(/);
  assert.match(script, /searchPresentationArtistProfiles\(query\)/);
  assert.match(script, /query\.length < 3/);
  assert.match(script, /requestVersion/);
  assert.match(script, /setPresentationParticipantProfile\(participant\.id, profile\.id\)/);
  assert.match(script, /setPresentationParticipantProfile\(participant\.id, null\)/);
  assert.match(script, /PARTICIPANT PROFILE COULD NOT BE SAVED/);
  assert.match(script, /CHAINED ARTIST LINKED/);
  assert.match(script, /listManagedPresentationCooperatorSummaries\(currentPresentationId\)/);
  assert.match(script, /invitePresentationCooperatorByProfile\(/);
  assert.match(script, /CO-OPERATOR COULD NOT BE INVITED/);
  assert.match(script, /inviteButton\.disabled = true/);
  assert.match(script, /revokePresentationCooperator\(/);
  assert.match(script, /presentation\.managementRole === "owner"/);
  assert.match(script, /deleteButton\.hidden = !editing \|\| !isOwnerManager/);
  assert.match(script, /listManagedPresentationWorks\(currentPresentationId\)/);
  assert.match(script, /getPublicProfileRepository/);
  assert.match(script, /getProfileById\(/);
  assert.match(script, /proposePresentationWork\(currentPresentationId, work\.id\)/);
  assert.match(script, /const pendingWorkRemovalIds = new Set\(\)/);
  assert.match(script, /REMOVE ON SAVE/);
  assert.match(script, /action\(\s*isWorkRemovalPending\(association\) \? "KEEP" : "REMOVE"/);
  assert.match(script, /async function reconcilePendingWorkRemovals\(\)/);
  assert.match(script, /await repository\.removePresentationWork\(associationId\)/);
  assert.match(script, /let removalError = null/);
  assert.match(script, /await refreshContext\(\);[\s\S]*if \(removalError\) throw removalError/);
  assert.match(script, /await reconcilePendingWorkRemovals\(\)/);
  assert.match(script, /await refreshContext\(\);/);
  assert.match(script, /SELECT OR SEARCH AN ARTIST TO ADD AN EXISTING PUBLIC WORK/);
  assert.match(script, /action\("ADD WORK", async \(\) => \{[\s\S]*?proposePresentationWork\(currentPresentationId, work\.id\)/);
  assert.match(script, /selectedWorkProfile = profile/);
  assert.match(script, /availableProfiles\.set\(profile\.id/);
  assert.match(script, /WORK COULD NOT BE ADDED/);
  assert.match(script, /listPresentationProgramOccurrences\(currentPresentationId\)/);
  assert.match(script, /createPresentationProgramOccurrence\(/);
  assert.match(script, /setPresentationProgramVisibility\(/);
  assert.match(script, /deletePresentationProgramOccurrence\(/);
  assert.match(script, /participantAddButton\?\.addEventListener\("click"/);
  assert.match(script, /inviteButton\.addEventListener\("click"/);
  assert.match(script, /programAddButton\?\.addEventListener\("click"/);
  assert.match(script, /triggerContextActionOnEnter/);
  assert.doesNotMatch(script, /participantAddForm\.elements|cooperatorInviteForm\.elements|programAddForm\.elements/);
  assert.match(page, /id="presentation-cooperator-invite"/);
  assert.match(page, /id="presentation-cooperator-results"/);
  assert.doesNotMatch(script, /listPresentationCooperators\(|invitePresentationCooperator\(|invitedAccountId|accountId|from\("accounts"\)/);
  assert.doesNotMatch(script, /listWorks\(|getDiscoverWorks\(/);
  assert.doesNotMatch(script, /selectedWorkParticipantProfileId/);
});

test("new Presentation saves once and reveals persisted context through the edit loader", async () => {
  const [page, script, css] = await Promise.all([
    readFile(new URL("../dashboard-presentation-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-presentation-form.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard.css", import.meta.url), "utf8")
  ]);
  assert.match(page, /href="dashboard-form\.css"/);
  assert.match(page, /id="presentation-first-save-note"[^>]*>SAVE THIS DRAFT/);
  assert.match(page, /id="presentation-editor-status">STATUS: NEW/);
  for (const id of ["participants", "works", "agenda-image", "program", "cooperators"]) {
    assert.match(page, new RegExp(`id="presentation-${id}-section" hidden`));
  }
  assert.match(css, /\.presentation-form \[hidden\] \{ display:none !important; \}/);
  assert.match(script, /firstSaveNote\.hidden = editing/);
  assert.match(script, /if \(!requestedId\) \{[\s\S]*?updateEditorState\(\);[\s\S]*?return;/);

  const submit = script.slice(script.indexOf('form.addEventListener("submit"'), script.indexOf('form.addEventListener("input"'));
  const steps = [
    'if (saveButton.disabled) return',
    'await repository.createPresentation(',
    'currentPresentationId = saved.id',
    'history.replaceState(',
    'await repository.getPresentation(saved.id)',
    'await refreshContext()'
  ];
  let cursor = -1;
  for (const step of steps) {
    const next = submit.indexOf(step, cursor + 1);
    assert.ok(next > cursor, `${step} must follow the preceding save step`);
    cursor = next;
  }
  assert.equal((submit.match(/createPresentation\(/g) || []).length, 1);
  assert.match(submit, /if \(creating\) \{[\s\S]*?await repository\.getPresentation\(saved\.id\);[\s\S]*?updateEditorState\(hydrated\);[\s\S]*?await refreshContext\(\)/);
  assert.match(submit, /DRAFT SAVED\. CONTEXT COULD NOT BE LOADED\. RELOAD THIS PAGE/);
  assert.match(submit, /\} catch \(error\) \{[\s\S]*?PRESENTATION COULD NOT BE SAVED/);
  assert.match(script, /await refreshContext\(\);\s*\} catch \(error\) \{\s*renderDashboardAccountIdentity/);
});

test("Presentation sections follow a single content-to-management order", async () => {
  const page = await readFile(new URL("../dashboard-presentation-edit.html", import.meta.url), "utf8");
  const sections = [...page.matchAll(/<section class="work-form-section[^\"]*"(?: id="[^"]+")?(?: hidden)?>\s*<header class="work-form-section-header">\s*<p>(\d\d)<\/p>[\s\S]*?<h3>([^<]+)<\/h3>/g)]
    .map((match) => ({ number: match[1], heading: match[2] }));
  assert.deepEqual(sections, [
    { number: "01", heading: "BASIC INFORMATION" },
    { number: "02", heading: "PLACE AND DATE" },
    { number: "03", heading: "CONTEXT" },
    { number: "04", heading: "PLACEMENT" },
    { number: "05", heading: "PARTICIPANTS" },
    { number: "06", heading: "WORKS" },
    { number: "07", heading: "AGENDA IMAGE" },
    { number: "08", heading: "PROGRAM" },
    { number: "09", heading: "CO-OPERATORS" }
  ]);
  assert.match(page, /MANAGEMENT ACCESS · NOT PUBLIC PARTICIPANTS/);
  assert.match(page, /THE ARTIST KEEPS CONTROL OF ITS WORK RECORD/);
});
