import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CV_IMPORT_PDF_BYTES,
  CvImportExtractionError,
  createCvImportExtractionService,
  safeCvImportMessage,
  validateCvImportPdfFile
} from "../data/cv-import-extraction.mjs";
import { CV_IMPORT_REVIEW_FIXTURE } from "../data/cv-import-review-fixture.mjs";

function pdfFile(name = "cv.pdf", size = 100, type = "application/pdf") {
  return new File([new Uint8Array(size)], name, { type });
}

const providerResult = {
  source: { documentKind: "pdf", pageCount: 2, extractedCharacterCount: 100 },
  candidates: CV_IMPORT_REVIEW_FIXTURE.candidates.map((candidate, index) => ({
    ...candidate,
    source: { pageNumber: 1, sectionHeading: "CV", excerpt: candidate.title, sequence: index },
    confidence: "high",
    warnings: []
  })),
  warnings: [],
  unsupportedSections: CV_IMPORT_REVIEW_FIXTURE.unsupportedSections
};

test("client PDF validation accepts one bounded PDF and rejects invalid or oversized input", () => {
  assert.equal(validateCvImportPdfFile(pdfFile()).name, "cv.pdf");
  assert.throws(() => validateCvImportPdfFile(null), CvImportExtractionError);
  assert.throws(() => validateCvImportPdfFile(pdfFile("cv.txt", 100, "text/plain")), /invalid_pdf/);
  assert.throws(() => validateCvImportPdfFile(pdfFile("cv.pdf", MAX_CV_IMPORT_PDF_BYTES + 1)), /pdf_too_large/);
  assert.equal(safeCvImportMessage({ code: "pdf_too_large" }), "PDF MUST BE 20 MB OR SMALLER");
});

test("service sends one multipart PDF invocation and returns only normalized provider-independent data", async () => {
  const calls = [];
  const service = createCvImportExtractionService({
    invoke: async (...args) => {
      calls.push(args);
      return { data: providerResult, error: null };
    }
  });
  const result = await service.extract(pdfFile());

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "cv-import-extract");
  assert.equal(calls[0][1].body instanceof FormData, true);
  assert.equal(calls[0][1].body.get("pdf").name, "cv.pdf");
  assert.equal(result.candidates.length, CV_IMPORT_REVIEW_FIXTURE.candidates.length);
  assert.equal("provider" in result, false);
});

test("malformed backend output fails closed and backend errors remain safely categorized", async () => {
  const malformed = createCvImportExtractionService({ invoke: async () => ({ data: { raw: "private" }, error: null }) });
  await assert.rejects(() => malformed.extract(pdfFile()), /invalid_response/);

  const denied = createCvImportExtractionService({
    invoke: async () => ({ data: null, error: { context: { code: "cv_import_not_enabled", private: "hidden" } } })
  });
  await assert.rejects(
    () => denied.extract(pdfFile()),
    (error) => error.code === "cv_import_not_enabled" && !error.message.includes("hidden")
  );
});
