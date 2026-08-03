document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const workStore = window.ChainedWorkStore;
  const worksContainer = document.querySelector("#works");
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


  function sortPublishedWorks(works) {
    return [...works].sort((first, second) => {
      const firstYear = Number.parseInt(first.year, 10);
      const secondYear = Number.parseInt(second.year, 10);
      const normalisedFirstYear = Number.isFinite(firstYear) ? firstYear : -Infinity;
      const normalisedSecondYear = Number.isFinite(secondYear) ? secondYear : -Infinity;

      if (normalisedFirstYear !== normalisedSecondYear) {
        return normalisedSecondYear - normalisedFirstYear;
      }

      return (
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime()
      );
    });
  }


  function getCoverImage(work) {
    const images = [...(work.images || [])].sort(
      (first, second) => first.order - second.order
    );

    return images.find((image) => image.isCover) || images[0] || null;
  }


  function createImageSource(image) {
    if (image.blob) {
      const objectUrl = URL.createObjectURL(image.blob);

      activeObjectUrls.add(objectUrl);
      return objectUrl;
    }

    return image.src;
  }


  function applyOrientationClass(article, image) {
    const updateOrientation = () => {
      article.classList.toggle(
        "profile-work-landscape",
        image.naturalWidth >= image.naturalHeight
      );
      article.classList.toggle(
        "profile-work-portrait",
        image.naturalWidth < image.naturalHeight
      );
    };

    image.addEventListener("load", updateOrientation, { once: true });

    if (image.complete) {
      updateOrientation();
    }
  }


  function createWorkImage(work, article, destination) {
    const imageLink = document.createElement("a");
    const coverImage = getCoverImage(work);

    imageLink.className = "profile-image-link";
    imageLink.href = destination;
    imageLink.setAttribute(
      "aria-label",
      `View ${work.title || "untitled work"} by Peer Vink`
    );

    if (!coverImage) {
      const placeholder = document.createElement("span");

      placeholder.className = "profile-image-placeholder";
      placeholder.textContent = "IMAGE NOT AVAILABLE";
      imageLink.append(placeholder);
      return imageLink;
    }

    const image = document.createElement("img");

    image.src = createImageSource(coverImage);
    image.alt = `${work.title || "Untitled work"} by Peer Vink`;
    applyOrientationClass(article, image);
    imageLink.append(image);

    return imageLink;
  }


  function createWorkMetadata(work, destination) {
    const metadata = document.createElement("div");
    const heading = document.createElement("h2");
    const titleLink = document.createElement("a");
    const displayType = work.format || work.workType;

    metadata.className = "profile-work-meta";
    titleLink.href = destination;
    titleLink.textContent = work.title || "UNTITLED";
    titleLink.setAttribute(
      "aria-label",
      `View ${work.title || "untitled work"} by Peer Vink`
    );
    heading.append(titleLink);
    metadata.append(heading);

    if (work.year) {
      const year = document.createElement("span");

      year.className = "profile-year";
      year.textContent = work.year;
      metadata.append(year);
    }

    if (displayType) {
      const type = document.createElement("p");

      type.textContent = formatType(displayType);
      metadata.append(type);
    }

    return metadata;
  }


  function createWorkArticle(work) {
    const article = document.createElement("article");
    const destination = `artwork.html?id=${encodeURIComponent(work.id)}`;

    article.className = "profile-work";
    article.append(
      createWorkImage(work, article, destination),
      createWorkMetadata(work, destination)
    );

    return article;
  }


  function createState(message, isError = false) {
    const state = document.createElement("p");

    state.className = "profile-works-state";
    state.classList.toggle("is-error", isError);
    state.textContent = message;

    return state;
  }


  function renderPublishedWorks(works) {
    releaseObjectUrls();

    if (works.length === 0) {
      worksContainer.replaceChildren(createState("NO PUBLISHED WORKS"));
      return;
    }

    worksContainer.replaceChildren(...works.map(createWorkArticle));
  }


  async function initialisePublicProfile() {
    if (!workStore || !worksContainer) {
      console.error("CHAINED public profile dependencies are unavailable.");
      worksContainer?.replaceChildren(
        createState("PUBLISHED WORKS UNAVAILABLE", true)
      );
      return;
    }

    try {
      await workStore.initialiseDatabase();
      const works = await workStore.getAllWorks();
      const publishedWorks = sortPublishedWorks(
        works.filter((work) => work.visibility === "published")
      );

      renderPublishedWorks(publishedWorks);
    } catch (error) {
      console.error("Could not load published CHAINED works.", error);
      worksContainer.replaceChildren(
        createState("PUBLISHED WORKS UNAVAILABLE", true)
      );
    }
  }


  window.addEventListener("beforeunload", releaseObjectUrls);
  initialisePublicProfile();
});
