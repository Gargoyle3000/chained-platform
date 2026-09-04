import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { normalizeHttpUrl } from "./url-normalization.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRESENTATION_SELECT = [
  "id",
  "owner_profile_id",
  "title",
  "activity_type",
  "venue_name",
  "city",
  "country",
  "start_date",
  "end_date",
  "description",
  "external_url",
  "show_in_presentations",
  "include_in_cv",
  "visibility",
  "published_at",
  "created_at",
  "updated_at"
].join(",");

const PRESENTATION_PROGRAM_SELECT = [
  "id",
  "owner_profile_id",
  "activity_id",
  "occurrence_type",
  "title_override",
  "start_date",
  "end_date",
  "start_time",
  "end_time",
  "time_zone",
  "venue_name_override",
  "city_override",
  "show_in_agenda",
  "show_in_presentation",
  "visibility",
  "published_at",
  "created_at",
  "updated_at"
].join(",");

const PRESENTATION_WORK_STATUSES = new Set([
  "pending",
  "accepted",
  "rejected"
]);

const PRESENTATION_COOPERATOR_STATUSES = new Set([
  "pending",
  "accepted",
  "declined",
  "revoked"
]);

function requireId(id, message = "THIS PRESENTATION IS NOT AVAILABLE") {
  if (!UUID_PATTERN.test(String(id || ""))) {
    throw new Error(message);
  }

  return id;
}

function requireResult(error, data, fallback) {
  if (error) {
    console.error(error);
    throw new Error(fallback);
  }

  return data;
}

function optionalId(value) {
  return UUID_PATTERN.test(String(value || "")) ? value : null;
}

function requireIds(ids, message) {
  if (!Array.isArray(ids) || !ids.length) throw new Error(message);

  const normalized = ids.map((id) => requireId(id, message));

  if (new Set(normalized).size !== normalized.length) {
    throw new Error(message);
  }

  return normalized;
}

function mapRows(rows, mapper) {
  return Array.isArray(rows)
    ? rows.map(mapper).filter(Boolean)
    : [];
}

