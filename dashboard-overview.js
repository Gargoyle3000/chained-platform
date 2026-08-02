document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const workStore = window.ChainedWorkStore;
  const totalElement = document.querySelector("#dashboard-work-total");
  const breakdownElement = document.querySelector(
    "#dashboard-work-breakdown"
  );
  const recentTotalElement = document.querySelector("#dashboard-recent-total");
  const recentList = document.querySelector("#dashboard-recent-work-list");
  const errorElement = document.querySelector("#dashboard-overview-error");
  const activeObjectUrls = new Set();


  function releaseObjectUrls() {
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls.clear();
  }


  function setError(message = "") {
    if (!errorElement) {
      return;
    }

    errorElement.textContent = message;
    errorElement.hidden = !message;
  }


  function getCoverImage(work) {
    const images = [...(work.images || [])].sort(
      (first, second) => first.order - second.order
    );

    return images.find((image) => image.isCover) || images[0] || null;
  }


  function createWorkImage(work) {
    const coverImage = getCoverImage(work);

    if (!coverImage) {
      const placeholder = document.createElement("div");

      placeholder.className = "dashboard-work-image-placeholder";
      placeholder.textContent = "NO IMAGE";
      placeholder.setAttribute("aria-label", `${work.title || "Untitled"}: no image`);

      return placeholder;
    }

    const image = document.createElement("img");

    if (coverImage.blob) {
      const objectUrl = URL.createObjectURL(coverImage.blob);

      activeObjectUrls.add(objectUrl);
      image.src = objectUrl;
    } else {
      image.src = coverImage.src;
    }

    image.alt = `${work.title || "Untitled"} cover image`;

    return image;
  }


  function createRecentWorkRow(work) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const editLink = document.createElement("a");
    const year = document.createElement("p");
    const status = document.createElement("span");

    row.className = "dashboard-work-row";
    information.className = "dashboard-work-information";

    editLink.href = `dashboard-work-edit.html?id=${encodeURIComponent(work.id)}`;
    editLink.textContent = work.title || "UNTITLED";
    editLink.setAttribute("aria-label", `Edit ${work.title || "untitled work"}`);

    year.textContent = work.year || "YEAR NOT SET";
    status.textContent = work.visibility === "published" ? "PUBLISHED" : "DRAFT";
    status.className = work.visibility === "published" ? "is-published" : "is-draft";

    title.append(editLink);
    information.append(title, year);
    row.append(createWorkImage(work), information, status);

    return row;
  }


  function createEmptyState() {
    const emptyState = document.createElement("div");
    const message = document.createElement("p");
    const addLink = document.createElement("a");

    emptyState.className = "dashboard-empty-state";
    message.textContent = "NO WORKS ADDED";
    addLink.className = "text-action";
    addLink.href = "dashboard-work-edit.html";
    addLink.textContent = "[ + ADD WORK ]";

    emptyState.append(message, addLink);

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


  function renderRecentWorks(works) {
    releaseObjectUrls();

    if (works.length === 0) {
      recentList.replaceChildren(createEmptyState());
      return;
    }

    recentList.replaceChildren(
      ...works.slice(0, 3).map(createRecentWorkRow)
    );
  }


  async function initialiseOverview() {
    if (
      !workStore ||
      !totalElement ||
      !breakdownElement ||
      !recentTotalElement ||
      !recentList
    ) {
      console.error("CHAINED dashboard work dependencies are unavailable.");
      setError("LOCAL WORK STORAGE IS UNAVAILABLE");
      return;
    }

    try {
      await workStore.initialiseDatabase();
      const works = await workStore.getAllWorks();

      setError();
      updateSummary(works);
      renderRecentWorks(works);
    } catch (error) {
      console.error("Could not initialise CHAINED work storage.", error);
      setError("LOCAL WORK STORAGE IS UNAVAILABLE");
    }
  }


  window.addEventListener("beforeunload", releaseObjectUrls);
  initialiseOverview();
});
