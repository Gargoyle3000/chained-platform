document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const workStore = window.ChainedWorkStore;
  const workList = document.querySelector("#dashboard-work-list");
  const totalElement = document.querySelector("#dashboard-works-total");
  const breakdownElement = document.querySelector(
    "#dashboard-works-breakdown"
  );
  const errorElement = document.querySelector("#dashboard-works-error");
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


  function formatWorkType(value) {
    const labels = {
      "single-work": "SINGLE WORK",
      series: "SERIES",
      installation: "INSTALLATION",
      video: "VIDEO",
      performance: "PERFORMANCE",
      publication: "PUBLICATION"
    };

    return labels[value] || value.replaceAll("-", " ").toUpperCase();
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


  function createTextAction(text, ariaLabel) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "text-action";
    button.textContent = `[ ${text} ]`;
    button.setAttribute("aria-label", ariaLabel);

    return button;
  }


  function createDeleteConfirmation(work, onDeleted) {
    const confirmation = document.createElement("div");
    const prompt = document.createElement("p");
    const actions = document.createElement("div");
    const confirmButton = createTextAction(
      "CONFIRM DELETE",
      `Confirm deletion of ${work.title || "untitled work"}`
    );
    const cancelButton = createTextAction(
      "CANCEL",
      `Cancel deletion of ${work.title || "untitled work"}`
    );

    confirmation.className = "dashboard-delete-confirmation";
    confirmation.hidden = true;
    prompt.textContent = "DELETE THIS WORK?";
    actions.className = "dashboard-delete-actions";

    cancelButton.addEventListener("click", () => {
      confirmation.hidden = true;
    });

    confirmButton.addEventListener("click", async () => {
      confirmButton.disabled = true;

      try {
        await workStore.deleteWork(work.id);
        await onDeleted();
      } catch (error) {
        console.error(`Could not delete CHAINED work ${work.id}.`, error);
        setError("THIS WORK COULD NOT BE DELETED");
        confirmButton.disabled = false;
      }
    });

    actions.append(confirmButton, cancelButton);
    confirmation.append(prompt, actions);

    return confirmation;
  }


  function createWorkRow(work, reloadWorks) {
    const row = document.createElement("article");
    const information = document.createElement("div");
    const title = document.createElement("h3");
    const metadata = document.createElement("p");
    const statusArea = document.createElement("div");
    const status = document.createElement("span");
    const actions = document.createElement("div");
    const editLink = document.createElement("a");
    const deleteButton = createTextAction(
      "DELETE",
      `Delete ${work.title || "untitled work"}`
    );
    const confirmation = createDeleteConfirmation(work, reloadWorks);
    const metadataParts = [];

    row.className = "dashboard-work-row";
    information.className = "dashboard-work-information";
    statusArea.className = "dashboard-work-status";
    actions.className = "dashboard-work-actions";

    title.textContent = work.title || "UNTITLED";

    if (work.year) {
      metadataParts.push(work.year);
    }

    if (work.workType) {
      metadataParts.push(formatWorkType(work.workType));
    }

    metadata.textContent = metadataParts.join(" · ") || "INCOMPLETE RECORD";

    status.textContent = work.visibility === "published" ? "PUBLISHED" : "DRAFT";
    status.className = work.visibility === "published" ? "is-published" : "is-draft";

    editLink.className = "text-action";
    editLink.href = `dashboard-work-edit.html?id=${encodeURIComponent(work.id)}`;
    editLink.textContent = "[ EDIT ]";
    editLink.setAttribute("aria-label", `Edit ${work.title || "untitled work"}`);

    deleteButton.addEventListener("click", () => {
      confirmation.hidden = false;
    });

    information.append(title, metadata);
    actions.append(editLink, deleteButton);
    statusArea.append(status, actions, confirmation);
    row.append(createWorkImage(work), information, statusArea);

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


  function updateCounts(works) {
    const publishedCount = works.filter(
      (work) => work.visibility === "published"
    ).length;
    const draftCount = works.length - publishedCount;

    breakdownElement.textContent =
      `${publishedCount} PUBLISHED / ${draftCount} ${draftCount === 1 ? "DRAFT" : "DRAFTS"}`;
    totalElement.textContent = `${works.length} ${works.length === 1 ? "WORK" : "WORKS"}`;
  }


  async function renderWorks() {
    const works = await workStore.getAllWorks();

    releaseObjectUrls();
    setError();
    updateCounts(works);

    if (works.length === 0) {
      workList.replaceChildren(createEmptyState());
      return;
    }

    workList.replaceChildren(
      ...works.map((work) => createWorkRow(work, renderWorks))
    );
  }


  async function initialiseWorksPage() {
    if (!workStore || !workList || !totalElement || !breakdownElement) {
      console.error("CHAINED works management dependencies are unavailable.");
      setError("LOCAL WORK STORAGE IS UNAVAILABLE");
      return;
    }

    try {
      await workStore.initialiseDatabase();
      await renderWorks();
    } catch (error) {
      console.error("Could not initialise CHAINED work storage.", error);
      setError("LOCAL WORK STORAGE IS UNAVAILABLE");
    }
  }


  window.addEventListener("beforeunload", releaseObjectUrls);
  initialiseWorksPage();
});