function cleanText(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function databaseToPresentation(row) {
  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    title: row.title || "",
    activityType: row.activity_type || "",
    venueName: row.venue_name || "",
    city: row.city || "",
    country: row.country || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    description: row.description || "",
    externalUrl: row.external_url || "",
    showInPresentations: row.show_in_presentations !== false,
    includeInCv: row.include_in_cv === true,
    visibility: row.visibility || "draft",
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function presentationToDatabase(record) {
  return {
    title: String(record.title ?? "").trim(),
    activity_type: String(record.activityType ?? "").trim(),
    venue_name: String(record.venueName ?? "").trim(),
    city: String(record.city ?? "").trim(),
    country: cleanText(record.country),
    start_date: cleanText(record.startDate),
    end_date: cleanText(record.endDate),
    description: cleanText(record.description),
    external_url: normalizeHttpUrl(record.externalUrl, null),
    show_in_presentations: record.showInPresentations !== false,
    include_in_cv: record.includeInCv === true
  };
}

function databaseToParticipant(row) {
  if (!optionalId(row?.id) || !optionalId(row?.presentation_id)) {
    return null;
  }

  return Object.freeze({
    id: row.id,
    presentationId: row.presentation_id,
    linkedProfileId: optionalId(row.linked_profile_id),
    displayName: String(row.display_name || "").trim(),
    position: Number.isInteger(row.position) ? row.position : 0,
    isVisible: row.is_visible !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  });
}

function databaseToPresentationWork(row) {
  if (
    !optionalId(row?.id) ||
    !optionalId(row?.presentation_id) ||
    !optionalId(row?.work_id) ||
    !PRESENTATION_WORK_STATUSES.has(row.status)
  ) {
    return null;
  }

  return Object.freeze({
    id: row.id,
    presentationId: row.presentation_id,
    workId: row.work_id,
    position: Number.isInteger(row.position) ? row.position : 0,
    isVisible: row.is_visible !== false,
    status: row.status,
    requestedAt: row.requested_at || null,
    decidedAt: row.decided_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  });
}

function databaseToManagedCooperatorSummary(row) {
  if (
    !optionalId(row?.cooperator_id) ||
    !optionalId(row?.presentation_id) ||
    !PRESENTATION_COOPERATOR_STATUSES.has(row.cooperator_status)
  ) {
    return null;
  }

  return Object.freeze({
    id: row.cooperator_id,
    presentationId: row.presentation_id,
    profileId: optionalId(row.profile_id),
    profileDisplayName: String(row.profile_display_name || "").trim(),
    profileSlug: String(row.profile_slug || "").trim(),
    status: row.cooperator_status,
    invitedAt: row.invited_at || null
  });
}

function databaseToPresentationArtistProfile(row) {
  if (!optionalId(row?.profile_id)) return null;

  return Object.freeze({
    id: row.profile_id,
    displayName: String(row.display_name || "").trim(),
    slug: String(row.slug || "").trim()
  });
}

function databaseToWorkRequestSummary(row) {
  if (
    !optionalId(row?.association_id) ||
    !optionalId(row?.presentation_id) ||
    !optionalId(row?.work_id) ||
    !PRESENTATION_WORK_STATUSES.has(row.request_status)
  ) {
    return null;
  }

  return Object.freeze({
    associationId: row.association_id,
    presentationId: row.presentation_id,
    presentationTitle: String(row.presentation_title || "").trim(),
    presentationHostDisplayName: String(
      row.presentation_host_display_name || ""
    ).trim(),
    workId: row.work_id,
    workTitle: String(row.work_title || "").trim(),
    status: row.request_status,
    requestedAt: row.requested_at || null
  });
}

function databaseToCooperatorInvitationSummary(row) {
  if (
    !optionalId(row?.invitation_id) ||
    !optionalId(row?.presentation_id) ||
    !PRESENTATION_COOPERATOR_STATUSES.has(row.invitation_status)
  ) {
    return null;
  }

  return Object.freeze({
    invitationId: row.invitation_id,
    presentationId: row.presentation_id,
    presentationTitle: String(row.presentation_title || "").trim(),
    presentationHostDisplayName: String(
      row.presentation_host_display_name || ""
    ).trim(),
    status: row.invitation_status,
    invitedAt: row.invited_at || null
  });
}

function databaseToPresentationProgramOccurrence(row) {
  if (!optionalId(row?.id) || !optionalId(row?.activity_id)) {
    return null;
  }

  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id || null,
    presentationId: row.activity_id,
    occurrenceType: row.occurrence_type || "",
    titleOverride: row.title_override || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    timeZone: row.time_zone || "",
    venueNameOverride: row.venue_name_override || "",
    cityOverride: row.city_override || "",
    showInAgenda: row.show_in_agenda === true,
    showInPresentation: row.show_in_presentation === true,
    visibility: row.visibility || "draft",
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  });
}

function presentationProgramToDatabase(record) {
  return {
    occurrence_type: String(record.occurrenceType ?? "").trim(),
    title_override: cleanText(record.titleOverride),
    start_date: cleanText(record.startDate),
    end_date: cleanText(record.endDate),
    start_time: cleanText(record.startTime),
    end_time: cleanText(record.endTime),
    time_zone: cleanText(record.timeZone),
    venue_name_override: cleanText(record.venueNameOverride),
    city_override: cleanText(record.cityOverride),
    show_in_agenda: false
  };
}

async function callRpc(client, name, args, fallback) {
  const { data, error } = await client.rpc(name, args);
  return requireResult(error, data, fallback);
}

