(function (root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (!root) return;

  root.ChainedScrollIndicators = api;

  const installPageIndicator = () => api.attachPageIndicator(root.document);

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", installPageIndicator, {
      once: true
    });
  } else {
    installPageIndicator();
  }
}(typeof window === "undefined" ? null : window, function (root) {
  "use strict";

  const MINIMUM_THUMB_SIZE = 18;

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

  function documentMetrics(document) {
    const rootElement = document.documentElement;
    const body = document.body;

    return {
      clientSize: rootElement.clientHeight,
      scrollSize: Math.max(
        rootElement.scrollHeight,
        body?.scrollHeight || 0
      ),
      scrollPosition: root?.scrollY || rootElement.scrollTop || 0
    };
  }

  function attachPageIndicator(document) {
    if (!document?.body || document.documentElement.dataset.chainedPageIndicator) {
      return null;
    }

    const visual = createIndicator(document, "chained-page-scroll-indicator");
    const rootElement = document.documentElement;

    rootElement.dataset.chainedPageIndicator = "true";
    rootElement.classList.add("chained-page-scrollbar");
    document.body.append(visual.indicator);

    function update() {
      const metrics = documentMetrics(document);
      const geometry = calculateIndicatorGeometry(metrics);

      visual.indicator.hidden = !geometry.scrollable;
      if (!geometry.scrollable) return;

      visual.indicator.style.height = `${metrics.clientSize}px`;
      visual.thumb.style.height = `${geometry.thumbSize}px`;
      visual.thumb.style.transform = `translateY(${geometry.offset}px)`;
    }

    const cleanupObservers = observeUpdates(
      [document.body, rootElement],
      update
    );
    const onResize = () => update();

    root?.addEventListener("scroll", update, { passive: true });
    root?.addEventListener("resize", onResize, { passive: true });
    update();

    return {
      update,
      destroy() {
        root?.removeEventListener("scroll", update);
        root?.removeEventListener("resize", onResize);
        cleanupObservers();
        visual.indicator.remove();
        delete rootElement.dataset.chainedPageIndicator;
        rootElement.classList.remove("chained-page-scrollbar");
      }
    };
  }

  return Object.freeze({
    attachPageIndicator,
    attachScrollIndicator,
    calculateIndicatorGeometry
  });
}));
