import { FRONTEND_MODES } from "./auth/config.mjs";
import { getArchiveRepository } from "./data/archive-repository.mjs";

const page = document.querySelector(".archive-page");
const grid = document.querySelector(".saved-grid");
const searchInput = document.querySelector(".archive-search input");
const resultCount = document.querySelector(".archive-result-count");
const emptyMessage = document.querySelector(".archive-empty");
const viewButtons = [...document.querySelectorAll("[data-archive-view]")];
const tagForm = document.querySelector(".archive-tag-create");
const tagInput = document.querySelector(".archive-tag-create input");
const tagCreateButton = document.querySelector(".archive-tag-create button");
const tagMessage = document.querySelector(".archive-tag-message");
const tagClearButton = document.querySelector(".archive-tag-clear");
const tagList = document.querySelector(".archive-tag-list");
const viewStorageKey = "chained-archive-view";

let repository = null;
let works = [];
let tags = [];
let tagIdsByWork = new Map();
let activeTagIds = new Set();

function setResultCount(count) {
  resultCount.textContent = `${count} ${count === 1 ? "WORK" : "WORKS"}`;
}

function showEmpty(message) {
  grid.replaceChildren();
  emptyMessage.textContent = message;
  emptyMessage.hidden = false;
  grid.setAttribute("aria-busy", "false");
}

function showUpdateError() {
  emptyMessage.textContent = "ARCHIVE COULD NOT BE UPDATED";
  emptyMessage.hidden = false;
}

function setTagMessage(message = "") {
  tagMessage.textContent = message;
  tagMessage.hidden = !message;
}

function workSearchText(work) {
  return [work.title, work.yearLabel, work.artistName, work.workType]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function tagIdsForWork(workId) {
  return tagIdsByWork.get(workId) || new Set();
}

function assignedTagsForWork(workId) {
  const assignedTagIds = tagIdsForWork(workId);
  return tags.filter((tag) => assignedTagIds.has(tag.id));
}

function setTagMenuBusy(menu, busy) {
  menu.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
}

async function removeAssignedTag(work, tag, menu, toggle) {
  setTagMenuBusy(menu, true);
  toggle.disabled = true;
  try {
    await repository.removeTag(work.id, tag.id);
    tagIdsForWork(work.id).delete(tag.id);
    renderWorks();
  } catch {
    setTagMenuBusy(menu, false);
    toggle.disabled = false;
    setTagMessage("TAG COULD NOT BE UPDATED");
  }
}

async function replaceAssignedTag(work, currentTag, replacementTag, menu, toggle) {
  setTagMenuBusy(menu, true);
  toggle.disabled = true;
  try {
    await repository.assignTag(work.id, replacementTag.id);
    try {
      await repository.removeTag(work.id, currentTag.id);
    } catch (error) {
      try {
        await repository.removeTag(work.id, replacementTag.id);
      } catch {}
      throw error;
    }
    const workTagIds = tagIdsForWork(work.id);
    workTagIds.delete(currentTag.id);
    workTagIds.add(replacementTag.id);
    renderWorks();
  } catch {
    setTagMenuBusy(menu, false);
    toggle.disabled = false;
    setTagMessage("TAG COULD NOT BE UPDATED");
  }
}

function createAssignedTags(work) {
  const container = document.createElement("div");
  container.className = "archive-work-tags";
  container.setAttribute("aria-label", `Tags for ${work.title}`);

  assignedTagsForWork(work.id).forEach((tag) => {
    const tagControl = document.createElement("div");
    tagControl.className = "archive-assigned-tag-control";
    const tagButton = document.createElement("button");
    tagButton.className = "archive-work-tag";
    tagButton.type = "button";
    tagButton.textContent = tag.name;
    tagButton.setAttribute("aria-label", `Manage ${tag.name} tag on ${work.title}`);
    tagButton.setAttribute("aria-haspopup", "menu");
    tagButton.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "archive-tag-menu archive-tag-management";
    menu.hidden = true;
    menu.setAttribute("role", "menu");

    const close = document.createElement("button");
    close.className = "archive-tag-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close tag menu");
    close.addEventListener("click", () => {
      menu.hidden = true;
      tagButton.setAttribute("aria-expanded", "false");
    });

    const options = document.createElement("div");
    options.className = "archive-tag-options";
    const availableTags = tags.filter((availableTag) => (
      availableTag.id !== tag.id && !tagIdsForWork(work.id).has(availableTag.id)
    ));
    availableTags.forEach((replacementTag) => {
      const replacement = document.createElement("button");
      replacement.type = "button";
      replacement.textContent = replacementTag.name;
      replacement.setAttribute("role", "menuitem");
      replacement.setAttribute("aria-label", `Replace ${tag.name} with ${replacementTag.name} on ${work.title}`);
      replacement.addEventListener("click", () => {
        void replaceAssignedTag(work, tag, replacementTag, menu, tagButton);
      });
      options.append(replacement);
    });
    options.hidden = availableTags.length === 0;

    const remove = document.createElement("button");
    remove.className = "archive-tag-remove";
    remove.type = "button";
    remove.textContent = "[ REMOVE TAG ]";
    remove.setAttribute("role", "menuitem");
    remove.setAttribute("aria-label", `Remove ${tag.name} tag from ${work.title}`);
    remove.addEventListener("click", () => {
      void removeAssignedTag(work, tag, menu, tagButton);
    });

    menu.append(close, options, remove);
    tagButton.addEventListener("click", () => {
      const isOpen = menu.hidden;
      menu.hidden = !isOpen;
      tagButton.setAttribute("aria-expanded", String(isOpen));
    });
    tagControl.append(tagButton, menu);
    container.append(tagControl);
  });

  return container;
}

