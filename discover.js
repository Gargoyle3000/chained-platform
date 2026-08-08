const page = document.body;
const stream = document.querySelector(".discover-stream");
const viewButtons = document.querySelectorAll(".view-button");
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

function createDiscoverWork(work) {
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

async function initialiseLocalDiscover() {
  const { FRONTEND_MODES } = await import("./auth/config.mjs");
  const { getFrontendConfig } = await import("./auth/supabase-client.mjs");
  const config = await getFrontendConfig();
  if (config.mode === FRONTEND_MODES.PROTOTYPE) return;

  stream.setAttribute("aria-live", "polite");
  stream.setAttribute("aria-busy", "true");
  stream.replaceChildren(createState("LOADING PUBLISHED WORKS"));

  const { getDiscoverRepository, DISCOVER_INITIAL_BATCH } = await import(
    "./data/discover-repository.mjs"
  );
  const { createDiscoverBatchState } = await import("./data/discover-ordering.mjs");
  const { runtime, repository } = await getDiscoverRepository();

  if (runtime.mode !== FRONTEND_MODES.SUPABASE || !repository) return;

  try {
    const works = await repository.listWorks();
    stream.setAttribute("aria-busy", "false");
    if (!works.length) {
      stream.replaceChildren(createState("NO PUBLISHED WORKS"));
      return;
    }

    const batches = createDiscoverBatchState(works, DISCOVER_INITIAL_BATCH);
    let loadMoreRegion;

    const appendBatch = () => {
      const batch = batches.next();
      stream.append(...batch.appended.map(createDiscoverWork));
      if (!batch.hasMore) loadMoreRegion?.remove();
    };

    stream.replaceChildren();
    loadMoreRegion = createLoadMoreButton(appendBatch);
    stream.after(loadMoreRegion);
    appendBatch();
  } catch {
    stream.setAttribute("aria-busy", "false");
    stream.replaceChildren(createState("PUBLISHED WORKS CURRENTLY UNAVAILABLE", true));
  }
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
