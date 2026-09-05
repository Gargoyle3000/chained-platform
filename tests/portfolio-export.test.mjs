import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fontkitModule from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import {
  createPortfolioPlan,
  createPortfolioSourceCache,
  fitIntoBox,
  generateWithinBudget,
  portfolioFilename,
  portfolioMaterials,
  portfolioMetadataLines,
  PortfolioExportError,
  renderPortfolioPdf
} from "../data/portfolio-export.mjs";

const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gL+V4p8NwAAAABJRU5ErkJggg==",
  "base64"
));

function work(id, images = 1, overrides = {}) {
  return {
    id,
    title: `WORK ${id}`,
    year: "2026",
    format: "painting",
    materials: "OIL, CANVAS",
    height: "100",
    width: "80",
    dimensionUnit: "cm",
    images: Array.from({ length: images }, (_, index) => ({
      id: `${id}-${index}`,
      order: index,
      uploadStatus: "ready",
      mimeType: "image/png"
    })),
    ...overrides
  };
}

test("portfolio plan keeps selected Work order and assigns multi-image references", () => {
  const plan = createPortfolioPlan([work("one", 2), work("two", 1)]);
  assert.deepEqual(plan.works.map((entry) => entry.number), ["01", "02"]);
  assert.deepEqual(plan.imagePages.map((entry) => entry.reference), ["01A", "01B", "02"]);
});

test("metadata uses only supported Work fields and omits empty fields", () => {
  const lines = portfolioMetadataLines(work("one", 1, {
    duration: "12:00",
    edition: "3 + 1 AP",
    collaboratorName: "COLLABORATOR",
    photoCreditName: "PHOTOGRAPHER",
    description: "A restrained description."
  }));
  assert.deepEqual(lines, [
    "WORK one, 2026",
    "PAINTING",
    "OIL, CANVAS",
    "100 × 80 CM",
    "DURATION: 12:00",
    "EDITION: 3 + 1 AP",
    "COLLABORATOR: COLLABORATOR",
    "PHOTO CREDIT: PHOTOGRAPHER",
    "A restrained description."
  ]);
});

test("portfolio metadata renders one normalized MATERIALS list", () => {
  assert.equal(
    portfolioMaterials({ materials: "Oil, canvas, OIL, Canvas, studs" }),
    "Oil, canvas, studs"
  );
});

test("fitting preserves aspect ratio and never upscales", () => {
  assert.deepEqual(fitIntoBox(3000, 1000, 500, 700), { width: 500, height: 166.66666666666666, scale: 1 / 6 });
  assert.deepEqual(fitIntoBox(100, 100, 500, 700), { width: 100, height: 100, scale: 1 });
});

test("portfolio filenames remain artist-oriented and safe", () => {
  assert.equal(portfolioFilename("Peer Vink"), "peer-vink-visual-portfolio.pdf");
  assert.equal(portfolioFilename("Peer Vink", "Visual Documentation Stokroos"), "visual-documentation-stokroos.pdf");
});

test("size budgeting retries a bounded set of compression tiers", async () => {
  const attempts = [];
  const result = await generateWithinBudget({
    targetBytes: 100,
    tiers: [{ id: "standard" }, { id: "compact" }, { id: "minimum" }],
    renderTier: async (tier) => {
      attempts.push(tier.id);
      return { bytes: new Uint8Array(tier.id === "compact" ? 90 : 150) };
    }
  });
  assert.deepEqual(attempts, ["standard", "compact"]);
  assert.equal(result.tier.id, "compact");
  await assert.rejects(
    () => generateWithinBudget({
      targetBytes: 100,
      tiers: [{ id: "minimum" }],
      renderTier: async () => ({ bytes: new Uint8Array(101) })
    }),
    (error) => error instanceof PortfolioExportError && error.message === "THIS PORTFOLIO CANNOT MEET THE MAIL-FRIENDLY EXPORT LIMIT. REMOVE SOME IMAGES OR WORKS."
  );
});

