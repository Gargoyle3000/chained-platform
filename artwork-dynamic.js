document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getWorkRepository } = await import("./data/work-repository.mjs");
  const { createPublicProfileLink } = await import("./data/public-work-mapping.mjs");
  let workStore = null;
  const information = document.querySelector("#artwork-information");
  const content = document.querySelector("#artwork-content");
  const primaryProfileLink = document.querySelector("[data-own-profile-link]");
  const activeObjectUrls = new Set();


  function releaseObjectUrls() {
    activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    activeObjectUrls.clear();
  }


  function formatType(value) {
    const labels = {
      "single-work": "SINGLE WORK",
      series: "SERIES",
      installation: "INSTALLATION",
      photography: "PHOTOGRAPHY",
      sculpture: "SCULPTURE",
      painting: "PAINTING",
      video: "VIDEO",
      performance: "PERFORMANCE",
      publication: "PUBLICATION",
      digital: "DIGITAL WORK"
    };

    return labels[value] || value.replaceAll("-", " ").toUpperCase();
  }


  function formatMaterials(work) {
    return work.materials?.trim() || "";
  }


  function formatDimensions(work) {
    if (!work.height || !work.width) {
      return "";
    }

    const values = [work.height, work.width];

    if (work.depth) {
      values.push(work.depth);
    }

    const unit = work.dimensionUnit?.trim().toUpperCase();

    return `${values.join(" × ")}${unit ? ` ${unit}` : ""}`;
  }


  function isValidExternalUrl(value) {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);

      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        Boolean(url.hostname)
      );
    } catch (error) {
      return false;
    }
  }


  function profileDestination(work) {
    return createPublicProfileLink(work?.ownerProfileSlug) || "profile.html";
  }


  function createBackLink(work = null) {
    const backLink = document.createElement("a");

    backLink.className = "artwork-back";
    backLink.href = profileDestination(work);
    backLink.textContent = "← SHOW ARTIST PROFILE";

    return backLink;
  }


  function createFeedBackLink(origin) {
    if (!origin) return null;

    const backLink = document.createElement("a");
    backLink.className = "artwork-back artwork-feed-back";
    backLink.href = origin.feedLocation;
    backLink.textContent = "← BACK";
    backLink.setAttribute(
      "aria-label",
      `Return to ${origin.origin === "discover" ? "Discover" : "Following"}`
    );
    backLink.addEventListener("click", (event) => {
      if (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        window.history.back();
      }
    });

    return backLink;
  }


  function createTextLine(value, className = "") {
    const line = document.createElement("p");

    if (className) {
      line.className = className;
    }

    line.textContent = value;

    return line;
  }


  function createCredit(label, name, url) {
    const line = document.createElement("p");

    line.className = "artwork-credit";
    line.append(document.createTextNode(`${label}: `));

    if (isValidExternalUrl(url)) {
      const link = document.createElement("a");

      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${name} ↗`;
      link.setAttribute("aria-label", `${label}: ${name}, opens in a new tab`);
      line.append(link);
    } else {
      line.append(document.createTextNode(name));
    }

    return line;
  }


  function createInformation(work, archiveState = null, createArchiveAction = null, feedOrigin = null, carouselControls = null) {
    const fragment = document.createDocumentFragment();
    const artist = document.createElement("a");
    const heading = document.createElement("h1");
    const classification = work.workType;
    const materials = formatMaterials(work);
    const dimensions = formatDimensions(work);

    artist.className = "artwork-artist";
    artist.href = profileDestination(work);
    artist.textContent = work.ownerProfileName || "PEER VINK";
    heading.textContent = work.title;
    fragment.append(artist, heading);

    if (work.year) {
      const year = document.createElement("span");

      year.className = "artwork-year";
      year.textContent = work.year;
      fragment.append(year);
    }

    if (classification) {
      fragment.append(createTextLine(formatType(classification)));
    }

    if (materials) {
      fragment.append(createTextLine(materials));
    }

    if (dimensions) {
      fragment.append(createTextLine(dimensions));
    }

    if (work.duration) {
      fragment.append(createTextLine(`DURATION: ${work.duration}`));
    }

    if (work.edition) {
      fragment.append(createTextLine(`EDITION: ${work.edition}`));
    }

    if (work.description) {
      fragment.append(
        createTextLine(work.description, "artwork-description")
      );
    }

    if (work.collaboratorName) {
      fragment.append(
        createCredit(
          "COLLABORATOR",
          work.collaboratorName,
          work.collaboratorUrl
        )
      );
    }

    if (work.photoCreditName) {
      fragment.append(
        createCredit(
          "PHOTO CREDIT",
          work.photoCreditName,
          work.photoCreditUrl
        )
      );
    }

    if (carouselControls) fragment.append(carouselControls.root);

    if (archiveState && createArchiveAction) {
      const archiveStatus = document.createElement("p");
      archiveStatus.className = "sr-only";
      archiveStatus.setAttribute("aria-live", "polite");
      fragment.append(
        createArchiveAction(
          work,
          archiveState,
          (message) => { archiveStatus.textContent = message; },
          "artwork-save"
        ),
        archiveStatus
      );
    }

    fragment.append(createBackLink(work));
    const feedBackLink = createFeedBackLink(feedOrigin);
    if (feedBackLink) fragment.append(feedBackLink);

    return fragment;
  }


  function createImageSource(image) {
    if (image.blob) {
      const objectUrl = URL.createObjectURL(image.blob);

      activeObjectUrls.add(objectUrl);
      return objectUrl;
    }

    return image.src;
  }


  function createArtworkImage(imageRecord, work, index, total) {
    const figure = document.createElement("figure");
    const image = document.createElement("img");

    figure.className = "artwork-main-image artwork-dynamic-image";
    figure.tabIndex = total > 1 ? 0 : -1;
    image.src = imageRecord.src || createImageSource(imageRecord);
    image.alt =
      `${work.title} by ${work.ownerProfileName || "Peer Vink"}, image ${index + 1} of ${total}`;
    figure.append(image);

    return { figure, image };
  }


  function createCarouselControls(total) {
    if (total < 2) return null;

    const root = document.createElement("div");
    const previous = document.createElement("button");
    const counter = document.createElement("span");
    const next = document.createElement("button");

    root.className = "artwork-carousel-controls";
    root.hidden = true;
    previous.className = "artwork-carousel-button";
    previous.type = "button";
    previous.textContent = "<";
    previous.setAttribute("aria-label", "Previous image");
    previous.hidden = true;
    counter.className = "artwork-carousel-count";
    counter.textContent = `1/${total}`;
    next.className = "artwork-carousel-button";
    next.type = "button";
    next.textContent = ">";
    next.setAttribute("aria-label", "Next image");
    next.hidden = true;
    root.append(previous, counter, next);

    return { root, previous, counter, next };
  }


  function renderImages(work, carouselControls = null, carousel = null) {
    releaseObjectUrls();

    const images = [...(work.images || [])].sort(
      (first, second) => first.order - second.order
    );

    if (images.length === 0) {
      const state = document.createElement("p");

      state.className = "artwork-state";
      state.textContent = "IMAGE NOT AVAILABLE";
      content.replaceChildren(state);
      return;
    }

    const carouselImages = images.map((record) => ({
      ...record,
      src: createImageSource(record)
    }));
    const { figure, image } = createArtworkImage(carouselImages[0], work, 0, images.length);
    content.replaceChildren(figure);

    if (!carouselControls || !carousel) return;

    carousel.attach({
      link: figure,
      image,
      article: figure,
      workId: work.id,
      coverImage: carouselImages[0],
      loadImages: async () => carouselImages,
      label: `View ${work.title}`,
      previousButton: carouselControls.previous,
      nextButton: carouselControls.next,
      counter: carouselControls.counter,
      eager: true
    });
  }


  function renderUnavailable() {
    releaseObjectUrls();
    document.title = "WORK NOT AVAILABLE — CHAINED";

    const heading = document.createElement("h1");

    heading.textContent = "WORK NOT AVAILABLE";
    information.replaceChildren(heading, createBackLink());
    content.replaceChildren();
  }


  function renderWork(work, archiveState = null, createArchiveAction = null, feedOrigin = null, carousel = null) {
    if (primaryProfileLink) primaryProfileLink.href = profileDestination(work);
    document.title = `${work.title} — ${work.ownerProfileName || "PEER VINK"} — CHAINED`;
    const carouselControls = createCarouselControls(work.images?.length || 0);
    information.replaceChildren(createInformation(work, archiveState, createArchiveAction, feedOrigin, carouselControls));
    renderImages(work, carouselControls, carousel);
  }


  async function initialiseArtwork() {
    if (!information || !content) {
      console.error("CHAINED dynamic artwork dependencies are unavailable.");
      renderUnavailable();
      return;
    }

    const workId = new URLSearchParams(window.location.search).get("id");

    if (!workId) {
      renderUnavailable();
      return;
    }

    try {
      const [selected, { consumeWorkFeedOrigin }, { attachPublicWorkCarousel }] = await Promise.all([
        getWorkRepository(),
        import("./data/work-feed-return.mjs"),
        import("./public-work-carousel.mjs")
      ]);
      workStore = selected.repository;
      await workStore.initialise();
      const work = await workStore.getPublishedWork(workId);

      if (!work || work.visibility !== "published") {
        renderUnavailable();
        return;
      }

      let archiveState = null;
      let createArchiveAction = null;

      try {
        const { createArchiveWorkAction, loadArchiveWorkState } = await import("./data/archive-work-action.mjs");
        archiveState = await loadArchiveWorkState();
        createArchiveAction = createArchiveWorkAction;
      } catch {
        // Keep the public Work available if the private Archive control cannot load.
      }

      const feedOrigin = consumeWorkFeedOrigin({
        workId,
        detailLocation: window.location.href,
        referrer: document.referrer,
        storage: window.sessionStorage
      });
      renderWork(work, archiveState, createArchiveAction, feedOrigin, { attach: attachPublicWorkCarousel });
    } catch (error) {
      renderUnavailable();
    }
  }


  window.addEventListener("beforeunload", releaseObjectUrls);
  initialiseArtwork();
});
