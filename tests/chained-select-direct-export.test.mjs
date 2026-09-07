import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAINED_SELECT_MAX_IMAGES,
  CHAINED_SELECT_MAX_WORKS,
  canonicalChainedSelectWorks,
  chainedSelectLimit,
  resolveChainedSelectSelector,
  revalidateProjectChainedSelect
} from "../data/chained-select-direct-export.mjs";

const work = (id, artistName, year, title, images = 1) => Object.freeze({
  id, artistName, year, title,
  images: Object.freeze(Array.from({ length: images }, (_, order) => ({ id: `${id}-${order}`, order, uploadStatus: "ready" })))
});

test("Project membership is canonically grouped by artist, year, title, then stable id", () => {
  const source = [
    work("z", "Artist B", "2026", "Zulu"),
    work("d", "artist a", "", "Delta"),
    work("c", "Artist A", "2025", "Charlie"),
    work("b", "Artist A", "2026", "Bravo"),
    work("a", "Artist A", "2025", "Alpha"),
    work("e", "Artist C", "2026", "Echo")
  ];
  assert.deepEqual(canonicalChainedSelectWorks(source).map((entry) => entry.id), ["b", "a", "c", "d", "z", "e"]);
  assert.deepEqual(source.map((entry) => entry.id), ["z", "d", "c", "b", "a", "e"]);
});

test("SELECT deliberately ignores artist-profile curation positions", () => {
  const source = [
    { ...work("late-title", "Artist A", "2026", "Zulu"), profileOrder: 0 },
    { ...work("early-title", "Artist A", "2026", "Alpha"), profileOrder: 99 }
  ];
  assert.deepEqual(canonicalChainedSelectWorks(source).map((entry) => entry.id), ["early-title", "late-title"]);
});

test("direct Select limits reject Project sources without trimming them", () => {
  assert.equal(chainedSelectLimit(Array.from({ length: CHAINED_SELECT_MAX_WORKS + 1 }, (_, index) => work(String(index), "A", "2026", "W"))).valid, false);
  assert.equal(chainedSelectLimit([work("one", "A", "2026", "W", CHAINED_SELECT_MAX_IMAGES + 1)]).valid, false);
});

test("selector prefers the Project publisher and falls back only to one manageable Artist profile", () => {
  const project = { publisherProfileId: "publisher" };
  assert.equal(resolveChainedSelectSelector(project, [{ id: "publisher", displayName: "HOST" }], [{ id: "artist", name: "ARTIST" }]), "HOST");
  assert.equal(resolveChainedSelectSelector({}, [], [{ id: "artist", name: "ARTIST" }]), "ARTIST");
  assert.equal(resolveChainedSelectSelector({}, [], [{ id: "a", name: "A" }, { id: "b", name: "B" }]), null);
});

test("every direct export uses fresh public rows and blocks a changed Project instead of using stale media", async () => {
  const calls = [];
  const result = await revalidateProjectChainedSelect({
    repository: { async listArchivedSelectWorks(ids) { calls.push(ids); return [work("a", "Artist A", "2026", "Alpha")]; } },
    workIds: ["a", "missing"]
  });
  assert.deepEqual(calls, [["a", "missing"]]);
  assert.deepEqual(result.unavailableIds, ["missing"]);
  assert.deepEqual(result.works, []);
});
