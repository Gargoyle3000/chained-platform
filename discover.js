const page = document.body;
const stream = document.querySelector(".discover-stream");
const viewButtons = document.querySelectorAll(".view-button");
const filterRoot = document.querySelector(".discover-filter");
const filterTrigger = document.querySelector(".discover-filter-trigger");
const filterMenu = document.querySelector(".discover-filter-menu");
const filterOptions = document.querySelector(".discover-filter-options");
const filterCloseButton = document.querySelector(".discover-filter-close");
const filterClearButton = document.querySelector(".discover-filter-clear");
const viewStorageKey = "chained-discover-view";
const scrollStorageKey = "chained-discover-scroll";

function readStoredView() {
  try {
    const stored = localStorage.getItem(viewStorageKey);
    return stored === "grid" ? "grid" : "single";
  } catch {
    return "single";
  }
}

function setView(view) {
  const selected = view === "grid" ? "grid" : "single";
  page.dataset.view = selected;

  viewButtons.forEach((button) => {
    const isActive = button.dataset.view === selected;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  try {
    localStorage.setItem(viewStorageKey, selected);
  } catch {
    // The selected view still applies for the current page session.
  }
}

function rememberScrollPosition() {
  try {
    sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
  } catch {
    // Navigation remains functional when session storage is unavailable.
  }
}

function restoreScrollPosition() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("restore") !== "1") return;

  let savedScrollPosition = 0;
  try {
    savedScrollPosition = Number(sessionStorage.getItem(scrollStorageKey)) || 0;
  } catch {
    savedScrollPosition = 0;
  }

  history.scrollRestoration = "manual";
  window.addEventListener("load", () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollPosition, left: 0, behavior: "instant" });
        try {
          sessionStorage.removeItem(scrollStorageKey);
        } catch {
          // The restored position does not depend on removing the preference.
        }
        history.replaceState({}, "", window.location.pathname);
      });
    });
  });
}

function formatType(value) {
  return String(value || "").replaceAll("-", " ").toUpperCase();
}

function formatDimensions(work) {
  if (!Number.isFinite(work.height) || !Number.isFinite(work.width)) return "";
  const values = [work.height, work.width];
  if (Number.isFinite(work.depth)) values.push(work.depth);
  return `${values.join(" × ")}${work.dimensionUnit ? ` ${work.dimensionUnit.toUpperCase()}` : ""}`;
}

function createState(message, isError = false) {
  const state = document.createElement("p");
  state.className = "discover-state";
  state.classList.toggle("is-error", isError);
  state.setAttribute("role", "status");
  state.textContent = message;
  return state;
}

function replaceBrokenImage(link) {
  const state = document.createElement("span");
  state.className = "discover-image-state";
  state.textContent = "IMAGE NOT AVAILABLE";
  link.replaceChildren(state);
}

function updateArchiveAction(button, work, isSaved) {
  button.classList.toggle("is-saved", isSaved);
  button.setAttribute("aria-pressed", String(isSaved));
  button.setAttribute(
    "aria-label",
    `${isSaved ? "Remove" : "Save"} ${work.title} ${isSaved ? "from" : "to"} Archive`
  );
}

function createArchiveAction(work, archiveState, announce) {
  const button = document.createElement("button");
  button.className = "text-action discover-archive-action";
  button.type = "button";
  button.textContent = "+";
  updateArchiveAction(button, work, archiveState.isSaved(work.id));

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
      const isSaved = await archiveState.toggle(work.id);
      updateArchiveAction(button, work, isSaved);
    } catch {
      announce("ARCHIVE IS CURRENTLY UNAVAILABLE");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });

  return button;
}

