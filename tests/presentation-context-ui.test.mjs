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
  assert.match(page, /PUBLIC WORKS BY CHAINED ARTISTS/);
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
  assert.match(script, /SELECT OR SEARCH A CHAINED ARTIST/);
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
