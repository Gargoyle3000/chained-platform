import { FRONTEND_MODES } from "./auth/config.mjs";
import { getArchiveRepository } from "./data/archive-repository.mjs";
import {
  archiveProjectLocation,
  filterArchiveProjectWorks,
  orderedProjectWorks,
  resolveArchiveProjectId
} from "./data/archive-project-state.mjs";
import { calculateAnchoredPopoverPosition } from "./data/anchored-popover.mjs";

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
const projectList = document.querySelector(".archive-project-list");
const projectContext = document.querySelector(".archive-project-context");
const projectTitle = document.querySelector("#archive-current-project");
const allWorksLabel = document.querySelector(".archive-all-works-label");
const projectEditLink = document.querySelector(".archive-project-edit");
const projectCloseButton = document.querySelector(".archive-project-close");
const viewStorageKey = "chained-archive-view";

let repository = null;
let works = [];
let tags = [];
let tagIdsByWork = new Map();
let activeTagIds = new Set();
let projects = [];
let projectItems = [];
let projectIdsByWork = new Map();
let selectedProjectId = new URL(window.location.href).searchParams.get("project") || null;
let openProjectMenu = null;
let openWorkManagementMenu = null;
let openArchivePopover = null;

function setResultCount(count) {
  resultCount.textContent = `${count} ${count === 1 ? "WORK" : "WORKS"}`;
}

function setTagMessage(message = "") {
  tagMessage.textContent = message;
  tagMessage.hidden = !message;
}

function selectedProject() {
  return projects.find((project) => project.id === selectedProjectId) || null;
}

function updateProjectLocation(projectId, mode) {
  const nextLocation = archiveProjectLocation(window.location.href, projectId);
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextLocation === currentLocation) return;
  window.history[mode === "replace" ? "replaceState" : "pushState"]({}, document.title, nextLocation);
}

function tagIdsForWork(workId) {
  return tagIdsByWork.get(workId) || new Set();
}

function projectIdsForWork(workId) {
  return projectIdsByWork.get(workId) || new Set();
}

function rebuildProjectIndexes() {
  projectIdsByWork = new Map();
  projectItems.forEach((item) => {
    if (!projectIdsByWork.has(item.workId)) projectIdsByWork.set(item.workId, new Set());
    projectIdsByWork.get(item.workId).add(item.projectId);
  });
}

function closeProjectMenu(returnFocus = false) {
  if (!openProjectMenu) return;
  const { menu, toggle } = openProjectMenu;
  closeArchivePopover(menu, toggle);
  openProjectMenu = null;
  if (returnFocus) toggle.focus();
}

function closeArchivePopover(menu, toggle) {
  if (openArchivePopover?.menu === menu) {
    window.removeEventListener("scroll", openArchivePopover.reposition, true);
    window.removeEventListener("resize", openArchivePopover.reposition);
    openArchivePopover = null;
  }
  menu.hidden = true;
  menu.classList.remove("is-anchored");
  menu.style.removeProperty("left");
  menu.style.removeProperty("top");
  toggle.setAttribute("aria-expanded", "false");
}

function openArchivePopoverFor(toggle, menu) {
  if (openArchivePopover) {
    closeArchivePopover(openArchivePopover.menu, openArchivePopover.toggle);
  }
  menu.classList.add("is-anchored");
  menu.hidden = false;
  const reposition = () => {
    const placement = calculateAnchoredPopoverPosition({
      trigger: toggle.getBoundingClientRect(),
      popover: menu.getBoundingClientRect(),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });
    menu.style.left = `${placement.left}px`;
    menu.style.top = `${placement.top}px`;
  };
  reposition();
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  toggle.setAttribute("aria-expanded", "true");
  openArchivePopover = { menu, toggle, reposition };
}

function closeWorkManagementMenu(returnFocus = false) {
  if (!openWorkManagementMenu) return;
  const { menu, toggle } = openWorkManagementMenu;
  if (openProjectMenu && menu.contains(openProjectMenu.menu)) closeProjectMenu();
  if (openArchivePopover && menu.contains(openArchivePopover.menu)) {
    closeArchivePopover(openArchivePopover.menu, openArchivePopover.toggle);
  }
  menu.querySelectorAll(".archive-tag-menu").forEach((tagMenu) => {
    tagMenu.hidden = true;
    const tagToggle = tagMenu.previousElementSibling;
    if (tagToggle) tagToggle.setAttribute("aria-expanded", "false");
  });
  menu.dataset.open = "false";
  toggle.setAttribute("aria-expanded", "false");
  openWorkManagementMenu = null;
  if (returnFocus) toggle.focus();
}

