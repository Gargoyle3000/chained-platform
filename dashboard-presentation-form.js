document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getPresentationRepository } =
    await import("./data/presentation-repository.mjs");

  const { normalizeHttpUrl } =
    await import("./data/url-normalization.mjs");

  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const form = document.querySelector("#presentation-form");
  const errorElement =
    document.querySelector("#presentation-form-error");
  const statusElement =
    document.querySelector("#presentation-form-status");
  const headingElement =
    document.querySelector("#presentation-editor-heading");
  const contextElement =
    document.querySelector("#presentation-editor-context");
  const ownerField =
    document.querySelector("#presentation-owner-field");
  const ownerSelect =
    document.querySelector("#presentation-owner-profile");
  const deleteButton =
    document.querySelector("#presentation-delete");
  const publicationButton =
    document.querySelector("#presentation-publication");

  const agendaButton =
    document.querySelector("#presentation-add-agenda");
  const saveButton =
    document.querySelector(".presentation-form-save");
  const participantsSection = document.querySelector("#presentation-participants-section");
  const participantsList = document.querySelector("#presentation-participants-list");
  const participantAddForm = document.querySelector("#presentation-participant-add");
  const cooperatorsSection = document.querySelector("#presentation-cooperators-section");
  const cooperatorsList = document.querySelector("#presentation-cooperators-list");
  const cooperatorInviteForm = document.querySelector("#presentation-cooperator-invite");
  const cooperatorSearchInput = cooperatorInviteForm?.elements.namedItem("cooperator-profile-search");
  const cooperatorSearchResults = document.querySelector("#presentation-cooperator-results");
  const programSection = document.querySelector("#presentation-program-section");
  const programList = document.querySelector("#presentation-program-list");
  const programAddForm = document.querySelector("#presentation-program-add");

  let repository;
  let currentPresentationId = null;
  let expectedUpdatedAt = null;
  let currentVisibility = "draft";
  let managedProfiles = [];
  let currentPresentation = null;
  let isOwnerManager = false;

  function field(name) {
    return form.elements.namedItem(name);
  }

  function setError(message = "") {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function setStatus(message = "") {
    statusElement.textContent = message;
    statusElement.hidden = !message;
  }

  function setFormDisabled(disabled) {
    [...form.elements].forEach((element) => {
      element.disabled = disabled;
    });
  }

  function normaliseUrl(value) {
    try {
      return normalizeHttpUrl(value);
    } catch {
      throw new Error("EXTERNAL URL MUST BE A VALID HTTP OR HTTPS URL");
    }
  }

  function readRecord() {
    let externalUrl;
    try {
      externalUrl = normaliseUrl(field("external-url").value);
    } catch (error) {
      field("external-url").setAttribute("aria-invalid", "true");
      throw error;
    }

    return {
      id: currentPresentationId,
      title: field("title").value,
      activityType: field("activity-type").value,
      venueName: field("venue-name").value,
      city: field("city").value,
      country: field("country").value,
      startDate: field("start-date").value,
      endDate: field("end-date").value,
      description: field("description").value,
      externalUrl,
      showInPresentations:
        field("show-in-presentations").checked,
      includeInCv:
        field("include-in-cv").checked
    };
  }

  function validateRecord(record) {
    if (
      record.startDate &&
      record.endDate &&
      record.endDate < record.startDate
    ) {
      throw new Error(
        "END DATE CANNOT BE BEFORE START DATE"
      );
    }
  }

  function validatePublication(record) {
    const requiredFields = [
      ["TITLE", record.title],
      ["TYPE", record.activityType],
      ["VENUE", record.venueName],
      ["CITY", record.city],
      ["START DATE", record.startDate]
    ];

    const missingFields = requiredFields
      .filter(([, value]) => !String(value || "").trim())
      .map(([label]) => label);

    if (missingFields.length) {
      throw new Error(
        `COMPLETE BEFORE PUBLISHING: ${missingFields.join(", ")}`
      );
    }
  }

  function populateForm(presentation) {
    field("title").value = presentation.title || "";
    field("activity-type").value =
      presentation.activityType || "";
    field("venue-name").value =
      presentation.venueName || "";
    field("city").value = presentation.city || "";
    field("country").value = presentation.country || "";
    field("start-date").value =
      presentation.startDate || "";
    field("end-date").value =
      presentation.endDate || "";
    field("description").value =
      presentation.description || "";
    field("external-url").value =
      presentation.externalUrl || "";
    field("show-in-presentations").checked =
      presentation.showInPresentations !== false;
    field("include-in-cv").checked =
      presentation.includeInCv === true;
  }

  function updateEditorState(presentation = null) {
    const editing = Boolean(presentation);

    contextElement.textContent = editing
      ? "PRESENTATIONS / EDIT PRESENTATION"
      : "PRESENTATIONS / ADD PRESENTATION";

    headingElement.textContent = editing
      ? presentation.title || "UNTITLED PRESENTATION"
      : "NEW PRESENTATION";

    document.title = editing
      ? `${presentation.title || "Untitled Presentation"} — CHAINED Dashboard`
      : "Add Presentation — CHAINED Dashboard";

    deleteButton.hidden = !editing;
    publicationButton.hidden = !editing;
    agendaButton.hidden = !editing;

    if (editing) {
      agendaButton.href =
        `dashboard-agenda-edit.html?presentation=${encodeURIComponent(
          presentation.id
        )}`;
    }

    if (editing) {
      const published =
        presentation.visibility === "published";

      ownerSelect.disabled = true;

      publicationButton.textContent = published
        ? "[ UNPUBLISH ]"
        : "[ PUBLISH ]";

      saveButton.textContent = published
        ? "[ SAVE CHANGES ]"
        : "[ SAVE DRAFT ]";
    } else {
      saveButton.textContent = "[ SAVE DRAFT ]";
    }
  }

  function populateOwnerProfiles(profiles) {
    ownerSelect.replaceChildren(
      ...profiles.map((profile) => {
        const option = document.createElement("option");

        option.value = profile.id;
        option.textContent = profile.name;

        return option;
      })
    );

    ownerField.hidden = profiles.length <= 1;
  }

  function emptyContext(text) {
    const item = document.createElement("p");
    item.className = "dashboard-empty-state";
    item.textContent = text;
    return item;
  }

  function action(label, handler) {
    const button = document.createElement("button");
    let busy = false;
    button.type = "button";
    button.className = "text-action";
    button.textContent = `[ ${label} ]`;
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      button.disabled = true;
      try {
        await handler();
      } finally {
        busy = false;
        button.disabled = false;
      }
    });
    return button;
  }

  function clearProfileResults(element) {
    element.replaceChildren();
    element.hidden = true;
  }

  function attachProfileSearch(input, results, onSelect) {
    let requestVersion = 0;

    input.addEventListener("input", async () => {
      const query = input.value.trim();
      const version = ++requestVersion;
      clearProfileResults(results);

      if (query.length < 3) return;

      try {
        const profiles = await repository.searchPresentationArtistProfiles(query);
        if (version !== requestVersion) return;

        results.replaceChildren(...(profiles.length ? profiles.map((profile) => {
          const select = action(
            `${profile.displayName || profile.slug} · ${profile.slug}`,
            async () => onSelect(profile)
          );
          select.classList.add("presentation-profile-result");
          return select;
        }) : [emptyContext("NO ARTIST PROFILES")]));
        results.hidden = false;
      } catch {
        if (version !== requestVersion) return;
        setError("ARTIST PROFILE SEARCH IS CURRENTLY UNAVAILABLE");
      }
    });
  }

  function createParticipantProfileLinker(participant) {
    const linker = document.createElement("div");
    const search = document.createElement("input");
    const results = document.createElement("div");
    const label = document.createElement("label");

    linker.className = "presentation-profile-linker";
    label.className = "work-form-field";
    label.textContent = "LINK CHAINED ARTIST";
    search.type = "search";
    search.maxLength = 100;
    search.placeholder = "SEARCH ARTIST PROFILE";
    search.autocomplete = "off";
    label.append(search);
    results.className = "presentation-profile-results";
    results.hidden = true;
    linker.append(label, results);

    attachProfileSearch(search, results, async (profile) => {
      try {
        await repository.setPresentationParticipantProfile(participant.id, profile.id);
        await refreshContext();
      } catch {
        setError("PARTICIPANT PROFILE COULD NOT BE SAVED");
      }
    });

    return linker;
  }

  async function refreshContext() {
    if (!currentPresentationId) return;
    const [participants, cooperators, program] = await Promise.all([
      repository.listManagedParticipants(currentPresentationId),
      repository.listManagedPresentationCooperatorSummaries(currentPresentationId),
      repository.listPresentationProgramOccurrences(currentPresentationId)
    ]);
    participantsSection.hidden = false;
    cooperatorsSection.hidden = false;
    programSection.hidden = false;
    participantsList.replaceChildren(...(participants.length ? participants.map((participant, index) => {
      const row = document.createElement("div");
      const name = document.createElement("input");
      const visible = document.createElement("input");
      const controls = document.createElement("div");
      row.className = "presentation-context-row";
      name.value = participant.displayName;
      name.maxLength = 300;
      visible.type = "checkbox";
      visible.checked = participant.isVisible;
      controls.className = "presentation-context-actions";
      controls.append(
        action("SAVE", async () => { try { await repository.updateParticipant(participant.id, { displayName: name.value, linkedProfileId: participant.linkedProfileId, isVisible: visible.checked }); await refreshContext(); } catch { setError("PARTICIPANT COULD NOT BE SAVED"); } }),
        action("UP", async () => { if (index) { const ids = participants.map((item) => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await repository.reorderParticipants(currentPresentationId, ids); await refreshContext(); } }),
        action("DOWN", async () => { if (index < participants.length - 1) { const ids = participants.map((item) => item.id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; await repository.reorderParticipants(currentPresentationId, ids); await refreshContext(); } }),
        action("REMOVE", async () => { if (window.confirm("REMOVE THIS PARTICIPANT?")) { await repository.removeParticipant(participant.id); await refreshContext(); } })
      );
      if (participant.linkedProfileId) {
        const linked = document.createElement("p");
        linked.className = "presentation-linked-profile";
        linked.textContent = "CHAINED ARTIST LINKED";
        controls.append(action("UNLINK", async () => { try { await repository.setPresentationParticipantProfile(participant.id, null); await refreshContext(); } catch { setError("PARTICIPANT PROFILE COULD NOT BE SAVED"); } }));
        row.append(name, visible, linked, controls);
      } else {
        const linkProfile = action("LINK PROFILE", async () => {
          linkProfile.replaceWith(createParticipantProfileLinker(participant));
        });
        controls.append(linkProfile);
        row.append(name, visible, controls);
      }
      return row;
    }) : [emptyContext("NO PARTICIPANTS")]));
    const activeCooperators = cooperators.filter((item) => item.status === "pending" || item.status === "accepted");
    cooperatorsList.replaceChildren(...(activeCooperators.length ? activeCooperators.map((cooperator) => {
      const row = document.createElement("div");
      const text = document.createElement("p");
      const controls = document.createElement("div");
      row.className = "presentation-context-row";
      text.textContent = `${cooperator.profileDisplayName || "CHAINED ARTIST"} · ${cooperator.status.toUpperCase()}`;
      controls.className = "presentation-context-actions";
      if (isOwnerManager) controls.append(action("REVOKE", async () => { if (window.confirm("REVOKE THIS CO-OPERATOR?")) { try { await repository.revokePresentationCooperator(cooperator.id); await refreshContext(); } catch { setError("CO-OPERATOR COULD NOT BE REVOKED"); } } }));
      row.append(text, controls);
      return row;
    }) : [emptyContext("NO CO-OPERATORS")]));
    cooperatorInviteForm.hidden = !isOwnerManager;
    const orderedProgram = [...program].sort((a, b) => `${a.startDate || ""}${a.startTime || ""}`.localeCompare(`${b.startDate || ""}${b.startTime || ""}`));
    programList.replaceChildren(...(orderedProgram.length ? orderedProgram.map((item) => {
      const row = document.createElement("div");
      const title = document.createElement("input");
      const visible = document.createElement("input");
      const controls = document.createElement("div");
      row.className = "presentation-context-row";
      title.value = item.titleOverride || "";
      title.maxLength = 300;
      title.setAttribute("aria-label", [item.startDate, item.occurrenceType, item.startTime].filter(Boolean).join(" · ") || "PROGRAM ITEM");
      visible.type = "checkbox"; visible.checked = item.showInPresentation; visible.setAttribute("aria-label", "SHOW IN PRESENTATION");
      controls.className = "presentation-context-actions";
      controls.append(
        action("SAVE", async () => { await repository.updatePresentationProgramOccurrence({ ...item, titleOverride: title.value }, item.updatedAt); await repository.setPresentationProgramVisibility(item.id, visible.checked); await refreshContext(); }),
        action("REMOVE", async () => { if (window.confirm("REMOVE THIS PROGRAM ITEM?")) { await repository.deletePresentationProgramOccurrence(item.id); await refreshContext(); } })
      );
      row.append(title, visible, controls);
      return row;
    }) : [emptyContext("NO PROGRAM")]));
  }

  participantAddForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = participantAddForm.elements.namedItem("participant-name").value.trim();
    if (!name) return;
    try { await repository.createParticipant(currentPresentationId, { displayName: name }); participantAddForm.reset(); await refreshContext(); } catch { setError("PARTICIPANT COULD NOT BE SAVED"); }
  });

  if (cooperatorSearchInput && cooperatorSearchResults && cooperatorInviteForm) {
    let selectedCooperatorProfile = null;
    const inviteButton = cooperatorInviteForm.querySelector('button[type="submit"]');

    cooperatorSearchInput.addEventListener("input", () => {
      selectedCooperatorProfile = null;
      inviteButton.disabled = true;
    });

    attachProfileSearch(cooperatorSearchInput, cooperatorSearchResults, async (profile) => {
      selectedCooperatorProfile = profile;
      cooperatorSearchInput.value = profile.displayName || profile.slug;
      clearProfileResults(cooperatorSearchResults);
      inviteButton.disabled = false;
    });

    cooperatorInviteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedCooperatorProfile || inviteButton.disabled) return;
      inviteButton.disabled = true;
      try {
        await repository.invitePresentationCooperatorByProfile(
          currentPresentationId,
          selectedCooperatorProfile.id
        );
        selectedCooperatorProfile = null;
        cooperatorInviteForm.reset();
        await refreshContext();
      } catch {
        inviteButton.disabled = false;
        setError("CO-OPERATOR COULD NOT BE INVITED");
      }
    });
  }

  programAddForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = programAddForm.elements.namedItem("program-title").value.trim();
    if (!title) return;
    try {
      const saved = await repository.createPresentationProgramOccurrence({ titleOverride: title, startDate: programAddForm.elements.namedItem("program-date").value, startTime: programAddForm.elements.namedItem("program-start-time").value, occurrenceType: programAddForm.elements.namedItem("program-type").value, showInPresentation: programAddForm.elements.namedItem("program-visible").checked }, currentPresentation.ownerProfileId, currentPresentationId);
      if (programAddForm.elements.namedItem("program-visible").checked) {
        await repository.setPresentationProgramVisibility(saved.id, true);
      }
      programAddForm.reset(); await refreshContext();
    } catch { setError("PROGRAM ITEM COULD NOT BE SAVED"); }
  });

  function createDeleteConfirmation() {
    const confirmation = document.createElement("div");
    const prompt = document.createElement("p");
    const actions = document.createElement("div");
    const confirm = document.createElement("button");
    const cancel = document.createElement("button");

    confirmation.className =
      "dashboard-delete-confirmation";
    actions.className = "dashboard-delete-actions";

    prompt.textContent =
      currentVisibility === "published"
        ? "UNPUBLISH THIS PRESENTATION BEFORE DELETING IT."
        : "DELETE THIS PRESENTATION?";

    confirm.type = "button";
    confirm.className = "text-action";
    confirm.textContent = "[ CONFIRM DELETE ]";
    confirm.disabled = currentVisibility === "published";

    cancel.type = "button";
    cancel.className = "text-action";
    cancel.textContent = "[ CANCEL ]";

    cancel.addEventListener("click", () => {
      confirmation.remove();
      deleteButton.hidden = false;
      deleteButton.focus();
    });

    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      setError();
      setStatus("DELETING PRESENTATION");

      try {
        await repository.deletePresentation(
          currentPresentationId
        );

        window.location.assign(
          "dashboard-presentations.html"
        );
      } catch {
        setStatus();
        setError(
          "THIS PRESENTATION COULD NOT BE DELETED"
        );
        confirm.disabled = false;
      }
    });

    actions.append(confirm, cancel);
    confirmation.append(prompt, actions);

    return confirmation;
  }

  publicationButton.addEventListener("click", async () => {
    if (!currentPresentationId) return;

    setError();
    setStatus();

    publicationButton.disabled = true;
    saveButton.disabled = true;
    deleteButton.disabled = true;

    try {
      let saved;

      if (currentVisibility === "published") {
        setStatus("UNPUBLISHING PRESENTATION");

        saved = await repository.unpublishPresentation(
          currentPresentationId,
          expectedUpdatedAt
        );
      } else {
        const record = readRecord();

        validateRecord(record);
        validatePublication(record);

        setStatus("SAVING BEFORE PUBLICATION");

        const draft = await repository.updatePresentation(
          record,
          expectedUpdatedAt
        );

        setStatus("PUBLISHING PRESENTATION");

        saved = await repository.publishPresentation(
          draft.id,
          draft.updatedAt
        );
      }

      currentPresentationId = saved.id;
      expectedUpdatedAt = saved.updatedAt;
      currentVisibility = saved.visibility;

      populateForm(saved);
      updateEditorState(saved);

      setStatus(
        saved.visibility === "published"
          ? "PRESENTATION PUBLISHED"
          : "PRESENTATION RETURNED TO DRAFT"
      );
    } catch (error) {
      setStatus();
      setError(
        error?.message ||
        "PRESENTATION STATUS COULD NOT BE CHANGED"
      );
    } finally {
      publicationButton.disabled = false;
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  });
  deleteButton.addEventListener("click", () => {
    if (!currentPresentationId) return;

    deleteButton.hidden = true;

    deleteButton.parentElement.insertBefore(
      createDeleteConfirmation(),
      deleteButton
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setError();
    setStatus();

    let record;

    try {
      record = readRecord();
      validateRecord(record);
    } catch (error) {
      setError(error.message);
      return;
    }

    const ownerProfileId = ownerSelect.value;

    if (!currentPresentationId && !ownerProfileId) {
      setError("SELECT AN ARTIST PROFILE");
      return;
    }

    saveButton.disabled = true;
    setStatus(
      currentVisibility === "published"
        ? "SAVING CHANGES"
        : "SAVING DRAFT"
    );

    try {
      const saved = currentPresentationId
        ? await repository.updatePresentation(
            record,
            expectedUpdatedAt
          )
        : await repository.createPresentation(
            record,
            ownerProfileId
          );

      currentPresentationId = saved.id;
      expectedUpdatedAt = saved.updatedAt;
      currentVisibility = saved.visibility;

      populateForm(saved);
      updateEditorState(saved);

      history.replaceState(
        {},
        "",
        `dashboard-presentation-edit.html?id=${encodeURIComponent(
          saved.id
        )}`
      );

      setStatus(
        saved.visibility === "published"
          ? "CHANGES SAVED"
          : "DRAFT SAVED"
      );
    } catch (error) {
      setStatus();
      setError(
        error?.message ||
        "PRESENTATION COULD NOT BE SAVED"
      );
    } finally {
      saveButton.disabled = false;
    }
  });

  form.addEventListener("input", (event) => {
    event.target.removeAttribute?.("aria-invalid");
  });

  try {
    const selected =
      await getPresentationRepository();

    repository = selected.repository;
    await repository.initialise();

    if (repository.mode !== "supabase") {
      renderDashboardAccountIdentity([], "prototype");
      setFormDisabled(true);
      setError(
        "PRESENTATIONS ARE CURRENTLY UNAVAILABLE"
      );
      return;
    }

    managedProfiles =
      await repository.listManagedProfiles();

    renderDashboardAccountIdentity(managedProfiles);

    const requestedId =
      new URLSearchParams(window.location.search).get("id");

    if (!managedProfiles.length && !requestedId) {
      setFormDisabled(true);
      setError("ARTIST PROFILE SETUP REQUIRED");
      return;
    }

    if (managedProfiles.length) populateOwnerProfiles(managedProfiles);

    if (!requestedId) {
      ownerSelect.value = managedProfiles[0].id;
      updateEditorState();
      return;
    }

    const presentation =
      await repository.getPresentation(requestedId);

    if (!presentation) {
      throw new Error(
        "THIS PRESENTATION IS NOT AVAILABLE"
      );
    }

    currentPresentationId = presentation.id;
    currentPresentation = presentation;
    isOwnerManager = managedProfiles.some(
      (profile) => profile.id === presentation.ownerProfileId
    );
    expectedUpdatedAt = presentation.updatedAt;
    currentVisibility = presentation.visibility;

    if (managedProfiles.length) ownerSelect.value = presentation.ownerProfileId;

    populateForm(presentation);
    updateEditorState(presentation);
    await refreshContext();
  } catch (error) {
    renderDashboardAccountIdentity([], "error");
    setFormDisabled(true);

    setError(
      error?.message ||
      "PRESENTATION IS CURRENTLY UNAVAILABLE"
    );
  }
});
