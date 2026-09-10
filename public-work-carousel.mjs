const SWIPE_THRESHOLD = 28;

export function createPublicWorkCarouselState(images = []) {
  return Object.freeze({
    images: Object.freeze([...images]),
    activeIndex: 0
  });
}

/**
 * Creates the one compact, accessible navigation treatment for every public
 * Work viewer. It stays hidden until the shared carousel has confirmed that
 * the Work has more than one public image.
 */
export function createPublicWorkCarouselControls(document, total = null) {
  if (!document?.createElement || (Number.isInteger(total) && total < 2)) return null;

  const root = document.createElement("div");
  const previous = document.createElement("button");
  const counter = document.createElement("span");
  const next = document.createElement("button");

  root.className = "public-work-carousel-controls";
  root.hidden = true;
  previous.className = "public-work-carousel-button";
  previous.type = "button";
  previous.textContent = "<";
  previous.setAttribute("aria-label", "Previous image");
  previous.hidden = true;
  counter.className = "public-work-carousel-count";
  counter.setAttribute("aria-live", "polite");
  counter.textContent = Number.isInteger(total) ? `1/${total}` : "";
  next.className = "public-work-carousel-button";
  next.type = "button";
  next.textContent = ">";
  next.setAttribute("aria-label", "Next image");
  next.hidden = true;
  root.append(previous, counter, next);

  return { root, previous, counter, next };
}

export function nextCarouselIndex(index, direction, length) {
  if (!Number.isInteger(index) || !Number.isInteger(length) || length < 2) return 0;
  if (direction > 0) return (index + 1) % length;
  if (direction < 0) return (index - 1 + length) % length;
  return index;
}

function horizontalSwipe(startX, startY, currentX, currentY) {
  const x = currentX - startX;
  const y = currentY - startY;
  return Math.abs(x) >= SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y);
}

function describeImage(index, total, label) {
  return `${label}. Image ${index + 1} of ${total}`;
}

function updateInteractiveHitArea(link, imageRecord) {
  const width = link.clientWidth;
  const height = link.clientHeight;
  const imageWidth = Number(imageRecord?.width) || 0;
  const imageHeight = Number(imageRecord?.height) || 0;
  if (!width || !height || !imageWidth || !imageHeight) return;

  const frameRatio = width / height;
  const imageRatio = imageWidth / imageHeight;
  const renderedWidth = frameRatio > imageRatio ? height * imageRatio : width;
  const renderedHeight = frameRatio > imageRatio ? height : width / imageRatio;
  const horizontalInset = Math.max(0, (width - renderedWidth) / 2);
  const verticalInset = Math.max(0, (height - renderedHeight) / 2);

  link.dataset.publicCarouselHitArea = "true";
  link.style.setProperty("--public-carousel-hit-top", `${verticalInset}px`);
  link.style.setProperty("--public-carousel-hit-right", `${horizontalInset}px`);
  link.style.setProperty("--public-carousel-hit-bottom", `${verticalInset}px`);
  link.style.setProperty("--public-carousel-hit-left", `${horizontalInset}px`);
}

/**
 * Adds invisible browsing behavior to an existing public image link. The
 * cover remains the layout anchor; only the contained image source changes.
 */