function createSupergridManagement(work) {
  const toggle = document.createElement("button");
  toggle.className = "archive-supergrid-management-trigger";
  toggle.type = "button";
  toggle.textContent = "[ ... ]";
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `Manage ${work.title} in Archive`);

  const menu = document.createElement("div");
  menu.className = "archive-supergrid-menu";
  menu.id = `archive-management-${work.id}`;
  menu.dataset.open = "false";
  menu.setAttribute("role", "menu");
  toggle.setAttribute("aria-controls", menu.id);

  const close = document.createElement("button");
  close.className = "archive-supergrid-menu-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close Work management menu");
  close.addEventListener("click", () => closeWorkManagementMenu(true));

  toggle.addEventListener("click", () => {
    const isOpen = menu.dataset.open === "true";
    closeWorkManagementMenu();
    if (isOpen) return;
    menu.dataset.open = "true";
    toggle.setAttribute("aria-expanded", "true");
    openWorkManagementMenu = { menu, toggle };
  });

  menu.append(close);
  return { menu, toggle };
}

function createTagMenuClose(menu, toggle) {
  const close = document.createElement("button");
  close.className = "archive-tag-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close tag menu");
  close.addEventListener("click", () => {
    closeArchivePopover(menu, toggle);
    toggle.focus();
  });
  return close;
}

function setTagMenuBusy(menu, busy) {
  menu.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
}

function assignedTagsForWork(workId) {
  return tags.filter((tag) => tagIdsForWork(workId).has(tag.id));
}

function createAssignedTags(work) {
  const container = document.createElement("div");
  container.className = "archive-work-tags";
  container.setAttribute("aria-label", `Tags for ${work.title}`);
  assignedTagsForWork(work.id).forEach((tag) => {
    const control = document.createElement("div");
    control.className = "archive-assigned-tag-control";
    const toggle = document.createElement("button");
    toggle.className = "archive-work-tag";
    toggle.type = "button";
    toggle.textContent = tag.name;
    toggle.setAttribute("aria-label", `Manage ${tag.name} tag on ${work.title}`);
    toggle.setAttribute("aria-haspopup", "menu");
    toggle.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "archive-tag-menu archive-tag-management";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    const options = document.createElement("div");
    options.className = "archive-tag-options";
    const available = tags.filter((candidate) => candidate.id !== tag.id && !tagIdsForWork(work.id).has(candidate.id));
    available.forEach((replacementTag) => {
      const replacement = document.createElement("button");
      replacement.type = "button";
      replacement.textContent = replacementTag.name;
      replacement.setAttribute("role", "menuitem");
      replacement.setAttribute("aria-label", `Replace ${tag.name} with ${replacementTag.name} on ${work.title}`);
      replacement.addEventListener("click", async () => {
        setTagMenuBusy(menu, true);
        try {
          await repository.assignTag(work.id, replacementTag.id);
          try { await repository.removeTag(work.id, tag.id); } catch (error) {
            try { await repository.removeTag(work.id, replacementTag.id); } catch {}
            throw error;
          }
          tagIdsForWork(work.id).delete(tag.id);
          tagIdsForWork(work.id).add(replacementTag.id);
          renderWorks();
        } catch { setTagMenuBusy(menu, false); setTagMessage("TAG COULD NOT BE UPDATED"); }
      });
      options.append(replacement);
    });
    options.hidden = available.length === 0;
    const remove = document.createElement("button");
    remove.className = "archive-tag-remove";
    remove.type = "button";
    remove.textContent = "[ REMOVE TAG ]";
    remove.setAttribute("role", "menuitem");
    remove.setAttribute("aria-label", `Remove ${tag.name} tag from ${work.title}`);
    remove.addEventListener("click", async () => {
      setTagMenuBusy(menu, true);
      try {
        await repository.removeTag(work.id, tag.id);
        tagIdsForWork(work.id).delete(tag.id);
        renderWorks();
      } catch { setTagMenuBusy(menu, false); setTagMessage("TAG COULD NOT BE UPDATED"); }
    });
    menu.append(createTagMenuClose(menu, toggle), options, remove);
    window.ChainedScrollIndicators?.attachScrollIndicator(options, { host: menu });
    toggle.addEventListener("click", () => {
      const isOpen = menu.hidden;
      if (!isOpen) {
        closeArchivePopover(menu, toggle);
        return;
      }
      closeProjectMenu();
      openArchivePopoverFor(toggle, menu);
    });
    control.append(toggle, menu);
    container.append(control);
  });
  return container;
}

