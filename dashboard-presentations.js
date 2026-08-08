document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getPresentationRepository } =
    await import("./data/presentation-repository.mjs");

  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const presentationList =
    document.querySelector("#dashboard-presentation-list");

  const totalElement =
    document.querySelector("#dashboard-presentations-total");

  const breakdownElement =
    document.querySelector("#dashboard-presentations-breakdown");

  const errorElement =
    document.querySelector("#dashboard-presentations-error");

  const noticeElement =
    document.querySelector("#dashboard-presentations-notice");

  const addPresentationLink =
    document.querySelector(".dashboard-add-presentation");

  let repository;

  function setError(message = "") {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function formatType(value = "") {
    return String(value)
      .replaceAll("-", " ")
      .replaceAll("_", " ")
      .toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
      .format(date)
      .toUpperCase();
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);

    if (!start && !end) return "";
    if (!end || start === end) return start;

    return `${start} — ${end}`;
  }

  function formatUpdated(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
      .format(date)
      .toUpperCase();

    return `UPDATED ${formatted}`;
  }

  function createTextAction(text, ariaLabel) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "text-action";
    button.textContent = `[ ${text} ]`;
    button.setAttribute("aria-label", ariaLabel);

    return button;
  }

  function createDeleteConfirmation(presentation, reload) {
    const container = document.createElement("div");
    const prompt = document.createElement("p");
    const actions = document.createElement("div");

    const confirm = createTextAction(
      "CONFIRM DELETE",
      `Confirm deletion of ${presentation.title || "untitled presentation"}`
    );

    const cancel = createTextAction(
      "CANCEL",
      `Cancel deletion of ${presentation.title || "untitled presentation"}`
    );

    container.className = "dashboard-delete-confirmation";
    container.hidden = true;

    prompt.textContent =
      presentation.visibility === "published"
        ? "UNPUBLISH THIS PRESENTATION BEFORE DELETING IT."
        : "DELETE THIS PRESENTATION?";

    actions.className = "dashboard-delete-actions";
    confirm.disabled = presentation.visibility === "published";

    cancel.addEventListener("click", () => {
      container.hidden = true;

      cancel
        .closest("article")
        ?.querySelector(".dashboard-delete-trigger")
        ?.focus();
    });

    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      setError();

      try {
        await repository.deletePresentation(presentation.id);
        await reload();
      } catch {
        setError("THIS PRESENTATION COULD NOT BE DELETED");
        confirm.disabled = false;
      }
    });

    actions.append(confirm, cancel);
    container.append(prompt, actions);

    return container;
  }

  function createPresentationRow(presentation, reload) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const metadata = document.createElement("p");
    const placement = document.createElement("p");
    const statusArea = document.createElement("div");
    const status = document.createElement("span");
    const actions = document.createElement("div");
    const edit = document.createElement("a");

    const remove = createTextAction(
      "DELETE",
      `Delete ${presentation.title || "untitled presentation"}`
    );

    const confirmation =
      createDeleteConfirmation(presentation, reload);

    const location = [
      presentation.venueName,
      presentation.city,
      presentation.country
    ]
      .filter(Boolean)
      .join(", ");

    const details = [
      formatType(presentation.activityType),
      formatDateRange(
        presentation.startDate,
        presentation.endDate
      ),
      location,
      formatUpdated(presentation.updatedAt)
    ].filter(Boolean);

    const destinations = [];

    if (presentation.showInPresentations) {
      destinations.push("PRESENTATIONS");
    }

    if (presentation.includeInCv) {
      destinations.push("CV");
    }

    row.className = "dashboard-presentation-row";
    information.className = "dashboard-presentation-information";
    statusArea.className = "dashboard-presentation-status";
    actions.className = "dashboard-presentation-actions";
    remove.classList.add("dashboard-delete-trigger");

    title.textContent = presentation.title || "UNTITLED";

    metadata.textContent =
      details.join(" · ") || "INCOMPLETE RECORD";

    placement.className = "dashboard-presentation-placement";
    placement.textContent = destinations.length
      ? `USED IN: ${destinations.join(" / ")}`
      : "NOT SHOWN PUBLICLY";

    status.textContent =
      presentation.visibility === "published"
        ? "PUBLISHED"
        : "DRAFT";

    status.className =
      presentation.visibility === "published"
        ? "is-published"
        : "is-draft";

    edit.className = "text-action";
    edit.href =
      `dashboard-presentation-edit.html?id=${encodeURIComponent(
        presentation.id
      )}`;

    edit.textContent = "[ EDIT ]";

    edit.setAttribute(
      "aria-label",
      `Edit ${presentation.title || "untitled presentation"}`
    );

    remove.addEventListener("click", () => {
      confirmation.hidden = false;

      confirmation
        .querySelector("button:not([disabled])")
        ?.focus();
    });

    information.append(title, metadata, placement);
    actions.append(edit, remove);
    statusArea.append(status, actions, confirmation);
    row.append(information, statusArea);

    return row;
  }

  function emptyState(message = "NO PRESENTATIONS ADDED") {
    const state = document.createElement("div");
    const text = document.createElement("p");

    state.className = "dashboard-empty-state";
    text.textContent = message;
    state.append(text);

    if (message === "NO PRESENTATIONS ADDED") {
      const link = document.createElement("a");

      link.className = "text-action";
      link.href = "dashboard-presentation-edit.html";
      link.textContent = "[ + ADD PRESENTATION ]";

      state.append(link);
    }

    return state;
  }

  function updateCounts(presentations) {
    const published = presentations.filter(
      (presentation) =>
        presentation.visibility === "published"
    ).length;

    const drafts = presentations.length - published;

    breakdownElement.textContent =
      `${published} PUBLISHED / ${drafts} ` +
      `${drafts === 1 ? "DRAFT" : "DRAFTS"}`;

    totalElement.textContent =
      `${presentations.length} ` +
      `${presentations.length === 1
        ? "PRESENTATION"
        : "PRESENTATIONS"}`;
  }

  async function renderPresentations(profileIds = []) {
    const presentations =
      await repository.listPresentations(profileIds);

    setError();
    updateCounts(presentations);

    if (!presentations.length) {
      presentationList.replaceChildren(emptyState());
      return;
    }

    presentationList.replaceChildren(
      ...presentations.map((presentation) =>
        createPresentationRow(
          presentation,
          () => renderPresentations(profileIds)
        )
      )
    );
  }

  try {
    const selected = await getPresentationRepository();

    repository = selected.repository;
    await repository.initialise();

    if (repository.mode !== "supabase") {
      renderDashboardAccountIdentity([], "prototype");

      noticeElement.textContent =
        "PRESENTATIONS REQUIRE THE LOCAL DATABASE";

      noticeElement.hidden = false;

      addPresentationLink.setAttribute(
        "aria-disabled",
        "true"
      );

      addPresentationLink.removeAttribute("href");
      updateCounts([]);

      presentationList.replaceChildren(
        emptyState("PRESENTATIONS UNAVAILABLE")
      );

      return;
    }

    const profiles = await repository.listManagedProfiles();

    renderDashboardAccountIdentity(profiles);

    if (!profiles.length) {
      addPresentationLink.setAttribute(
        "aria-disabled",
        "true"
      );

      addPresentationLink.removeAttribute("href");
      updateCounts([]);

      presentationList.replaceChildren(
        emptyState("ARTIST PROFILE SETUP REQUIRED")
      );

      return;
    }

    await renderPresentations(
      profiles.map((profile) => profile.id)
    );
  } catch {
    renderDashboardAccountIdentity([], "error");
    setError("PRESENTATIONS ARE CURRENTLY UNAVAILABLE");
    updateCounts([]);

    presentationList.replaceChildren(
      emptyState("PRESENTATIONS UNAVAILABLE")
    );
  }
});
