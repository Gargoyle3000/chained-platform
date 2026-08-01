document.addEventListener("DOMContentLoaded", () => {
  const page = document.body;

  const viewButtons = [
    ...document.querySelectorAll(".view-button")
  ];

  const works = [
    ...document.querySelectorAll(
      ".discover-work[data-artist-id]"
    )
  ];

  const stream =
    document.querySelector(".discover-stream");

  const emptyMessage =
    document.querySelector(".following-empty");

  const followingApi =
    window.ChainedFollowing;

  const viewStorageKey =
    "chained-following-view";


  if (!followingApi) {
    console.error(
      "followed-artists.js was not loaded."
    );

    return;
  }


  function setView(view) {
    page.dataset.view = view;

    viewButtons.forEach((button) => {
      const isActive =
        button.dataset.view === view;

      button.classList.toggle(
        "is-active",
        isActive
      );

      button.setAttribute(
        "aria-pressed",
        String(isActive)
      );
    });

    localStorage.setItem(
      viewStorageKey,
      view
    );
  }


  function updateFollowing() {
    const followedArtists = new Set(
      followingApi.getAll()
    );

    let visibleCount = 0;

    works.forEach((work) => {
      const artistId =
        work.dataset.artistId;

      const isVisible =
        followedArtists.has(artistId);

      work.hidden = !isVisible;

      if (isVisible) {
        visibleCount += 1;
      }
    });

    stream.hidden =
      visibleCount === 0;

    emptyMessage.hidden =
      visibleCount > 0;
  }


  const storedView =
    localStorage.getItem(viewStorageKey) ||
    "single";

  setView(storedView);


  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });


  window.addEventListener(
    "chained:following-changed",
    updateFollowing
  );


  window.addEventListener(
    "storage",
    (event) => {
      if (
        event.key ===
        "chained-followed-artist-ids"
      ) {
        updateFollowing();
      }
    }
  );


  updateFollowing();
});