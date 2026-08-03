document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const { getWorkRepository } = await import("./data/work-repository.mjs");
  const { createPublicProfileLink } = await import("./data/public-work-mapping.mjs");
  let workStore = null;
  const information = document.querySelector("#artwork-information");
  const content = document.querySelector("#artwork-content");
  const primaryProfileLink = document.querySelector(".main-nav a:last-child");
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
    const additionalMaterials = Array.isArray(work.additionalMaterials)
      ? work.additionalMaterials.join(", ")
      : work.additionalMaterials;

    return [
      work.primaryMedium,
      work.supportBase,
      additionalMaterials
    ]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(", ");
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
    return createPublicProfileLink(work?.ownerProfileSlug) || "profile-peer-vink.html";
  }


  function createBackLink(work = null) {
    const backLink = document.createElement("a");

    backLink.className = "artwork-back";
    backLink.href = profileDestination(work);
    backLink.textContent = "← SHOW ARTIST PROFILE";

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


  function createInformation(work) {
    const fragment = document.createDocumentFragment();
    const artist = document.createElement("a");
    const heading = document.createElement("h1");
    const classification = work.format || work.workType;
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

    fragment.append(createBackLink(work));

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
    image.src = createImageSource(imageRecord);
    image.alt =
      `${work.title} by ${work.ownerProfileName || "Peer Vink"}, image ${index + 1} of ${total}`;
    figure.append(image);

    return figure;
  }


  function renderImages(work) {
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

    content.replaceChildren(
      ...images.map((image, index) =>
        createArtworkImage(image, work, index, images.length)
      )
    );
  }


  function renderUnavailable() {
    releaseObjectUrls();
    document.title = "WORK NOT AVAILABLE — CHAINED";

    const heading = document.createElement("h1");

    heading.textContent = "WORK NOT AVAILABLE";
    information.replaceChildren(heading, createBackLink());
    content.replaceChildren();
  }


  function renderWork(work) {
    if (primaryProfileLink) primaryProfileLink.href = profileDestination(work);
    document.title = `${work.title} — ${work.ownerProfileName || "PEER VINK"} — CHAINED`;
    information.replaceChildren(createInformation(work));
    renderImages(work);
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
      const selected = await getWorkRepository();
      workStore = selected.repository;
      await workStore.initialise();
      const work = await workStore.getPublishedWork(workId);

      if (!work || work.visibility !== "published") {
        renderUnavailable();
        return;
      }

      renderWork(work);
    } catch (error) {
      renderUnavailable();
    }
  }


  window.addEventListener("beforeunload", releaseObjectUrls);
  initialiseArtwork();
});