test("export-scoped sources are fetched once across compression retries and released afterward", async () => {
  const images = [{ id: "one" }, { id: "two" }];
  const acquired = [];
  const cache = createPortfolioSourceCache(async (requested) => {
    acquired.push(...requested.map((image) => image.id));
    return requested.map((image) => ({ imageId: image.id, blob: new Blob([image.id], { type: "image/png" }) }));
  });
  await cache.preload([...images, images[0]]);
  await cache.get(images[0]);
  await cache.get(images[1]);
  await cache.get(images[0]);
  assert.deepEqual(acquired, ["one", "two"]);
  await cache.clear();
  await assert.rejects(() => cache.get(images[0]), PortfolioExportError);
});

test("every export sweeps expired foreign spill records before a memory-only preload", async () => {
  const now = 10_000;
  const stale = { sessionId: "old", imageId: "stale", createdAt: now - (60 * 60 * 1000) - 1, blob: new Blob(["stale"]) };
  const fresh = { sessionId: "other", imageId: "fresh", createdAt: now - 1, blob: new Blob(["fresh"]) };
  const records = new Map([["old/stale", stale], ["other/fresh", fresh]]);
  let prepareCalls = 0;
  let putCalls = 0;
  const sourceStore = {
    async prepare() {
      prepareCalls += 1;
      for (const [key, record] of records) {
        if (record.createdAt < now - (60 * 60 * 1000)) records.delete(key);
      }
    },
    async put() { putCalls += 1; },
    async get() { return null; },
    async clear() { records.delete("current/image"); }
  };
  const cache = createPortfolioSourceCache(
    async ([image]) => [{ imageId: image.id, blob: new Blob(["memory"]) }],
    { maxBytes: 256, maxSourceBytes: 50, sourceStoreFactory: () => sourceStore }
  );

  await cache.prepare();
  await cache.preload([{ id: "memory" }]);
  assert.equal(prepareCalls, 1);
  assert.equal(records.has("old/stale"), false);
  assert.equal(records.has("other/fresh"), true);
  assert.equal(putCalls, 0);
  assert.equal((await cache.get({ id: "memory" })).size, 6);
  await cache.clear();
});

test("housekeeping failure is non-fatal for memory-only export but required spill failure remains fatal", async () => {
  const sourceStore = {
    async prepare() { throw new Error("housekeeping unavailable"); },
    async put() { throw new Error("spill unavailable"); },
    async get() { return null; },
    async clear() {}
  };
  const memoryCache = createPortfolioSourceCache(
    async ([image]) => [{ imageId: image.id, blob: new Blob(["memory"]) }],
    { maxBytes: 256, maxSourceBytes: 50, sourceStoreFactory: () => sourceStore }
  );
  await memoryCache.prepare();
  assert.equal((await memoryCache.get({ id: "memory" })).size, 6);
  await memoryCache.clear();

  const spillCache = createPortfolioSourceCache(
    async ([image]) => [{ imageId: image.id, blob: new Blob(["spill"]) }],
    { maxBytes: 50, maxSourceBytes: 50, sourceStoreFactory: () => sourceStore }
  );
  await spillCache.prepare();
  await assert.rejects(() => spillCache.preload([{ id: "spill" }]), PortfolioExportError);
  await spillCache.clear();
});

