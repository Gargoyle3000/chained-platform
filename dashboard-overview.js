document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getWorkRepository } =
    await import("./data/work-repository.mjs");
  const { getPresentationRepository } =
    await import("./data/presentation-repository.mjs");
  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const totalElement = document.querySelector("#dashboard-work-total");
  const breakdownElement = document.querySelector(
    "#dashboard-work-breakdown"
  );
  const presentationTotalElement = document.querySelector(
    "#dashboard-presentation-total"
  );
  const presentationBreakdownElement = document.querySelector(
    "#dashboard-presentation-breakdown"
  );
  const recentPresentationTotalElement = document.querySelector(
    "#dashboard-recent-presentation-total"
  );
  const recentPresentationList = document.querySelector(
    "#dashboard-recent-presentation-list"
  );
  const recentTotalElement = document.querySelector(
    "#dashboard-recent-total"
  );
  const recentList = document.querySelector(
    "#dashboard-recent-work-list"
  );
  const errorElement = document.querySelector(
    "#dashboard-overview-error"
  );

  const activeObjectUrls = new Set();
  let repository = null;

  function releaseObjectUrls() {
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls.clear();
    repository?.media?.urls?.revokeAll();
  }

  function setError(message = "") {
    if (!errorElement) return;

    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  function initialiseRecentScrollIndicators() {
    const desktopQuery =
      window.matchMedia("(min-width: 1101px)");

    const bindings = [
      ...document.querySelectorAll(
        ".dashboard-latest-column"
      )
    ].map((column) => {
      const list = column.querySelector(
        ".dashboard-work-list, " +
        ".dashboard-recent-presentation-list"
      );

      const indicator = column.querySelector(
        ".dashboard-scroll-indicator"
      );

      const thumb = indicator?.querySelector(
        ".dashboard-scroll-indicator-thumb"
      );

      if (!list || !indicator || !thumb) {
        return null;
      }

      function update() {
        const scrollable =
          desktopQuery.matches &&
          list.scrollHeight >
            list.clientHeight + 1;

        indicator.hidden = !scrollable;

        if (!scrollable) {
          thumb.style.transform =
            "translateY(0)";
          return;
        }

        indicator.style.top =
          `${list.offsetTop}px`;

        indicator.style.height =
          `${list.clientHeight}px`;

        const thumbHeight = 18;

        const maximumScroll =
          list.scrollHeight -
          list.clientHeight;

        const availableTravel =
          Math.max(
            0,
            list.clientHeight -
            thumbHeight
          );

        const progress =
          maximumScroll > 0
            ? list.scrollTop /
              maximumScroll
            : 0;

        thumb.style.transform =
          `translateY(${
            Math.round(
              availableTravel * progress
            )
          }px)`;
      }

      list.addEventListener(
        "scroll",
        update,
        { passive: true }
      );

      column.addEventListener(
        "wheel",
        (event) => {
          if (
            !desktopQuery.matches ||
            list.contains(event.target) ||
            list.scrollHeight <=
              list.clientHeight
          ) {
            return;
          }

          const previous =
            list.scrollTop;

          list.scrollTop +=
            event.deltaY;

          if (list.scrollTop !== previous) {
            event.preventDefault();
          }
        },
        { passive: false }
      );

      const resizeObserver =
        new ResizeObserver(update);

      resizeObserver.observe(column);
      resizeObserver.observe(list);

      const mutationObserver =
        new MutationObserver(update);

      mutationObserver.observe(list, {
        childList: true,
        subtree: true
      });

      return {
        update,
        resizeObserver,
        mutationObserver
      };
    }).filter(Boolean);

    function updateAll() {
      bindings.forEach(
        (binding) => binding.update()
      );
    }

    desktopQuery.addEventListener(
      "change",
      updateAll
    );

    window.addEventListener(
      "resize",
      updateAll
    );

    updateAll();
  }

  function getCoverImage(work) {
    const images = [...(work.images || [])].sort(
      (first, second) => first.order - second.order
    );

    return images.find((image) => image.isCover) || images[0] || null;
  }

  async function createWorkImage(work, privatePreviews = new Map()) {
    const coverImage = getCoverImage(work);

    if (!coverImage) {
      const placeholder = document.createElement("div");

      placeholder.className = "dashboard-work-image-placeholder";
      placeholder.textContent = "NO IMAGE";
      placeholder.setAttribute(
        "aria-label",
        `${work.title || "Untitled"}: no image`
      );

      return placeholder;
    }

    const image = document.createElement("img");
    image.alt = `${work.title || "Untitled"} cover image`;

    try {
      if (repository.mode === "supabase") {
        image.src =
          coverImage.publicPath && work.visibility === "published"
            ? repository.media.publicUrl(coverImage.publicPath)
            : privatePreviews.get(String(coverImage.id).toLowerCase()) || "";
        if (!image.src) throw new Error("private preview unavailable");
      } else if (coverImage.blob) {
        image.src = URL.createObjectURL(coverImage.blob);
        activeObjectUrls.add(image.src);
      } else {
        image.src = coverImage.src;
      }
    } catch {
      const placeholder = document.createElement("div");

      placeholder.className = "dashboard-work-image-placeholder";
      placeholder.textContent = "PREVIEW UNAVAILABLE";

      return placeholder;
    }

    return image;
  }

  async function createRecentWorkRow(work, privatePreviews) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const editLink = document.createElement("a");
    const year = document.createElement("p");
    const status = document.createElement("span");

    row.className = "dashboard-work-row";
    information.className = "dashboard-work-information";

    editLink.href =
      `dashboard-work-edit.html?id=${encodeURIComponent(work.id)}`;
    editLink.textContent = work.title || "UNTITLED";
    editLink.setAttribute(
      "aria-label",
      `Edit ${work.title || "untitled work"}`
    );

    year.textContent = work.year || "YEAR NOT SET";
    status.textContent =
      work.visibility === "published" ? "PUBLISHED" : "DRAFT";
    status.className =
      work.visibility === "published" ? "is-published" : "is-draft";

    title.append(editLink);
    information.append(title, year);
    row.append(
      await createWorkImage(work, privatePreviews),
      information,
      status
    );

    return row;
  }

  function createEmptyState(
    message = "NO WORKS ADDED",
    includeAddLink = true
  ) {
    const emptyState = document.createElement("div");
    const text = document.createElement("p");

    emptyState.className = "dashboard-empty-state";
    text.textContent = message;
    emptyState.append(text);

    if (includeAddLink) {
      const addLink = document.createElement("a");

      addLink.className = "text-action";
      addLink.href = "dashboard-work-edit.html";
      addLink.textContent = "[ + ADD WORK ]";
      emptyState.append(addLink);
    }

    return emptyState;
  }

  function updateSummary(works) {
    const publishedCount = works.filter(
      (work) => work.visibility === "published"
    ).length;
    const draftCount = works.length - publishedCount;

    totalElement.textContent = String(works.length);
    breakdownElement.replaceChildren(
      document.createTextNode(`${publishedCount} PUBLISHED`),
      document.createElement("br"),
      document.createTextNode(`${draftCount} DRAFTS`)
    );
    recentTotalElement.textContent =
      `${works.length} ${works.length === 1 ? "WORK" : "WORKS"}`;
  }


  function parseTimestamp(value) {
    const parsed = Date.parse(value);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  function formatPresentationDate(value) {
    if (!value) return "";

    const parsed = new Date(`${value}T00:00:00Z`);

    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(parsed).toUpperCase();
  }

  function formatPresentationDateRange(
    startDate,
    endDate
  ) {
    const start =
      formatPresentationDate(startDate);

    const end =
      formatPresentationDate(endDate);

    if (!start) return "DATE NOT SET";

    if (!end || endDate === startDate) {
      return start;
    }

    return `${start} — ${end}`;
  }

  function createRecentPresentationRow(
    presentation
  ) {
    const row =
      document.createElement("article");

    const information =
      document.createElement("div");

    const title =
      document.createElement("h3");

    const editLink =
      document.createElement("a");

    const date =
      document.createElement("p");

    const status =
      document.createElement("span");

    row.className =
      "dashboard-recent-presentation-row";

    information.className =
      "dashboard-recent-presentation-information";

    editLink.href =
      `dashboard-presentation-edit.html?id=${encodeURIComponent(
        presentation.id
      )}`;

    editLink.textContent =
      presentation.title || "UNTITLED";

    editLink.setAttribute(
      "aria-label",
      `Edit ${
        presentation.title ||
        "untitled presentation"
      }`
    );

    date.textContent =
      formatPresentationDateRange(
        presentation.startDate,
        presentation.endDate
      );

    const published =
      presentation.visibility === "published";

    status.textContent =
      published
        ? "PUBLISHED"
        : "DRAFT";

    status.className =
      published
        ? "is-published"
        : "is-draft";

    title.append(editLink);
    information.append(title, date);
    row.append(information, status);

    return row;
  }

  function createPresentationEmptyState(
    message = "NO PRESENTATIONS ADDED",
    includeAddLink = true
  ) {
    const emptyState =
      document.createElement("div");

    const text =
      document.createElement("p");

    emptyState.className =
      "dashboard-empty-state";

    text.textContent = message;
    emptyState.append(text);

    if (includeAddLink) {
      const addLink =
        document.createElement("a");

      addLink.className = "text-action";
      addLink.href =
        "dashboard-presentation-edit.html";

      addLink.textContent =
        "[ + ADD PRESENTATION ]";

      emptyState.append(addLink);
    }

    return emptyState;
  }

  function renderRecentPresentations(
    presentations,
    emptyMessage = "NO PRESENTATIONS ADDED",
    includeAddLink = true
  ) {
    recentPresentationTotalElement.textContent =
      `${presentations.length} ${
        presentations.length === 1
          ? "PRESENTATION"
          : "PRESENTATIONS"
      }`;

    if (!presentations.length) {
      recentPresentationList.replaceChildren(
        createPresentationEmptyState(
          emptyMessage,
          includeAddLink
        )
      );

      return;
    }

    const recentPresentations =
      [...presentations]
        .sort(
          (first, second) =>
            parseTimestamp(second.updatedAt) -
            parseTimestamp(first.updatedAt)
        )
        .slice(0, 10);

    recentPresentationList.replaceChildren(
      ...recentPresentations.map(
        createRecentPresentationRow
      )
    );
  }

  function updatePresentationSummary(presentations) {
    const publishedCount = presentations.filter(
      (presentation) =>
        presentation.visibility === "published"
    ).length;

    const draftCount =
      presentations.length - publishedCount;

    presentationTotalElement.textContent =
      String(presentations.length);

    presentationBreakdownElement.replaceChildren(
      document.createTextNode(
        `${publishedCount} PUBLISHED`
      ),
      document.createElement("br"),
      document.createTextNode(
        `${draftCount} DRAFTS`
      )
    );
  }

  async function loadPresentationSummary(profileIds = []) {
    try {
      const selected =
        await getPresentationRepository();

      const presentationRepository =
        selected.repository;

      await presentationRepository.initialise();

      const presentations =
        presentationRepository.mode === "supabase"
          ? await presentationRepository.listPresentations(
              profileIds
            )
          : await presentationRepository.listPresentations();

      updatePresentationSummary(presentations);
      renderRecentPresentations(presentations);
    } catch (error) {
      console.error(
        "Could not load dashboard Presentation summary.",
        error
      );

      updatePresentationSummary([]);
      renderRecentPresentations(
        [],
        "PRESENTATIONS UNAVAILABLE",
        false
      );

      presentationBreakdownElement.textContent =
        "PRESENTATIONS UNAVAILABLE";
    }
  }

  async function renderRecentWorks(
    works,
    emptyMessage = "NO WORKS ADDED",
    includeAddLink = true
  ) {
    releaseObjectUrls();

    if (works.length === 0) {
      recentList.replaceChildren(
        createEmptyState(emptyMessage, includeAddLink)
      );
      return;
    }

    const recentWorks = works.slice(0, 10);
    const privateCovers = recentWorks.map((work) => {
      const cover = getCoverImage(work);
      return cover && !(cover.publicPath && work.visibility === "published") ? cover : null;
    }).filter(Boolean);
    let privatePreviews = new Map();
    if (repository.mode === "supabase") {
      try { privatePreviews = await repository.media.privatePreviewBatch(privateCovers); }
      catch { privatePreviews = new Map(); }
    }
    recentList.replaceChildren(
      ...await Promise.all(
        recentWorks.map((work) => createRecentWorkRow(work, privatePreviews))
      )
    );
  }

  async function initialiseOverview() {
    try {
      const selected = await getWorkRepository();
      repository = selected.repository;
      await repository.initialise();

      let works = [];
      let managedProfileIds = [];

      if (repository.mode === "supabase") {
        const profiles = await repository.listManagedProfiles();
        renderDashboardAccountIdentity(profiles);
        managedProfileIds = profiles.map(
          (profile) => profile.id
        );
        if (!profiles.length) {
          updateSummary([]);
          updatePresentationSummary([]);

          renderRecentPresentations(
            [],
            "ARTIST PROFILE SETUP REQUIRED",
            false
          );

          await renderRecentWorks(
            [],
            "ARTIST PROFILE SETUP REQUIRED",
            false
          );
          return;
        }

        works = await repository.listWorks(
          profiles.map((profile) => profile.id)
        );
      } else {
        renderDashboardAccountIdentity([], "prototype");
        works = await repository.listWorks();
      }

      setError();
      updateSummary(works);
      await loadPresentationSummary(managedProfileIds);
      await renderRecentWorks(works);
    } catch (error) {
      console.error(
        "Could not initialise CHAINED dashboard overview.",
        error
      );

      renderDashboardAccountIdentity([], "error");
      updateSummary([]);
      updatePresentationSummary([]);

      renderRecentPresentations(
        [],
        "PRESENTATIONS UNAVAILABLE",
        false
      );

      await renderRecentWorks(
        [],
        "WORKS UNAVAILABLE",
        false
      );
      setError("WORKS ARE CURRENTLY UNAVAILABLE");
    }
  }

  initialiseRecentScrollIndicators();

  window.addEventListener("beforeunload", releaseObjectUrls);
  initialiseOverview();
});
