import { rememberWorkFeedOrigin } from "./data/work-feed-return.mjs";

const page = document.body;
const stream = document.querySelector(".discover-stream");
const viewButtons = document.querySelectorAll(".view-button");
const filterRoot = document.querySelector(".discover-filter");
const filterTrigger = document.querySelector(".discover-filter-trigger");
const filterMenu = document.querySelector(".discover-filter-menu");
const filterOptions = document.querySelector(".discover-filter-options");
const filterCloseButton = document.querySelector(".discover-filter-close");
const filterClearButton = document.querySelector(".discover-filter-clear");
const channelButtons = [...document.querySelectorAll("[data-discover-channel]")];
const viewStorageKey = "chained-discover-view";
const scrollStorageKey = "chained-discover-scroll";
const containedImageHitAreas = new Map();

function updateContainedImageHitAreas() {
  containedImageHitAreas.forEach((source, imageLink) => {
    if (!imageLink.isConnected) {
      containedImageHitAreas.delete(imageLink);
      return;
    }

    const width = imageLink.clientWidth;
    const height = imageLink.clientHeight;
    if (!width || !height || !source.width || !source.height) return;

    const frameRatio = width / height;
    const imageRatio = source.width / source.height;
    const imageWidth = frameRatio > imageRatio ? height * imageRatio : width;
    const imageHeight = frameRatio > imageRatio ? height : width / imageRatio;
    const horizontalInset = Math.max(0, (width - imageWidth) / 2);
    const verticalInset = Math.max(0, (height - imageHeight) / 2);

    imageLink.style.setProperty("--discover-image-hit-top", `${verticalInset}px`);
    imageLink.style.setProperty("--discover-image-hit-right", `${horizontalInset}px`);
    imageLink.style.setProperty("--discover-image-hit-bottom", `${verticalInset}px`);
    imageLink.style.setProperty("--discover-image-hit-left", `${horizontalInset}px`);
  });
}

function registerContainedImageHitArea(imageLink, image, source) {
  const dimensions = {
    width: Number(source?.width) || 0,
    height: Number(source?.height) || 0
  };

  imageLink.dataset.containedHitArea = "true";
  containedImageHitAreas.set(imageLink, dimensions);
  image.addEventListener("load", () => {
    if (!dimensions.width) dimensions.width = image.naturalWidth;
    if (!dimensions.height) dimensions.height = image.naturalHeight;
    updateContainedImageHitAreas();
  }, { once: true });
  requestAnimationFrame(updateContainedImageHitAreas);
}

if (typeof ResizeObserver === "function") {
  const containedImageHitAreaObserver = new ResizeObserver(updateContainedImageHitAreas);
  containedImageHitAreaObserver.observe(stream);
}

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

function rememberScrollPosition(workLink) {
  try {
    sessionStorage.setItem(scrollStorageKey, JSON.stringify({
      pathname: window.location.pathname,
      scrollY: window.scrollY
    }));
    const url = new URL(window.location.href);
    url.searchParams.set("restore", "discover");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    rememberWorkFeedOrigin({
      origin: "discover",
      feedLocation: url.href,
      workHref: workLink.href,
      storage: sessionStorage
    });
  } catch {
    // Navigation remains functional when session storage is unavailable.
  }
}

function restoreScrollPosition() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("restore") !== "discover") return () => {};

  let savedScrollPosition = 0;
  try {
    const saved = JSON.parse(sessionStorage.getItem(scrollStorageKey) || "null");
    if (saved?.pathname === window.location.pathname) {
      savedScrollPosition = Number(saved.scrollY) || 0;
    }
  } catch {
    savedScrollPosition = 0;
  }

  history.scrollRestoration = "manual";
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
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
  };
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

function createCuratedCollection(collection) {
  const article = document.createElement("article");
  article.className = "discover-curated-collection";
  const href = `curated.html?id=${encodeURIComponent(collection.id)}`;
  const preview = document.createElement("a");
  preview.className = "discover-curated-preview";
  preview.href = href;
  preview.setAttribute("aria-label", `Open CURATED collection ${collection.title}`);
  const firstWork = collection.works[0];
  if (firstWork) {
    const image = document.createElement("img");
    image.src = firstWork.image.src;
    image.alt = `${collection.title}: ${firstWork.title}`;
    if (firstWork.image.width) image.width = firstWork.image.width;
    if (firstWork.image.height) image.height = firstWork.image.height;
    preview.append(image);
  } else {
    const empty = document.createElement("span");
    empty.className = "discover-curated-preview-empty";
    empty.textContent = "NO PUBLIC WORKS CURRENTLY AVAILABLE";
    preview.append(empty);
  }
  const metadata = document.createElement("div");
  metadata.className = "discover-curated-meta";
  const label = document.createElement("p");
  label.textContent = "CURATED";
  const title = document.createElement("a");
  title.href = href;
  title.textContent = collection.title;
  const publisher = document.createElement("span");
  publisher.className = "discover-curated-publisher";
  publisher.textContent = collection.publisher.name;
  metadata.append(label, title, publisher);
  if (collection.description) {
    const description = document.createElement("p");
    description.textContent = collection.description;
    metadata.append(description);
  }
  article.append(preview, metadata);
  return article;
}

