import test from "node:test";
import assert from "node:assert/strict";
import { createSupabasePresentationRepository } from "../data/presentation-repository.mjs";

const IDS = Object.freeze({
  presentation: "11111111-1111-4111-8111-111111111111",
  participant: "22222222-2222-4222-8222-222222222222",
  work: "33333333-3333-4333-8333-333333333333",
  association: "44444444-4444-4444-8444-444444444444",
  invitation: "55555555-5555-4555-8555-555555555555",
  consent: "56565656-5656-4565-8565-565656565656",
  account: "66666666-6666-4666-8666-666666666666",
  profile: "77777777-7777-4777-8777-777777777777",
  occurrence: "88888888-8888-4888-8888-888888888888"
});

function createClient({ rpcRows = {}, tables = {} } = {}) {
  const calls = [];

  function query(table) {
    const result = { data: tables[table] || [], error: null };
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      order() { return builder; },
      insert(payload) {
        calls.push({ insert: [table, payload] });
        return builder;
      },
      update(payload) {
        calls.push({ update: [table, payload] });
        return builder;
      },
      single() { return Promise.resolve(result); },
      maybeSingle() { return Promise.resolve(result); },
      then(resolve) { return Promise.resolve(result).then(resolve); }
    };

    return builder;
  }

  return {
    calls,
    from(table) {
      calls.push({ from: table });
      return query(table);
    },
    async rpc(name, args) {
      calls.push({ rpc: [name, args] });
      const value = rpcRows[name];
      return {
        data: typeof value === "function" ? value(args) : value ?? true,
        error: null
      };
    }
  };
}

