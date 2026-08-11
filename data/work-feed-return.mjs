const storageKey = "chained-work-feed-return";
const supportedOrigins = new Set(["discover", "following"]);

function readUrl(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export function rememberWorkFeedOrigin({ origin, feedLocation, workHref, storage }) {
  if (!supportedOrigins.has(origin) || !storage) return null;

  const feedUrl = readUrl(feedLocation);
  const workUrl = readUrl(workHref, feedUrl?.href);
  const workId = workUrl?.searchParams.get("id");

  if (!feedUrl || !workUrl || !workId || feedUrl.searchParams.get("restore") !== origin) {
    return null;
  }

  const record = {
    origin,
    workId,
    feedPathname: feedUrl.pathname,
    feedLocation: `${feedUrl.pathname}${feedUrl.search}${feedUrl.hash}`,
    detailPathname: workUrl.pathname
  };

  try {
    storage.setItem(storageKey, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export function consumeWorkFeedOrigin({ workId, detailLocation, referrer, storage }) {
  if (!storage) return null;

  let record;
  try {
    const rawRecord = storage.getItem(storageKey);
    storage.removeItem(storageKey);
    record = rawRecord ? JSON.parse(rawRecord) : null;
  } catch {
    return null;
  }

  if (!record || !supportedOrigins.has(record.origin) || record.workId !== workId) return null;

  const detailUrl = readUrl(detailLocation);
  const feedUrl = readUrl(record.feedLocation, detailUrl?.origin);
  const referrerUrl = readUrl(referrer);

  if (!detailUrl || !feedUrl || !referrerUrl) return null;
  if (
    detailUrl.pathname !== record.detailPathname ||
    feedUrl.origin !== detailUrl.origin ||
    referrerUrl.origin !== detailUrl.origin ||
    feedUrl.pathname !== record.feedPathname ||
    referrerUrl.pathname !== record.feedPathname ||
    feedUrl.searchParams.get("restore") !== record.origin ||
    referrerUrl.searchParams.get("restore") !== record.origin
  ) {
    return null;
  }

  return record;
}
