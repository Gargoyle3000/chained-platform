import test from "node:test";
import assert from "node:assert/strict";
import { createDiscoverChannelState } from "../data/discover-channel-state.mjs";

test("Discover channel state starts in NOSY and switches without changing filter state", () => {
  const state = createDiscoverChannelState();
  assert.equal(state.current(), "nosy");
  assert.equal(state.select("curated"), "curated");
  assert.equal(state.select("nosy"), "nosy");
});

test("Discover channel state rejects unknown channels", () => {
  assert.throws(() => createDiscoverChannelState().select("unknown"), /INVALID DISCOVER CHANNEL/);
});
