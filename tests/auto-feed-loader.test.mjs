import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_FEED_ROOT_MARGIN,
  createAutoFeedLoader
} from "../data/auto-feed-loader.mjs";

function createObserverHarness() {
  const instances = [];
  class Observer {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = new Set();
      instances.push(this);
    }

    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
    disconnect() { this.observed.clear(); }
    emit(target, isIntersecting = true) { this.callback([{ target, isIntersecting }]); }
  }
  return { Observer, instances };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

test("an intersecting sentinel loads only one continuation while a request is in flight", async () => {
  const { Observer, instances } = createObserverHarness();
  const sentinel = {};
  let resolvePage;
  let calls = 0;
  const loader = createAutoFeedLoader({
    sentinel,
    Observer,
    hasMore: () => true,
    loadNext: () => {
      calls += 1;
      return new Promise((resolve) => { resolvePage = resolve; });
    }
  });

  assert.equal(loader.start(), true);
  assert.equal(instances[0].options.rootMargin, AUTO_FEED_ROOT_MARGIN);
  instances[0].emit(sentinel);
  instances[0].emit(sentinel);
  assert.equal(calls, 1);
  resolvePage();
  await settle();
  assert.equal(loader.isInFlight(), false);
});

test("the loader stops permanently after its final page", async () => {
  const { Observer, instances } = createObserverHarness();
  const sentinel = {};
  let hasMore = true;
  let calls = 0;
  const loader = createAutoFeedLoader({
    sentinel,
    Observer,
    hasMore: () => hasMore,
    loadNext: async () => {
      calls += 1;
      hasMore = false;
    }
  });

  loader.start();
  instances[0].emit(sentinel);
  await settle();
  instances[0].emit(sentinel);
  await settle();
  assert.equal(calls, 1);
  assert.equal(instances[0].observed.size, 0);
});

test("a later-page failure pauses observation and exposes one coherent retry", async () => {
  const { Observer, instances } = createObserverHarness();
  const sentinel = {};
  let attempts = 0;
  let retry;
  const loader = createAutoFeedLoader({
    sentinel,
    Observer,
    hasMore: () => attempts < 2,
    loadNext: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
    },
    onError: (_error, retryLoad) => { retry = retryLoad; }
  });

  loader.start();
  instances[0].emit(sentinel);
  await settle();
  assert.equal(attempts, 1);
  assert.equal(instances[0].observed.size, 0);
  await retry();
  assert.equal(attempts, 2);
});

test("unsupported observers leave the caller to its restrained manual fallback", () => {
  const loader = createAutoFeedLoader({
    sentinel: {},
    Observer: null,
    hasMore: () => true,
    loadNext: async () => {}
  });
  assert.equal(loader.start(), false);
  assert.equal(loader.isSupported(), false);
});
