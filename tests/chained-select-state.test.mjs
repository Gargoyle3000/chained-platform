import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAINED_SELECT_MAX_IMAGES,
  CHAINED_SELECT_MAX_WORKS,
  chainedSelectLimit,
  createChainedSelectSession,
  createChainedSelectState,
  readChainedSelectSession,
  writeChainedSelectSession
} from "../data/chained-select-state.mjs";

test("CHAINED Select keeps source order ephemeral and never mutates the supplied source", () => {
  const source = ["one", "two", "three"];
  const state = createChainedSelectState(source);
  state.move("three", -1);
  state.deselect("two");
  assert.deepEqual(state.ids(), ["one", "three"]);
  assert.deepEqual(source, ["one", "two", "three"]);
});

test("CHAINED Select has explicit Work and image ceilings without truncation", () => {
  const works = Array.from({ length: CHAINED_SELECT_MAX_WORKS + 1 }, (_, index) => ({ id: String(index), images: [{ id: `image-${index}` }] }));
  assert.equal(chainedSelectLimit(works).valid, false);
  const atLimit = chainedSelectLimit(Array.from({ length: CHAINED_SELECT_MAX_WORKS }, (_, index) => ({ id: String(index), images: [{ id: `image-${index}-a` }, { id: `image-${index}-b` }] })));
  assert.equal(atLimit.imageCount, CHAINED_SELECT_MAX_IMAGES);
  assert.equal(atLimit.valid, true);
  assert.equal(chainedSelectLimit([{ id: "one", images: Array.from({ length: CHAINED_SELECT_MAX_IMAGES + 1 }, (_, index) => ({ id: String(index) })) }]).valid, false);
});

test("CHAINED Select session carries only public source identity, title, and source kind", () => {
  const records = new Map();
  const storage = { setItem: (key, value) => records.set(key, value), getItem: (key) => records.get(key) };
  assert.equal(writeChainedSelectSession(storage, { source: "project", title: "EXHIBITION", workIds: ["one", "two", "one"] }), true);
  assert.deepEqual(readChainedSelectSession(storage), { version: 1, source: "project", title: "EXHIBITION", workIds: ["one", "two"] });
  assert.equal(createChainedSelectSession({ source: "project", workIds: [] }), null);
  assert.equal(JSON.stringify(records).includes("private"), false);
});