test("Presentation v2 participant adapters use the bounded participant RPCs", async () => {
  const client = createClient({
    rpcRows: {
      get_managed_presentation_participants: [{
        id: IDS.participant,
        presentation_id: IDS.presentation,
        linked_profile_id: IDS.profile,
        display_name: "Manuel Klappe",
        position: 2,
        is_visible: true
      }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  assert.deepEqual(await repository.listManagedParticipants(IDS.presentation), [{
    id: IDS.participant,
    presentationId: IDS.presentation,
    linkedProfileId: IDS.profile,
    displayName: "Manuel Klappe",
    position: 2,
    isVisible: true,
    createdAt: null,
    updatedAt: null
  }]);
  assert.equal(
    (await repository.getManagedParticipant(IDS.presentation, IDS.participant))?.id,
    IDS.participant
  );
  await repository.createParticipant(IDS.presentation, {
    displayName: "  Peer Vink  ",
    linkedProfileId: IDS.profile
  });
  await repository.updateParticipant(IDS.participant, {
    displayName: "Peer Vink",
    isVisible: false
  });
  await repository.removeParticipant(IDS.participant);
  await repository.reorderParticipants(IDS.presentation, [IDS.participant]);

  assert.deepEqual(client.calls.filter((call) => call.rpc), [
    { rpc: ["get_managed_presentation_participants", { target_presentation_id: IDS.presentation }] },
    { rpc: ["get_managed_presentation_participants", { target_presentation_id: IDS.presentation }] },
    { rpc: ["create_presentation_participant", {
      target_presentation_id: IDS.presentation,
      participant_display_name: "Peer Vink",
      target_linked_profile_id: IDS.profile
    }] },
    { rpc: ["update_presentation_participant", {
      target_participant_id: IDS.participant,
      participant_display_name: "Peer Vink",
      target_linked_profile_id: null,
      participant_is_visible: false
    }] },
    { rpc: ["remove_presentation_participant", { target_participant_id: IDS.participant }] },
    { rpc: ["reorder_presentation_participants", {
      target_presentation_id: IDS.presentation,
      ordered_participant_ids: [IDS.participant]
    }] }
  ]);
});

test("managed Presentation summaries use one bounded RPC and preserve management roles", async () => {
  const client = createClient({
    rpcRows: {
      get_managed_presentation_summaries: [{
        id: IDS.presentation,
        owner_profile_id: IDS.profile,
        title: "Owned Presentation",
        activity_type: "group-exhibition",
        visibility: "draft",
        management_role: "owner"
      }, {
        id: IDS.association,
        owner_profile_id: IDS.account,
        title: "Co-operated Presentation",
        activity_type: "project",
        visibility: "published",
        management_role: "cooperator"
      }, {
        id: IDS.presentation,
        owner_profile_id: IDS.profile,
        title: "Duplicate row",
        management_role: "owner"
      }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  const presentations = await repository.listPresentations();
  assert.deepEqual(
    presentations.map((presentation) => [presentation.id, presentation.managementRole]),
    [[IDS.presentation, "owner"], [IDS.association, "cooperator"]]
  );
  assert.deepEqual(client.calls, [{
    rpc: ["get_managed_presentation_summaries", {}]
  }]);
});

test("Presentation detail is gated by the managed summary before reading editor fields", async () => {
  const row = {
    id: IDS.presentation,
    owner_profile_id: IDS.profile,
    title: "Co-operated Presentation",
    activity_type: "project",
    visibility: "draft"
  };
  const client = createClient({
    rpcRows: {
      get_managed_presentation_summaries: [{
        ...row,
        management_role: "cooperator"
      }]
    },
    tables: {
      profile_activities: [row]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  const presentation = await repository.getPresentation(IDS.presentation);
  assert.equal(presentation.managementRole, "cooperator");
  assert.deepEqual(client.calls.slice(0, 2), [{
    rpc: ["get_managed_presentation_summaries", {}]
  }, { from: "profile_activities" }]);

  const unrelatedClient = createClient({
    rpcRows: { get_managed_presentation_summaries: [] },
    tables: { profile_activities: [row] }
  });
  const unrelated = createSupabasePresentationRepository(unrelatedClient);
  assert.equal(await unrelated.getPresentation(IDS.presentation), null);
  assert.deepEqual(unrelatedClient.calls, [{
    rpc: ["get_managed_presentation_summaries", {}]
  }]);
});

test("Presentation identity adapters search and mutate only profile identifiers", async () => {
  const client = createClient({
    rpcRows: {
      search_presentation_artist_profiles: [{
        profile_id: IDS.profile,
        display_name: "Manuel Klappe",
        slug: "manuel-klappe"
      }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  assert.deepEqual(await repository.searchPresentationArtistProfiles("ma"), []);
  assert.deepEqual(await repository.searchPresentationArtistProfiles("man"), [{
    id: IDS.profile,
    displayName: "Manuel Klappe",
    slug: "manuel-klappe"
  }]);
  await repository.setPresentationParticipantProfile(IDS.participant, IDS.profile);
  await repository.setPresentationParticipantProfile(IDS.participant, null);

  assert.deepEqual(client.calls.filter((call) => call.rpc), [
    { rpc: ["search_presentation_artist_profiles", { search_query: "man" }] },
    { rpc: ["set_presentation_participant_profile", {
      target_participant_id: IDS.participant,
      target_profile_id: IDS.profile
    }] },
    { rpc: ["set_presentation_participant_profile", {
      target_participant_id: IDS.participant,
      target_profile_id: null
    }] }
  ]);
  assert.doesNotMatch(JSON.stringify(client.calls), /account_id|invited_account/);
});

test("Presentation Work associations preserve backend statuses and decision contract", async () => {
  const client = createClient({
    rpcRows: {
      get_managed_presentation_works: [{
        id: IDS.association,
        presentation_id: IDS.presentation,
        work_id: IDS.work,
        position: 0,
        is_visible: true,
        status: "pending"
      }],
      get_work_presentation_request_summaries: [{
        association_id: IDS.association,
        presentation_id: IDS.presentation,
        presentation_title: "Gothic Summer",
        presentation_host_display_name: "Peer Vink",
        work_id: IDS.work,
        work_title: "Hedo Maxxing II",
        request_status: "pending",
        requested_at: "2026-09-04T10:00:00Z"
      }, { malformed: true }],
      get_my_presentation_work_request_summaries: [{
        association_id: IDS.association,
        presentation_id: IDS.presentation,
        presentation_title: "Gothic Summer",
        presentation_host_display_name: "Peer Vink",
        work_id: IDS.work,
        work_title: "Hedo Maxxing II",
        request_status: "pending",
        requested_at: "2026-09-04T10:00:00Z"
      }, {
        association_id: IDS.participant,
        presentation_id: IDS.presentation,
        presentation_title: "Second Presentation",
        presentation_host_display_name: "Peer Vink",
        work_id: IDS.profile,
        work_title: "Second Work",
        request_status: "pending",
        requested_at: "2026-09-04T11:00:00Z"
      }, { malformed: true }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  assert.equal((await repository.listManagedPresentationWorks(IDS.presentation))[0].status, "pending");
  const summaries = await repository.listWorkPresentationRequestSummaries(IDS.work);
  assert.equal(summaries.length, 1);
  assert.deepEqual(summaries[0], {
    associationId: IDS.association,
    presentationId: IDS.presentation,
    presentationTitle: "Gothic Summer",
    presentationHostDisplayName: "Peer Vink",
    workId: IDS.work,
    workTitle: "Hedo Maxxing II",
    status: "pending",
    requestedAt: "2026-09-04T10:00:00Z"
  });
  const dashboardSummaries =
    await repository.listMyPresentationWorkRequestSummaries();
  assert.equal(dashboardSummaries.length, 2);
  assert.deepEqual(
    dashboardSummaries.map((summary) => summary.associationId),
    [IDS.association, IDS.participant]
  );
  await repository.proposePresentationWork(IDS.presentation, IDS.work);
  await repository.decidePresentationWork(IDS.association, "accepted");
  await repository.decidePresentationWork(IDS.association, "rejected");
  await repository.setPresentationWorkVisibility(IDS.association, false);
  await repository.removePresentationWork(IDS.association);
  await repository.reorderPresentationWorks(IDS.presentation, [IDS.association]);
  await assert.rejects(
    () => repository.decidePresentationWork(IDS.association, "pending"),
    /WORK PROPOSAL COULD NOT BE DECIDED/
  );

  assert.deepEqual(client.calls.filter((call) => call.rpc).slice(-6), [
    { rpc: ["propose_presentation_work", {
      target_presentation_id: IDS.presentation,
      target_work_id: IDS.work
    }] },
    { rpc: ["decide_presentation_work", {
      target_association_id: IDS.association,
      target_decision: "accepted"
    }] },
    { rpc: ["decide_presentation_work", {
      target_association_id: IDS.association,
      target_decision: "rejected"
    }] },
    { rpc: ["set_presentation_work_visibility", {
      target_association_id: IDS.association,
      target_is_visible: false
    }] },
    { rpc: ["remove_presentation_work", { target_association_id: IDS.association }] },
    { rpc: ["reorder_presentation_works", {
      target_presentation_id: IDS.presentation,
      ordered_association_ids: [IDS.association]
    }] }
  ]);
});

test("co-operator summaries and invitations remain profile-based and RPC-bound", async () => {
  const client = createClient({
    rpcRows: {
      get_managed_presentation_cooperator_summaries: [{
        cooperator_id: IDS.invitation,
        presentation_id: IDS.presentation,
        profile_id: IDS.profile,
        profile_display_name: "Manuel Klappe",
        profile_slug: "manuel-klappe",
        cooperator_status: "accepted",
        invited_at: "2026-09-04T10:00:00Z"
      }],
      get_presentation_cooperator_invitation_summaries: [{
        invitation_id: IDS.invitation,
        presentation_id: IDS.presentation,
        presentation_title: "Gothic Summer",
        presentation_host_display_name: "Peer Vink",
        invitation_status: "pending",
        invited_at: "2026-09-04T10:00:00Z"
      }, { invitation_id: "not-a-uuid" }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  assert.deepEqual(
    await repository.listManagedPresentationCooperatorSummaries(IDS.presentation),
    [{
      id: IDS.invitation,
      presentationId: IDS.presentation,
      profileId: IDS.profile,
      profileDisplayName: "Manuel Klappe",
      profileSlug: "manuel-klappe",
      status: "accepted",
      invitedAt: "2026-09-04T10:00:00Z"
    }]
  );
  const incoming = await repository.listIncomingCooperatorInvitations();
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].status, "pending");
  await repository.invitePresentationCooperatorByProfile(IDS.presentation, IDS.profile);
  await repository.acceptPresentationCooperator(IDS.invitation);
  await repository.declinePresentationCooperator(IDS.invitation);
  await repository.revokePresentationCooperator(IDS.invitation);

  assert.deepEqual(client.calls.filter((call) => call.rpc).slice(-4), [
    { rpc: ["invite_presentation_cooperator_by_profile", {
      target_presentation_id: IDS.presentation,
      target_profile_id: IDS.profile
    }] },
    { rpc: ["accept_presentation_cooperator", { target_invitation_id: IDS.invitation }] },
    { rpc: ["decline_presentation_cooperator", { target_invitation_id: IDS.invitation }] },
    { rpc: ["revoke_presentation_cooperator", { target_invitation_id: IDS.invitation }] }
  ]);
});

test("participation request summaries and decisions use only the safe consent RPC contract", async () => {
  const client = createClient({
    rpcRows: {
      get_my_presentation_participation_request_summaries: [{
        consent_id: IDS.consent,
        presentation_id: IDS.presentation,
        presentation_title: "Gothic Summer",
        presentation_host_display_name: "Peer Vink",
        participant_display_name: "Manuel Klappe",
        consent_status: "pending",
        requested_at: "2026-09-05T10:00:00Z",
        requested_by_account_id: IDS.account
      }, { consent_id: "not-a-uuid" }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  assert.deepEqual(
    await repository.listMyPresentationParticipationRequestSummaries(),
    [{
      consentId: IDS.consent,
      presentationId: IDS.presentation,
      presentationTitle: "Gothic Summer",
      presentationHostDisplayName: "Peer Vink",
      participantDisplayName: "Manuel Klappe",
      status: "pending",
      requestedAt: "2026-09-05T10:00:00Z"
    }]
  );
  await repository.acceptPresentationParticipation(IDS.consent);
  await repository.declinePresentationParticipation(IDS.consent);

  assert.deepEqual(client.calls.filter((call) => call.rpc), [
    { rpc: ["get_my_presentation_participation_request_summaries", {}] },
    { rpc: ["accept_presentation_participation", {
      target_consent_id: IDS.consent
    }] },
    { rpc: ["decline_presentation_participation", {
      target_consent_id: IDS.consent
    }] }
  ]);
  assert.equal(
    JSON.stringify(await repository.listMyPresentationParticipationRequestSummaries())
      .includes("requested_by_account_id"),
    false
  );
});

test("Presentation program adapter uses the scoped visibility RPC and maps historical occurrences", async () => {
  const client = createClient({
    tables: {
      activity_occurrences: [{
        id: IDS.occurrence,
        activity_id: IDS.presentation,
        occurrence_type: "opening",
        title_override: "Opening",
        show_in_agenda: false,
        show_in_presentation: true,
        visibility: "published"
      }]
    }
  });
  const repository = createSupabasePresentationRepository(client);

  const occurrences = await repository.listPresentationProgramOccurrences(IDS.presentation);
  assert.deepEqual(occurrences[0], {
    id: IDS.occurrence,
    ownerProfileId: null,
    presentationId: IDS.presentation,
    occurrenceType: "opening",
    titleOverride: "Opening",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    timeZone: "",
    venueNameOverride: "",
    cityOverride: "",
    showInAgenda: false,
    showInPresentation: true,
    visibility: "published",
    publishedAt: null,
    createdAt: null,
    updatedAt: null
  });
  await repository.setPresentationProgramVisibility(IDS.occurrence, false);

  assert.deepEqual(client.calls.filter((call) => call.rpc), [{
    rpc: ["set_presentation_occurrence_visibility", {
      target_occurrence_id: IDS.occurrence,
      target_show_in_presentation: false
    }]
  }]);
});

test("empty safe summary responses remain empty", async () => {
  const repository = createSupabasePresentationRepository(createClient({
    rpcRows: {
      get_presentation_cooperator_invitation_summaries: [],
      get_work_presentation_request_summaries: [],
      get_my_presentation_work_request_summaries: [],
      get_my_presentation_participation_request_summaries: []
    }
  }));

  assert.deepEqual(await repository.listIncomingCooperatorInvitations(), []);
  assert.deepEqual(await repository.listWorkPresentationRequestSummaries(IDS.work), []);
  assert.deepEqual(await repository.listMyPresentationWorkRequestSummaries(), []);
  assert.deepEqual(await repository.listMyPresentationParticipationRequestSummaries(), []);
});
