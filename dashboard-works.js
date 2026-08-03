document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getWorkRepository, getPrototypeWorkCount } = await import("./data/work-repository.mjs");
  const workList = document.querySelector("#dashboard-work-list");
  const totalElement = document.querySelector("#dashboard-works-total");
  const breakdownElement = document.querySelector("#dashboard-works-breakdown");
  const errorElement = document.querySelector("#dashboard-works-error");
  const noticeElement = document.querySelector("#dashboard-prototype-notice");
  const addWorkLink = document.querySelector(".dashboard-add-work");
  let repository;
  const activeUrls = new Set();

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

  async function createWorkImage(work) {
    const cover = [...(work.images || [])].sort((a, b) => a.order - b.order).find((image) => image.isCover) || work.images?.[0];
    if (!cover) {
      const placeholder = document.createElement("div");
      placeholder.className = "dashboard-work-image-placeholder";
      placeholder.textContent = "NO IMAGE";
      return placeholder;
    }
    const image = document.createElement("img");
    image.alt = `${work.title || "Untitled"} cover image`;
    try {
      if (repository.mode === "local-supabase") {
        image.src = cover.publicPath && work.visibility === "published" ? repository.media.publicUrl(cover.publicPath) : await repository.media.privatePreview(cover);
      } else if (cover.blob) {
        image.src = URL.createObjectURL(cover.blob);
        activeUrls.add(image.src);
      } else image.src = cover.src;
    } catch {
      const placeholder = document.createElement("div");
      placeholder.className = "dashboard-work-image-placeholder";
      placeholder.textContent = "PREVIEW UNAVAILABLE";
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
    prompt.textContent = work.visibility === "published" ? "UNPUBLISH THIS WORK BEFORE DELETING IT." : "DELETE THIS WORK?";
    actions.className = "dashboard-delete-actions";
    confirm.disabled = work.visibility === "published";
    cancel.addEventListener("click", () => { container.hidden = true; cancel.closest("article")?.querySelector(".dashboard-delete-trigger")?.focus(); });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try { await repository.deleteWork(work.id); await reload(); }
      catch { setError("THIS WORK COULD NOT BE DELETED"); confirm.disabled = false; }
    });
    actions.append(confirm, cancel);
    container.append(prompt, actions);
    return container;
  }

  async function createWorkRow(work, reload) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const metadata = document.createElement("p");
    const imageState = document.createElement("p");
    const statusArea = document.createElement("div");
    const status = document.createElement("span");
    const actions = document.createElement("div");
    const edit = document.createElement("a");
    const remove = createTextAction("DELETE", `Delete ${work.title || "untitled work"}`);
    const confirmation = createDeleteConfirmation(work, reload);
    row.className = "dashboard-work-row";
    information.className = "dashboard-work-information";
    statusArea.className = "dashboard-work-status";
    actions.className = "dashboard-work-actions";
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
    information.append(title, metadata, imageState);
    actions.append(edit, remove);
    statusArea.append(status, actions, confirmation);
    row.append(await createWorkImage(work), information, statusArea);
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

  async function renderWorks(profileIds = []) {
    const works = await repository.listWorks(profileIds);
    releaseUrls();
    setError();
    updateCounts(works);
    if (!works.length) { workList.replaceChildren(emptyState()); return; }
    workList.replaceChildren(...await Promise.all(works.map((work) => createWorkRow(work, () => renderWorks(profileIds)))));
  }

  try {
    const selected = await getWorkRepository();
    repository = selected.repository;
    await repository.initialise();
    if (repository.mode === "local-supabase") {
      const count = await getPrototypeWorkCount().catch(() => 0);
      if (count) { noticeElement.textContent = `LOCAL PROTOTYPE WORKS HAVE NOT BEEN IMPORTED. (${count})`; noticeElement.hidden = false; }
      const profiles = await repository.listManagedProfiles();
      if (!profiles.length) {
        addWorkLink.setAttribute("aria-disabled", "true");
        addWorkLink.removeAttribute("href");
        updateCounts([]);
        workList.replaceChildren(emptyState("ARTIST PROFILE SETUP REQUIRED"));
        return;
      }
      await renderWorks(profiles.map((profile) => profile.id));
    } else await renderWorks();
  } catch { setError("WORKS ARE CURRENTLY UNAVAILABLE"); workList.replaceChildren(emptyState("WORKS UNAVAILABLE")); }

  window.addEventListener("beforeunload", releaseUrls);
});
