import { FRONTEND_MODES } from "./auth/config.mjs";
import { getArchiveRepository } from "./data/archive-repository.mjs";

const page = document.querySelector(".archive-page");
const grid = document.querySelector(".saved-grid");
const searchInput = document.querySelector(".archive-search input");
const resultCount = document.querySelector(".archive-result-count");
const emptyMessage = document.querySelector(".archive-empty");
const viewButtons = [...document.querySelectorAll("[data-archive-view]")];
const viewStorageKey = "chained-archive-view";

let repository = null;
let works = [];

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

function workSearchText(work) {
  return [work.title, work.yearLabel, work.artistName, work.workType]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
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
  const actions = document.createElement("div");
  actions.className = "saved-work-actions";
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

  actions.append(remove);
  metadata.append(profileLink, title, year, actions);
  article.append(artworkLink, metadata);
  return article;
}

function renderWorks() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase();
  const visibleWorks = works.filter((work) => !searchTerm || workSearchText(work).includes(searchTerm));
  grid.replaceChildren(...visibleWorks.map(createSavedWork));
  setResultCount(visibleWorks.length);
  emptyMessage.hidden = visibleWorks.length !== 0;
  if (!visibleWorks.length) {
    emptyMessage.textContent = searchTerm
      ? "NO SAVED WORKS MATCH YOUR SEARCH"
      : "NO SAVED WORKS";
  }
  grid.setAttribute("aria-busy", "false");
}

async function loadArchive() {
  grid.setAttribute("aria-busy", "true");
  emptyMessage.hidden = true;
  try {
    works = await repository.listArchivedWorks();
    searchInput.disabled = false;
    renderWorks();
  } catch {
    searchInput.disabled = true;
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