function createTagAssignment(work) {
  const available = tags.filter((tag) => !tagIdsForWork(work.id).has(tag.id));
  if (!available.length) return null;
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
  menu.setAttribute("role", "menu");
  const options = document.createElement("div");
  options.className = "archive-tag-options";
  available.forEach((tag) => {
    const assign = document.createElement("button");
    assign.type = "button";
    assign.textContent = tag.name;
    assign.setAttribute("aria-label", `Assign ${tag.name} tag to ${work.title}`);
    assign.addEventListener("click", async () => {
      assign.disabled = true;
      try {
        await repository.assignTag(work.id, tag.id);
        if (!tagIdsByWork.has(work.id)) tagIdsByWork.set(work.id, new Set());
        tagIdsByWork.get(work.id).add(tag.id);
        renderWorks();
      } catch { assign.disabled = false; setTagMessage("TAG COULD NOT BE UPDATED"); }
    });
    options.append(assign);
  });
  menu.append(createTagMenuClose(menu, toggle), options);
  window.ChainedScrollIndicators?.attachScrollIndicator(options, { host: menu });
  toggle.addEventListener("click", () => {
    const isOpen = menu.hidden;
    if (!isOpen) {
      closeArchivePopover(menu, toggle);
      return;
    }
    closeProjectMenu();
    openArchivePopoverFor(toggle, menu);
  });
  container.append(toggle, menu);
  return container;
}

function createProjectMemberships(work) {
  const memberships = projects.filter((project) => projectIdsForWork(work.id).has(project.id));
  if (!memberships.length) return null;
  const container = document.createElement("div");
  container.className = "archive-work-projects";
  memberships.forEach((project) => {
    const button = document.createElement("button");
    button.className = "archive-work-project";
    button.type = "button";
    button.textContent = project.title;
    button.setAttribute("aria-label", `Open ${project.title} Project`);
    button.addEventListener("click", () => void selectProject(project.id));
    container.append(button);
  });
  return container;
}

function createProjectAssignment(work) {
  const available = projects.filter((project) => !projectIdsForWork(work.id).has(project.id));
  if (!available.length) return null;
  const container = document.createElement("div");
  container.className = "archive-project-assignment";
  const toggle = document.createElement("button");
  toggle.className = "text-action archive-add-project";
  toggle.type = "button";
  toggle.textContent = "[ + PROJECT ]";
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `Add ${work.title} to a Project`);
  const menu = document.createElement("div");
  menu.className = "archive-project-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  const close = document.createElement("button");
  close.className = "archive-project-close-menu";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close Project menu");
  close.addEventListener("click", () => closeProjectMenu(true));
  const options = document.createElement("div");
  options.className = "archive-project-options";
  available.forEach((project) => {
    const add = document.createElement("button");
    add.className = "archive-project-option";
    add.type = "button";
    add.textContent = project.title;
    add.setAttribute("role", "menuitem");
    add.setAttribute("aria-label", `Add ${work.title} to ${project.title}`);
    add.addEventListener("click", async () => {
      add.disabled = true;
      try {
        await repository.addProjectWork(project.id, work.id);
        closeProjectMenu();
        await loadProjectData();
        renderProjects();
        renderWorks();
      } catch { add.disabled = false; setTagMessage("WORK COULD NOT BE ADDED TO PROJECT"); }
    });
    options.append(add);
  });
  toggle.addEventListener("click", () => {
    const isOpen = menu.hidden;
    closeProjectMenu();
    if (!isOpen) return;
    openArchivePopoverFor(toggle, menu);
    openProjectMenu = { container, menu, toggle };
  });
  menu.append(close, options);
  window.ChainedScrollIndicators?.attachScrollIndicator(options, { host: menu });
  container.append(toggle, menu);
  return container;
}

