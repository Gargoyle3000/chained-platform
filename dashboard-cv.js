document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getCvRepository } =
    await import("./data/cv-repository.mjs");

  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const {
    CV_CATEGORY_TYPES,
    CV_CATEGORY_LABELS,
    createCvImportReviewState,
    cvImportReviewSummary,
    groupCvImportReviewCandidates,
    selectedCvImportPersistenceProjection,
    updateCvImportReviewCandidate
  } = await import("./data/cv-import-review.mjs");

  const {
    getCvImportExtractionService,
    safeCvImportMessage,
    validateCvImportPdfFile
  } = await import("./data/cv-import-extraction.mjs");

  const { createCvImportFlow } =
    await import("./data/cv-import-flow.mjs");

  const liveCv =
    document.querySelector("#dashboard-cv-live");

  const errorElement =
    document.querySelector("#dashboard-cv-error");

  const noticeElement =
    document.querySelector("#dashboard-cv-notice");

  const profileField =
    document.querySelector("#dashboard-cv-profile-field");

  const profileSelect =
    document.querySelector("#dashboard-cv-profile");

  const pageActions =
    document.querySelector("#dashboard-cv-page-actions");

  const importButton =
    document.querySelector("#dashboard-cv-import");

  const importFileInput =
    document.querySelector("#dashboard-cv-import-file");

  let repository;
  let managedProfiles = [];
  let selectedProfileId = null;
  let importReview = null;
  let lastPrototypeProjection = [];
  let importAvailable = false;
  let importRequestActive = false;

  function setError(message = "") {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function setNotice(message = "") {
    noticeElement.textContent = message;
    noticeElement.hidden = !message;
  }

  function setImportAvailable(available) {
    importAvailable = Boolean(available);
    importButton.disabled = !importAvailable || importRequestActive;
  }

  function setImportRequestActive(active) {
    importRequestActive = Boolean(active);
    importButton.disabled = !importAvailable || importRequestActive;
    importFileInput.disabled = importRequestActive;
  }

  function createTextButton(text, ariaLabel = "") {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "text-action";
    button.textContent = `[ ${text} ]`;

    if (ariaLabel) {
      button.setAttribute("aria-label", ariaLabel);
    }

    return button;
  }

  function formatAutomaticYear(activity) {
    const startYear =
      String(activity?.startDate || "").slice(0, 4);

    const endYear =
      String(activity?.endDate || "").slice(0, 4);

    if (!startYear) return "";
    if (!endYear || endYear === startYear) return startYear;

    return `${startYear}\u2013${endYear}`;
  }

  function getEntryYear(entry) {
    return entry.isAutomatic
      ? formatAutomaticYear(entry.sourceActivity)
      : entry.yearLabel || "";
  }

  function getEntryYearScore(entry) {
    const years =
      getEntryYear(entry).match(/\d{4}/g) || [];

    if (!years.length) return 0;

    return Math.max(
      ...years.map((year) => Number.parseInt(year, 10))
    );
  }

  function sortEntries(entries = []) {
    return [...entries].sort((first, second) => {
      const yearDifference =
        getEntryYearScore(second) -
        getEntryYearScore(first);

      if (yearDifference) return yearDifference;

      const secondCreated =
        new Date(second.createdAt || 0).getTime();

      const firstCreated =
        new Date(first.createdAt || 0).getTime();

      if (secondCreated !== firstCreated) {
        return secondCreated - firstCreated;
      }

      return String(first.id).localeCompare(String(second.id));
    });
  }

  function getManualLine(entry) {
    return [
      entry.title,
      entry.organization,
      entry.locationText
    ]
      .filter(Boolean)
      .join(", ");
  }

  function getAutomaticLine(entry) {
    const activity = entry.sourceActivity;

    const location = [
      activity?.city,
      activity?.country
    ]
      .filter(Boolean)
      .join(", ");

    return [
      activity?.title,
      activity?.venueName,
      location
    ]
      .filter(Boolean)
      .join(", ");
  }

  function getEntryLine(entry) {
    if (entry.isAutomatic) {
      return (
        getAutomaticLine(entry) ||
        "UNTITLED PRESENTATION"
      );
    }

    return getManualLine(entry) || "UNTITLED CV ENTRY";
  }

  function createEntryText(entry) {
    const container = document.createElement("div");
    const line = document.createElement("p");

    container.className = "dashboard-cv-entry-text";
    line.textContent = getEntryLine(entry);

    container.append(line);

    if (entry.isAutomatic) {
      const source = document.createElement("p");

      source.className = "dashboard-cv-entry-source";
      source.textContent = "FROM PRESENTATION";

      container.append(source);
    }

    if (!entry.isVisible) {
      const hidden = document.createElement("p");

      hidden.className = "dashboard-cv-entry-source";
      hidden.textContent = "HIDDEN";

      container.append(hidden);
    }

    return container;
  }

  function reviewCandidateLine(candidate) {
    return [
      candidate.title,
      candidate.organization,
      candidate.locationText
    ]
      .filter(Boolean)
      .join(", ");
  }

  function setImportReviewMode(active) {
    pageActions.hidden = active;
    profileField.hidden = active || managedProfiles.length <= 1;
  }

  function createReviewSummary(summary) {
    const element = document.createElement("p");
    const selection = [
      `${summary.selected} SELECTED`,
      summary.excluded ? `${summary.excluded} EXCLUDED` : "",
      `${summary.needsReview} NEED REVIEW`
    ]
      .filter(Boolean)
      .join(" · ");

    element.className = "dashboard-cv-import-summary";
    element.textContent = selection;
    element.setAttribute("aria-live", "polite");

    return element;
  }

  function createReviewEditor(candidate, row) {
    const form = document.createElement("form");
    const category = document.createElement("select");
    const year = document.createElement("input");
    const line = document.createElement("input");
    const actions = document.createElement("div");
    const save = document.createElement("button");
    const cancel = createTextButton(
      "CANCEL",
      `Cancel editing ${reviewCandidateLine(candidate)}`
    );

    form.className = "dashboard-cv-entry-edit dashboard-cv-import-edit";

    CV_CATEGORY_TYPES.forEach((categoryType) => {
      const option = document.createElement("option");

      option.value = categoryType;
      option.textContent = CV_CATEGORY_LABELS[categoryType];
      option.selected = categoryType === candidate.categoryType;
      category.append(option);
    });

    category.setAttribute("aria-label", "CV category");
    year.type = "text";
    year.maxLength = 40;
    year.placeholder = "YEAR / PERIOD";
    year.value = candidate.yearLabel || "";
    year.setAttribute("aria-label", "Year or period");
    line.type = "text";
    line.maxLength = 300;
    line.placeholder = "COMPLETE CV LINE";
    line.value = reviewCandidateLine(candidate);
    line.setAttribute("aria-label", "Complete CV line");

    actions.className = "dashboard-cv-entry-edit-actions";
    save.type = "submit";
    save.className = "text-action";
    save.textContent = "[ SAVE ]";

    cancel.addEventListener("click", () => renderImportReview());

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!line.value.trim()) {
        setError("ENTER A COMPLETE CV LINE");
        line.focus();
        return;
      }

      updateCvImportReviewCandidate(
        importReview,
        candidate.candidateId,
        {
          categoryType: category.value,
          yearLabel: year.value,
          title: line.value
        }
      );

      setError();
      renderImportReview();
    });

    actions.append(save, cancel);
    form.append(category, year, line, actions);
    row.replaceChildren(form);
    line.focus();
  }

  function createReviewCandidateRow(candidate) {
    const row = document.createElement("article");
    const select = document.createElement("input");
    const year = document.createElement("p");
    const text = document.createElement("div");
    const line = document.createElement("p");
    const actions = document.createElement("div");
    const edit = createTextButton(
      "EDIT",
      `Edit import candidate ${reviewCandidateLine(candidate)}`
    );

    row.className = "dashboard-cv-entry dashboard-cv-import-entry";
    select.type = "checkbox";
    select.checked = candidate.selected;
    select.setAttribute(
      "aria-label",
      `Add ${reviewCandidateLine(candidate)} to my CV`
    );

    select.addEventListener("change", () => {
      updateCvImportReviewCandidate(
        importReview,
        candidate.candidateId,
        { selected: select.checked }
      );
      renderImportReview();
    });

    year.className = "dashboard-cv-entry-year";
    year.textContent = candidate.yearLabel || "";
    text.className = "dashboard-cv-entry-text";
    line.textContent = reviewCandidateLine(candidate);
    text.append(line);

    if (candidate.needsReview) {
      const review = document.createElement("p");

      review.className = "dashboard-cv-entry-source";
      review.textContent = "NEEDS REVIEW";
      text.append(review);
    }

    if (candidate.duplicateState === "duplicate") {
      const duplicate = document.createElement("p");

      duplicate.className = "dashboard-cv-entry-source";
      duplicate.textContent = "ALREADY IN CV";
      text.append(duplicate);
    }

    actions.className = "dashboard-cv-entry-actions";
    edit.addEventListener("click", () => createReviewEditor(candidate, row));
    actions.append(edit);
    row.append(select, year, text, actions);

    return row;
  }

  function createUnsupportedSections() {
    if (!importReview.unsupportedSections.length) return null;

    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const entries = document.createElement("div");

    section.className = "dashboard-cv-section dashboard-cv-import-unsupported";
    heading.textContent = "NOT IMPORTED";
    entries.className = "dashboard-cv-entries";

    importReview.unsupportedSections.forEach((item) => {
      const row = document.createElement("article");
      const title = document.createElement("p");
      const explanation = document.createElement("p");

      row.className = "dashboard-cv-import-unsupported-row";
      title.textContent = `${item.heading} · ${item.entryCount} ENTRIES`;
      explanation.textContent = "NOT SUPPORTED IN THE CURRENT CV FORMAT";
      row.append(title, explanation);
      entries.append(row);
    });

    section.append(heading, entries);
    return section;
  }

  function leaveImportReview(message = "") {
    importReview = null;
    setImportReviewMode(false);
    setNotice(message);
    reloadCv().catch(() => setError("CV COULD NOT BE RELOADED"));
  }

  function renderImportReview() {
    if (!importReview) return;

    setError();
    setNotice();

    const summary = cvImportReviewSummary(importReview);
    const header = document.createElement("header");
    const title = document.createElement("h3");
    const found = document.createElement("p");
    const groups = groupCvImportReviewCandidates(importReview);
    const endActions = document.createElement("div");
    const cancel = createTextButton("CANCEL", "Cancel CV import review");
    const add = createTextButton(
      `ADD ${summary.selected} ENTRIES`,
      `Prepare ${summary.selected} CV entries to add`
    );

    header.className = "dashboard-cv-import-header";
    title.textContent = "IMPORT CV";
    found.className = "dashboard-cv-import-found";
    found.textContent = [
      `${summary.found} ENTRIES FOUND`,
      `${summary.needsReview} NEED REVIEW`,
      `${summary.unsupportedSections} UNSUPPORTED SECTIONS`
    ].join(" · ");
    header.append(title, found, createReviewSummary(summary));

    const sections = groups.map((group) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const entries = document.createElement("div");

      section.className = "dashboard-cv-section dashboard-cv-import-section";
      heading.textContent = group.label;
      entries.className = "dashboard-cv-entries";
      entries.append(...group.candidates.map(createReviewCandidateRow));
      section.append(heading, entries);
      return section;
    });

    const unsupported = createUnsupportedSections();
    endActions.className = "dashboard-cv-import-actions";

    cancel.addEventListener("click", () => leaveImportReview());
    add.addEventListener("click", () => {
      lastPrototypeProjection = selectedCvImportPersistenceProjection(importReview);
      leaveImportReview(`${lastPrototypeProjection.length} ENTRIES READY TO ADD`);
    });

    endActions.append(cancel, add);
    liveCv.replaceChildren(
      header,
      ...sections,
      ...(unsupported ? [unsupported] : []),
      endActions
    );
  }

  function requestImportPdfSelection() {
    if (!selectedProfileId) {
      setError("ARTIST PROFILE SETUP REQUIRED");
      return;
    }
    importFlow.requestSelection();
  }

  function createImportStateHeader(filename, status) {
    const header = document.createElement("header");
    const title = document.createElement("h3");
    const file = document.createElement("p");
    const state = document.createElement("p");
    const privacy = document.createElement("p");

    header.className = "dashboard-cv-import-header dashboard-cv-import-processing";
    title.textContent = "IMPORT CV";
    file.className = "dashboard-cv-import-file";
    file.textContent = filename;
    state.className = "dashboard-cv-import-status";
    state.textContent = status;
    privacy.className = "dashboard-cv-import-privacy";
    privacy.textContent = "PDF IS PROCESSED BY AN EXTERNAL AI SERVICE FOR CV EXTRACTION. CHAINED DOES NOT SAVE THE PDF.";
    header.append(title, file, state, privacy);
    return header;
  }

  function renderImportProcessing(filename) {
    setError();
    setNotice();
    setImportReviewMode(true);
    liveCv.replaceChildren(createImportStateHeader(filename, "PROCESSING CV..."));
  }

  function renderImportFailure(filename, error) {
    const header = createImportStateHeader(filename, safeCvImportMessage(error));
    const actions = document.createElement("div");
    const retry = createTextButton("TRY AGAIN", "Choose a PDF and try CV import again");
    const cancel = createTextButton("CANCEL", "Cancel CV import");

    actions.className = "dashboard-cv-import-actions";
    retry.addEventListener("click", requestImportPdfSelection);
    cancel.addEventListener("click", () => leaveImportReview());
    actions.append(retry, cancel);
    liveCv.replaceChildren(header, actions);
  }

  const importFlow = createCvImportFlow({
    openPicker() {
      importFileInput.value = "";
      importFileInput.click();
    },
    validate: validateCvImportPdfFile,
    async extract(file) {
      const service = await getCvImportExtractionService();
      return service.extract(file);
    },
    onInvalid(error) {
      setError(safeCvImportMessage(error));
    },
    onProcessing(file) {
      lastPrototypeProjection = [];
      renderImportProcessing(file.name);
    },
    onSuccess(result) {
      importReview = createCvImportReviewState(result);
      renderImportReview();
    },
    onFailure(error, file) {
      importReview = null;
      renderImportFailure(file.name, error);
    },
    onActiveChange(active) {
      setImportRequestActive(active);
    }
  });

  function handleImportPdfSelection() {
    const file = importFileInput.files?.[0] ?? null;
    importFileInput.value = "";
    if (!file) return;
    importFlow.acceptSelection(file);
  }

  async function reloadCv() {
    if (!selectedProfileId) return;

    const categories =
      await repository.listCv([selectedProfileId]);

    renderCategories(categories);
  }

  function createInlineEditor(entry, row) {
    const form = document.createElement("form");
    const yearInput = document.createElement("input");
    const lineInput = document.createElement("input");
    const actions = document.createElement("div");

    const save = document.createElement("button");
    const cancel = createTextButton(
      "CANCEL",
      `Cancel editing ${getEntryLine(entry)}`
    );

    form.className = "dashboard-cv-entry-edit";

    yearInput.type = "text";
    yearInput.maxLength = 40;
    yearInput.placeholder = "YEAR / PERIOD";
    yearInput.value = entry.yearLabel || "";
    yearInput.setAttribute("aria-label", "Year or period");

    lineInput.type = "text";
    lineInput.maxLength = 300;
    lineInput.placeholder = "COMPLETE CV LINE";
    lineInput.value = getManualLine(entry);
    lineInput.setAttribute("aria-label", "Complete CV line");

    actions.className = "dashboard-cv-entry-edit-actions";

    save.type = "submit";
    save.className = "text-action";
    save.textContent = "[ SAVE ]";

    cancel.addEventListener("click", () => {
      reloadCv().catch(() => {
        setError("CV COULD NOT BE RELOADED");
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError();

      const title = lineInput.value.trim();

      if (!title) {
        setError("ENTER A COMPLETE CV LINE");
        lineInput.focus();
        return;
      }

      save.disabled = true;
      cancel.disabled = true;

      try {
        await repository.updateManualEntry(
          {
            ...entry,
            yearLabel: yearInput.value,
            title,
            organization: "",
            locationText: "",
            displayOrder: 0
          },
          entry.updatedAt
        );

        await reloadCv();
      } catch (error) {
        setError(
          error?.message ||
          "CV ENTRY COULD NOT BE SAVED"
        );

        save.disabled = false;
        cancel.disabled = false;
      }
    });

    actions.append(save, cancel);
    form.append(yearInput, lineInput, actions);

    row.replaceChildren(form);
    lineInput.focus();
  }

  function prepareDelete(entry, actions, button) {
    const cancel = createTextButton(
      "CANCEL",
      `Cancel deletion of ${getEntryLine(entry)}`
    );

    button.textContent = "[ CONFIRM DELETE ]";
    button.dataset.confirming = "true";

    cancel.addEventListener("click", () => {
      button.textContent = "[ DELETE ]";
      button.dataset.confirming = "false";
      cancel.remove();
      button.focus();
    });

    actions.append(cancel);
  }

  function createEntryRow(entry) {
    const row = document.createElement("article");
    const year = document.createElement("p");
    const actions = document.createElement("div");

    row.className = "dashboard-cv-entry";

    if (!entry.isVisible) {
      row.classList.add("is-hidden");
    }

    year.className = "dashboard-cv-entry-year";
    year.textContent = getEntryYear(entry);

    actions.className = "dashboard-cv-entry-actions";

    if (entry.isAutomatic) {
      const editSource = document.createElement("a");

      editSource.className = "text-action";
      editSource.href =
        `dashboard-presentation-edit.html?id=${encodeURIComponent(
          entry.sourceActivityId
        )}`;

      editSource.textContent = "[ EDIT SOURCE ]";

      actions.append(editSource);
    } else {
      const edit = createTextButton(
        "EDIT",
        `Edit ${getEntryLine(entry)}`
      );

      const remove = createTextButton(
        "DELETE",
        `Delete ${getEntryLine(entry)}`
      );

      edit.addEventListener("click", () => {
        createInlineEditor(entry, row);
      });

      remove.dataset.confirming = "false";

      remove.addEventListener("click", async () => {
        if (remove.dataset.confirming !== "true") {
          prepareDelete(entry, actions, remove);
          return;
        }

        remove.disabled = true;
        setError();

        try {
          await repository.deleteManualEntry(entry.id);
          await reloadCv();
        } catch (error) {
          setError(
            error?.message ||
            "CV ENTRY COULD NOT BE DELETED"
          );

          remove.disabled = false;
        }
      });

      actions.append(edit, remove);
    }

    if (!entry.isVisible) {
      const show = createTextButton(
        "SHOW",
        `Show ${getEntryLine(entry)}`
      );

      show.addEventListener("click", async () => {
        show.disabled = true;
        setError();

        try {
          await repository.updateEntryVisibility(
            entry.id,
            true,
            entry.updatedAt
          );

          await reloadCv();
        } catch (error) {
          setError(
            error?.message ||
            "CV ENTRY COULD NOT BE SHOWN"
          );

          show.disabled = false;
        }
      });

      actions.prepend(show);
    }

    row.append(
      year,
      createEntryText(entry),
      actions
    );

    return row;
  }

  function createAddForm(category) {
    const form = document.createElement("form");
    const yearInput = document.createElement("input");
    const lineInput = document.createElement("input");
    const submit = document.createElement("button");

    form.className = "dashboard-cv-add-form";

    yearInput.type = "text";
    yearInput.maxLength = 40;
    yearInput.placeholder = "YEAR / PERIOD";
    yearInput.setAttribute(
      "aria-label",
      `${category.label}: year or period`
    );

    lineInput.type = "text";
    lineInput.maxLength = 300;
    lineInput.placeholder = "ADD COMPLETE CV LINE";
    lineInput.setAttribute(
      "aria-label",
      `${category.label}: complete CV line`
    );

    submit.type = "submit";
    submit.className = "text-action";
    submit.textContent = "[ + ADD ]";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setError();

      const title = lineInput.value.trim();

      if (!title) {
        setError("ENTER A COMPLETE CV LINE");
        lineInput.focus();
        return;
      }

      submit.disabled = true;

      try {
        await repository.createManualEntry({
          categoryId: category.id,
          yearLabel: yearInput.value,
          title,
          organization: "",
          locationText: "",
          url: "",
          displayOrder: 0,
          isVisible: true
        });

        yearInput.value = "";
        lineInput.value = "";

        await reloadCv();
      } catch (error) {
        setError(
          error?.message ||
          "CV ENTRY COULD NOT BE ADDED"
        );

        submit.disabled = false;
      }
    });

    form.append(yearInput, lineInput, submit);

    return form;
  }

  function createCategory(category) {
    const section = document.createElement("section");
    const header = document.createElement("header");
    const heading = document.createElement("h3");
    const visibility = document.createElement("label");
    const checkbox = document.createElement("input");
    const visibilityText = document.createElement("span");
    const entries = document.createElement("div");

    section.className = "dashboard-cv-section";
    header.className = "dashboard-cv-section-header";

    heading.textContent = category.label;

    visibility.className = "dashboard-cv-visibility";

    checkbox.type = "checkbox";
    checkbox.checked = category.isVisible;
    checkbox.setAttribute(
      "aria-label",
      `Show ${category.label} on public CV`
    );

    visibilityText.textContent = "SHOW ON CV";

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      setError();

      try {
        await repository.updateCategory(
          {
            ...category,
            isVisible: checkbox.checked
          },
          category.updatedAt
        );

        await reloadCv();
      } catch (error) {
        checkbox.checked = !checkbox.checked;

        setError(
          error?.message ||
          "CV CATEGORY VISIBILITY COULD NOT BE CHANGED"
        );

        checkbox.disabled = false;
      }
    });

    visibility.append(checkbox, visibilityText);
    header.append(heading, visibility);

    entries.className = "dashboard-cv-entries";

    const sortedEntries =
      sortEntries(category.entries);

    if (sortedEntries.length) {
      entries.replaceChildren(
        ...sortedEntries.map(createEntryRow)
      );
    } else {
      const empty = document.createElement("p");

      empty.className = "dashboard-cv-empty";
      empty.textContent = "NO ENTRIES YET";

      entries.append(empty);
    }

    section.append(
      header,
      createAddForm(category),
      entries
    );

    return section;
  }

  function renderCategories(categories = []) {
    setError();

    if (!categories.length) {
      const empty = document.createElement("p");

      empty.className = "dashboard-cv-empty";
      empty.textContent = "CV CATEGORIES ARE UNAVAILABLE";

      liveCv.replaceChildren(empty);
      return;
    }

    liveCv.replaceChildren(
      ...categories.map(createCategory)
    );
  }

  function populateProfiles(profiles) {
    profileSelect.replaceChildren(
      ...profiles.map((profile) => {
        const option = document.createElement("option");

        option.value = profile.id;
        option.textContent = profile.name;

        return option;
      })
    );

    profileField.hidden = profiles.length <= 1;
    setImportAvailable(profiles.length > 0);
  }

  importButton.addEventListener("click", requestImportPdfSelection);
  importFileInput.addEventListener("change", handleImportPdfSelection);

  profileSelect.addEventListener("change", async () => {
    selectedProfileId = profileSelect.value;
    await reloadCv();
  });

  try {
    const selected = await getCvRepository();

    repository = selected.repository;
    await repository.initialise();

    if (repository.mode !== "supabase") {
      renderDashboardAccountIdentity([], "prototype");

      setNotice(
        "CV MANAGEMENT IS CURRENTLY UNAVAILABLE"
      );

      renderCategories([]);
      selectedProfileId = "local-review";
      setImportAvailable(true);

      const previewState = new URLSearchParams(window.location.search).get("cv-import-state");
      if (previewState === "processing") {
        renderImportProcessing("sample-cv.pdf");
      } else if (previewState === "error") {
        renderImportFailure("sample-cv.pdf", { code: "cv_import_failed" });
      } else if (previewState === "review") {
        const { CV_IMPORT_REVIEW_FIXTURE } = await import("./data/cv-import-review-fixture.mjs");
        importReview = createCvImportReviewState(CV_IMPORT_REVIEW_FIXTURE);
        setImportReviewMode(true);
        renderImportReview();
      }
      return;
    }

    managedProfiles =
      await repository.listManagedProfiles();

    renderDashboardAccountIdentity(managedProfiles);

    if (!managedProfiles.length) {
      setNotice("ARTIST PROFILE SETUP REQUIRED");
      renderCategories([]);
      setImportAvailable(false);
      return;
    }

    populateProfiles(managedProfiles);

    selectedProfileId = managedProfiles[0].id;
    profileSelect.value = selectedProfileId;

    await reloadCv();
  } catch (error) {
    console.error(error);

    renderDashboardAccountIdentity([], "error");

    setError(
      error?.message ||
      "CV IS CURRENTLY UNAVAILABLE"
    );

    renderCategories([]);
    setImportAvailable(false);
  }
});
