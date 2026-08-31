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

  let repository;
  let currentPresentationId = null;
  let expectedUpdatedAt = null;
  let currentVisibility = "draft";
  let managedProfiles = [];

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

    if (!managedProfiles.length) {
      setFormDisabled(true);
      setError("ARTIST PROFILE SETUP REQUIRED");
      return;
    }

    populateOwnerProfiles(managedProfiles);

    const requestedId =
      new URLSearchParams(window.location.search).get("id");

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
    expectedUpdatedAt = presentation.updatedAt;
    currentVisibility = presentation.visibility;

    ownerSelect.value = presentation.ownerProfileId;

    populateForm(presentation);
    updateEditorState(presentation);
  } catch (error) {
    renderDashboardAccountIdentity([], "error");
    setFormDisabled(true);

    setError(
      error?.message ||
      "PRESENTATION IS CURRENTLY UNAVAILABLE"
    );
  }
});