function createDiscoverWork(work, archiveState = null, announceArchiveStatus = () => {}) {
  const article = document.createElement("article");
  const metadata = document.createElement("div");
  const artist = document.createElement("a");
  const heading = document.createElement("h2");
  const imageLink = document.createElement("a");
  const image = document.createElement("img");

  article.className = "discover-work";
  article.dataset.workId = work.id;
  article.dataset.artistSlug = work.artistSlug;
  if (work.image.width && work.image.height) {
    article.dataset.orientation = work.image.width >= work.image.height
      ? "landscape"
      : "portrait";
  }

  metadata.className = "discover-meta";
  artist.className = "artist-link";
  artist.href = work.profileHref;
  artist.textContent = work.artistName;
  heading.textContent = work.title;
  metadata.append(artist, heading);

  if (work.yearLabel) {
    const year = document.createElement("span");
    year.className = "year-link";
    year.textContent = work.yearLabel;
    metadata.append(year);
  }

  const details = document.createElement("div");
  details.className = "discover-details";
  const classification = formatType(work.format || work.workType);
  const materials = [
    work.primaryMedium,
    work.supportBase,
    ...work.additionalMaterials
  ].filter(Boolean).join(", ");
  const dimensions = formatDimensions(work);

  [classification || materials, dimensions].filter(Boolean).forEach((value) => {
    const line = document.createElement("p");
    line.textContent = value;
    details.append(line);
  });
  if (details.childElementCount) metadata.append(details);
  if (archiveState) metadata.append(createArchiveAction(work, archiveState, announceArchiveStatus));

  imageLink.className = "discover-image-link";
  imageLink.href = work.artworkHref;
  imageLink.setAttribute("aria-label", `View ${work.title} by ${work.artistName}`);
  image.src = work.image.src;
  image.alt = `${work.title} by ${work.artistName}`;
  image.addEventListener("error", () => replaceBrokenImage(imageLink), { once: true });
  imageLink.append(image);

  article.append(metadata, imageLink);
  return article;
}

async function loadDiscoverArchiveState() {
  try {
    const [
      { FRONTEND_MODES },
      { getArchiveRepository },
      { readApplicationSession },
      { createDiscoverArchiveState }
    ] = await Promise.all([
      import("./auth/config.mjs"),
      import("./data/archive-repository.mjs"),
      import("./auth/session.mjs"),
      import("./data/discover-archive-state.mjs")
    ]);
    const { runtime, repository } = await getArchiveRepository();
    if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) return null;

    const applicationSession = await readApplicationSession(runtime.client);
    if (applicationSession.kind !== "active") return null;

    return createDiscoverArchiveState(
      repository,
      await repository.listArchivedWorkIds()
    );
  } catch {
    return null;
  }
}

function createLoadMoreButton(onLoadMore) {
  const region = document.createElement("div");
  const button = document.createElement("button");
  region.className = "discover-load-more";
  button.className = "text-action";
  button.type = "button";
  button.textContent = "[ LOAD MORE ]";
  button.setAttribute("aria-label", "Load more published Works");
  button.addEventListener("click", onLoadMore);
  region.append(button);
  return region;
}

function setupDiscoverFilter(formatDisciplines, filterState, onSelectionChange) {
  if (!filterRoot || !filterTrigger || !filterMenu || !filterOptions || !filterCloseButton || !filterClearButton) {
    return;
  }

  filterRoot.hidden = false;

  function setOpen(isOpen, returnFocus = false) {
    filterMenu.hidden = !isOpen;
    filterTrigger.setAttribute("aria-expanded", String(isOpen));
    if (!isOpen && returnFocus) filterTrigger.focus();
  }

  function render() {
    const selected = new Set(filterState.selected());
    const hasSelection = selected.size > 0;
    filterTrigger.classList.toggle("is-active", hasSelection);
    filterClearButton.hidden = !hasSelection;
    filterOptions.replaceChildren(
      ...formatDisciplines.map(({ value, label }) => {
        const option = document.createElement("button");
        const isSelected = selected.has(value);
        option.className = "discover-filter-option";
        option.type = "button";
        option.dataset.formatDiscipline = value;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(isSelected));
        option.classList.toggle("is-selected", isSelected);
        option.textContent = label;
        option.addEventListener("click", () => {
          filterState.toggle(value);
          render();
          onSelectionChange(filterState.selected());
        });
        return option;
      })
    );
  }

  filterTrigger.addEventListener("click", () => {
    const isOpen = filterTrigger.getAttribute("aria-expanded") === "true";
    setOpen(!isOpen);
  });
  filterCloseButton.addEventListener("click", () => setOpen(false, true));
  filterClearButton.addEventListener("click", () => {
    filterState.clear();
    render();
    onSelectionChange([]);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !filterMenu.hidden) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener("click", (event) => {
    if (!filterMenu.hidden && !filterRoot.contains(event.target)) setOpen(false);
  });

  render();
}