function createTagAssignment(work) {
  const assignedTagIds = tagIdsForWork(work.id);
  const availableTags = tags.filter((tag) => !assignedTagIds.has(tag.id));
  if (!availableTags.length) return null;

  const container = document.createElement("div");
  container.className = "archive-tag-assignment";
  const toggle = document.createElement("button");
  toggle.className = "text-action";
  toggle.type = "button";
  toggle.textContent = "[ + TAG ]";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `Assign a tag to ${work.title}`);

  const menu = document.createElement("div");
  menu.className = "archive-tag-menu";
  menu.hidden = true;
  const options = document.createElement("div");
  options.className = "archive-tag-options";

  availableTags.forEach((tag) => {
    const assignTag = document.createElement("button");
    assignTag.type = "button";
    assignTag.textContent = tag.name;
    assignTag.setAttribute("aria-label", `Assign ${tag.name} tag to ${work.title}`);
    assignTag.addEventListener("click", async () => {
      assignTag.disabled = true;
      try {
        await repository.assignTag(work.id, tag.id);
        if (!tagIdsByWork.has(work.id)) tagIdsByWork.set(work.id, new Set());
        tagIdsByWork.get(work.id).add(tag.id);
        renderWorks();
      } catch {
        assignTag.disabled = false;
        setTagMessage("TAG COULD NOT BE UPDATED");
      }
    });
    options.append(assignTag);
  });

  toggle.addEventListener("click", () => {
    const isOpen = menu.hidden;
    menu.hidden = !isOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  menu.append(options);
  container.append(toggle, menu);
  return container;
}

function createSavedWork(work) {
  const article = document.createElement("article");
  article.className = "saved-work";
  article.dataset.workId = work.id;

  const artworkLink = document.createElement("a");
  artworkLink.href = work.artworkHref;
  const image = document.createElement("img");
  image.src = work.image.src;
  image.alt = `${work.title} by ${work.artistName}`;
  if (work.image.width) image.width = work.image.width;
  if (work.image.height) image.height = work.image.height;
  artworkLink.append(image);

  const metadata = document.createElement("div");
  metadata.className = "saved-work-meta";
  const profileLink = document.createElement("a");
  profileLink.href = work.profileHref;
  profileLink.textContent = work.artistName;
  const title = document.createElement("h2");
  title.textContent = work.title;
  const year = document.createElement("p");
  year.textContent = work.yearLabel;
  const assignedTags = createAssignedTags(work);
  const actions = document.createElement("div");
  actions.className = "saved-work-actions";
  const tagAssignment = createTagAssignment(work);
  const remove = document.createElement("button");
  remove.className = "text-action archive-remove";
  remove.type = "button";
  remove.textContent = "[ REMOVE FROM ARCHIVE ]";
  remove.setAttribute("aria-label", `Remove ${work.title} from Archive`);
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    article.setAttribute("aria-busy", "true");
    try {
      await repository.removeWork(work.id);
      await loadArchive();
    } catch {
      remove.disabled = false;
      article.removeAttribute("aria-busy");
      showUpdateError();
    }
  });

  if (tagAssignment) actions.append(tagAssignment);
  actions.append(remove);
  metadata.append(profileLink, title, year, assignedTags, actions);
  article.append(artworkLink, metadata);
  return article;
}

function renderWorks() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase();
  const visibleWorks = works.filter((work) => {
    const matchesSearch = !searchTerm || workSearchText(work).includes(searchTerm);
    const assignedTagIds = tagIdsForWork(work.id);
    const matchesTags = [...activeTagIds].every((tagId) => assignedTagIds.has(tagId));
    return matchesSearch && matchesTags;
  });
  grid.replaceChildren(...visibleWorks.map(createSavedWork));
  setResultCount(visibleWorks.length);
  emptyMessage.hidden = visibleWorks.length !== 0;
  if (!visibleWorks.length) {
    if (searchTerm && activeTagIds.size) {
      emptyMessage.textContent = "NO SAVED WORKS MATCH YOUR SEARCH AND TAG FILTERS";
    } else if (searchTerm) {
      emptyMessage.textContent = "NO SAVED WORKS MATCH YOUR SEARCH";
    } else if (activeTagIds.size) {
      emptyMessage.textContent = "NO SAVED WORKS MATCH ACTIVE TAG FILTERS";
    } else {
      emptyMessage.textContent = "NO SAVED WORKS";
    }
  }
  grid.setAttribute("aria-busy", "false");
}

