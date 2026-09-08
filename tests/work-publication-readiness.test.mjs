import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPublicationReadinessWatcher,
  PUBLICATION_LONG_PROCESSING_INTERVAL_MS,
  publicationReadinessUiState,
  PUBLICATION_READINESS_BOUND_MS,
  PUBLICATION_READINESS_INTERVAL_MS,
  workOperationFailureUiState
} from "../data/work-publication-readiness.mjs";

function harness(states, { intervalMs = 50, boundMs = 100, longIntervalMs = 150 } = {}) {
  let time = 0;
  const timers = [];
  const cleared = [];
  const observed = [];
  let reads = 0;
  const watcher = createPublicationReadinessWatcher({
    read: async () => states[Math.min(reads++, states.length - 1)],
    onState: (state) => observed.push(state),
    now: () => time,
    intervalMs,
    boundMs,
    longIntervalMs,
    setTimer(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) { cleared.push(timer); }
  });
  return {
    watcher,
    observed,
    timers,
    cleared,
    reads: () => reads,
    async runNext() {
      const timer = timers.shift();
      assert.ok(timer);
      time += timer.delay;
      timer.callback();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

test("processing readiness polls once at a time and stops when ready", async () => {
  const session = harness([{ state: "processing" }, { state: "ready" }]);
  await session.watcher.start("work-a");
  assert.equal(session.timers.length, 1);
  await session.runNext();
  assert.deepEqual(session.observed.map(({ state }) => state), ["processing", "ready"]);
  assert.equal(session.reads(), 2);
  assert.equal(session.watcher.isActive(), false);
  assert.equal(session.timers.length, 0);
});

test("terminal failure stops polling immediately", async () => {
  const session = harness([{ state: "failed" }]);
  await session.watcher.start("work-a");
  assert.equal(session.reads(), 1);
  assert.equal(session.watcher.isActive(), false);
  assert.equal(session.timers.length, 0);
});

test("long processing stays active at a lower cadence until a later ready result", async () => {
  const session = harness([
    { state: "processing" },
    { state: "processing" },
    { state: "processing" },
    { state: "ready" }
  ]);
  await session.watcher.start("work-a");
  await session.runNext();
  await session.runNext();
  assert.equal(session.reads(), 3);
  assert.equal(session.observed.at(-1).state, "processing");
  assert.equal(session.observed.at(-1).longProcessing, true);
  assert.equal(session.watcher.isActive(), true);
  assert.equal(session.timers.at(-1).delay, 150);
  await session.runNext();
  assert.equal(session.observed.at(-1).state, "ready");
  assert.equal(session.watcher.isActive(), false);
});

test("manual readiness checks replace the scheduled long poll without creating overlap", async () => {
  const session = harness([
    { state: "processing" },
    { state: "processing" },
    { state: "processing" }
  ]);
  await session.watcher.start("work-a");
  await session.runNext();
  await session.runNext();
  const scheduledLongPoll = session.timers.at(-1);
  await session.watcher.checkNow();
  assert.equal(session.reads(), 4);
  assert.equal(session.cleared.includes(scheduledLongPoll), true);
  assert.equal(session.observed.at(-1).longProcessing, true);
  assert.equal(session.watcher.isActive(), true);
  assert.equal(session.timers.at(-1).delay, 150);
});

test("dispose clears the one scheduled timer", async () => {
  const session = harness([{ state: "processing" }]);
  await session.watcher.start("work-a");
  const scheduled = session.timers[0];
  session.watcher.dispose();
  assert.deepEqual(session.cleared, [scheduled]);
  assert.equal(session.watcher.isActive(), false);
});

test("work changes never overlap requests or apply stale readiness", async () => {
  let resolveFirst;
  let active = 0;
  let peak = 0;
  const reads = [];
  const observed = [];
  const watcher = createPublicationReadinessWatcher({
    read: async (workId) => {
      reads.push(workId);
      active += 1;
      peak = Math.max(peak, active);
      if (workId === "work-a") await new Promise((resolve) => { resolveFirst = resolve; });
      active -= 1;
      return { state: "ready", workId };
    },
    onState: (state) => observed.push(state),
    setTimer: () => 1,
    clearTimer: () => {}
  });
  const first = watcher.start("work-a");
  await Promise.resolve();
  await watcher.start("work-b");
  assert.deepEqual(reads, ["work-a"]);
  resolveFirst();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reads, ["work-a", "work-b"]);
  assert.equal(peak, 1);
  assert.deepEqual(observed.map(({ workId }) => workId), ["work-b"]);
});

test("readiness UI states control Publish with truthful stage copy", () => {
  assert.deepEqual(publicationReadinessUiState({ state: "processing" }), {
    message: "WORK SAVED\nPREPARING IMAGES FOR PUBLISH\nYOU CAN LEAVE THIS PAGE — PROCESSING WILL CONTINUE",
    isError: false,
    publishEnabled: false,
    showCheckAgain: false
  });
  assert.deepEqual(publicationReadinessUiState({ state: "processing", longProcessing: true }), {
    message: "WORK SAVED\nIMAGES ARE TAKING LONGER TO PREPARE\nYOU CAN LEAVE THIS PAGE AND RETURN LATER",
    isError: false,
    publishEnabled: false,
    showCheckAgain: true
  });
  assert.deepEqual(publicationReadinessUiState({ state: "ready" }), {
    message: "READY TO PUBLISH", isError: false, publishEnabled: true, showCheckAgain: false
  });
  assert.deepEqual(publicationReadinessUiState({ state: "failed" }), {
    message: "IMAGE PROCESSING FAILED", isError: true, publishEnabled: false, showCheckAgain: false
  });
  assert.deepEqual(publicationReadinessUiState({ state: "prerequisite_invalid" }, "ONE COVER IMAGE IS REQUIRED"), {
    message: "ONE COVER IMAGE IS REQUIRED", isError: true, publishEnabled: false, showCheckAgain: false
  });
});

test("SAVE DRAFT readiness sequence visibly progresses from processing to ready", async () => {
  const session = harness([{ state: "processing" }, { state: "ready" }]);
  await session.watcher.start("saved-draft-work");
  assert.deepEqual(
    publicationReadinessUiState(session.observed.at(-1)),
    {
      message: "WORK SAVED\nPREPARING IMAGES FOR PUBLISH\nYOU CAN LEAVE THIS PAGE — PROCESSING WILL CONTINUE",
      isError: false,
      publishEnabled: false,
      showCheckAgain: false
    }
  );
  await session.runNext();
  assert.deepEqual(
    publicationReadinessUiState(session.observed.at(-1)),
    { message: "READY TO PUBLISH", isError: false, publishEnabled: true, showCheckAgain: false }
  );
  assert.equal(session.watcher.isActive(), false);
});

test("reopening a saved draft presents every authoritative readiness outcome", async () => {
  const cases = [
    ["processing", "WORK SAVED\nPREPARING IMAGES FOR PUBLISH\nYOU CAN LEAVE THIS PAGE — PROCESSING WILL CONTINUE", false, true],
    ["ready", "READY TO PUBLISH", true, false],
    ["failed", "IMAGE PROCESSING FAILED", false, false]
  ];
  for (const [state, message, publishEnabled, staysActive] of cases) {
    const session = harness([{ state }]);
    await session.watcher.start(`reopened-draft-${state}`);
    assert.deepEqual(publicationReadinessUiState(session.observed.at(-1)), {
      message, isError: state === "failed", publishEnabled, showCheckAgain: false
    });
    assert.equal(session.watcher.isActive(), staysActive);
  }
});

test("save and Publish failures remain semantically separate", () => {
  assert.equal(workOperationFailureUiState({ phase: "saving", metadataPersisted: false, error: new Error("raw") }).message, "WORK COULD NOT BE SAVED");
  assert.deepEqual(workOperationFailureUiState({ phase: "publishing", metadataPersisted: true, error: { code: "media_processing" } }), {
    message: "WORK SAVED\nPREPARING IMAGES FOR PUBLISH\nYOU CAN LEAVE THIS PAGE — PROCESSING WILL CONTINUE",
    isError: false,
    restartReadiness: true
  });
  assert.equal(workOperationFailureUiState({ phase: "publishing", metadataPersisted: true, error: new Error("raw") }).message, "WORK COULD NOT BE PUBLISHED");
  assert.equal(workOperationFailureUiState({ phase: "uploading", metadataPersisted: true, error: new Error("raw") }).message, "WORK SAVED · IMAGE UPLOAD FAILED");
});

test("editor copy and boundaries distinguish save, processing, publication, and teardown", async () => {
  const source = await readFile(new URL("../dashboard-form.js", import.meta.url), "utf8");
  const readinessSource = await readFile(new URL("../data/work-publication-readiness.mjs", import.meta.url), "utf8");
  const editorMarkup = await readFile(new URL("../dashboard-work-edit.html", import.meta.url), "utf8");
  const editorStyles = await readFile(new URL("../dashboard-form.css", import.meta.url), "utf8");
  assert.match(source, /showFormStatus\("SAVING WORK"\)/);
  assert.match(source, /showFormStatus\("CHECKING IMAGE PROCESSING"\)/);
  assert.match(source, /showFormStatus\("DRAFT SAVED"\);\s*phase = "readiness";\s*await refreshPublicationReadiness\(\);/s);
  assert.match(source, /await populateForm\(work\);\s*if \(!currentWorkPublished\) await refreshPublicationReadiness\(\);/s);
  assert.doesNotMatch(source, /announceReadiness|refreshPublicationReadiness\(\{\s*announce:\s*false\s*\}\)/);
  assert.match(readinessSource, /PREPARING IMAGES FOR PUBLISH/);
  assert.match(readinessSource, /IMAGES ARE TAKING LONGER TO PREPARE/);
  assert.match(readinessSource, /YOU CAN LEAVE THIS PAGE AND RETURN LATER/);
  assert.match(readinessSource, /READY TO PUBLISH/);
  assert.match(readinessSource, /IMAGE PROCESSING FAILED/);
  assert.match(readinessSource, /WORK COULD NOT BE PUBLISHED/);
  assert.match(readinessSource, /WORK COULD NOT BE SAVED/);
  assert.match(readinessSource, /WORK_ERROR_CODES\.MEDIA_PROCESSING/);
  assert.match(source, /\["unknown", "checking", "processing", "failed"\]\.includes\(managedPublicationState\)/);
  assert.match(source, /readinessWatcher\.dispose\(\)/);
  assert.match(source, /readinessWatcher\.checkNow\(\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(source, /window\.addEventListener\("focus", refreshReadinessAfterReturn\)/);
  assert.match(source, /#work-readiness-check/);
  assert.match(editorMarkup, /id="work-readiness-check"/);
  assert.match(editorMarkup, /\[ CHECK AGAIN \]/);
  assert.match(editorStyles, /\.work-form-publish:disabled\s*\{[^}]*opacity:\s*0\.45/s);
  assert.match(editorStyles, /\.work-readiness-check:disabled\s*\{[^}]*cursor:\s*wait/s);
  assert.equal(PUBLICATION_READINESS_INTERVAL_MS, 5_000);
  assert.equal(PUBLICATION_READINESS_BOUND_MS, 120_000);
  assert.equal(PUBLICATION_LONG_PROCESSING_INTERVAL_MS, 15_000);
});