async function initialiseLocalDiscover() {
  const { FRONTEND_MODES } = await import("./auth/config.mjs");
  const { getFrontendConfig } = await import("./auth/supabase-client.mjs");
  const config = await getFrontendConfig();
  if (config.mode === FRONTEND_MODES.PROTOTYPE) return;

  stream.setAttribute("aria-live", "polite");
  stream.setAttribute("aria-busy", "true");
  stream.replaceChildren(createState("LOADING PUBLISHED WORKS"));

  const [
    { getDiscoverRepository, DISCOVER_INITIAL_BATCH },
    { createDiscoverBatchState },
    { createDiscoverFilterState, createDiscoverRequestGate },
    { FORMAT_DISCIPLINES }
  ] = await Promise.all([
    import("./data/discover-repository.mjs"),
    import("./data/discover-ordering.mjs"),
    import("./data/discover-filter-state.mjs"),
    import("./data/work-format-disciplines.mjs")
  ]);
  const { runtime, repository } = await getDiscoverRepository();

  if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) return;

  const filterState = createDiscoverFilterState();
  const archiveStatePromise = loadDiscoverArchiveState();
  let archiveState = null;
  let archiveStatus = null;
  let loadMoreRegion = null;
  const requestGate = createDiscoverRequestGate();

  function announceArchiveStatus(message) {
    if (archiveStatus) archiveStatus.textContent = message;
  }

  function removeLoadMore() {
    loadMoreRegion?.remove();
    loadMoreRegion = null;
  }

  async function renderWorks(formatDisciplines = []) {
    const version = requestGate.next();
    const hasFilter = formatDisciplines.length > 0;
    removeLoadMore();
    stream.setAttribute("aria-busy", "true");
    stream.replaceChildren(createState("LOADING PUBLISHED WORKS"));

    try {
      const works = await (hasFilter
        ? repository.listWorks({ formatDisciplines })
        : repository.listWorks());
      if (!requestGate.isCurrent(version)) return;

      archiveState ||= await archiveStatePromise;
      if (!requestGate.isCurrent(version)) return;
      if (archiveState && !archiveStatus) {
        archiveStatus = document.createElement("p");
        archiveStatus.className = "sr-only";
        archiveStatus.setAttribute("aria-live", "polite");
        stream.before(archiveStatus);
      }

      stream.setAttribute("aria-busy", "false");
      if (!works.length) {
        stream.replaceChildren(createState(
          hasFilter ? "NO PUBLISHED WORKS MATCH FILTER" : "NO PUBLISHED WORKS"
        ));
        return;
      }

      const batches = createDiscoverBatchState(works, DISCOVER_INITIAL_BATCH);
      const appendBatch = () => {
        const batch = batches.next();
        stream.append(...batch.appended.map((work) => (
          createDiscoverWork(work, archiveState, announceArchiveStatus)
        )));
        if (!batch.hasMore) removeLoadMore();
      };

      stream.replaceChildren();
      loadMoreRegion = createLoadMoreButton(appendBatch);
      stream.after(loadMoreRegion);
      appendBatch();
    } catch {
      if (!requestGate.isCurrent(version)) return;
      stream.setAttribute("aria-busy", "false");
      stream.replaceChildren(createState("PUBLISHED WORKS CURRENTLY UNAVAILABLE", true));
    }
  }

  setupDiscoverFilter(
    FORMAT_DISCIPLINES,
    filterState,
    (formatDisciplines) => renderWorks(formatDisciplines)
  );
  await renderWorks();
}

setView(readStoredView());
viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".discover-image-link")) rememberScrollPosition();
});

restoreScrollPosition();
initialiseLocalDiscover().catch(() => {
  stream.setAttribute("aria-live", "polite");
  stream.setAttribute("aria-busy", "false");
  stream.replaceChildren(createState("PUBLISHED WORKS CURRENTLY UNAVAILABLE", true));
});
