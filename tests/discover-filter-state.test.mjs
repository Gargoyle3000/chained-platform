import test from "node:test";
import assert from "node:assert/strict";

import {
  createDiscoverFilterState,
  createDiscoverRequestGate
} from "../data/discover-filter-state.mjs";

test("Discover filter state starts inactive and keeps canonical option order", () => {
  const state = createDiscoverFilterState();
  assert.equal(state.hasSelection(), false);
  state.toggle("sculpture");
  state.toggle("painting");
  assert.equal(state.hasSelection(), true);
  assert.deepEqual(state.selected(), ["painting", "sculpture"]);
});

test("Discover filter selection can deselect and clear without persistence", () => {
  const state = createDiscoverFilterState(["painting", "sculpture"]);
  assert.deepEqual(state.toggle("painting"), ["sculpture"]);
  assert.deepEqual(state.clear(), []);
  assert.equal(state.hasSelection(), false);
});

test("Discover filter state rejects invalid values instead of using them", () => {
  const state = createDiscoverFilterState();
  assert.throws(() => state.toggle("PAINTING"), /INVALID FORMAT DISCIPLINE/);
  assert.deepEqual(state.selected(), []);
});

test("a newer Discover filter request prevents an older unfiltered request from rendering", () => {
  const gate = createDiscoverRequestGate();
  const unfilteredRequest = gate.next();
  const filteredRequest = gate.next();

  assert.equal(gate.isCurrent(unfilteredRequest), false);
  assert.equal(gate.isCurrent(filteredRequest), true);
});
