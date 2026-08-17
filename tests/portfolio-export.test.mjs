import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fontkitModule from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

import {
  createPortfolioPlan,
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
    (error) => error instanceof PortfolioExportError && error.message.includes("MAIL-FRIENDLY")
  );
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
