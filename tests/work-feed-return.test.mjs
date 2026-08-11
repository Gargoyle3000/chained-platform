import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeWorkFeedOrigin,
  rememberWorkFeedOrigin
} from "../data/work-feed-return.mjs";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}

test("a valid Discover origin is available once for its exact Work", () => {
  const storage = createStorage();
  rememberWorkFeedOrigin({
    origin: "discover",
    feedLocation: "https://chained.test/discover.html?restore=discover#works",
    workHref: "https://chained.test/artwork.html?id=work-1",
    storage
  });

  const origin = consumeWorkFeedOrigin({
    workId: "work-1",
    detailLocation: "https://chained.test/artwork.html?id=work-1",
    referrer: "https://chained.test/discover.html?restore=discover#works",
    storage
  });

  assert.equal(origin?.origin, "discover");
  assert.equal(origin?.feedLocation, "/discover.html?restore=discover#works");
  assert.equal(
    consumeWorkFeedOrigin({
      workId: "work-1",
      detailLocation: "https://chained.test/artwork.html?id=work-1",
      referrer: "https://chained.test/discover.html?restore=discover#works",
      storage
    }),
    null
  );
});

test("a Following origin rejects direct and mismatched Work views", () => {
  const storage = createStorage();
  rememberWorkFeedOrigin({
    origin: "following",
    feedLocation: "https://chained.test/following.html?restore=following",
    workHref: "https://chained.test/artwork.html?id=work-2",
    storage
  });

  assert.equal(
    consumeWorkFeedOrigin({
      workId: "work-3",
      detailLocation: "https://chained.test/artwork.html?id=work-3",
      referrer: "https://chained.test/following.html?restore=following",
      storage
    }),
    null
  );
  assert.equal(
    consumeWorkFeedOrigin({
      workId: "work-2",
      detailLocation: "https://chained.test/artwork.html?id=work-2",
      referrer: "",
      storage
    }),
    null
  );
});

test("an origin record requires the matching feed restoration route", () => {
  assert.equal(
    rememberWorkFeedOrigin({
      origin: "discover",
      feedLocation: "https://chained.test/discover.html",
      workHref: "https://chained.test/artwork.html?id=work-1",
      storage: createStorage()
    }),
    null
  );
});
