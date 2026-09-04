function pendingRequests(rows, kind) {
  return Array.isArray(rows)
    ? rows
      .filter((row) => row?.status === "pending")
      .map((row) => Object.freeze({ ...row, kind }))
    : [];
}

export async function loadDashboardRequests(repository) {
  const [cooperatorInvitations, workRequests] = await Promise.all([
    repository.listIncomingCooperatorInvitations(),
    repository.listMyPresentationWorkRequestSummaries()
  ]);

  return Object.freeze([
    ...pendingRequests(cooperatorInvitations, "cooperator"),
    ...pendingRequests(workRequests, "work")
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
  } else {
    throw new Error("REQUEST COULD NOT BE UPDATED");
  }

  return loadDashboardRequests(repository);
}
