import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import fontkitModule from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import {
  createCvExportSelectionState,
  cvExportFilename,
  cvExportSelectionSummary,
  renderCvPdf,
  selectedCvExportCategories,
  updateCvExportSelection
} from "../data/cv-export.mjs";

const categories = [
  {
    id: "education",
    label: "EDUCATION",
    entries: [
      { id: "public-entry", yearLabel: "2014–2018", line: "BA Fine Arts, AKV St. Joost", isVisible: true },
      { id: "hidden-entry", yearLabel: "2012–2013", line: "Prior Education Arts & Design, ArtEZ Arnhem", isVisible: false }
    ]
  },
  {
    id: "presentations",
    label: "GROUP EXHIBITIONS / PRESENTATIONS",
    entries: [
      { id: "automatic-entry", yearLabel: "2026", line: "Gothic Summer, Amsterdam", isVisible: true, sourceActivityId: "internal-only" }
    ]
  }
];

test("CV export starts from existing entry visibility and changes selection locally only", () => {
  const initial = createCvExportSelectionState(categories);
  assert.deepEqual(cvExportSelectionSummary(initial), { available: 3, selected: 2, excluded: 1 });
  assert.equal(initial.categories[0].entries[0].selected, true);
  assert.equal(initial.categories[0].entries[1].selected, false);

  const tailored = updateCvExportSelection(
    updateCvExportSelection(initial, "public-entry", false),
    "hidden-entry",
    true
  );
  assert.deepEqual(cvExportSelectionSummary(tailored), { available: 3, selected: 2, excluded: 1 });
  assert.equal(tailored.categories[0].entries[0].isVisible, true);
  assert.equal(tailored.categories[0].entries[1].isVisible, false);
  assert.equal(createCvExportSelectionState(categories).categories[0].entries[1].selected, false);
});

test("CV export count follows temporary selection and zero selected entries remain export-invalid", () => {
  const initial = createCvExportSelectionState(categories);
  const withHiddenEntry = updateCvExportSelection(initial, "hidden-entry", true);
  const noneSelected = ["public-entry", "automatic-entry", "hidden-entry"].reduce(
    (state, entryId) => updateCvExportSelection(state, entryId, false),
    withHiddenEntry
  );

  assert.deepEqual(cvExportSelectionSummary(withHiddenEntry), { available: 3, selected: 3, excluded: 0 });
  assert.deepEqual(cvExportSelectionSummary(noneSelected), { available: 3, selected: 0, excluded: 3 });
  assert.deepEqual(selectedCvExportCategories(noneSelected), []);
});

test("CV export model includes selected hidden entries, excludes unselected entries, and omits empty categories", () => {
  let state = createCvExportSelectionState(categories);
  state = updateCvExportSelection(state, "public-entry", false);
  state = updateCvExportSelection(state, "hidden-entry", true);
  state = updateCvExportSelection(state, "automatic-entry", false);
  assert.deepEqual(selectedCvExportCategories(state), [{
    label: "EDUCATION",
    entries: [{ yearLabel: "2012–2013", line: "Prior Education Arts & Design, ArtEZ Arnhem" }]
  }]);
});

test("CV export keeps no-year entries natural and never includes internal source metadata", () => {
  const state = createCvExportSelectionState([{ id: "award", label: "AWARDS", entries: [{
    id: "no-year", yearLabel: "", line: "Untitled award", isVisible: true, sourceActivityId: "must-not-export"
  }] }]);
  const model = selectedCvExportCategories(state);
  assert.deepEqual(model, [{ label: "AWARDS", entries: [{ yearLabel: "", line: "Untitled award" }] }]);
  assert.equal(JSON.stringify(model).includes("sourceActivityId"), false);
  assert.equal(JSON.stringify(model).includes("must-not-export"), false);
  assert.equal(cvExportFilename("Peer Vink"), "peer-vink-cv.pdf");
});

test("CV export keeps the supplied CV category and entry order regardless of entry origin", () => {
  const state = createCvExportSelectionState([
    { id: "manual", label: "EDUCATION", entries: [{ id: "manual-entry", yearLabel: "2010", line: "Manual entry", isVisible: true }] },
    { id: "imported", label: "SOLO EXHIBITIONS", entries: [{ id: "imported-entry", yearLabel: "2022", line: "Imported entry", isVisible: true, importMetadata: "never-export" }] },
    { id: "presentation", label: "GROUP EXHIBITIONS / PRESENTATIONS", entries: [{ id: "presentation-entry", yearLabel: "2026", line: "Presentation entry", isVisible: true, sourceActivityId: "activity-internal" }] }
  ]);

  assert.deepEqual(selectedCvExportCategories(state), [
    { label: "EDUCATION", entries: [{ yearLabel: "2010", line: "Manual entry" }] },
    { label: "SOLO EXHIBITIONS", entries: [{ yearLabel: "2022", line: "Imported entry" }] },
    { label: "GROUP EXHIBITIONS / PRESENTATIONS", entries: [{ yearLabel: "2026", line: "Presentation entry" }] }
  ]);
});

test("CV PDF is deterministic in structure, text-based, and flows a long CV across pages", async () => {
  const fontBytes = await readFile(new URL("../assets/fonts/CascadiaCode-Regular.ttf", import.meta.url));
  const longCategories = [{
    label: "GROUP EXHIBITIONS / PRESENTATIONS",
    entries: Array.from({ length: 110 }, (_, index) => ({
      yearLabel: index % 7 === 0 ? "" : String(2026 - (index % 20)),
      line: `Long CV entry ${index + 1} with enough descriptive context to wrap naturally across the fixed CV text column without clipping.`
    }))
  }];
  const output = await renderCvPdf({
    PDFLib: { PDFDocument, rgb },
    fontkit: fontkitModule.default || fontkitModule,
    fontBytes,
    artistName: "PEER VINK",
    categories: longCategories
  });
  const document = await PDFDocument.load(output.bytes);
  assert.ok(document.getPageCount() > 2);
  assert.equal(document.getPageCount(), output.pageCount);
  assert.ok(output.bytes.byteLength > 1000);
});

test("CV PDF keeps identity on page one and continues split categories without a running header", async () => {
  const source = await readFile(new URL("../data/cv-export.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(!continuation\) \{/);
  assert.match(source, /cursor = continuation \? top : top - 72/);
  assert.doesNotMatch(source, /continuation \? top - 16/);
  assert.match(source, /if \(cursor - categoryHeight < bottom\) startPage\(true\)/);
  assert.match(source, /if \(cursor - height < bottom\) startPage\(true\)/);
});

test("CV PDF generator rejects empty private/export-invalid input without a fallback", async () => {
  await assert.rejects(
    () => renderCvPdf({ artistName: "PEER VINK", categories: [] }),
    /PDF GENERATION IS UNAVAILABLE/
  );
});
