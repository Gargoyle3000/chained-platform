document.addEventListener("DOMContentLoaded", () => {
  const events = [
    ...document.querySelectorAll(".agenda-event")
  ];

  const months = [
    ...document.querySelectorAll(".agenda-month")
  ];

  const scopeButtons = [
    ...document.querySelectorAll(".agenda-scope")
  ];

  const filterButtons = [
    ...document.querySelectorAll(".agenda-filter")
  ];

  const clearButton =
    document.querySelector(".agenda-clear");

  const searchInput =
    document.querySelector(".agenda-search input");

  const currentView =
    document.querySelector(".agenda-current-view");

  const resultCount =
    document.querySelector(".agenda-result-count");

  const emptyMessage =
    document.querySelector(".agenda-empty");


  let activeScope = "all";

  const activeCities = new Set();
  const activeTypes = new Set();


  function updateAgenda() {
    const followedArtists = new Set(
      window.ChainedFollowing.getAll()
    );

    const searchTerm =
      searchInput.value.trim().toLowerCase();

    let visibleCount = 0;


    events.forEach((event) => {
      const artistId =
        event.dataset.artistId || "";

      const city =
        event.dataset.city || "";

      const eventType =
        event.dataset.eventType || "";

      const searchableText =
        event.textContent.toLowerCase();


      const matchesScope =
        activeScope === "all" ||
        followedArtists.has(artistId);


      const matchesCity =
        activeCities.size === 0 ||
        activeCities.has(city);


      const matchesType =
        activeTypes.size === 0 ||
        activeTypes.has(eventType);


      const matchesSearch =
        searchTerm === "" ||
        searchableText.includes(searchTerm);


      const visible =
        matchesScope &&
        matchesCity &&
        matchesType &&
        matchesSearch;


      event.hidden = !visible;

      if (visible) {
        visibleCount += 1;
      }
    });


    months.forEach((month) => {
      const hasVisibleEvent = [
        ...month.querySelectorAll(".agenda-event")
      ].some((event) => !event.hidden);

      month.hidden = !hasVisibleEvent;
    });


    resultCount.textContent =
      `${visibleCount} ${
        visibleCount === 1
          ? "EVENT"
          : "EVENTS"
      }`;


    emptyMessage.hidden =
      visibleCount !== 0;
  }


  scopeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeScope =
        button.dataset.agendaScope;

      scopeButtons.forEach((scopeButton) => {
        scopeButton.classList.toggle(
          "is-active",
          scopeButton === button
        );
      });

      currentView.textContent =
        activeScope === "following"
          ? "FOLLOWED ARTISTS"
          : "ALL EVENTS";

      updateAgenda();
    });
  });


  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filterType =
        button.dataset.filterType;

      const filterValue =
        button.dataset.filterValue;

      const targetSet =
        filterType === "city"
          ? activeCities
          : activeTypes;


      if (targetSet.has(filterValue)) {
        targetSet.delete(filterValue);
        button.classList.remove("is-active");
      } else {
        targetSet.add(filterValue);
        button.classList.add("is-active");
      }

      updateAgenda();
    });
  });


  searchInput.addEventListener(
    "input",
    updateAgenda
  );


  clearButton.addEventListener("click", () => {
    activeScope = "all";

    activeCities.clear();
    activeTypes.clear();

    searchInput.value = "";

    scopeButtons.forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.agendaScope === "all"
      );
    });

    filterButtons.forEach((button) => {
      button.classList.remove("is-active");
    });

    currentView.textContent = "ALL EVENTS";

    updateAgenda();
  });


  window.addEventListener(
    "chained:following-changed",
    updateAgenda
  );


  window.addEventListener(
    "storage",
    (event) => {
      if (
        event.key ===
        "chained-followed-artist-ids"
      ) {
        updateAgenda();
      }
    }
  );


  updateAgenda();
});