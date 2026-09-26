(function (root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (!root) return;

  root.ChainedScrollIndicators = api;
}(typeof window === "undefined" ? null : window, function (root) {
  "use strict";

  const MINIMUM_THUMB_SIZE = 18;
  const PAGE_HIDE_DELAY = 700;
  const MOBILE_PAGE_QUERY = "(max-width: 700px) and (pointer: coarse)";

  function calculateIndicatorGeometry({
    clientSize,
    scrollSize,
    scrollPosition,
    minimumThumbSize = MINIMUM_THUMB_SIZE
  }) {
    const viewport = Math.max(0, Number(clientSize) || 0);
    const content = Math.max(0, Number(scrollSize) || 0);
    const maximumScroll = Math.max(0, content - viewport);

    if (viewport === 0 || maximumScroll <= 1) {
      return {
        scrollable: false,
        thumbSize: 0,
        offset: 0
      };
    }

    const thumbSize = Math.min(
      viewport,
      Math.max(
        Math.min(minimumThumbSize, viewport),
        Math.round((viewport * viewport) / content)
      )
    );
    const travel = Math.max(0, viewport - thumbSize);
    const progress = Math.min(
      1,
      Math.max(0, (Number(scrollPosition) || 0) / maximumScroll)
    );

    return {
      scrollable: true,
      thumbSize,
      offset: Math.round(travel * progress)
    };
  }

  function createIndicator(document, className) {
    const indicator = document.createElement("span");
    const thumb = document.createElement("span");

    indicator.className = className;
    indicator.hidden = true;
    indicator.setAttribute("aria-hidden", "true");
    thumb.className = `${className}-thumb`;
    indicator.append(thumb);

    return { indicator, thumb };
  }

  function observeUpdates(targets, update) {
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(update)
      : null;
    const mutationObserver = typeof MutationObserver === "function"
      ? new MutationObserver(update)
      : null;

    targets.forEach((target) => resizeObserver?.observe(target));
    mutationObserver?.observe(targets[0], {
      childList: true,
      subtree: true
    });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }

  function attachScrollIndicator(scrollElement, options = {}) {
    if (!scrollElement || scrollElement.dataset.chainedScrollIndicator) {
      return null;
    }

    const host = options.host || scrollElement.parentElement;
    if (!host) return null;

    const visual = options.indicator && options.thumb
      ? { indicator: options.indicator, thumb: options.thumb }
      : createIndicator(scrollElement.ownerDocument, "chained-scroll-indicator");

    if (!visual.indicator.parentElement) host.append(visual.indicator);

    scrollElement.dataset.chainedScrollIndicator = "true";
    scrollElement.classList.add("chained-scrollable");
    host.classList.add("chained-scroll-indicator-host");

    function update() {
      const geometry = calculateIndicatorGeometry({
        clientSize: scrollElement.clientHeight,
        scrollSize: scrollElement.scrollHeight,
        scrollPosition: scrollElement.scrollTop
      });

      visual.indicator.hidden = !geometry.scrollable;
      if (!geometry.scrollable) return;

      visual.indicator.style.top = `${scrollElement.offsetTop}px`;
      visual.indicator.style.height = `${scrollElement.clientHeight}px`;
      visual.thumb.style.height = `${geometry.thumbSize}px`;
      visual.thumb.style.transform = `translateY(${geometry.offset}px)`;
    }

    const cleanupObservers = observeUpdates([host, scrollElement], update);
    const onResize = () => update();

    scrollElement.addEventListener("scroll", update, { passive: true });
    root?.addEventListener("resize", onResize, { passive: true });
    update();

    return {
      update,
      destroy() {
        scrollElement.removeEventListener("scroll", update);
        root?.removeEventListener("resize", onResize);
        cleanupObservers();
        visual.indicator.remove();
        delete scrollElement.dataset.chainedScrollIndicator;
        scrollElement.classList.remove("chained-scrollable");
        host.classList.remove("chained-scroll-indicator-host");
      }
    };
  }

  function attachPageIndicator(document) {
    if (!root || !document?.body || !root.matchMedia) return null;

    const media = root.matchMedia(MOBILE_PAGE_QUERY);
    const { indicator } = createIndicator(document, "chained-page-scroll-indicator");
    const page = document.documentElement;
    const viewport = root.visualViewport;
    let cleanupObservers = () => {};
    let frame = 0;
    let hideTimer = 0;

    document.body.append(indicator);

    function update() {
      frame = 0;
      const scroller = document.scrollingElement || page;
      const viewportHeight = page.clientHeight;
      const geometry = calculateIndicatorGeometry({
        clientSize: viewportHeight,
        scrollSize: Math.max(scroller.scrollHeight, document.body.scrollHeight),
        scrollPosition: scroller.scrollTop
      });

      indicator.hidden = !geometry.scrollable;
      if (!geometry.scrollable) {
        indicator.classList.remove("is-visible");
        root.clearTimeout(hideTimer);
        return;
      }

      indicator.style.height = `${geometry.thumbSize}px`;
      indicator.style.transform = `translateY(${geometry.offset}px)`;
    }

    function scheduleUpdate() {
      if (!frame) frame = root.requestAnimationFrame(update);
    }

    function onScroll() {
      scheduleUpdate();
      indicator.classList.add("is-visible");
      root.clearTimeout(hideTimer);
      hideTimer = root.setTimeout(() => {
        indicator.classList.remove("is-visible");
      }, PAGE_HIDE_DELAY);
    }

    function enable() {
      page.classList.add("chained-mobile-page-scrollbar");
      root.addEventListener("scroll", onScroll, { passive: true });
      root.addEventListener("resize", scheduleUpdate, { passive: true });
      viewport?.addEventListener("resize", scheduleUpdate, { passive: true });
      viewport?.addEventListener("scroll", scheduleUpdate, { passive: true });
      cleanupObservers = observeUpdates([page, document.body], scheduleUpdate);
      scheduleUpdate();
    }

    function disable() {
      page.classList.remove("chained-mobile-page-scrollbar");
      indicator.hidden = true;
      indicator.classList.remove("is-visible");
      root.clearTimeout(hideTimer);
      if (frame) root.cancelAnimationFrame(frame);
      frame = 0;
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("scroll", scheduleUpdate);
      cleanupObservers();
      cleanupObservers = () => {};
    }

    function sync() {
      if (media.matches) enable();
      else disable();
    }

    if (media.addEventListener) media.addEventListener("change", sync);
    else media.addListener?.(sync);
    sync();

    return {
      update: scheduleUpdate,
      destroy() {
        if (media.removeEventListener) media.removeEventListener("change", sync);
        else media.removeListener?.(sync);
        disable();
        indicator.remove();
      }
    };
  }

  if (root?.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => {
        attachPageIndicator(root.document);
      }, { once: true });
    } else {
      attachPageIndicator(root.document);
    }
  }

  return Object.freeze({
    attachScrollIndicator,
    attachPageIndicator,
    calculateIndicatorGeometry
  });
}));
