const SWIPE_THRESHOLD = 28;

export function createPublicWorkCarouselState(images = []) {
  return Object.freeze({
    images: Object.freeze([...images]),
    activeIndex: 0
  });
}

export function nextCarouselIndex(index, direction, length) {
  if (!Number.isInteger(index) || !Number.isInteger(length) || length < 2) return 0;
  if (direction > 0) return Math.min(index + 1, length - 1);
  if (direction < 0) return Math.max(index - 1, 0);
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
  onImageChange = () => {}
}) {
  if (!link || !image || !article || typeof loadImages !== "function") return () => {};

  let state = createPublicWorkCarouselState([coverImage]);
  let requestStarted = false;
  let loadPromise = null;
  let pointer = null;
  let capturedPointerId = null;
  let suppressClick = false;

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
    onImageChange(current, state);
  };

  const load = () => {
    if (requestStarted) return loadPromise;
    requestStarted = true;
    loadPromise = Promise.resolve(loadImages(workId, coverImage)).then((images) => {
      if (!Array.isArray(images) || images.length < 2) return;
      state = createPublicWorkCarouselState(images);
      article.classList.add("has-public-work-carousel");
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
        void (load()?.then(() => change(direction)));
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
      void (load()?.then(() => change(direction)));
    } else {
      change(direction);
    }
  };

  link.addEventListener("pointerdown", onPointerDown);
  link.addEventListener("pointermove", onPointerMove);
  link.addEventListener("pointerup", onPointerUp);
  link.addEventListener("pointercancel", onPointerCancel);
  link.addEventListener("dragstart", onDragStart);
  image.addEventListener("dragstart", onDragStart);
  link.addEventListener("click", onClick, true);
  link.addEventListener("keydown", onKeyDown);

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
  };
}