function createUnavailableRepository() {
  return Object.freeze({
    mode: "prototype",
    initialise: async () => {},
    listManagedProfiles: async () => [],
    listPresentations: async () => [],
    getPresentation: async () => null,
    async createPresentation() {
      throw new Error("PRESENTATIONS ARE CURRENTLY UNAVAILABLE");
    },
    async updatePresentation() {
      throw new Error("PRESENTATIONS ARE CURRENTLY UNAVAILABLE");
    },
    async publishPresentation() {
      throw new Error("PRESENTATIONS ARE CURRENTLY UNAVAILABLE");
    },
    async unpublishPresentation() {
      throw new Error("PRESENTATIONS ARE CURRENTLY UNAVAILABLE");
    },
    async deletePresentation() {
      throw new Error("PRESENTATIONS ARE CURRENTLY UNAVAILABLE");
    },
    async listManagedParticipants() {
      return [];
    },
    async getManagedParticipant() {
      return null;
    },
    async listManagedPresentationWorks() {
      return [];
    },
    async searchPresentationArtistProfiles() {
      return [];
    },
    async setPresentationParticipantProfile() {
      throw new Error("PRESENTATION PARTICIPANTS ARE CURRENTLY UNAVAILABLE");
    },
    async listManagedPresentationCooperatorSummaries() {
      return [];
    },
    async invitePresentationCooperatorByProfile() {
      throw new Error("PRESENTATION CO-OPERATORS ARE CURRENTLY UNAVAILABLE");
    },
    async listIncomingCooperatorInvitations() {
      return [];
    },
    async listWorkPresentationRequestSummaries() {
      return [];
    },
    async listMyPresentationWorkRequestSummaries() {
      return [];
    },
    async listPresentationProgramOccurrences() {
      return [];
    },
    async setPresentationProgramVisibility() {
      throw new Error("PRESENTATION PROGRAM IS CURRENTLY UNAVAILABLE");
    }
  });
}

