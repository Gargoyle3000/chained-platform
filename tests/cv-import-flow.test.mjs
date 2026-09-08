import test from "node:test";
import assert from "node:assert/strict";
import { createCvImportFlow } from "../data/cv-import-flow.mjs";

function harness({ fail = false } = {}) {
  const events = [];
  let calls = 0;
  const flow = createCvImportFlow({
    openPicker: () => events.push("picker"),
    validate: (file) => {
      if (file.invalid) throw new Error("invalid");
    },
    extract: async (file) => {
      calls += 1;
      if (fail) throw new Error("backend");
      return { candidates: file.candidates ?? [] };
    },
    onInvalid: () => events.push("invalid"),
    onProcessing: () => events.push("processing"),
    onSuccess: (result) => events.push(`success:${result.candidates.length}`),
    onFailure: () => events.push("failure")
  });
  return { flow, events, calls: () => calls };
}

test("IMPORT requests native selection while picker cancellation leaves state untouched", async () => {
  const { flow, events, calls } = harness();
  assert.equal(flow.requestSelection(), true);
  assert.equal(await flow.acceptSelection(null), false);
  assert.deepEqual(events, ["picker"]);
  assert.equal(calls(), 0);
});

test("invalid selection never enters processing or invokes extraction", async () => {
  const { flow, events, calls } = harness();
  assert.equal(await flow.acceptSelection({ invalid: true }), false);
  assert.deepEqual(events, ["invalid"]);
  assert.equal(calls(), 0);
});

test("valid PDF enters processing once and sends a long result to same-page success", async () => {
  const { flow, events, calls } = harness();
  assert.equal(await flow.acceptSelection({ candidates: Array.from({ length: 125 }) }), true);
  assert.deepEqual(events, ["processing", "success:125"]);
  assert.equal(calls(), 1);
});

test("backend failure is single-shot and retry only opens a new picker", async () => {
  const { flow, events, calls } = harness({ fail: true });
  await flow.acceptSelection({});
  assert.deepEqual(events, ["processing", "failure"]);
  assert.equal(calls(), 1);
  flow.requestSelection();
  assert.deepEqual(events, ["processing", "failure", "picker"]);
  assert.equal(calls(), 1);
});

test("concurrent actions cannot create a second extraction request", async () => {
  let release;
  let calls = 0;
  const flow = createCvImportFlow({
    openPicker: () => {}, validate: () => {},
    extract: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return {}; },
    onInvalid: () => {}, onProcessing: () => {}, onSuccess: () => {}, onFailure: () => {}
  });
  const running = flow.acceptSelection({});
  assert.equal(flow.requestSelection(), false);
  assert.equal(await flow.acceptSelection({}), false);
  release();
  await running;
  assert.equal(calls, 1);
});
