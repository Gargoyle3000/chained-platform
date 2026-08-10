import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { calculateIndicatorGeometry } = require("../scroll-indicators.js");

test("a non-scrollable container hides its indicator", () => {
  assert.deepEqual(calculateIndicatorGeometry({
    clientSize: 120,
    scrollSize: 120,
    scrollPosition: 0
  }), {
    scrollable: false,
    thumbSize: 0,
    offset: 0
  });
});

test("a scrollable container receives a proportional indicator", () => {
  const geometry = calculateIndicatorGeometry({
    clientSize: 100,
    scrollSize: 400,
    scrollPosition: 0
  });

  assert.equal(geometry.scrollable, true);
  assert.equal(geometry.thumbSize, 25);
  assert.equal(geometry.offset, 0);
});

test("the indicator reaches the bottom at maximum scroll", () => {
  const geometry = calculateIndicatorGeometry({
    clientSize: 100,
    scrollSize: 400,
    scrollPosition: 300
  });

  assert.equal(geometry.offset, 75);
});

test("content-size updates recalculate indicator geometry independently", () => {
  const first = calculateIndicatorGeometry({
    clientSize: 120,
    scrollSize: 360,
    scrollPosition: 120
  });
  const second = calculateIndicatorGeometry({
    clientSize: 120,
    scrollSize: 600,
    scrollPosition: 120
  });

  assert.notEqual(first.thumbSize, second.thumbSize);
  assert.notEqual(first.offset, second.offset);
});
