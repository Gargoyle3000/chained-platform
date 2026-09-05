import test from "node:test";
import assert from "node:assert/strict";
import {
  decideDashboardRequest,
  loadDashboardRequests
} from "../data/dashboard-requests.mjs";

const IDS = Object.freeze({
  invitation: "11111111-1111-4111-8111-111111111111",
  associationA: "22222222-2222-4222-8222-222222222222",
  associationB: "33333333-3333-4333-8333-333333333333",
  consent: "44444444-4444-4444-8444-444444444444"
});

function createRepository({ failDecision = false } = {}) {
  const calls = [];
  const cooperator = {
    invitationId: IDS.invitation,
    presentationTitle: "Gothic Summer",
    presentationHostDisplayName: "Peer Vink",
    status: "pending"
  };
  const workA = {
    associationId: IDS.associationA,
    presentationTitle: "Gothic Summer",
    workTitle: "Hedo Maxxing II",
    status: "pending"
  };
  const workB = {
    associationId: IDS.associationB,
    presentationTitle: "Other Presentation",
    workTitle: "Other Work",
    status: "accepted"
  };
  const participation = {
    consentId: IDS.consent,
    presentationTitle: "Gothic Summer",
    presentationHostDisplayName: "Peer Vink",
    participantDisplayName: "Manuel Klappe",
    status: "pending"
  };

  return {
    calls,
    async listIncomingCooperatorInvitations() {
      calls.push("list-cooperators");
      return [cooperator];
    },
    async listMyPresentationWorkRequestSummaries() {
      calls.push("list-work-requests");
      return [workA, workB];
    },
    async listMyPresentationParticipationRequestSummaries() {
      calls.push("list-participation-requests");
      return [participation];
    },
    async acceptPresentationCooperator(id) {
      calls.push(["accept-cooperator", id]);
      if (failDecision) throw new Error("server failure");
    },
    async declinePresentationCooperator(id) {
      calls.push(["decline-cooperator", id]);
      if (failDecision) throw new Error("server failure");
    },
    async decidePresentationWork(id, decision) {
      calls.push(["decide-work", id, decision]);
      if (failDecision) throw new Error("server failure");
    },
    async acceptPresentationParticipation(id) {
      calls.push(["accept-participation", id]);
      if (failDecision) throw new Error("server failure");
    },
    async declinePresentationParticipation(id) {
      calls.push(["decline-participation", id]);
      if (failDecision) throw new Error("server failure");
    }
  };
}

test("Dashboard request loader batches all three server summaries once and keeps only pending requests", async () => {
  const repository = createRepository();

  assert.deepEqual(await loadDashboardRequests(repository), [{
    kind: "cooperator",
    invitationId: IDS.invitation,
    presentationTitle: "Gothic Summer",
    presentationHostDisplayName: "Peer Vink",
    status: "pending"
  }, {
    kind: "work",
    associationId: IDS.associationA,
    presentationTitle: "Gothic Summer",
    workTitle: "Hedo Maxxing II",
    status: "pending"
  }, {
    kind: "participation",
    consentId: IDS.consent,
    presentationTitle: "Gothic Summer",
    presentationHostDisplayName: "Peer Vink",
    participantDisplayName: "Manuel Klappe",
    status: "pending"
  }]);
  assert.deepEqual(repository.calls, [
    "list-cooperators",
    "list-work-requests",
    "list-participation-requests"
  ]);
});

test("Dashboard request decisions use trusted repository actions then reload both summaries", async () => {
  const repository = createRepository();
  const workRequest = {
    kind: "work",
    associationId: IDS.associationA,
    status: "pending"
  };

  const refreshed = await decideDashboardRequest(
    repository,
    workRequest,
    "accept"
  );

  assert.equal(refreshed.length, 3);
  assert.deepEqual(repository.calls, [
    ["decide-work", IDS.associationA, "accepted"],
    "list-cooperators",
    "list-work-requests",
    "list-participation-requests"
  ]);
});

test("participation decisions use only the consent identifier and reload all summaries", async () => {
  const repository = createRepository();

  await decideDashboardRequest(repository, {
    kind: "participation",
    consentId: IDS.consent,
    status: "pending"
  }, "decline");

  assert.deepEqual(repository.calls, [
    ["decline-participation", IDS.consent],
    "list-cooperators",
    "list-work-requests",
    "list-participation-requests"
  ]);
});

test("failed Dashboard request actions reject without a fake refresh or local success", async () => {
  const repository = createRepository({ failDecision: true });

  await assert.rejects(
    () => decideDashboardRequest(repository, {
      kind: "cooperator",
      invitationId: IDS.invitation,
      status: "pending"
    }, "decline"),
    /server failure/
  );
  assert.deepEqual(repository.calls, [
    ["decline-cooperator", IDS.invitation]
  ]);
});
