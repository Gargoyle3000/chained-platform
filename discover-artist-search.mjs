import { FRONTEND_MODES } from "./auth/config.mjs";
import {
  getPublicArtistSearchRepository,
  normalizeArtistSearchQuery
} from "./data/public-artist-search-repository.mjs";

export const DISCOVER_ARTIST_SUGGESTION_LIMIT = 6;
export const DISCOVER_ARTIST_SEARCH_DEBOUNCE_MS = 220;

export function mountDiscoverArtistSearch({
  pageDocument = document,
  getRepository = getPublicArtistSearchRepository,
  schedule = setTimeout,
  cancel = clearTimeout,
  debounceMs = DISCOVER_ARTIST_SEARCH_DEBOUNCE_MS
} = {}) {
  const root = pageDocument.getElementById("discover-artist-search");
  const trigger = root?.querySelector(".discover-artist-search-trigger");
  const panel = pageDocument.getElementById("discover-artist-search-panel");
  const input = pageDocument.getElementById("discover-artist-search-query");
  const results = pageDocument.getElementById("discover-artist-search-results");
  if (!root || !trigger || !panel || !input || !results) return null;

  let timer = null;
  let requestVersion = 0;
  let links = [];

  function clearResults() {
    links = [];
    results.replaceChildren();
    results.hidden = true;
  }

  function close(returnFocus = false) {
    if (panel.hidden) return;
    requestVersion += 1;
    if (timer !== null) cancel(timer);
    timer = null;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    input.value = "";
    clearResults();
    if (returnFocus) trigger.focus();
  }

  function showState(message) {
    const item = pageDocument.createElement("li");
    item.className = "discover-artist-search-state";
    item.textContent = message;
    clearResults();
    results.replaceChildren(item);
    results.hidden = false;
  }

  function showSuggestions(profiles) {
    clearResults();
    if (!profiles.length) {
      showState("NO ARTISTS FOUND");
      return;
    }
    links = profiles.slice(0, DISCOVER_ARTIST_SUGGESTION_LIMIT).map((profile) => {
      const item = pageDocument.createElement("li");
      const link = pageDocument.createElement("a");
      const name = pageDocument.createElement("span");
      link.className = "discover-artist-search-result";
      link.href = profile.href;
      name.textContent = profile.displayName;
      link.append(name);
      item.append(link);
      results.append(item);
      return link;
    });
    results.hidden = false;
  }

  async function search(query, version) {
    try {
      const { runtime, repository } = await getRepository();
      if (version !== requestVersion || panel.hidden) return;
      if (runtime?.mode !== FRONTEND_MODES.SUPABASE || !repository) {
        showState("ARTIST SEARCH UNAVAILABLE");
        return;
      }
      const profiles = await repository.search(query);
      if (version === requestVersion && !panel.hidden) showSuggestions(profiles);
    } catch {
      if (version === requestVersion && !panel.hidden) showState("ARTIST SEARCH UNAVAILABLE");
    }
  }

  trigger.addEventListener("click", () => {
    if (!panel.hidden) {
      close();
      return;
    }
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    input.focus();
  });

  input.addEventListener("input", () => {
    requestVersion += 1;
    if (timer !== null) cancel(timer);
    timer = null;
    clearResults();
    const query = normalizeArtistSearchQuery(input.value);
    if (query.length < 2) return;
    const version = requestVersion;
    timer = schedule(() => {
      timer = null;
      void search(query, version);
    }, debounceMs);
  });

  pageDocument.addEventListener("keydown", (event) => {
    if (panel.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    const current = links.indexOf(event.target);
    if (event.target !== input && current === -1) return;
    if (event.key === "Enter" && current !== -1) {
      event.preventDefault();
      links[current].click();
      return;
    }
    if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || !links.length) return;
    event.preventDefault();
    const next = current === -1
      ? event.key === "ArrowDown" ? 0 : links.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    links.forEach((link, index) => link.classList.toggle("is-active", index === next));
    links[next].focus();
  });

  pageDocument.addEventListener("click", (event) => {
    if (!panel.hidden && !root.contains(event.target)) close();
  });

  return { close };
}

if (typeof document !== "undefined") mountDiscoverArtistSearch();
