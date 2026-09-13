function pendingRequests(rows, kind) {
  return Array.isArray(rows)
    ? rows
      .filter((row) => row?.status === "pending")
      .map((row) => Object.freeze({ ...row, kind }))
    : [];
}

function comparePublishReadyWorks(first, second) {
  const firstTitle = String(first.workTitle || "").toLowerCase();
  const secondTitle = String(second.workTitle || "").toLowerCase();

  if (firstTitle < secondTitle) return -1;
  if (firstTitle > secondTitle) return 1;
  return String(first.workId).localeCompare(String(second.workId));
}

export function dashboardWorkEditorHref(workId) {
  return `dashboard-work-edit.html?id=${encodeURIComponent(workId)}`;
}

export async function loadDashboardPublishReadyWorks(repository) {
  if (typeof repository?.listPublishReadyWorkActions !== "function") {
    return Object.freeze([]);
  }

  const rows = await repository.listPublishReadyWorkActions();
  return Object.freeze(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => typeof row?.workId === "string" && row.workId.trim())
      .map((row) => Object.freeze({
        kind: "work_ready_to_publish",
        workId: row.workId,
        workTitle: row.workTitle || "UNTITLED",
        href: dashboardWorkEditorHref(row.workId)
      }))
      .sort(comparePublishReadyWorks)
  );
}

export async function acknowledgeDashboardPublishReadyWork(repository, request) {
  if (request?.kind !== "work_ready_to_publish"
    || typeof request.workId !== "string"
    || !request.workId.trim()
    || typeof repository?.acknowledgePublishReadyWorkAction !== "function") {
    throw new Error("WORK READY STATE COULD NOT BE UPDATED");
  }

  await repository.acknowledgePublishReadyWorkAction(request.workId);
}

export async function loadDashboardRequests(repository) {
  const [cooperatorInvitations, workRequests, participationRequests] = await Promise.all([
    repository.listIncomingCooperatorInvitations(),
    repository.listMyPresentationWorkRequestSummaries(),
    repository.listMyPresentationParticipationRequestSummaries()
  ]);

  return Object.freeze([
    ...pendingRequests(cooperatorInvitations, "cooperator"),
    ...pendingRequests(workRequests, "work"),
    ...pendingRequests(participationRequests, "participation")
  ]);
}

export async function decideDashboardRequest(repository, request, decision) {
  if (decision !== "accept" && decision !== "decline") {
    throw new Error("REQUEST COULD NOT BE UPDATED");
  }

  if (request?.kind === "cooperator") {
    if (decision === "accept") {
      await repository.acceptPresentationCooperator(request.invitationId);
    } else {
      await repository.declinePresentationCooperator(request.invitationId);
    }
  } else if (request?.kind === "work") {
    await repository.decidePresentationWork(
      request.associationId,
      decision === "accept" ? "accepted" : "rejected"
    );
  } else if (request?.kind === "participation") {
    if (decision === "accept") {
      await repository.acceptPresentationParticipation(request.consentId);
    } else {
      await repository.declinePresentationParticipation(request.consentId);
    }
  } else {
    throw new Error("REQUEST COULD NOT BE UPDATED");
  }

  return loadDashboardRequests(repository);
}