export function attachPublicWorkCarousel({
  link,
  image,
  article,
  workId,
  coverImage,
  loadImages,
  label,
  previousButton = null,
  nextButton = null,
  counter = null,
  eager = false,
  onImageChange = () => {}
}) {
  if (!link || !image || !article || typeof loadImages !== "function") return () => {};

  let state = createPublicWorkCarouselState([coverImage]);
  let requestStarted = false;
  let loadPromise = null;
  let pointer = null;
  let capturedPointerId = null;
  let suppressClick = false;
  let resizeObserver = null;

  link.draggable = false;
  image.draggable = false;

  const onDragStart = (event) => {
    event.preventDefault();
  };

  const capturePointer = (pointerId) => {
    if (typeof link.setPointerCapture !== "function") return;
    try {
      link.setPointerCapture(pointerId);
      if (typeof link.hasPointerCapture !== "function" || link.hasPointerCapture(pointerId)) {
        capturedPointerId = pointerId;
      }
    } catch {
      capturedPointerId = null;
    }
  };

  const releasePointer = (pointerId) => {
    if (capturedPointerId !== pointerId) return;
    try {
      if (typeof link.hasPointerCapture !== "function" || link.hasPointerCapture(pointerId)) {
        link.releasePointerCapture?.(pointerId);
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    capturedPointerId = null;
  };

  const update = () => {
    const current = state.images[state.activeIndex];
    if (!current) return;
    image.src = current.src;
    image.alt = label;
    link.setAttribute("aria-label", describeImage(state.activeIndex, state.images.length, label));
    link.dataset.carouselIndex = String(state.activeIndex + 1);
    link.dataset.carouselCount = String(state.images.length);
    if (counter) {
      counter.textContent = `${state.activeIndex + 1}/${state.images.length}`;
      counter.parentElement.hidden = state.images.length < 2;
    }
    updateInteractiveHitArea(link, current);
    onImageChange(current, state);
  };

  const load = () => {
    if (requestStarted) return loadPromise;
    requestStarted = true;
    loadPromise = Promise.resolve(loadImages(workId, coverImage)).then((images) => {
      if (!Array.isArray(images) || images.length < 2) return;
      state = createPublicWorkCarouselState(images);
      article.classList.add("has-public-work-carousel");
      if (previousButton) previousButton.hidden = false;
      if (nextButton) nextButton.hidden = false;
      if (coverImage.width && coverImage.height) {
        article.style.setProperty(
          "--public-carousel-cover-ratio",
          `${coverImage.width} / ${coverImage.height}`
        );
      }
      update();
    }).catch(() => {
      // A failed optional public-media lookup leaves normal cover navigation intact.
    });
    return loadPromise;
  };

  const change = (direction) => {
    if (state.images.length < 2) return false;
    const next = nextCarouselIndex(state.activeIndex, direction, state.images.length);
    if (next === state.activeIndex) return false;
    state = Object.freeze({ ...state, activeIndex: next });
    update();
    return true;
  };

  const changeFromControl = (direction) => {
    if (state.images.length < 2) {
      void (load()?.then(() => change(direction)));
      return;
    }
    change(direction);
  };

  const onPointerDown = (event) => {
    // A later deliberate pointer activation must never inherit a missing
    // synthetic click from an earlier swipe.
    suppressClick = false;
    load();
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false
    };
    capturePointer(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer.moved ||= horizontalSwipe(pointer.x, pointer.y, event.clientX, event.clientY);
  };
  const onPointerUp = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const completedSwipe = pointer.moved && horizontalSwipe(
      pointer.x, pointer.y, event.clientX, event.clientY
    );
    if (completedSwipe) {
      suppressClick = true;
      const direction = event.clientX < pointer.x ? 1 : -1;
      if (state.images.length < 2) {
        changeFromControl(direction);
      } else {
        change(direction);
      }
      event.preventDefault();
    }
    releasePointer(event.pointerId);
    pointer = null;
  };
  const onPointerCancel = (event) => {
    releasePointer(event.pointerId);
    pointer = null;
  };
  const onClick = (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      suppressClick = false;
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (state.images.length < 2) {
      changeFromControl(direction);
    } else {
      change(direction);
    }
  };
  const onPreviousClick = (event) => {
    event.preventDefault();
    changeFromControl(-1);
  };
  const onNextClick = (event) => {
    event.preventDefault();
    changeFromControl(1);
  };

  link.addEventListener("pointerdown", onPointerDown);
  link.addEventListener("pointermove", onPointerMove);
  link.addEventListener("pointerup", onPointerUp);
  link.addEventListener("pointercancel", onPointerCancel);
  link.addEventListener("dragstart", onDragStart);
  image.addEventListener("dragstart", onDragStart);
  link.addEventListener("click", onClick, true);
  link.addEventListener("keydown", onKeyDown);
  previousButton?.addEventListener("click", onPreviousClick);
  nextButton?.addEventListener("click", onNextClick);

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      updateInteractiveHitArea(link, state.images[state.activeIndex]);
    });
    resizeObserver.observe(link);
  }
  updateInteractiveHitArea(link, coverImage);

  if (eager) void load();

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        load();
        observer.disconnect();
      }
    }, { rootMargin: "240px 0px" });
    observer.observe(article);
  }

  return () => {
    link.removeEventListener("pointerdown", onPointerDown);
    link.removeEventListener("pointermove", onPointerMove);
    link.removeEventListener("pointerup", onPointerUp);
    link.removeEventListener("pointercancel", onPointerCancel);
    link.removeEventListener("dragstart", onDragStart);
    image.removeEventListener("dragstart", onDragStart);
    link.removeEventListener("click", onClick, true);
    link.removeEventListener("keydown", onKeyDown);
    previousButton?.removeEventListener("click", onPreviousClick);
    nextButton?.removeEventListener("click", onNextClick);
    resizeObserver?.disconnect();
  };
}