function renderTags() {
  tagList.replaceChildren();
  tags.forEach((tag) => {
    const row = document.createElement("div");
    row.className = "archive-tag-row";
    const name = document.createElement("button");
    const isActive = activeTagIds.has(tag.id);
    name.className = "archive-tag-filter";
    name.type = "button";
    name.textContent = tag.name;
    name.setAttribute("aria-pressed", String(isActive));
    name.setAttribute("aria-label", `${isActive ? "Deactivate" : "Activate"} ${tag.name} filter`);
    name.classList.toggle("is-active", isActive);
    name.addEventListener("click", () => {
      if (activeTagIds.has(tag.id)) {
        activeTagIds.delete(tag.id);
      } else {
        activeTagIds.add(tag.id);
      }
      renderTags();
      renderWorks();
    });
    const remove = document.createElement("button");
    remove.className = "text-action";
    remove.type = "button";
    remove.textContent = "[ DELETE ]";
    remove.setAttribute("aria-label", `Delete ${tag.name} tag`);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await repository.deleteTag(tag.id);
        tags = tags.filter((currentTag) => currentTag.id !== tag.id);
        activeTagIds.delete(tag.id);
        tagIdsByWork.forEach((tagIds) => tagIds.delete(tag.id));
        renderTags();
        renderWorks();
      } catch {
        remove.disabled = false;
        setTagMessage("TAG COULD NOT BE DELETED");
      }
    });
    row.append(name, remove);
    tagList.append(row);
  });
  tagClearButton.hidden = activeTagIds.size === 0;
}

async function loadTagData() {
  const [loadedTags, memberships] = await Promise.all([
    repository.listTags(),
    repository.listTagMemberships()
  ]);
  tags = [...loadedTags];
  const availableTagIds = new Set(tags.map((tag) => tag.id));
  activeTagIds = new Set([...activeTagIds].filter((tagId) => availableTagIds.has(tagId)));
  tagIdsByWork = new Map();
  memberships.forEach(({ workId, tagId }) => {
    if (!tagIdsByWork.has(workId)) tagIdsByWork.set(workId, new Set());
    tagIdsByWork.get(workId).add(tagId);
  });
}

async function loadArchive() {
  grid.setAttribute("aria-busy", "true");
  emptyMessage.hidden = true;
  try {
    const [loadedWorks] = await Promise.all([
      repository.listArchivedWorks(),
      loadTagData()
    ]);
    works = loadedWorks;
    searchInput.disabled = false;
    tagInput.disabled = false;
    tagCreateButton.disabled = false;
    renderTags();
    renderWorks();
  } catch {
    searchInput.disabled = true;
    tagInput.disabled = true;
    tagCreateButton.disabled = true;
    setResultCount(0);
    showEmpty("ARCHIVE IS CURRENTLY UNAVAILABLE");
  }
}

function setView(view) {
  if (!viewButtons.some((button) => button.dataset.archiveView === view)) return;
  page.dataset.view = view;
  viewButtons.forEach((button) => {
    const active = button.dataset.archiveView === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  try {
    localStorage.setItem(viewStorageKey, view);
  } catch {}
}

function initialiseView() {
  let storedView = "grid";
  try {
    storedView = localStorage.getItem(viewStorageKey) || storedView;
  } catch {}
  setView(storedView);
  viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.archiveView)));
}

function initialiseTagCreation() {
  tagClearButton.addEventListener("click", () => {
    activeTagIds.clear();
    renderTags();
    renderWorks();
  });

  tagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = tagInput.value.trim();
    if (!name) {
      setTagMessage("ENTER A TAG NAME");
      return;
    }

    tagCreateButton.disabled = true;
    setTagMessage();
    try {
      await repository.createTag(name);
      tagInput.value = "";
      await loadTagData();
      renderTags();
      renderWorks();
    } catch {
      setTagMessage("TAG COULD NOT BE CREATED");
    } finally {
      tagCreateButton.disabled = false;
    }
  });
}

async function initialiseArchive() {
  initialiseView();
  const resolved = await getArchiveRepository();
  if (resolved.runtime.mode === FRONTEND_MODES.PROTOTYPE || !resolved.repository) {
    setResultCount(0);
    showEmpty("NO SAVED WORKS");
    return;
  }
  repository = resolved.repository;
  searchInput.addEventListener("input", renderWorks);
  initialiseTagCreation();
  await loadArchive();
}

function beginWhenAuthorised() {
  if (document.body.dataset.authMode) {
    void initialiseArchive();
    return;
  }
  window.addEventListener("chained:auth-ready", () => void initialiseArchive(), { once: true });
}

beginWhenAuthorised();