function replaceBrokenImage(link) {
  const state = document.createElement("span");
  state.className = "discover-image-state";
  state.textContent = "IMAGE NOT AVAILABLE";
  link.replaceChildren(state);
}

function createDiscoverWork(work, archiveState = null, createArchiveAction = null, announceArchiveStatus = () => {}) {
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
  if (archiveState && createArchiveAction) {
    metadata.append(createArchiveAction(work, archiveState, announceArchiveStatus, "discover-archive-action"));
  }

  imageLink.className = "discover-image-link";
  imageLink.href = work.artworkHref;
  imageLink.setAttribute("aria-label", `View ${work.title} by ${work.artistName}`);
  image.src = work.image.src;
  image.alt = `${work.title} by ${work.artistName}`;
  image.addEventListener("error", () => replaceBrokenImage(imageLink), { once: true });
  imageLink.append(image);
  registerContainedImageHitArea(imageLink, image, work.image);

  article.append(metadata, imageLink);
  return article;
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
  window.ChainedScrollIndicators?.attachScrollIndicator(filterOptions, {
    host: filterMenu
  });

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
    { createDiscoverChannelState },
    { FORMAT_DISCIPLINES },
    { createArchiveWorkAction, loadArchiveWorkState }
  ] = await Promise.all([
    import("./data/discover-repository.mjs"),
    import("./data/discover-ordering.mjs"),
    import("./data/discover-filter-state.mjs"),
    import("./data/discover-channel-state.mjs"),
    import("./data/work-format-disciplines.mjs"),
    import("./data/archive-work-action.mjs")
  ]);
  const { runtime, repository } = await getDiscoverRepository();

  if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) return;

  const filterState = createDiscoverFilterState();
  const channelState = createDiscoverChannelState();
  const archiveStatePromise = loadArchiveWorkState();
  let archiveState = null;
  let archiveStatus = null;
  let loadMoreRegion = null;
  const requestGate = createDiscoverRequestGate();
  let curatedRepositoryPromise = null;

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
          createDiscoverWork(work, archiveState, createArchiveWorkAction, announceArchiveStatus)
        )));
        if (!batch.hasMore) removeLoadMore();
      };

      stream.replaceChildren();
      loadMoreRegion = createLoadMoreButton(appendBatch);
      stream.after(loadMoreRegion);
      appendBatch();
      restoreFeedPosition();
    } catch {
      if (!requestGate.isCurrent(version)) return;
      stream.setAttribute("aria-busy", "false");
      stream.replaceChildren(createState("PUBLISHED WORKS CURRENTLY UNAVAILABLE", true));
    }
  }

  function setChannelControls(channel) {
    page.dataset.discoverChannel = channel;
    channelButtons.forEach((button) => {
      const active = button.dataset.discoverChannel === channel;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    filterRoot.hidden = channel !== "nosy";
  }

  async function renderCuratedCollections() {
    const version = requestGate.next();
    removeLoadMore();
    stream.setAttribute("aria-busy", "true");
    stream.replaceChildren(createState("LOADING CURATED COLLECTIONS"));
    try {
      curatedRepositoryPromise ||= import("./data/curated-repository.mjs")
        .then(({ getCuratedRepository }) => getCuratedRepository());
      const { repository: curatedRepository } = await curatedRepositoryPromise;
      const collections = curatedRepository ? await curatedRepository.listCollections() : [];
      if (!requestGate.isCurrent(version)) return;
      stream.setAttribute("aria-busy", "false");
      stream.replaceChildren(...(collections.length
        ? collections.map(createCuratedCollection)
        : [createState("NO PUBLISHED CURATED COLLECTIONS")]));
    } catch {
      if (!requestGate.isCurrent(version)) return;
      stream.setAttribute("aria-busy", "false");
      stream.replaceChildren(createState("CURATED IS CURRENTLY UNAVAILABLE", true));
    }
  }

  function renderChannel(channel) {
    setChannelControls(channel);
    if (channel === "curated") return renderCuratedCollections();
    return renderWorks(filterState.selected());
  }

  setupDiscoverFilter(
    FORMAT_DISCIPLINES,
    filterState,
    (formatDisciplines) => renderWorks(formatDisciplines)
  );
  channelButtons.forEach((button) => button.addEventListener("click", () => {
    const channel = channelState.select(button.dataset.discoverChannel);
    void renderChannel(channel);
  }));
  setChannelControls(channelState.current());
  await renderWorks();
}

setView(readStoredView());
viewButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.addEventListener("click", (event) => {
  const workLink = event.target.closest(".discover-image-link");
  if (
    workLink &&
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  ) {
    rememberScrollPosition(workLink);
  }
});

const restoreFeedPosition = restoreScrollPosition();
initialiseLocalDiscover().catch(() => {
  stream.setAttribute("aria-live", "polite");
  stream.setAttribute("aria-busy", "false");
  stream.replaceChildren(createState("PUBLISHED WORKS CURRENTLY UNAVAILABLE", true));
});
