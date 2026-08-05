document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getWorkRepository } =
    await import("./data/work-repository.mjs");
  const { renderDashboardAccountIdentity } =
    await import("./data/dashboard-context.mjs");

  const totalElement = document.querySelector("#dashboard-work-total");
  const breakdownElement = document.querySelector(
    "#dashboard-work-breakdown"
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

  function getCoverImage(work) {
    const images = [...(work.images || [])].sort(
      (first, second) => first.order - second.order
    );

    return images.find((image) => image.isCover) || images[0] || null;
  }

  async function createWorkImage(work) {
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
      if (repository.mode === "local-supabase") {
        image.src =
          coverImage.publicPath && work.visibility === "published"
            ? repository.media.publicUrl(coverImage.publicPath)
            : await repository.media.privatePreview(coverImage);
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

  async function createRecentWorkRow(work) {
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
      await createWorkImage(work),
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

    recentList.replaceChildren(
      ...await Promise.all(
        works.slice(0, 3).map(createRecentWorkRow)
      )
    );
  }

  async function initialiseOverview() {
    try {
      const selected = await getWorkRepository();
      repository = selected.repository;
      await repository.initialise();

      let works = [];

      if (repository.mode === "local-supabase") {
        const profiles = await repository.listManagedProfiles();
        renderDashboardAccountIdentity(profiles);

        if (!profiles.length) {
          updateSummary([]);
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
      await renderRecentWorks(works);
    } catch (error) {
      console.error(
        "Could not initialise CHAINED dashboard overview.",
        error
      );

      renderDashboardAccountIdentity([], "error");
      updateSummary([]);
      await renderRecentWorks(
        [],
        "WORKS UNAVAILABLE",
        false
      );
      setError("WORKS ARE CURRENTLY UNAVAILABLE");
    }
  }

  window.addEventListener("beforeunload", releaseObjectUrls);
  initialiseOverview();
});