document.addEventListener("DOMContentLoaded", () => {
  const page = document.body;
  const viewButtons = [...document.querySelectorAll(".view-button")];
  const stream = document.querySelector(".discover-stream");
  const emptyRegion = document.querySelector(".following-empty");
  const viewStorageKey = "chained-following-view";
  let localInitialised = false;

  function readStoredView() {
    try {
      return localStorage.getItem(viewStorageKey) === "grid" ? "grid" : "single";
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
      // The selected view remains active for the current page session.
    }
  }

  function createState(message, isError = false) {
    const state = document.createElement("p");
    state.className = "following-state";
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

  function createFollowingWork(work) {
    const article = document.createElement("article");
    const metadata = document.createElement("div");
    const artist = document.createElement("a");
    const heading = document.createElement("h2");
    const title = document.createElement("a");
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
    title.href = work.artworkHref;
    title.textContent = work.title;
    heading.append(title);
    metadata.append(artist, heading);

    if (work.yearLabel) {
      const year = document.createElement("span");
      year.className = "year-link";
      year.textContent = work.yearLabel;
      metadata.append(year);
    }

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

  function showEmpty(message) {
    stream.hidden = true;
    emptyRegion.hidden = false;
    emptyRegion.setAttribute("aria-live", "polite");
    emptyRegion.replaceChildren(createState(message));
  }

  function showError(retry) {
    const action = document.createElement("button");
    action.className = "text-action";
    action.type = "button";
    action.textContent = "[ RETRY ]";
    action.setAttribute("aria-label", "Retry loading Following");
    action.addEventListener("click", retry, { once: true });
    stream.hidden = true;
    emptyRegion.hidden = false;
    emptyRegion.setAttribute("aria-live", "polite");
    emptyRegion.replaceChildren(
      createState("FOLLOWING IS CURRENTLY UNAVAILABLE.", true),
      action
    );
  }

  async function initialiseLocalFollowing() {
    if (localInitialised) return;
    localInitialised = true;
    stream.hidden = false;
    emptyRegion.hidden = true;
    stream.setAttribute("aria-live", "polite");
    stream.setAttribute("aria-busy", "true");
    stream.replaceChildren(createState("LOADING FOLLOWING"));

    try {
      const { getFollowingRepository } = await import("./data/following-repository.mjs");
      const { appendFollowingPage } = await import("./data/following-mapping.mjs");
      const { runtime, repository } = await getFollowingRepository();
      if (runtime.mode !== "local-supabase" || !repository) return;

      const [hasFollows, firstPage] = await Promise.all([
        repository.hasAnyFollows(),
        repository.loadFollowingFeed()
      ]);
      stream.setAttribute("aria-busy", "false");

      if (!hasFollows) {
        showEmpty("YOU ARE NOT FOLLOWING ANY PROFILES.");
        return;
      }
      if (!firstPage.items.length) {
        showEmpty("NO PUBLISHED WORKS FROM FOLLOWED PROFILES.");
        return;
      }

      let visible = appendFollowingPage([], firstPage.items);
      let cursor = firstPage.nextCursor;
      let hasMore = firstPage.hasMore;
      const loadMoreRegion = document.createElement("div");
      const loadMore = document.createElement("button");
      loadMoreRegion.className = "discover-load-more";
      loadMore.className = "text-action";
      loadMore.type = "button";
      loadMore.textContent = "[ LOAD MORE ]";
      loadMore.setAttribute("aria-label", "Load more Works from followed profiles");
      loadMoreRegion.append(loadMore);

      stream.replaceChildren(...visible.map(createFollowingWork));
      emptyRegion.hidden = true;
      stream.hidden = false;
      stream.after(loadMoreRegion);
      loadMoreRegion.hidden = !hasMore;

      loadMore.addEventListener("click", async () => {
        if (loadMore.disabled || !hasMore || !cursor) return;
        loadMore.disabled = true;
        loadMore.setAttribute("aria-busy", "true");
        stream.setAttribute("aria-busy", "true");
        try {
          const pageResult = await repository.loadFollowingFeed(cursor);
          const nextVisible = appendFollowingPage(visible, pageResult.items);
          stream.append(...nextVisible.slice(visible.length).map(createFollowingWork));
          visible = nextVisible;
          cursor = pageResult.nextCursor;
          hasMore = pageResult.hasMore;
          loadMoreRegion.hidden = !hasMore;
        } catch {
          loadMore.textContent = "[ TRY AGAIN ]";
        } finally {
          loadMore.disabled = false;
          loadMore.removeAttribute("aria-busy");
          stream.setAttribute("aria-busy", "false");
        }
      });
    } catch {
      stream.setAttribute("aria-busy", "false");
      localInitialised = false;
      showError(initialiseLocalFollowing);
    }
  }

  function initialisePrototypeFollowing() {
    const followingApi = window.ChainedFollowing;
    if (!followingApi) return;
    const works = [...document.querySelectorAll(".discover-work[data-artist-id]")];

    function updateFollowing() {
      const followedArtists = new Set(followingApi.getAll());
      let visibleCount = 0;
      works.forEach((work) => {
        const isVisible = followedArtists.has(work.dataset.artistId);
        work.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
      });
      stream.hidden = visibleCount === 0;
      emptyRegion.hidden = visibleCount > 0;
    }

    window.addEventListener("chained:following-changed", updateFollowing);
    window.addEventListener("storage", (event) => {
      if (event.key === "chained-followed-artist-ids") updateFollowing();
    });
    updateFollowing();
  }

  function authReady(mode) {
    if (mode === "local-supabase") initialiseLocalFollowing();
    if (mode === "prototype") initialisePrototypeFollowing();
  }

  setView(readStoredView());
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  if (page.dataset.authMode) {
    authReady(page.dataset.authMode);
  } else {
    window.addEventListener("chained:auth-ready", (event) => {
      authReady(event.detail?.mode);
    }, { once: true });
  }
});
