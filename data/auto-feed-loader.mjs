export const AUTO_FEED_ROOT_MARGIN = "0px 0px 720px 0px";

export function createAutoFeedLoader({
  sentinel,
  loadNext,
  hasMore,
  onError = () => {},
  Observer = globalThis.IntersectionObserver,
  root = null,
  rootMargin = AUTO_FEED_ROOT_MARGIN
}) {
  let observer = null;
  let inFlight = false;
  let stopped = false;
  let failed = false;

  function stop() {
    stopped = true;
    observer?.disconnect();
    observer = null;
  }

  async function requestNext() {
    if (stopped || failed || inFlight) return false;
    if (!hasMore()) {
      stop();
      return false;
    }

    inFlight = true;
    try {
      await loadNext();
      if (!hasMore()) stop();
      return true;
    } catch (error) {
      failed = true;
      observer?.unobserve(sentinel);
      onError(error, retry);
      return false;
    } finally {
      inFlight = false;
    }
  }

  async function retry() {
    if (stopped || inFlight) return false;
    failed = false;
    observer?.observe(sentinel);
    return requestNext();
  }

  function start() {
    if (!Observer || stopped || observer) return false;
    observer = new Observer((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void requestNext();
    }, { root, rootMargin });
    observer.observe(sentinel);
    return true;
  }

  return Object.freeze({
    start,
    stop,
    retry,
    requestNext,
    isSupported: () => Boolean(Observer),
    isInFlight: () => inFlight
  });
}
