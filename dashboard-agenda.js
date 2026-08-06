document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getAgendaRepository } =
    await import("./data/agenda-repository.mjs");

  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const agendaList =
    document.querySelector("#dashboard-agenda-list");

  const totalElement =
    document.querySelector("#dashboard-agenda-total");

  const breakdownElement =
    document.querySelector("#dashboard-agenda-breakdown");

  const errorElement =
    document.querySelector("#dashboard-agenda-error");

  const noticeElement =
    document.querySelector("#dashboard-agenda-notice");

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

  function formatTime(value) {
    if (!value) return "";

    return String(value).slice(0, 5);
  }

  function formatTimeRange(startTime, endTime) {
    const start = formatTime(startTime);
    const end = formatTime(endTime);

    if (!start && !end) return "";
    if (!end) return start;

    return `${start}–${end}`;
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

  function createDeleteConfirmation(item, reload) {
    const container = document.createElement("div");
    const prompt = document.createElement("p");
    const actions = document.createElement("div");

    const confirm = createTextAction(
      "CONFIRM DELETE",
      `Confirm deletion of ${item.title || "untitled Agenda item"}`
    );

    const cancel = createTextAction(
      "CANCEL",
      `Cancel deletion of ${item.title || "untitled Agenda item"}`
    );

    container.className = "dashboard-delete-confirmation";
    container.hidden = true;

    prompt.textContent =
      item.visibility === "published"
        ? "UNPUBLISH THIS AGENDA ITEM BEFORE DELETING IT."
        : "DELETE THIS AGENDA ITEM?";

    actions.className = "dashboard-delete-actions";
    confirm.disabled = item.visibility === "published";

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
        await repository.deleteAgendaItem(item.id);
        await reload();
      } catch {
        setError("THIS AGENDA ITEM COULD NOT BE DELETED");
        confirm.disabled = false;
      }
    });

    actions.append(confirm, cancel);
    container.append(prompt, actions);

    return container;
  }

  function createPublicationAction(item, reload) {
    const isPublished = item.visibility === "published";

    const action = createTextAction(
      isPublished ? "UNPUBLISH" : "PUBLISH",
      `${isPublished ? "Unpublish" : "Publish"} ${
        item.title || "untitled Agenda item"
      }`
    );

    action.addEventListener("click", async () => {
      action.disabled = true;
      setError();

      try {
        if (isPublished) {
          await repository.unpublishAgendaItem(
            item.id,
            item.updatedAt
          );
        } else {
          await repository.publishAgendaItem(
            item.id,
            item.updatedAt
          );
        }

        await reload();
      } catch (error) {
        setError(
          error?.message ||
          "THIS AGENDA ITEM COULD NOT BE UPDATED"
        );

        action.disabled = false;
      }
    });

    return action;
  }

  function createAgendaRow(item, reload) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const metadata = document.createElement("p");
    const placement = document.createElement("p");
    const statusArea = document.createElement("div");
    const status = document.createElement("span");
    const actions = document.createElement("div");

    const publicationAction =
      createPublicationAction(item, reload);

    const edit = document.createElement("a");

    edit.className = "text-action";

    edit.href =
      `dashboard-agenda-edit.html?id=${encodeURIComponent(
        item.id
      )}`;

    edit.textContent = "[ EDIT ]";

    edit.setAttribute(
      "aria-label",
      `Edit ${item.title || "untitled Agenda item"}`
    );

    const remove = createTextAction(
      "DELETE",
      `Delete ${item.title || "untitled Agenda item"}`
    );

    const confirmation =
      createDeleteConfirmation(item, reload);

    const location = [
      item.venueName,
      item.city,
      item.country
    ]
      .filter(Boolean)
      .join(", ");

    const details = [
      formatType(item.occurrenceType),
      formatDateRange(item.startDate, item.endDate),
      formatTimeRange(item.startTime, item.endTime),
      location,
      formatUpdated(item.updatedAt)
    ].filter(Boolean);

    row.className = "dashboard-agenda-row";
    information.className = "dashboard-agenda-information";
    statusArea.className = "dashboard-agenda-status";
    actions.className = "dashboard-agenda-actions";
    remove.classList.add("dashboard-delete-trigger");

    title.textContent = item.title || "UNTITLED";

    metadata.textContent =
      details.join(" · ") || "INCOMPLETE RECORD";

    placement.className = "dashboard-agenda-placement";

    if (item.presentation) {
      const prefix = document.createTextNode("LINKED TO: ");
      const presentationLink = document.createElement("a");

      presentationLink.href =
        `dashboard-presentation-edit.html?id=${encodeURIComponent(
          item.presentation.id
        )}`;

      presentationLink.textContent =
        item.presentation.title || "UNTITLED PRESENTATION";

      placement.append(prefix, presentationLink);
    } else {
      placement.textContent = "INDEPENDENT AGENDA ITEM";
    }

    status.textContent =
      item.visibility === "published"
        ? "PUBLISHED"
        : "DRAFT";

    status.className =
      item.visibility === "published"
        ? "is-published"
        : "is-draft";

    remove.addEventListener("click", () => {
      confirmation.hidden = false;

      confirmation
        .querySelector("button:not([disabled])")
        ?.focus();
    });

    information.append(title, metadata, placement);
    actions.append(edit, publicationAction, remove);
    statusArea.append(status, actions, confirmation);
    row.append(information, statusArea);

    return row;
  }

  function emptyState(message = "NO AGENDA ITEMS ADDED") {
    const state = document.createElement("div");
    const text = document.createElement("p");

    state.className = "dashboard-empty-state";
    text.textContent = message;

    state.append(text);

    if (message === "NO AGENDA ITEMS ADDED") {
      const link = document.createElement("a");

      link.className = "text-action";
      link.href = "dashboard-agenda-edit.html";
      link.textContent = "[ + ADD AGENDA ITEM ]";

      state.append(link);
    }

    return state;
  }

  function updateCounts(items) {
    const published = items.filter(
      (item) => item.visibility === "published"
    ).length;

    const drafts = items.length - published;

    breakdownElement.textContent =
      `${published} PUBLISHED / ${drafts} ` +
      `${drafts === 1 ? "DRAFT" : "DRAFTS"}`;

    totalElement.textContent =
      `${items.length} ` +
      `${items.length === 1 ? "AGENDA ITEM" : "AGENDA ITEMS"}`;
  }

  async function renderAgenda(profileIds = []) {
    const items =
      await repository.listAgendaItems(profileIds);

    setError();
    updateCounts(items);

    if (!items.length) {
      agendaList.replaceChildren(emptyState());
      return;
    }

    agendaList.replaceChildren(
      ...items.map((item) =>
        createAgendaRow(
          item,
          () => renderAgenda(profileIds)
        )
      )
    );
  }

  try {
    const selected = await getAgendaRepository();

    repository = selected.repository;
    await repository.initialise();

    if (repository.mode !== "local-supabase") {
      renderDashboardAccountIdentity([], "prototype");

      noticeElement.textContent =
        "AGENDA REQUIRES THE LOCAL DATABASE";

      noticeElement.hidden = false;

      updateCounts([]);

      agendaList.replaceChildren(
        emptyState("AGENDA UNAVAILABLE")
      );

      return;
    }

    const profiles = await repository.listManagedProfiles();

    renderDashboardAccountIdentity(profiles);

    if (!profiles.length) {
      updateCounts([]);

      agendaList.replaceChildren(
        emptyState("ARTIST PROFILE SETUP REQUIRED")
      );

      return;
    }

    await renderAgenda(
      profiles.map((profile) => profile.id)
    );
  } catch {
    renderDashboardAccountIdentity([], "error");
    setError("AGENDA IS CURRENTLY UNAVAILABLE");
    updateCounts([]);

    agendaList.replaceChildren(
      emptyState("AGENDA UNAVAILABLE")
    );
  }
});