(() => {
  const storageKey = "chained-followed-artist-ids";


  function getFollowedArtists() {
    const storedValue = localStorage.getItem(storageKey);

    if (!storedValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(storedValue);

      return Array.isArray(parsedValue)
        ? parsedValue
        : [];
    } catch {
      return [];
    }
  }


  function writeFollowedArtists(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)];

    localStorage.setItem(
      storageKey,
      JSON.stringify(uniqueArtistIds)
    );

    window.dispatchEvent(
      new CustomEvent("chained:following-changed", {
        detail: {
          artistIds: uniqueArtistIds
        }
      })
    );

    return uniqueArtistIds;
  }


  function isFollowing(artistId) {
    return getFollowedArtists().includes(artistId);
  }


  function followArtist(artistId) {
    if (!artistId || isFollowing(artistId)) {
      return;
    }

    writeFollowedArtists([
      ...getFollowedArtists(),
      artistId
    ]);
  }


  function unfollowArtist(artistId) {
    writeFollowedArtists(
      getFollowedArtists().filter(
        (id) => id !== artistId
      )
    );
  }


  function toggleArtist(artistId) {
    if (isFollowing(artistId)) {
      unfollowArtist(artistId);
    } else {
      followArtist(artistId);
    }
  }


  function updateFollowButtons(root = document) {
    const buttons = root.querySelectorAll(
      "[data-follow-artist][data-artist-id]"
    );

    buttons.forEach((button) => {
      const following = isFollowing(
        button.dataset.artistId
      );

      button.classList.toggle(
        "is-success",
        following
      );

      button.setAttribute(
        "aria-pressed",
        String(following)
      );

      button.textContent = following
        ? "[ FOLLOWING ]"
        : "[ FOLLOW ]";
    });
  }


  document.addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-follow-artist][data-artist-id]"
    );

    if (!button) {
      return;
    }

    toggleArtist(button.dataset.artistId);
  });


  window.addEventListener(
    "chained:following-changed",
    () => {
      updateFollowButtons();
    }
  );


  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      updateFollowButtons();
    }
  });


  window.ChainedFollowing = {
    getAll: getFollowedArtists,
    isFollowing,
    follow: followArtist,
    unfollow: unfollowArtist,
    toggle: toggleArtist,
    updateButtons: updateFollowButtons
  };


  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => updateFollowButtons()
    );
  } else {
    updateFollowButtons();
  }
})();