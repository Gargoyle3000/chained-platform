import test from "node:test";
import assert from "node:assert/strict";
import { generateProjectChainedSelect } from "../data/chained-select-direct-generator.mjs";

const work = (id, images = 1) => Object.freeze({
  id,
  artistName: "ARTIST",
  year: "2026",
  title: id,
  images: Object.freeze(Array.from({ length: images }, (_, order) => ({ id: `${id}-${order}`, order, src: `https://public.example/${id}-${order}.webp`, uploadStatus: "ready" })))
});

test("direct generator validates fresh public Project rows before loading PDF runtime or media", async () => {
  const stages = [];
  const result = await generateProjectChainedSelect({
    repository: { async listArchivedSelectWorks() { return []; } },
    project: { title: "PROJECT" },
    workIds: ["missing"],
    selectorName: "SELECTOR",
    setStatus: (stage) => stages.push(stage),
    environment: {}
  });
  assert.equal(result.status, "changed");
  assert.deepEqual(result.unavailableIds, ["missing"]);
  assert.deepEqual(stages, ["VALIDATING PUBLIC WORKS"]);
});

test("direct generator blocks an oversized fresh Project before fetching media", async () => {
  const result = await generateProjectChainedSelect({
    repository: { async listArchivedSelectWorks() { return Array.from({ length: 21 }, (_, index) => work(String(index))); } },
    project: { title: "PROJECT" },
    workIds: Array.from({ length: 21 }, (_, index) => String(index)),
    selectorName: "SELECTOR",
    environment: {}
  });
  assert.equal(result.status, "limit");
  assert.equal(result.limit.workCount, 21);
});

test("direct generator creates one browser-local download after the real status stages", async () => {
  const stages = [];
  const downloads = [];
  const page = () => ({ drawText() {}, drawImage() {} });
  const pdf = {
    registerFontkit() {},
    embedFont: async () => ({ widthOfTextAtSize: (value) => value.length * 6 }),
    embedJpg: async () => ({ width: 100, height: 140 }),
    addPage: page,
    getPageCount: () => 3,
    save: async () => new Uint8Array([1])
  };
  class TestImage {
    naturalWidth = 100;
    naturalHeight = 140;
    set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
  }
  const document = {
    body: { append(link) { downloads.push(link); } },
    createElement(tag) {
      if (tag === "a") return { click() {}, remove() {} };
      return { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob(callback) { callback(new Blob([new Uint8Array([1])], { type: "image/jpeg" })); } };
    }
  };
  const result = await generateProjectChainedSelect({
    repository: { async listArchivedSelectWorks() { return [work("one")]; } },
    project: { title: "PROJECT" },
    workIds: ["one"],
    selectorName: "SELECTOR",
    setStatus: (stage) => stages.push(stage),
    environment: {
      PDFLib: { PDFDocument: { create: async () => pdf }, rgb: () => ({}) },
      fontkit: {},
      fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1), blob: async () => new Blob([new Uint8Array([1])], { type: "image/webp" }) }),
      document,
      URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
      Image: TestImage,
      setTimeout(callback) { callback(); }
    }
  });
  assert.equal(result.status, "ready");
  assert.equal(downloads.length, 1);
  assert.deepEqual(stages, ["VALIDATING PUBLIC WORKS", "PREPARING 1 WORK / 1 IMAGE", "FETCHING PUBLIC IMAGES", "GENERATING PDF", "READY · DOWNLOAD COMPLETE"]);
});
