import test from "node:test";
import assert from "node:assert/strict";
import { BROWSER_DOWNLOAD_REVOKE_DELAY_MS, downloadBlob } from "../data/browser-download.mjs";

function browserHarness() {
  const events = [];
  const timers = [];
  const body = {
    children: [],
    append(node) { this.children.push(node); events.push("append"); },
    remove(node) { this.children = this.children.filter((child) => child !== node); }
  };
  const documentRef = {
    body,
    createElement() {
      const node = {
        click() { events.push("click"); assert.equal(body.children.includes(node), true); },
        remove() { body.remove(node); events.push("remove"); }
      };
      return node;
    }
  };
  const urlApi = {
    createObjectURL(blob) { events.push(["create", blob]); return "blob:portfolio"; },
    revokeObjectURL(url) { events.push(["revoke", url]); }
  };
  const setTimeoutFn = (callback, delay) => { timers.push({ callback, delay }); };
  return { events, timers, body, documentRef, urlApi, setTimeoutFn };
}

test("downloadBlob creates a PDF download with the expected anchor lifecycle", () => {
  const harness = browserHarness();
  downloadBlob(new Uint8Array([1, 2, 3]), {
    filename: "artist-portfolio.pdf",
    documentRef: harness.documentRef,
    urlApi: harness.urlApi,
    setTimeoutFn: harness.setTimeoutFn
  });
  const blob = harness.events.find((event) => Array.isArray(event) && event[0] === "create")[1];
  assert.equal(blob.type, "application/pdf");
  assert.deepEqual(harness.events.slice(0, 4).map((event) => Array.isArray(event) ? event[0] : event), ["create", "append", "click", "remove"]);
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, BROWSER_DOWNLOAD_REVOKE_DELAY_MS);
  assert.equal(harness.events.some((event) => Array.isArray(event) && event[0] === "revoke"), false);
  harness.timers[0].callback();
  assert.deepEqual(harness.events.at(-1), ["revoke", "blob:portfolio"]);
});

test("downloadBlob rejects empty or invalid data before creating a URL", () => {
  const harness = browserHarness();
  assert.throws(() => downloadBlob(new Uint8Array(), { filename: "empty.pdf", ...harness }), /non-empty/);
  assert.throws(() => downloadBlob(null, { filename: "invalid.pdf", ...harness }), /non-empty/);
  assert.equal(harness.events.length, 0);
});

test("downloadBlob preserves the requested filename and clicks once", () => {
  const harness = browserHarness();
  let clicks = 0;
  const originalCreate = harness.documentRef.createElement;
  harness.documentRef.createElement = () => {
    const node = originalCreate();
    node.click = () => { clicks += 1; assert.equal(node.download, "safe-name.pdf"); };
    return node;
  };
  downloadBlob([9], { filename: "safe-name.pdf", ...harness });
  assert.equal(clicks, 1);
});
