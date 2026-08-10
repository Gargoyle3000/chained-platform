import test from "node:test";
import assert from "node:assert/strict";

import { createDiscoverArchiveState } from "../data/discover-archive-state.mjs";

const IDS = Object.freeze({
  saved: "11111111-1111-4111-8111-111111111111",
  unsaved: "22222222-2222-4222-8222-222222222222"
});

function repository(failures = {}) {
  const calls = [];
  return {
    calls,
    async saveWork(workId) {
      calls.push({ saveWork: workId });
      if (failures.save) throw new Error("ARCHIVE IS CURRENTLY UNAVAILABLE");
    },
    async removeWork(workId) {
      calls.push({ removeWork: workId });
      if (failures.remove) throw new Error("ARCHIVE IS CURRENTLY UNAVAILABLE");
    }
  };
}

test("Discover Archive state starts from one loaded ID set", () => {
  const state = createDiscoverArchiveState(repository(), [IDS.saved]);
  assert.equal(state.isSaved(IDS.saved), true);
  assert.equal(state.isSaved(IDS.unsaved), false);
});

test("saving updates the local Discover state only after success", async () => {
  const api = repository();
  const state = createDiscoverArchiveState(api);
  assert.equal(await state.toggle(IDS.unsaved), true);
  assert.equal(state.isSaved(IDS.unsaved), true);
  assert.deepEqual(api.calls, [{ saveWork: IDS.unsaved }]);
});

test("pending saves do not change local Discover state early", async () => {
  let resolveSave;
  const api = {
    saveWork() {
      return new Promise((resolve) => { resolveSave = resolve; });
    },
    async removeWork() {}
  };
  const state = createDiscoverArchiveState(api);
  const pending = state.toggle(IDS.unsaved);
  assert.equal(state.isSaved(IDS.unsaved), false);
  resolveSave();
  await pending;
  assert.equal(state.isSaved(IDS.unsaved), true);
});

test("removing restores the unsaved Discover state", async () => {
  const api = repository();
  const state = createDiscoverArchiveState(api, [IDS.saved]);
  assert.equal(await state.toggle(IDS.saved), false);
  assert.equal(state.isSaved(IDS.saved), false);
  assert.deepEqual(api.calls, [{ removeWork: IDS.saved }]);
});

test("failed Archive mutations leave Discover state unchanged", async () => {
  const save = createDiscoverArchiveState(repository({ save: true }));
  const remove = createDiscoverArchiveState(repository({ remove: true }), [IDS.saved]);
  await assert.rejects(() => save.toggle(IDS.unsaved), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  await assert.rejects(() => remove.toggle(IDS.saved), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  assert.equal(save.isSaved(IDS.unsaved), false);
  assert.equal(remove.isSaved(IDS.saved), true);
});
