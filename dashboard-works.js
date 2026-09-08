document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getWorkRepository } = await import("./data/work-repository.mjs");
  const { renderDashboardAccountIdentity } = await import("./data/dashboard-context.mjs");
  const {
    groupArtistWorksByYear,
    moveWorkWithinYear,
    placeWorkWithinYear,
    workInsertionDestination
  } = await import("./data/artist-work-ordering.mjs");
  const workList = document.querySelector("#dashboard-work-list");
  const totalElement = document.querySelector("#dashboard-works-total");
  const breakdownElement = document.querySelector("#dashboard-works-breakdown");
  const errorElement = document.querySelector("#dashboard-works-error");
  const addWorkLink = document.querySelector(".dashboard-add-work");
  let repository;
  const activeUrls = new Set();
  let activeWorkDrag = null;
  let workOrderSaving = false;

  function releaseUrls() {
    activeUrls.forEach((url) => URL.revokeObjectURL(url));
    activeUrls.clear();
    repository?.media?.urls.revokeAll();
  }

  function setError(message = "") {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function formatWorkType(value = "") {
    return value.replaceAll("-", " ").toUpperCase();
  }

  function formatUpdated(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : `UPDATED ${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date).toUpperCase()}`;
  }

  function createTextAction(text, ariaLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-action";
    button.textContent = `[ ${text} ]`;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  async function createWorkImage(work, privatePreviewResult = { previews: new Map(), failures: new Map() }) {
    const cover = [...(work.images || [])].sort((a, b) => a.order - b.order).find((image) => image.isCover) || work.images?.[0];
    if (!cover) {
      const placeholder = document.createElement("div");
      placeholder.className = "dashboard-work-image-placeholder";
      placeholder.textContent = "NO IMAGE";
      return placeholder;
    }
    const image = document.createElement("img");
    image.alt = `${work.title || "Untitled"} cover image`;
    image.draggable = false;
    try {
      if (repository.mode === "supabase") {
        image.src = cover.publicPath && work.visibility === "published"
          ? repository.media.publicUrl(cover.publicPath)
          : privatePreviewResult.previews.get(String(cover.id).toLowerCase()) || "";
        if (!image.src) throw new Error("private preview unavailable");
      } else if (cover.blob) {
        image.src = URL.createObjectURL(cover.blob);
        activeUrls.add(image.src);
      } else image.src = cover.src;
    } catch {
      const placeholder = document.createElement("div");
      placeholder.className = "dashboard-work-image-placeholder";
      const privatePreview = repository.mode === "supabase" && !(cover.publicPath && work.visibility === "published");
      const failure = privatePreviewResult.failures.get(String(cover.id).toLowerCase());
      placeholder.textContent = privatePreview && failure?.category !== "unavailable"
        ? "PREVIEW TEMPORARILY UNAVAILABLE"
        : "PREVIEW UNAVAILABLE";
      return placeholder;
    }
    return image;
  }

  function createDeleteConfirmation(work, reload) {
    const container = document.createElement("div");
    const prompt = document.createElement("p");
    const actions = document.createElement("div");
    const confirm = createTextAction("CONFIRM DELETE", `Confirm deletion of ${work.title || "untitled work"}`);
    const cancel = createTextAction("CANCEL", `Cancel deletion of ${work.title || "untitled work"}`);
    container.className = "dashboard-delete-confirmation";
    container.hidden = true;
    prompt.textContent = "DELETE THIS WORK?";
    actions.className = "dashboard-delete-actions";
    cancel.addEventListener("click", () => { container.hidden = true; cancel.closest("article")?.querySelector(".dashboard-delete-trigger")?.focus(); });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try { await repository.deleteWork(work.id, { published: work.visibility === "published", idempotencyKey: crypto.randomUUID() }); await reload(); }
      catch {
        try { await reload(); }
        catch {}
        setError("THIS WORK COULD NOT BE DELETED");
        confirm.disabled = false;
      }
    });
    actions.append(confirm, cancel);
    container.append(prompt, actions);
    return container;
  }

  function clearWorkDropTarget(rows) {
    rows.querySelectorAll(".is-work-drop-before, .is-work-drop-after").forEach((row) => {
      row.classList.remove("is-work-drop-before", "is-work-drop-after");
    });
  }

  function destinationForWorkDrag(session, clientX, clientY) {
    const bounds = session.rows.getBoundingClientRect();
    if (clientX < bounds.left - 48 || clientX > bounds.right + 48
      || clientY < bounds.top - 16 || clientY > bounds.bottom + 16) return null;
    const rows = [...session.rows.querySelectorAll(".dashboard-work-row")];
    const insertionIndex = rows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return clientY < bounds.top + bounds.height / 2;
    });
    const rawDestination = insertionIndex === -1 ? rows.length : insertionIndex;
    return workInsertionDestination(session.sourceIndex, rawDestination, rows.length);
  }

  function setWorkDropTarget(session, destination) {
    clearWorkDropTarget(session.rows);
    session.destination = destination;
    if (destination == null) return;
    const rows = [...session.rows.querySelectorAll(".dashboard-work-row")];
    rows[destination]?.classList.add(
      destination < session.sourceIndex ? "is-work-drop-before" : "is-work-drop-after"
    );
  }

  function finishWorkDrag(session, { cancelled = false } = {}) {
    if (activeWorkDrag !== session) return;
    activeWorkDrag = null;
    window.removeEventListener("pointermove", session.onMove);
    window.removeEventListener("pointerup", session.onEnd);
    window.removeEventListener("pointercancel", session.onCancel);
    session.row.classList.remove("is-work-reordering");
    clearWorkDropTarget(session.rows);
    if (cancelled || !session.started || session.destination == null) return;
    const nextWorks = placeWorkWithinYear(
      session.ordering.works,
      session.ordering.workId,
      session.destination
    );
    if (nextWorks) void session.ordering.save(nextWorks.map((work) => work.id));
  }

  function startWorkDrag(event, row, grip, ordering, fromGrip) {
    const coarsePointer = event.pointerType === "touch"
      || window.matchMedia?.("(pointer: coarse)")?.matches;
    if (event.pointerType !== "touch" && event.button !== 0) return;
    if (workOrderSaving || activeWorkDrag || (coarsePointer && !fromGrip)) return;
    if (!coarsePointer && event.target.closest("a, button, input, select, textarea")) return;
    if (fromGrip) event.stopPropagation();
    const session = {
      row,
      rows: ordering.rows,
      ordering,
      sourceIndex: ordering.index,
      destination: null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      onMove: null,
      onEnd: null,
      onCancel: null
    };
    session.onMove = (moveEvent) => {
      if (moveEvent.pointerId !== session.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - session.startX, moveEvent.clientY - session.startY);
      if (!session.started && distance < 6) return;
      session.started = true;
      moveEvent.preventDefault();
      session.row.classList.add("is-work-reordering");
      setWorkDropTarget(session, destinationForWorkDrag(session, moveEvent.clientX, moveEvent.clientY));
    };
    session.onEnd = (endEvent) => {
      if (endEvent.pointerId === session.pointerId) finishWorkDrag(session);
    };
    session.onCancel = (cancelEvent) => {
      if (cancelEvent.pointerId === session.pointerId) finishWorkDrag(session, { cancelled: true });
    };
    activeWorkDrag = session;
    window.addEventListener("pointermove", session.onMove, { passive: false });
    window.addEventListener("pointerup", session.onEnd);
    window.addEventListener("pointercancel", session.onCancel);
  }

  function attachWorkReorderInteraction(row, thumbnail, grip, ordering) {
    thumbnail.addEventListener("pointerdown", (event) => {
      startWorkDrag(event, row, grip, ordering, false);
    });
    grip.addEventListener("pointerdown", (event) => {
      startWorkDrag(event, row, grip, ordering, true);
    });
  }

  async function createWorkRow(work, reload, privatePreviewResult, ordering) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const metadata = document.createElement("p");
    const imageState = document.createElement("p");
    const statusArea = document.createElement("div");
    const status = document.createElement("span");
    const actions = document.createElement("div");
    const primaryActions = document.createElement("div");
    const edit = document.createElement("a");
    const grip = document.createElement("span");
    const remove = createTextAction("DELETE", `Delete ${work.title || "untitled work"}`);
    const confirmation = createDeleteConfirmation(work, reload);
    row.className = "dashboard-work-row";
    information.className = "dashboard-work-information";
    statusArea.className = "dashboard-work-status";
    actions.className = "dashboard-work-actions";
    primaryActions.className = "dashboard-work-primary-actions";
    grip.className = "dashboard-work-reorder-grip";
    grip.setAttribute("role", "img");
    grip.setAttribute("aria-label", `Reorder ${work.title || "untitled work"}; arrow controls remain available`);
    remove.classList.add("dashboard-delete-trigger");
    title.textContent = work.title || "UNTITLED";
    metadata.textContent = [work.year, formatWorkType(work.workType), formatUpdated(work.updatedAt)].filter(Boolean).join(" · ") || "INCOMPLETE RECORD";
    const states = [...new Set((work.images || []).map((item) => String(item.uploadStatus || "ready").replaceAll("_", " ").toUpperCase()))];
    imageState.className = "dashboard-work-image-state";
    imageState.textContent = work.images?.length ? `${work.images.length} IMAGE${work.images.length === 1 ? "" : "S"} · ${states.join(" / ")}` : "NO IMAGES";
    status.textContent = work.visibility === "published" ? "PUBLISHED" : "DRAFT";
    status.className = work.visibility === "published" ? "is-published" : "is-draft";
    edit.className = "text-action";
    edit.href = `dashboard-work-edit.html?id=${encodeURIComponent(work.id)}`;
    edit.textContent = "[ EDIT ]";
    edit.setAttribute("aria-label", `Edit ${work.title || "untitled work"}`);
    remove.addEventListener("click", () => { confirmation.hidden = false; confirmation.querySelector("button:not([disabled])")?.focus(); });
    if (ordering) {
      const reorderControls = document.createElement("div");
      const moveUp = createTextAction("↑", `Move ${work.title || "untitled work"} up within ${ordering.label}`);
      const moveDown = createTextAction("↓", `Move ${work.title || "untitled work"} down within ${ordering.label}`);
      reorderControls.className = "dashboard-work-reorder-controls";
      moveUp.disabled = ordering.index === 0;
      moveDown.disabled = ordering.index === ordering.workIds.length - 1;
      moveUp.addEventListener("click", () => ordering.move(-1));
      moveDown.addEventListener("click", () => ordering.move(1));
      reorderControls.append(moveUp, moveDown);
      primaryActions.append(grip, reorderControls);
    }
    information.append(title, metadata, imageState);
    if (ordering) {
      primaryActions.append(edit);
      actions.append(primaryActions, remove);
    } else {
      actions.append(edit, remove);
    }
    statusArea.append(status, actions, confirmation);
    const thumbnail = await createWorkImage(work, privatePreviewResult);
    if (ordering) thumbnail.classList.add("dashboard-work-reorder-thumbnail");
    row.append(thumbnail, information, statusArea);
    if (ordering) attachWorkReorderInteraction(row, thumbnail, grip, ordering);
    return row;
  }

  function emptyState(message = "NO WORKS ADDED") {
    const state = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = message;
    state.className = "dashboard-empty-state";
    state.append(text);
    if (message === "NO WORKS ADDED") {
      const link = document.createElement("a");
      link.className = "text-action";
      link.href = "dashboard-work-edit.html";
      link.textContent = "[ + ADD WORK ]";
      state.append(link);
    }
    return state;
  }

  function updateCounts(works) {
    const published = works.filter((work) => work.visibility === "published").length;
    const drafts = works.length - published;
    breakdownElement.textContent = `${published} PUBLISHED / ${drafts} ${drafts === 1 ? "DRAFT" : "DRAFTS"}`;
    totalElement.textContent = `${works.length} ${works.length === 1 ? "WORK" : "WORKS"}`;
  }

  async function renderWorks(profiles = []) {
    const profileIds = profiles.map((profile) => profile.id);
    const works = await repository.listWorks(profileIds);
    releaseUrls();
    setError();
    updateCounts(works);
    if (!works.length) { workList.replaceChildren(emptyState()); return; }
    const privateCovers = works.map((work) => {
      const cover = [...(work.images || [])].sort((a, b) => a.order - b.order).find((image) => image.isCover) || work.images?.[0];
      return cover && !(cover.publicPath && work.visibility === "published") ? cover : null;
    }).filter(Boolean);
    let privatePreviewResult = { previews: new Map(), failures: new Map() };
    if (repository.mode === "supabase") {
      privatePreviewResult = await repository.media.privatePreviewBatchResult(privateCovers);
    }
    const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));
    const groups = groupArtistWorksByYear(works, profileNames);
    const showProfileNames = new Set(groups.map((group) => group.profileId)).size > 1;
    const sections = await Promise.all(groups.map(async (group) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const rows = document.createElement("div");
      const yearLabel = group.year == null ? "UNKNOWN" : String(group.year);
      const label = showProfileNames && group.profileName ? `${group.profileName.toUpperCase()} · ${yearLabel}` : yearLabel;
      section.className = "dashboard-work-year-group";
      heading.className = "dashboard-work-year-heading";
      heading.textContent = label;
      rows.className = "dashboard-work-year-list";
      const orderedIds = group.works.map((work) => work.id);
      const saveOrder = async (nextWorkIds) => {
        if (workOrderSaving) return;
        workOrderSaving = true;
        setError();
        try {
          await repository.reorderArtistProfileWorks(group.profileId, group.year, nextWorkIds);
          await renderWorks(profiles);
        } catch {
          try { await renderWorks(profiles); } catch {}
          setError("WORK ORDER COULD NOT BE SAVED");
        } finally {
          workOrderSaving = false;
        }
      };
      const renderedRows = await Promise.all(group.works.map((work, index) => createWorkRow(
        work,
        () => renderWorks(profiles),
        privatePreviewResult,
        {
          index,
          label: yearLabel,
          rows,
          works: group.works,
          workId: work.id,
          workIds: orderedIds,
          move: async (direction) => {
            const moved = moveWorkWithinYear(orderedIds.map((id) => ({ id })), work.id, direction);
            if (!moved) return;
            await saveOrder(moved.map((item) => item.id));
          },
          save: saveOrder
        }
      )));
      rows.append(...renderedRows);
      section.append(heading, rows);
      return section;
    }));
    workList.replaceChildren(...sections);
  }

  try {
    const selected = await getWorkRepository();
    repository = selected.repository;
    await repository.initialise();
    if (repository.mode === "supabase") {
      const profiles = await repository.listManagedProfiles();
      renderDashboardAccountIdentity(profiles);

      if (!profiles.length) {
        addWorkLink.setAttribute("aria-disabled", "true");
        addWorkLink.removeAttribute("href");
        updateCounts([]);
        workList.replaceChildren(emptyState("ARTIST PROFILE SETUP REQUIRED"));
        return;
      }
      await renderWorks(profiles);
    } else {
      renderDashboardAccountIdentity([], "prototype");
      await renderWorks();
    }
  } catch {
    renderDashboardAccountIdentity([], "error");
    setError("WORKS ARE CURRENTLY UNAVAILABLE");
    workList.replaceChildren(emptyState("WORKS UNAVAILABLE"));
  }

  window.addEventListener("beforeunload", () => {
    if (activeWorkDrag) finishWorkDrag(activeWorkDrag, { cancelled: true });
    releaseUrls();
  });
});
