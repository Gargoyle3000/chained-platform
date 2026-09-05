import test from "node:test";
import assert from "node:assert/strict";
import {
  chainedSelectFilename,
  chainedSelectMetadataLines,
  createChainedSelectPlan,
  renderChainedSelectPdf
} from "../data/chained-select-export.mjs";
import { generateWithinBudget, PortfolioExportError } from "../data/portfolio-export.mjs";

const work = (id, artistName = "ARTIST") => ({
  id,
  title: `WORK ${id}`,
  year: "2026",
  artistName,
  format: "painting",
  materials: "Oil, canvas",
  artworkHref: `https://chained.work/artwork.html?id=${id}`,
  images: [
    { id: `${id}-a`, uploadStatus: "ready", order: 0, src: "https://public.example/large.webp" },
    { id: `${id}-b`, uploadStatus: "ready", order: 1, src: "https://public.example/large-b.webp" }
  ]
});

test("CHAINED Select preserves mixed-artist Work order and all public images", () => {
  const plan = createChainedSelectPlan([work("one", "ARTIST A"), work("two", "ARTIST B")]);
  assert.deepEqual(plan.works.map((entry) => entry.work.artistName), ["ARTIST A", "ARTIST B"]);
  assert.deepEqual(plan.imagePages.map((entry) => entry.reference), ["01A", "01B", "02A", "02B"]);
});

test("CHAINED Select metadata makes attribution mandatory and distinct from Work title", () => {
  const lines = chainedSelectMetadataLines(work("one", "ARTIST A"));
  assert.equal(lines[0], "ARTIST A");
  assert.equal(lines[1], "WORK one, 2026");
  assert.ok(lines.includes("https://chained.work/artwork.html?id=one"));
  assert.equal(lines.some((line) => /private|signed|object_path/i.test(line)), false);
});

test("CHAINED Select filenames have their own document identity", () => {
  assert.equal(chainedSelectFilename("Epoxy Research"), "epoxy-research.pdf");
  assert.equal(chainedSelectFilename(), "chained-select.pdf");
});

test("CHAINED Select uses Select-specific PDF budget failure copy", async () => {
  await assert.rejects(
    () => generateWithinBudget({
      failureSubject: "SELECT",
      targetBytes: 100,
      tiers: [{ id: "minimum" }],
      renderTier: async () => ({ bytes: new Uint8Array(101) })
    }),
    (error) => error instanceof PortfolioExportError && error.message === "THIS SELECT CANNOT MEET THE MAIL-FRIENDLY EXPORT LIMIT. REMOVE SOME IMAGES OR WORKS."
  );
});

test("CHAINED Select renders document provenance and artist attribution on every image page", async () => {
  const drawn = [];
  const page = () => ({ drawText: (value) => drawn.push(value), drawImage() {} });
  const pdf = {
    registerFontkit() {},
    embedFont: async () => ({ widthOfTextAtSize: (value) => value.length * 6 }),
    embedJpg: async () => ({ width: 100, height: 140 }),
    addPage: page,
    getPageCount: () => 3,
    save: async () => new Uint8Array([1])
  };
  await renderChainedSelectPdf({
    PDFLib: { PDFDocument: { create: async () => pdf }, rgb: () => ({}) },
    fontkit: {},
    fontBytes: new Uint8Array([1]),
    plan: createChainedSelectPlan([work("one", "ARTIST A")]),
    title: "RESEARCH",
    selectorName: "CURATOR",
    tier: { id: "test" },
    loadPreparedImage: async () => ({ mimeType: "image/jpeg", bytes: new Uint8Array([1]) })
  });
  assert.ok(drawn.includes("<CHAINED>"));
  assert.ok(drawn.includes("SELECT"));
  assert.ok(drawn.includes("SELECTED BY CURATOR"));
  assert.ok(drawn.includes("01A · ARTIST A"));
  assert.ok(drawn.includes("01B · ARTIST A"));
});