function createSavedWork(work) {
  const article = document.createElement("article");
  article.className = "saved-work";
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
  const artist = document.createElement("a");
  artist.href = work.profileHref;
  artist.textContent = work.artistName;
  const title = document.createElement("h2");
  title.textContent = work.title;
  const year = document.createElement("p");
  year.textContent = work.yearLabel;
  const actions = document.createElement("div");
  actions.className = "saved-work-actions";
  const remove = document.createElement("button");
  remove.className = "text-action archive-remove";
  remove.type = "button";
  remove.textContent = "[ REMOVE FROM ARCHIVE ]";
  remove.setAttribute("aria-label", `Remove ${work.title} from Archive`);
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try { await repository.removeWork(work.id); await loadArchive(); }
    catch { remove.disabled = false; emptyMessage.textContent = "ARCHIVE COULD NOT BE UPDATED"; emptyMessage.hidden = false; }
  });
  const tagAssignment = createTagAssignment(work);
  const projectAssignment = createProjectAssignment(work);
  const management = createSupergridManagement(work);
  if (tagAssignment) management.menu.append(tagAssignment);
  if (projectAssignment) management.menu.append(projectAssignment);
  management.menu.append(remove);
  actions.append(management.toggle, management.menu);
  metadata.append(artist, title, year, createAssignedTags(work));
  const memberships = createProjectMemberships(work);
  if (memberships) metadata.append(memberships);
  metadata.append(actions);
  article.append(artworkLink, metadata);
  return article;
}

function selectedProjectWorks() {
  return orderedProjectWorks(works, projectItems, selectedProjectId);
}

function renderWorks() {
  if (openArchivePopover) closeArchivePopover(openArchivePopover.menu, openArchivePopover.toggle);
  closeWorkManagementMenu();
  closeProjectMenu();
  const searchTerm = searchInput.value.trim().toLocaleLowerCase();
  const visible = filterArchiveProjectWorks(selectedProjectWorks(), searchTerm, activeTagIds, tagIdsForWork);
  grid.replaceChildren(...visible.map(createSavedWork));
  setResultCount(visible.length);
  emptyMessage.hidden = visible.length !== 0;
  if (!visible.length) emptyMessage.textContent = selectedProjectId
    ? "NO SAVED WORKS MATCH THIS PROJECT"
    : "NO SAVED WORKS";
  grid.setAttribute("aria-busy", "false");
}

function renderTags() {
  tagList.replaceChildren();
  tags.forEach((tag) => {
    const row = document.createElement("div");
    row.className = "archive-tag-row";
    const name = document.createElement("button");
    const active = activeTagIds.has(tag.id);
    name.className = "archive-tag-filter";
    name.type = "button";
    name.textContent = tag.name;
    name.classList.toggle("is-active", active);
    name.setAttribute("aria-pressed", String(active));
    name.addEventListener("click", () => {
      if (activeTagIds.has(tag.id)) activeTagIds.delete(tag.id); else activeTagIds.add(tag.id);
      renderTags(); renderWorks();
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
        tags = tags.filter((entry) => entry.id !== tag.id);
        activeTagIds.delete(tag.id);
        tagIdsByWork.forEach((ids) => ids.delete(tag.id));
        renderTags(); renderWorks();
      } catch { remove.disabled = false; setTagMessage("TAG COULD NOT BE DELETED"); }
    });
    row.append(name, remove);
    tagList.append(row);
  });
  tagClearButton.hidden = activeTagIds.size === 0;
}

function renderProjects() {
  const project = selectedProject();
  projectContext.hidden = !project;
  allWorksLabel.hidden = Boolean(project);
  if (project) {
    projectTitle.textContent = project.title;
    projectEditLink.href = `archive-project.html?id=${encodeURIComponent(project.id)}`;
  }
  projectList.replaceChildren();
  projects.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "archive-project";
    button.type = "button";
    button.textContent = entry.title;
    button.classList.toggle("is-active", entry.id === selectedProjectId);
    button.setAttribute("aria-pressed", String(entry.id === selectedProjectId));
    button.addEventListener("click", () => void selectProject(entry.id));
    projectList.append(button);
  });
}

async function loadTagData() {
  const [loadedTags, memberships] = await Promise.all([repository.listTags(), repository.listTagMemberships()]);
  tags = [...loadedTags];
  const validIds = new Set(tags.map((tag) => tag.id));
  activeTagIds = new Set([...activeTagIds].filter((id) => validIds.has(id)));
  tagIdsByWork = new Map();
  memberships.forEach(({ workId, tagId }) => {
    if (!tagIdsByWork.has(workId)) tagIdsByWork.set(workId, new Set());
    tagIdsByWork.get(workId).add(tagId);
  });
}

async function loadProjectData() {
  const [loadedProjects, loadedItems] = await Promise.all([repository.listProjects(), repository.listProjectItems()]);
  projects = [...loadedProjects];
  projectItems = [...loadedItems];
  selectedProjectId = resolveArchiveProjectId(window.location.search, projects);
  rebuildProjectIndexes();
}

