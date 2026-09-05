import test from "node:test";
import assert from "node:assert/strict";

import { revalidateChainedSelectWorks } from "../data/chained-select-review.mjs";
import { chainedSelectLimit } from "../data/chained-select-state.mjs";

const work = (id, src = `https://public.example/${id}/large.webp`) => Object.freeze({
  id,
  title: id.toUpperCase(),
  images: Object.freeze([Object.freeze({ id: `${id}-image`, src })])
});

test("generation-time revalidation removes an unavailable selected Work and never returns its stale source", async () => {
  const initial = [work("a", "https://public.example/a/old-large.webp")];
  const calls = [];
  const result = await revalidateChainedSelectWorks({
    repository: { async listArchivedSelectWorks(ids) { calls.push(ids); return []; } },
    reviewWorks: initial,
    selectedIds: ["a"]
  });

  assert.deepEqual(calls, [["a"]]);
  assert.deepEqual(result.selectedIds, []);
  assert.deepEqual(result.unavailableIds, ["a"]);
  assert.deepEqual(result.works, []);
  assert.equal(chainedSelectLimit(result.works).valid, false);
  assert.equal(JSON.stringify(result).includes("old-large.webp"), false);
});

test("generation-time revalidation preserves selected order while replacing all source metadata with the fresh public projection", async () => {
  const initial = [work("a", "https://public.example/a/old-large.webp"), work("b"), work("c", "https://public.example/c/old-large.webp")];
  const calls = [];
  const repository = {
    async listArchivedSelectWorks(ids) {
      calls.push(ids);
      return [work("a", "https://public.example/a/new-large.webp"), work("c", "https://public.example/c/new-large.webp")];
    }
  };

  const first = await revalidateChainedSelectWorks({ repository, reviewWorks: initial, selectedIds: ["c", "b", "a"] });
  assert.deepEqual(first.unavailableIds, ["b"]);
  assert.deepEqual(first.selectedIds, ["c", "a"]);
  assert.deepEqual(first.works.map((entry) => entry.id), ["a", "c"]);
  assert.deepEqual(first.selectedIds.map((id) => first.works.find((entry) => entry.id === id).images[0].src), [
    "https://public.example/c/new-large.webp",
    "https://public.example/a/new-large.webp"
  ]);

  const second = await revalidateChainedSelectWorks({ repository, reviewWorks: first.works, selectedIds: first.selectedIds });
  assert.deepEqual(second.selectedIds, ["c", "a"]);
  assert.deepEqual(calls, [["c", "b", "a"], ["c", "a"]]);
});