test("overflow sources are acquired once, spill outside RAM, and survive every adaptive tier locally", async () => {
  const images = [{ id: "one" }, { id: "two" }, { id: "three" }];
  const acquired = [];
  const stored = new Map();
  const storeCalls = { put: [], get: [], clear: 0 };
  const sourceStore = {
    async put(imageId, blob) { storeCalls.put.push(imageId); stored.set(imageId, blob); },
    async get(imageId) { storeCalls.get.push(imageId); return stored.get(imageId) || null; },
    async clear() { storeCalls.clear += 1; stored.clear(); }
  };
  const cache = createPortfolioSourceCache(
    async (requested) => {
      acquired.push(...requested.map((image) => image.id));
      return requested.map((image) => ({ imageId: image.id, blob: new Blob([new Uint8Array(4)]) }));
    },
    { maxBytes: 12, maxSourceBytes: 4, sourceStoreFactory: () => sourceStore }
  );

  await cache.preload(images);
  for (const tier of ["standard", "compact", "compressed", "minimum"]) {
    for (const image of images) {
      const blob = await cache.get(image);
      assert.equal(blob.size, 4, tier);
    }
  }

  assert.deepEqual(acquired, ["one", "two", "three"]);
  assert.deepEqual(storeCalls.put, ["three"]);
  assert.deepEqual(storeCalls.get, ["three", "three", "three", "three"]);
  await cache.clear();
  assert.equal(storeCalls.clear, 1);
  assert.equal(stored.size, 0);
});

test("export source cleanup releases spilled bytes after acquisition failure", async () => {
  const stored = new Map();
  let clearCalls = 0;
  const cache = createPortfolioSourceCache(
    async ([image]) => {
      if (image.id === "three") throw new Error("download failed");
      return [{ imageId: image.id, blob: new Blob([new Uint8Array(4)]) }];
    },
    {
      maxBytes: 8,
      maxSourceBytes: 4,
      sourceStoreFactory: () => ({
        async put(imageId, blob) { stored.set(imageId, blob); },
        async get(imageId) { return stored.get(imageId) || null; },
        async clear() { clearCalls += 1; stored.clear(); }
      })
    }
  );
  try {
    await assert.rejects(() => cache.preload([{ id: "one" }, { id: "two" }, { id: "three" }]), /download failed/);
  } finally {
    await cache.clear();
  }
  assert.equal(clearCalls, 1);
  assert.equal(stored.size, 0);
});

test("export source cache rejects partial acquisition rather than omitting an image", async () => {
  const cache = createPortfolioSourceCache(async () => [{ imageId: "one", blob: new Blob(["one"]) }]);
  await assert.rejects(() => cache.preload([{ id: "one" }, { id: "two" }]), PortfolioExportError);
  await cache.clear();
});

test("a real A4 portfolio PDF has title, image, and final index pages", async () => {
  const fontBytes = await readFile(new URL("../assets/fonts/CascadiaCode-Regular.ttf", import.meta.url));
  const plan = createPortfolioPlan([work("one", 2), work("two", 1)]);
  const output = await renderPortfolioPdf({
    PDFLib: { PDFDocument, rgb },
    fontkit: fontkitModule.default || fontkitModule,
    fontBytes,
    plan,
    artistName: "PEER VINK",
    documentTitle: "VISUAL DOCUMENTATION",
    includeTitlePage: true,
    tier: { id: "test" },
    loadPreparedImage: async () => ({ mimeType: "image/png", bytes: PNG })
  });
  const document = await PDFDocument.load(output.bytes);
  assert.equal(document.getPageCount(), 5);
  assert.ok(output.bytes.byteLength < 1024 * 1024);
});

test("a 20-Work portfolio preserves numbering and continues its metadata index", async () => {
  const fontBytes = await readFile(new URL("../assets/fonts/CascadiaCode-Regular.ttf", import.meta.url));
  const plan = createPortfolioPlan(Array.from({ length: 20 }, (_, index) => work(String(index + 1), 1, {
    description: "Documentation notes for this Work remain readable in the final index."
  })));
  const output = await renderPortfolioPdf({
    PDFLib: { PDFDocument, rgb },
    fontkit: fontkitModule.default || fontkitModule,
    fontBytes,
    plan,
    artistName: "PEER VINK",
    documentTitle: "",
    includeTitlePage: false,
    tier: { id: "test" },
    loadPreparedImage: async () => ({ mimeType: "image/png", bytes: PNG })
  });
  const document = await PDFDocument.load(output.bytes);
  assert.equal(plan.imagePages.at(-1).reference, "20");
  assert.ok(document.getPageCount() > 21);
  assert.ok(output.bytes.byteLength < 1024 * 1024);
});