async function loadArchive() {
  grid.setAttribute("aria-busy", "true");
  try {
    const [loadedWorks] = await Promise.all([repository.listArchivedWorks(), loadTagData(), loadProjectData()]);
    works = loadedWorks;
    searchInput.disabled = false;
    tagInput.disabled = false;
    tagCreateButton.disabled = false;
    renderTags(); renderProjects(); renderWorks();
  } catch {
    setResultCount(0);
    emptyMessage.textContent = "ARCHIVE IS CURRENTLY UNAVAILABLE";
    emptyMessage.hidden = false;
    grid.setAttribute("aria-busy", "false");
  }
}

function selectProject(projectId, { history = "push" } = {}) {
  const nextProjectId = projectId === null
    ? null
    : projects.some((project) => project.id === projectId) ? projectId : null;
  selectedProjectId = nextProjectId;
  if (history === "push") updateProjectLocation(nextProjectId, "push");
  if (history === "replace") updateProjectLocation(nextProjectId, "replace");
  renderProjects();
  renderWorks();
}

function initialiseView() {
  let view = "grid";
  try { view = localStorage.getItem(viewStorageKey) || view; } catch {}
  const mobileViewQuery = window.matchMedia("(max-width: 700px)");
  const isMobile = () => mobileViewQuery.matches;
  const setView = (selected) => {
    if (!viewButtons.some((button) => button.dataset.archiveView === selected)) return;
    if (openArchivePopover) closeArchivePopover(openArchivePopover.menu, openArchivePopover.toggle);
    closeWorkManagementMenu();
    page.dataset.view = selected;
    page.classList.toggle("archive-mobile-grid", isMobile() && selected === "grid");
    viewButtons.forEach((button) => {
      const active = button.dataset.archiveView === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    try { localStorage.setItem(viewStorageKey, selected); } catch {}
  };
  if (isMobile() && view === "supergrid") view = "grid";
  setView(view);
  viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.archiveView)));
  mobileViewQuery.addEventListener("change", () => {
    if (isMobile() && page.dataset.view === "supergrid") setView("grid");
    else page.classList.toggle("archive-mobile-grid", isMobile() && page.dataset.view === "grid");
  });
}

function initialiseTags() {
  tagClearButton.addEventListener("click", () => { activeTagIds.clear(); renderTags(); renderWorks(); });
  tagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = tagInput.value.trim();
    if (!name) return setTagMessage("ENTER A TAG NAME");
    tagCreateButton.disabled = true;
    try {
      await repository.createTag(name);
      tagInput.value = "";
      await loadTagData();
      renderTags(); renderWorks();
    } catch { setTagMessage("TAG COULD NOT BE CREATED"); }
    finally { tagCreateButton.disabled = false; }
  });
}

async function initialiseArchive() {
  initialiseView();
  const resolved = await getArchiveRepository();
  if (resolved.runtime.mode === FRONTEND_MODES.PROTOTYPE || !resolved.repository) {
    setResultCount(0); emptyMessage.textContent = "NO SAVED WORKS"; emptyMessage.hidden = false; return;
  }
  repository = resolved.repository;
  searchInput.addEventListener("input", renderWorks);
  projectCloseButton.addEventListener("click", () => void selectProject(null));
  window.addEventListener("popstate", () => {
    void selectProject(resolveArchiveProjectId(window.location.search, projects), { history: "none" });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (openArchivePopover) {
      event.preventDefault();
      const { menu, toggle } = openArchivePopover;
      closeArchivePopover(menu, toggle);
      toggle.focus();
      return;
    }
    if (openWorkManagementMenu) { event.preventDefault(); closeWorkManagementMenu(true); return; }
    if (openProjectMenu) { event.preventDefault(); closeProjectMenu(true); }
  });
  document.addEventListener("click", (event) => {
    if (openArchivePopover && !openArchivePopover.menu.contains(event.target) && !openArchivePopover.toggle.contains(event.target)) {
      closeArchivePopover(openArchivePopover.menu, openArchivePopover.toggle);
    }
    if (openWorkManagementMenu && !openWorkManagementMenu.menu.contains(event.target) && !openWorkManagementMenu.toggle.contains(event.target)) {
      closeWorkManagementMenu();
    }
    if (openProjectMenu && !openProjectMenu.container.contains(event.target)) closeProjectMenu();
  });
  initialiseTags();
  await loadArchive();
}

if (document.body.dataset.authMode) void initialiseArchive();
else window.addEventListener("chained:auth-ready", () => void initialiseArchive(), { once: true });
