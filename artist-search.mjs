import { FRONTEND_MODES } from "./auth/config.mjs";
import { getPublicArtistSearchRepository } from "./data/public-artist-search-repository.mjs";

export function mountArtistSearch({ pageDocument = document, getRepository = getPublicArtistSearchRepository } = {}) {
  const form = pageDocument.getElementById("artist-search-form");
  const input = pageDocument.getElementById("artist-search-query");
  const status = pageDocument.getElementById("artist-search-status");
  const results = pageDocument.getElementById("artist-search-results");
  if (!form || !input || !status || !results) return;

  let requestVersion = 0;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim().replace(/\s+/g, " ");
    const version = ++requestVersion;
    results.replaceChildren();
    if (query.length < 2) {
      status.textContent = "ENTER AT LEAST TWO CHARACTERS.";
      return;
    }

    status.textContent = "SEARCHING ARTISTS";
    form.setAttribute("aria-busy", "true");
    try {
      const { runtime, repository } = await getRepository();
      if (runtime?.mode !== FRONTEND_MODES.SUPABASE || !repository) {
        if (version === requestVersion) status.textContent = "ARTIST SEARCH IS UNAVAILABLE IN THIS MODE.";
        return;
      }
      const profiles = await repository.search(query);
      if (version !== requestVersion) return;
      if (!profiles.length) {
        status.textContent = "NO ARTIST PROFILES FOUND.";
        return;
      }
      status.textContent = `${profiles.length} ARTIST${profiles.length === 1 ? "" : "S"} FOUND.`;
      results.replaceChildren(...profiles.map((profile) => {
        const item = pageDocument.createElement("li");
        const link = pageDocument.createElement("a");
        const name = pageDocument.createElement("span");
        const slug = pageDocument.createElement("span");
        link.href = profile.href;
        link.className = "artist-search-result-link";
        name.className = "artist-search-result-name";
        name.textContent = profile.displayName;
        slug.className = "artist-search-result-slug";
        slug.textContent = profile.slug;
        link.append(name, slug);
        item.append(link);
        return item;
      }));
    } catch {
      if (version === requestVersion) status.textContent = "ARTIST SEARCH IS CURRENTLY UNAVAILABLE. TRY AGAIN.";
    } finally {
      if (version === requestVersion) form.removeAttribute("aria-busy");
    }
  });
}

if (typeof document !== "undefined") mountArtistSearch();