export function createSupabasePresentationRepository(client) {
  return Object.freeze({
    mode: "supabase",

    initialise: async () => {},

    async listManagedProfiles() {
      const { data, error } = await client.rpc(
        "list_manageable_artist_profiles"
      );

      return requireResult(
        error,
        data,
        "ARTIST PROFILES ARE UNAVAILABLE"
      ).map((row) =>
        Object.freeze({
          id: row.id,
          name: row.display_name,
          slug: row.slug,
          publicationStatus: row.publication_status
        })
      );
    },

    async listPresentations(profileIds = []) {
      if (!profileIds.length) return [];

      const { data, error } = await client
        .from("profile_activities")
        .select(PRESENTATION_SELECT)
        .in("owner_profile_id", profileIds)
        .order("start_date", {
          ascending: false,
          nullsFirst: false
        })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });

      return requireResult(
        error,
        data,
        "PRESENTATIONS ARE UNAVAILABLE"
      ).map(databaseToPresentation);
    },

    async getPresentation(id) {
      const { data, error } = await client
        .from("profile_activities")
        .select(PRESENTATION_SELECT)
        .eq("id", requireId(id))
        .maybeSingle();

      const presentation = requireResult(
        error,
        data,
        "PRESENTATION IS UNAVAILABLE"
      );

      return presentation
        ? databaseToPresentation(presentation)
        : null;
    },

    async createPresentation(record, ownerProfileId) {
      const payload = {
        owner_profile_id: requireId(
          ownerProfileId,
          "ARTIST PROFILE IS UNAVAILABLE"
        ),
        ...presentationToDatabase(record)
      };

      const { data, error } = await client
        .from("profile_activities")
        .insert(payload)
        .select(PRESENTATION_SELECT)
        .single();

      return databaseToPresentation(
        requireResult(error, data, "PRESENTATION COULD NOT BE SAVED")
      );
    },

    async updatePresentation(record, expectedUpdatedAt) {
      requireId(record.id);

      const { data, error } = await client
        .from("profile_activities")
        .update(presentationToDatabase(record))
        .eq("id", record.id)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION COULD NOT BE SAVED");
      }

      if (!data) {
        const { data: current } = await client
          .from("profile_activities")
          .select("id")
          .eq("id", record.id)
          .maybeSingle();

        if (current) {
          throw new Error("THIS PRESENTATION CHANGED ELSEWHERE");
        }

        throw new Error("THIS PRESENTATION IS NOT AVAILABLE");
      }

      return databaseToPresentation(data);
    },

    async publishPresentation(id, expectedUpdatedAt) {
      const presentationId = requireId(id);

      const { data, error } = await client
        .from("profile_activities")
        .update({ visibility: "published" })
        .eq("id", presentationId)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION COULD NOT BE PUBLISHED");
      }

      if (!data) {
        const { data: current } = await client
          .from("profile_activities")
          .select("id")
          .eq("id", presentationId)
          .maybeSingle();

        if (current) {
          throw new Error("THIS PRESENTATION CHANGED ELSEWHERE");
        }

        throw new Error("THIS PRESENTATION IS NOT AVAILABLE");
      }

      return databaseToPresentation(data);
    },

    async unpublishPresentation(id, expectedUpdatedAt) {
      const presentationId = requireId(id);

      const { data, error } = await client
        .from("profile_activities")
        .update({ visibility: "draft" })
        .eq("id", presentationId)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION COULD NOT BE UNPUBLISHED");
      }

      if (!data) {
        const { data: current } = await client
          .from("profile_activities")
          .select("id")
          .eq("id", presentationId)
          .maybeSingle();

        if (current) {
          throw new Error("THIS PRESENTATION CHANGED ELSEWHERE");
        }

        throw new Error("THIS PRESENTATION IS NOT AVAILABLE");
      }

      return databaseToPresentation(data);
    },

    async deletePresentation(id) {
      const { data, error } = await client.rpc(
        "soft_delete_profile_activity",
        { target_activity_id: requireId(id) }
      );

      requireResult(error, data, "PRESENTATION COULD NOT BE DELETED");
    },

    async listManagedParticipants(presentationId) {
      const data = await callRpc(
        client,
        "get_managed_presentation_participants",
        { target_presentation_id: requireId(presentationId) },
        "PRESENTATION PARTICIPANTS ARE UNAVAILABLE"
      );

      return mapRows(data, databaseToParticipant);
    },

    async getManagedParticipant(presentationId, participantId) {
      const targetParticipantId = requireId(
        participantId,
        "PRESENTATION PARTICIPANT IS UNAVAILABLE"
      );
      const data = await callRpc(
        client,
        "get_managed_presentation_participants",
        { target_presentation_id: requireId(presentationId) },
        "PRESENTATION PARTICIPANTS ARE UNAVAILABLE"
      );
      const participants = mapRows(data, databaseToParticipant);

      return participants.find(
        (participant) => participant.id === targetParticipantId
      ) || null;
    },

    async createParticipant(presentationId, record) {
      return callRpc(
        client,
        "create_presentation_participant",
        {
          target_presentation_id: requireId(presentationId),
          participant_display_name: String(record?.displayName ?? "").trim(),
          target_linked_profile_id: record?.linkedProfileId
            ? requireId(record.linkedProfileId, "PARTICIPANT COULD NOT BE SAVED")
            : null
        },
        "PARTICIPANT COULD NOT BE SAVED"
      );
    },

    async updateParticipant(participantId, record) {
      return callRpc(
        client,
        "update_presentation_participant",
        {
          target_participant_id: requireId(participantId),
          participant_display_name: String(record?.displayName ?? "").trim(),
          target_linked_profile_id: record?.linkedProfileId
            ? requireId(record.linkedProfileId, "PARTICIPANT COULD NOT BE SAVED")
            : null,
          participant_is_visible: record?.isVisible !== false
        },
        "PARTICIPANT COULD NOT BE SAVED"
      );
    },

    async removeParticipant(participantId) {
      return callRpc(
        client,
        "remove_presentation_participant",
        { target_participant_id: requireId(participantId) },
        "PARTICIPANT COULD NOT BE REMOVED"
      );
    },

    async reorderParticipants(presentationId, participantIds) {
      return callRpc(
        client,
        "reorder_presentation_participants",
        {
          target_presentation_id: requireId(presentationId),
          ordered_participant_ids: requireIds(
            participantIds,
            "PARTICIPANT ORDER COULD NOT BE SAVED"
          )
        },
        "PARTICIPANT ORDER COULD NOT BE SAVED"
      );
    },

    async searchPresentationArtistProfiles(query) {
      const normalizedQuery = String(query ?? "").trim();

      if (normalizedQuery.length < 3) return [];

      const data = await callRpc(
        client,
        "search_presentation_artist_profiles",
        { search_query: normalizedQuery },
        "ARTIST PROFILE SEARCH IS UNAVAILABLE"
      );

      return mapRows(data, databaseToPresentationArtistProfile);
    },

    async setPresentationParticipantProfile(participantId, profileId = null) {
      return callRpc(
        client,
        "set_presentation_participant_profile",
        {
          target_participant_id: requireId(
            participantId,
            "PARTICIPANT PROFILE COULD NOT BE SAVED"
          ),
          target_profile_id: profileId
            ? requireId(profileId, "PARTICIPANT PROFILE COULD NOT BE SAVED")
            : null
        },
        "PARTICIPANT PROFILE COULD NOT BE SAVED"
      );
    },

    async listManagedPresentationWorks(presentationId) {
      const data = await callRpc(
        client,
        "get_managed_presentation_works",
        { target_presentation_id: requireId(presentationId) },
        "PRESENTATION WORKS ARE UNAVAILABLE"
      );

      return mapRows(data, databaseToPresentationWork);
    },

    async proposePresentationWork(presentationId, workId) {
      return callRpc(
        client,
        "propose_presentation_work",
        {
          target_presentation_id: requireId(presentationId),
          target_work_id: requireId(workId, "WORK PROPOSAL COULD NOT BE SENT")
        },
        "WORK PROPOSAL COULD NOT BE SENT"
      );
    },

    async decidePresentationWork(associationId, decision) {
      if (!PRESENTATION_WORK_STATUSES.has(decision) || decision === "pending") {
        throw new Error("WORK PROPOSAL COULD NOT BE DECIDED");
      }

      return callRpc(
        client,
        "decide_presentation_work",
        {
          target_association_id: requireId(associationId),
          target_decision: decision
        },
        "WORK PROPOSAL COULD NOT BE DECIDED"
      );
    },

    async setPresentationWorkVisibility(associationId, isVisible) {
      if (typeof isVisible !== "boolean") {
        throw new Error("PRESENTATION WORK COULD NOT BE SAVED");
      }

      return callRpc(
        client,
        "set_presentation_work_visibility",
        {
          target_association_id: requireId(associationId),
          target_is_visible: isVisible
        },
        "PRESENTATION WORK COULD NOT BE SAVED"
      );
    },

    async removePresentationWork(associationId) {
      return callRpc(
        client,
        "remove_presentation_work",
        { target_association_id: requireId(associationId) },
        "PRESENTATION WORK COULD NOT BE REMOVED"
      );
    },

    async reorderPresentationWorks(presentationId, associationIds) {
      return callRpc(
        client,
        "reorder_presentation_works",
        {
          target_presentation_id: requireId(presentationId),
          ordered_association_ids: requireIds(
            associationIds,
            "PRESENTATION WORK ORDER COULD NOT BE SAVED"
          )
        },
        "PRESENTATION WORK ORDER COULD NOT BE SAVED"
      );
    },

    async listWorkPresentationRequestSummaries(workId) {
      const data = await callRpc(
        client,
        "get_work_presentation_request_summaries",
        { target_work_id: requireId(workId, "WORK REQUESTS ARE UNAVAILABLE") },
        "WORK REQUESTS ARE UNAVAILABLE"
      );

      return mapRows(data, databaseToWorkRequestSummary);
    },

    async listMyPresentationWorkRequestSummaries() {
      const data = await callRpc(
        client,
        "get_my_presentation_work_request_summaries",
        {},
        "WORK REQUESTS ARE UNAVAILABLE"
      );

      return mapRows(data, databaseToWorkRequestSummary);
    },

    async listManagedPresentationCooperatorSummaries(presentationId) {
      const data = await callRpc(
        client,
        "get_managed_presentation_cooperator_summaries",
        { target_presentation_id: requireId(presentationId) },
        "PRESENTATION CO-OPERATORS ARE UNAVAILABLE"
      );

      return mapRows(data, databaseToManagedCooperatorSummary);
    },

    async invitePresentationCooperatorByProfile(presentationId, profileId) {
      return callRpc(
        client,
        "invite_presentation_cooperator_by_profile",
        {
          target_presentation_id: requireId(presentationId),
          target_profile_id: requireId(
            profileId,
            "CO-OPERATOR COULD NOT BE INVITED"
          )
        },
        "CO-OPERATOR COULD NOT BE INVITED"
      );
    },

    async acceptPresentationCooperator(invitationId) {
      return callRpc(
        client,
        "accept_presentation_cooperator",
        { target_invitation_id: requireId(invitationId) },
        "CO-OPERATOR INVITATION COULD NOT BE ACCEPTED"
      );
    },

    async declinePresentationCooperator(invitationId) {
      return callRpc(
        client,
        "decline_presentation_cooperator",
        { target_invitation_id: requireId(invitationId) },
        "CO-OPERATOR INVITATION COULD NOT BE DECLINED"
      );
    },

    async revokePresentationCooperator(invitationId) {
      return callRpc(
        client,
        "revoke_presentation_cooperator",
        { target_invitation_id: requireId(invitationId) },
        "CO-OPERATOR INVITATION COULD NOT BE REVOKED"
      );
    },

    async listIncomingCooperatorInvitations() {
      const data = await callRpc(
        client,
        "get_presentation_cooperator_invitation_summaries",
        {},
        "CO-OPERATOR INVITATIONS ARE UNAVAILABLE"
      );

      return mapRows(data, databaseToCooperatorInvitationSummary);
    },

    async listPresentationProgramOccurrences(presentationId) {
      const { data, error } = await client
        .from("activity_occurrences")
        .select(PRESENTATION_PROGRAM_SELECT)
        .eq("activity_id", requireId(presentationId))
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });

      return mapRows(
        requireResult(error, data, "PRESENTATION PROGRAM IS UNAVAILABLE"),
        databaseToPresentationProgramOccurrence
      );
    },

    async createPresentationProgramOccurrence(record, ownerProfileId, presentationId) {
      const { data, error } = await client
        .from("activity_occurrences")
        .insert({
          owner_profile_id: requireId(ownerProfileId, "PRESENTATION PROGRAM COULD NOT BE SAVED"),
          activity_id: requireId(presentationId),
          ...presentationProgramToDatabase(record)
        })
        .select(PRESENTATION_PROGRAM_SELECT)
        .single();

      return databaseToPresentationProgramOccurrence(
        requireResult(error, data, "PRESENTATION PROGRAM COULD NOT BE SAVED")
      );
    },

    async updatePresentationProgramOccurrence(record, expectedUpdatedAt) {
      requireId(record?.id, "PRESENTATION PROGRAM COULD NOT BE SAVED");

      const { data, error } = await client
        .from("activity_occurrences")
        .update(presentationProgramToDatabase(record))
        .eq("id", record.id)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_PROGRAM_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION PROGRAM COULD NOT BE SAVED");
      }

      if (!data) throw new Error("PRESENTATION PROGRAM CHANGED ELSEWHERE");

      return databaseToPresentationProgramOccurrence(data);
    },

    async setPresentationProgramVisibility(occurrenceId, isVisible) {
      if (typeof isVisible !== "boolean") {
        throw new Error("PRESENTATION PROGRAM COULD NOT BE SAVED");
      }

      return callRpc(
        client,
        "set_presentation_occurrence_visibility",
        {
          target_occurrence_id: requireId(occurrenceId),
          target_show_in_presentation: isVisible
        },
        "PRESENTATION PROGRAM COULD NOT BE SAVED"
      );
    },

    async deletePresentationProgramOccurrence(occurrenceId) {
      return callRpc(
        client,
        "soft_delete_activity_occurrence",
        { target_occurrence_id: requireId(occurrenceId) },
        "PRESENTATION PROGRAM COULD NOT BE DELETED"
      );
    }
  });
}

export function selectPresentationRepository(runtime) {
  if (
    runtime.mode === FRONTEND_MODES.SUPABASE &&
    runtime.client
  ) {
    return createSupabasePresentationRepository(runtime.client);
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return createUnavailableRepository();
  }

  throw new Error("Presentation repository mode is invalid.");
}

export async function getPresentationRepository() {
  const runtime = await getFrontendRuntime();

  return Object.freeze({
    runtime,
    repository: selectPresentationRepository(runtime)
  });
}
