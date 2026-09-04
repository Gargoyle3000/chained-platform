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
    "presentation-program-section"
  ]) assert.match(page, new RegExp(`id=\\"${id}\\"`));

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
  assert.match(script, /listPresentationProgramOccurrences\(currentPresentationId\)/);
  assert.match(script, /createPresentationProgramOccurrence\(/);
  assert.match(script, /setPresentationProgramVisibility\(/);
  assert.match(script, /deletePresentationProgramOccurrence\(/);
  assert.match(page, /id="presentation-cooperator-invite"/);
  assert.match(page, /id="presentation-cooperator-results"/);
  assert.doesNotMatch(script, /listPresentationCooperators\(|invitePresentationCooperator\(|invitedAccountId|accountId|from\("accounts"\)/);
});
