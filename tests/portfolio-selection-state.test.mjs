import assert from "node:assert/strict";
import test from "node:test";

import { createPortfolioSelectionState } from "../data/portfolio-selection-state.mjs";

test("portfolio selection supports selection, deselection, and manual ordering", () => {
  const state = createPortfolioSelectionState(["one", "two", "three"]);
  assert.equal(state.select("one"), true);
  assert.equal(state.select("three"), true);
  assert.equal(state.select("two"), true);
  assert.deepEqual(state.ids(), ["one", "three", "two"]);
  assert.equal(state.move("two", -1), true);
  assert.deepEqual(state.ids(), ["one", "two", "three"]);
  assert.equal(state.deselect("two"), true);
  assert.equal(state.select("two"), true);
  assert.deepEqual(state.ids(), ["one", "three", "two"]);
});

test("portfolio selection rejects unknown and duplicate Works and respects boundaries", () => {
  const state = createPortfolioSelectionState(Array.from({ length: 20 }, (_, index) => `work-${index + 1}`));
  Array.from({ length: 20 }, (_, index) => `work-${index + 1}`).forEach((id) => assert.equal(state.select(id), true));
  assert.equal(state.select("work-1"), false);
  assert.equal(state.select("missing"), false);
  assert.equal(state.move("work-1", -1), false);
  assert.equal(state.move("work-20", 1), false);
  assert.equal(state.ids().length, 20);
});
