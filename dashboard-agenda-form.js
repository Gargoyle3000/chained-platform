document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getAgendaRepository } =
    await import("./data/agenda-repository.mjs");

  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const form =
    document.querySelector("#agenda-form");

  const errorElement =
    document.querySelector("#agenda-form-error");

  const statusElement =
    document.querySelector("#agenda-form-status");

  const headingElement =
    document.querySelector("#agenda-editor-heading");

  const contextElement =
    document.querySelector("#agenda-editor-context");

  const ownerField =
    document.querySelector("#agenda-owner-field");

  const ownerSelect =
    document.querySelector("#agenda-owner-profile");

  const activitySelect =
    document.querySelector("#agenda-activity");

  const deleteButton =
    document.querySelector("#agenda-delete");

  const saveButton =
    document.querySelector(".agenda-form-save");

  let repository;
  let currentAgendaItemId = null;
  let expectedUpdatedAt = null;
  let currentVisibility = "draft";
  let managedProfiles = [];
  let presentations = [];

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

  function readRecord() {
    return {
      id: currentAgendaItemId,
      activityId: field("activity-id").value || null,
      occurrenceType: field("occurrence-type").value,
      titleOverride: field("title-override").value,
      startDate: field("start-date").value,
      endDate: field("end-date").value,
      startTime: field("start-time").value,
      endTime: field("end-time").value,
      timeZone: field("time-zone").value,
      venueNameOverride:
        field("venue-name-override").value,
      cityOverride:
        field("city-override").value,
      showInAgenda:
        field("show-in-agenda").checked
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

    const sameDay =
      record.startDate &&
      (!record.endDate ||
        record.endDate === record.startDate);

    if (
      sameDay &&
      record.startTime &&
      record.endTime &&
      record.endTime < record.startTime
    ) {
      throw new Error(
        "END TIME CANNOT BE BEFORE START TIME"
      );
    }
  }

  function validatePublishedRecord(record) {
    const requiredFields = [
      ["TYPE", record.occurrenceType],
      ["START DATE", record.startDate]
    ];

    if (!record.activityId) {
      requiredFields.push(
        ["TITLE", record.titleOverride],
        ["VENUE", record.venueNameOverride],
        ["CITY", record.cityOverride]
      );
    }

    const missingFields = requiredFields
      .filter(([, value]) => !String(value || "").trim())
      .map(([label]) => label);

    if (missingFields.length) {
      throw new Error(
        `COMPLETE BEFORE SAVING: ${missingFields.join(", ")}`
      );
    }

    if (record.activityId) {
      const presentation = presentations.find(
        (item) => item.id === record.activityId
      );

      if (
        presentation &&
        presentation.visibility !== "published"
      ) {
        throw new Error(
          "PUBLISH THE LINKED PRESENTATION FIRST"
        );
      }
    }
  }

  function populateForm(item) {
    field("activity-id").value =
      item.activityId || "";

    field("occurrence-type").value =
      item.occurrenceType || "";

    field("title-override").value =
      item.titleOverride || "";

    field("start-date").value =
      item.startDate || "";

    field("end-date").value =
      item.endDate || "";

    field("start-time").value =
      item.startTime || "";

    field("end-time").value =
      item.endTime || "";

    field("time-zone").value =
      item.timeZone || "";

    field("venue-name-override").value =
      item.venueNameOverride || "";

    field("city-override").value =
      item.cityOverride || "";

    field("show-in-agenda").checked =
      item.showInAgenda !== false;
  }

  function updateEditorState(item = null) {
    const editing = Boolean(item);

    contextElement.textContent = editing
      ? "AGENDA / EDIT AGENDA ITEM"
      : "AGENDA / ADD AGENDA ITEM";

    headingElement.textContent = editing
      ? item.title || "UNTITLED AGENDA ITEM"
      : "NEW AGENDA ITEM";

    document.title = editing
      ? `${item.title || "Untitled Agenda Item"} — CHAINED Dashboard`
      : "Add Agenda Item — CHAINED Dashboard";

    deleteButton.hidden = !editing;

    if (editing) {
      ownerSelect.disabled = true;
      activitySelect.disabled = true;

      saveButton.textContent =
        item.visibility === "published"
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

  function populatePresentationOptions(
    ownerProfileId,
    selectedActivityId = ""
  ) {
    const options = presentations
      .filter(
        (presentation) =>
          presentation.ownerProfileId === ownerProfileId
      )
      .map((presentation) => {
        const option = document.createElement("option");
        const title =
          presentation.title || "UNTITLED PRESENTATION";

        option.value = presentation.id;
        option.textContent =
          `${title} — ${presentation.visibility.toUpperCase()}`;

        return option;
      });

    const independent =
      document.createElement("option");

    independent.value = "";
    independent.textContent =
      "INDEPENDENT AGENDA ITEM";

    activitySelect.replaceChildren(
      independent,
      ...options
    );

    activitySelect.value = selectedActivityId || "";
  }

  function createDeleteConfirmation() {
    const confirmation = document.createElement("div");
    const prompt = document.createElement("p");
    const actions = document.createElement("div");
    const confirm = document.createElement("button");
    const cancel = document.createElement("button");

    confirmation.className =
      "dashboard-delete-confirmation";

    actions.className =
      "dashboard-delete-actions";

    prompt.textContent =
      currentVisibility === "published"
        ? "UNPUBLISH THIS AGENDA ITEM BEFORE DELETING IT."
        : "DELETE THIS AGENDA ITEM?";

    confirm.type = "button";
    confirm.className = "text-action";
    confirm.textContent = "[ CONFIRM DELETE ]";
    confirm.disabled =
      currentVisibility === "published";

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
      setStatus("DELETING AGENDA ITEM");

      try {
        await repository.deleteAgendaItem(
          currentAgendaItemId
        );

        window.location.assign(
          "dashboard-agenda.html"
        );
      } catch {
        setStatus();

        setError(
          "THIS AGENDA ITEM COULD NOT BE DELETED"
        );

        confirm.disabled = false;
      }
    });

    actions.append(confirm, cancel);
    confirmation.append(prompt, actions);

    return confirmation;
  }

  ownerSelect.addEventListener("change", () => {
    populatePresentationOptions(ownerSelect.value);
  });

  deleteButton.addEventListener("click", () => {
    if (!currentAgendaItemId) return;

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

      if (currentVisibility === "published") {
        validatePublishedRecord(record);
      }
    } catch (error) {
      setError(error.message);
      return;
    }

    const ownerProfileId = ownerSelect.value;

    if (!currentAgendaItemId && !ownerProfileId) {
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
      const saved = currentAgendaItemId
        ? await repository.updateAgendaItem(
            record,
            expectedUpdatedAt
          )
        : await repository.createAgendaItem(
            record,
            ownerProfileId
          );

      currentAgendaItemId = saved.id;
      expectedUpdatedAt = saved.updatedAt;
      currentVisibility = saved.visibility;

      ownerSelect.value = saved.ownerProfileId;

      populatePresentationOptions(
        saved.ownerProfileId,
        saved.activityId
      );

      populateForm(saved);
      updateEditorState(saved);

      history.replaceState(
        {},
        "",
        `dashboard-agenda-edit.html?id=${encodeURIComponent(
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
        "AGENDA ITEM COULD NOT BE SAVED"
      );
    } finally {
      saveButton.disabled = false;
    }
  });

  try {
    const selected =
      await getAgendaRepository();

    repository = selected.repository;
    await repository.initialise();

    if (repository.mode !== "supabase") {
      renderDashboardAccountIdentity([], "prototype");
      setFormDisabled(true);

      setError(
        "AGENDA IS CURRENTLY UNAVAILABLE"
      );

      return;
    }

    managedProfiles =
      await repository.listManagedProfiles();

    renderDashboardAccountIdentity(managedProfiles);

    if (!managedProfiles.length) {
      setFormDisabled(true);
      setError("ARTIST PROFILE SETUP REQUIRED");
      return;
    }

    presentations =
      await repository.listPresentations(
        managedProfiles.map((profile) => profile.id)
      );

    populateOwnerProfiles(managedProfiles);

    const parameters =
      new URLSearchParams(window.location.search);

    const requestedId =
      parameters.get("id");

    const requestedPresentationId =
      parameters.get("presentation");

    if (!requestedId) {
      let ownerProfileId = managedProfiles[0].id;

      const requestedPresentation =
        presentations.find(
          (presentation) =>
            presentation.id === requestedPresentationId
        );

      if (requestedPresentation) {
        ownerProfileId =
          requestedPresentation.ownerProfileId;
      }

      ownerSelect.value = ownerProfileId;

      populatePresentationOptions(
        ownerProfileId,
        requestedPresentation?.id || ""
      );

      updateEditorState();
      return;
    }

    const item =
      await repository.getAgendaItem(requestedId);

    if (!item) {
      throw new Error(
        "THIS AGENDA ITEM IS NOT AVAILABLE"
      );
    }

    currentAgendaItemId = item.id;
    expectedUpdatedAt = item.updatedAt;
    currentVisibility = item.visibility;

    ownerSelect.value = item.ownerProfileId;

    populatePresentationOptions(
      item.ownerProfileId,
      item.activityId
    );

    populateForm(item);
    updateEditorState(item);
  } catch (error) {
    renderDashboardAccountIdentity([], "error");
    setFormDisabled(true);

    setError(
      error?.message ||
      "AGENDA ITEM IS CURRENTLY UNAVAILABLE"
    );
  }
});
