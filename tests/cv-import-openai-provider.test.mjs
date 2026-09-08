import test from "node:test";
import assert from "node:assert/strict";
import {
  CV_IMPORT_RESULT_SCHEMA,
  CV_IMPORT_MODEL,
  CV_IMPORT_MAX_REQUEST_TIMEOUT_MS,
  CV_IMPORT_TIMEOUT_MS,
  MAX_CV_PDF_BYTES,
  CvImportProviderError,
  extractCvCandidatesWithMetadata,
  validateCvPdfInput
} from "../scripts/cv-import-openai-provider.mjs";
import { CV_CATEGORY_TYPES, normalizeCvImportResult } from "../scripts/cv-import-prototype.mjs";
import { CV_IMPORT_RESULT_SCHEMA as SHARED_CV_IMPORT_RESULT_SCHEMA } from "../data/cv-import-contract.mjs";

const payload = {
  source: { documentKind: "text", pageCount: 1, extractedCharacterCount: 20 },
  candidates: [{
    candidateId: "candidate-1", categoryType: "education", yearLabel: "2024", title: "Example Academy",
    organization: null, locationText: null, url: null,
    source: { pageNumber: 1, sectionHeading: "EDUCATION", excerpt: "2024 Example Academy", sequence: 0 },
    confidence: "high", needsReview: false, duplicateState: "new", warnings: []
  }],
  warnings: [],
  unsupportedSections: []
};

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const completed = (text = JSON.stringify(payload)) => ({
  model: CV_IMPORT_MODEL, status: "completed", output_text: text,
  usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 2 }, output_tokens: 6, output_tokens_details: { reasoning_tokens: 1 }, total_tokens: 16 }
});

test("provider requests Responses structured output with mandatory privacy and model settings", async () => {
  let request;
  await extractCvCandidatesWithMetadata({
    text: "Synthetic CV only", apiKey: "test-key", fetchImpl: async (url, options) => {
      request = { url, options }; return response(completed());
    }
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(body.model, CV_IMPORT_MODEL);
  assert.equal(body.store, false);
  assert.equal(body.reasoning.effort, "low");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.deepEqual(body.text.format.schema.properties.candidates.items.properties.categoryType.enum, CV_CATEGORY_TYPES);
  assert.equal(body.text.format.schema.properties.candidates.items.properties.categoryType.enum.includes("publication"), false);
  assert.equal(body.text.format.schema.properties.candidates.items.properties.categoryType.enum.includes("other"), false);
  assert.deepEqual(body.text.format.schema.properties.unsupportedSections.items.properties.reason.enum, ["unsupported_category"]);
  assert.equal(body.tools, undefined);
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(body.text.format.schema, SHARED_CV_IMPORT_RESULT_SCHEMA);
});

test("strict provider schema and CHAINED validation require bounded unsupported review sections", () => {
  assert.equal(CV_IMPORT_RESULT_SCHEMA.required.includes("unsupportedSections"), true);
  assert.equal(CV_IMPORT_RESULT_SCHEMA.properties.unsupportedSections.maxItems, 50);
  const withPress = structuredClone(payload);
  withPress.unsupportedSections = [{ heading: "PRESS", reason: "unsupported_category", entryCount: 5 }];
  assert.equal(withPress.candidates.length, 1);
  assert.equal(normalizeCvImportResult(withPress).unsupportedSections[0].heading, "PRESS");
});

test("provider-side validation rejects legacy candidate destinations even when response JSON is well formed", async () => {
  const legacy = structuredClone(payload);
  legacy.candidates[0].categoryType = "publication";
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(completed(JSON.stringify(legacy))) }),
    (error) => error instanceof CvImportProviderError
      && error.failure?.phase === "chained_schema_validation"
      && error.failure?.code === "SCHEMA_INVALID"
  );
});

test("successful structured output reaches the existing CHAINED validator and returns safe usage metadata", async () => {
  const result = await extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(completed()) });
  assert.equal(result.result.candidates[0].title, "Example Academy");
  assert.equal(result.metadata.inputTokens, 10);
  assert.equal(result.metadata.cachedInputTokens, 2);
  assert.equal(result.metadata.reasoningTokens, 1);
  assert.equal(result.metadata.store, false);
  assert.equal(result.metadata.requestTimeoutMs, CV_IMPORT_TIMEOUT_MS);
});

test("request timeouts are bounded, configurable, and cleaned up after a successful request", async () => {
  const scheduled = [];
  const cleared = [];
  const result = await extractCvCandidatesWithMetadata({
    text: "Synthetic", apiKey: "test-key", requestTimeoutMs: CV_IMPORT_MAX_REQUEST_TIMEOUT_MS,
    setTimeoutImpl: (callback, delay) => { const timer = { callback, delay }; scheduled.push(timer); return timer; },
    clearTimeoutImpl: (timer) => cleared.push(timer),
    fetchImpl: async () => response(completed())
  });
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, CV_IMPORT_MAX_REQUEST_TIMEOUT_MS);
  assert.deepEqual(cleared, [scheduled[0]]);
  assert.equal(result.metadata.requestTimeoutMs, CV_IMPORT_MAX_REQUEST_TIMEOUT_MS);
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", requestTimeoutMs: CV_IMPORT_MAX_REQUEST_TIMEOUT_MS + 1, fetchImpl: async () => response(completed()) }),
    /timeout is invalid/
  );
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", requestTimeoutMs: 999, fetchImpl: async () => response(completed()) }),
    /timeout is invalid/
  );
});

test("timeout aborts with safe diagnostics and never includes request secrets", async () => {
  let timeoutCallback;
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({
      text: "Synthetic private CV content", apiKey: "test-secret-key", requestTimeoutMs: 1_000,
      setTimeoutImpl: (callback) => { timeoutCallback = callback; return "timer"; },
      clearTimeoutImpl: (timer) => assert.equal(timer, "timer"),
      fetchImpl: async (_url, options) => {
        timeoutCallback();
        assert.equal(options.signal.aborted, true);
        const error = new Error("test-secret-key Synthetic private CV content");
        error.name = "AbortError";
        throw error;
      }
    }),
    (error) => error.failure?.phase === "fetch_started"
      && error.failure?.category === "timeout"
      && error.failure?.code === "AbortError"
      && !JSON.stringify(error.failure).includes("test-secret-key")
      && !JSON.stringify(error.failure).includes("private CV")
  );
});

test("direct PDF mode uses inline input_file and never a Files API route", async () => {
  let request;
  const pdf = Buffer.from("%PDF-1.4 synthetic PDF");
  await extractCvCandidatesWithMetadata({
    pdfBytes: pdf, filename: "private-cv.pdf", source: { documentKind: "pdf", pageCount: 1, extractedCharacterCount: 0 },
    maxOutputTokens: 12_000,
    apiKey: "test-key", fetchImpl: async (url, options) => { request = { url, options }; return response(completed()); }
  });
  const body = JSON.parse(request.options.body);
  const content = body.input[0].content;
  const file = content.find((item) => item.type === "input_file");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(body.store, false);
  assert.equal(body.model, CV_IMPORT_MODEL);
  assert.equal(body.max_output_tokens, 12_000);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(file.filename, "private-cv.pdf");
  assert.equal(file.detail, "auto");
  assert.equal(file.file_data.startsWith("data:application/pdf;base64,"), true);
  assert.equal(Buffer.from(file.file_data.replace("data:application/pdf;base64,", ""), "base64").toString("ascii"), "%PDF-1.4 synthetic PDF");
});

test("missing, non-PDF, and oversized direct inputs reject before a provider call without data leakage", () => {
  assert.throws(() => validateCvPdfInput(undefined, "private-cv.pdf"), CvImportProviderError);
  assert.throws(() => validateCvPdfInput(Buffer.from("not a PDF"), "private-cv.pdf"), /PDF/);
  assert.throws(() => validateCvPdfInput(Buffer.alloc(MAX_CV_PDF_BYTES + 1, 0), "private-cv.pdf"), /size limit/);
  assert.throws(
    () => validateCvPdfInput(Buffer.from("not a PDF with private-base64-like-content"), "private-cv.pdf"),
    (error) => error instanceof CvImportProviderError && !error.message.includes("private-base64")
  );
});

test("incomplete responses reject partial output but retain only safe reason and usage diagnostics", async () => {
  const partial = JSON.stringify({ privatePdfData: "must-not-be-used" });
  const body = {
    model: CV_IMPORT_MODEL,
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output_text: partial,
    usage: { input_tokens: 111, input_tokens_details: { cached_tokens: 4 }, output_tokens: 4000, output_tokens_details: { reasoning_tokens: 900 }, total_tokens: 5011 }
  };
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(body) }),
    (error) => error instanceof CvImportProviderError
      && error.diagnostics.incompleteReason === "max_output_tokens"
      && error.diagnostics.maxOutputTokens === 4000
      && error.diagnostics.inputTokens === 111
      && error.diagnostics.totalTokens === 5011
      && !error.message.includes("privatePdfData")
      && !JSON.stringify(error.diagnostics).includes("privatePdfData")
  );
});

test("incomplete reasons remain distinguishable without accepting partial candidates", async () => {
  const body = { model: CV_IMPORT_MODEL, status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] };
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(body) }),
    (error) => error instanceof CvImportProviderError && error.diagnostics.incompleteReason === "content_filter"
  );
});

test("network and timeout failures retain safe phase diagnostics without raw errors", async () => {
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => { const error = new TypeError("private endpoint"); error.code = "UND_ERR_CONNECT_TIMEOUT"; throw error; } }),
    (error) => error.failure?.phase === "fetch_started" && error.failure?.category === "network" && error.failure?.code === "UND_ERR_CONNECT_TIMEOUT" && !JSON.stringify(error.failure).includes("private")
  );
  await assert.rejects(
    () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => { const error = new Error(); error.name = "AbortError"; throw error; } }),
    (error) => error.failure?.category === "timeout" && error.failure?.code === "AbortError"
  );
});

test("malformed, presentation-shaped, and incomplete outputs fail closed", async () => {
  await assert.rejects(() => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(completed("not-json")) }), CvImportProviderError);
  const unsafe = structuredClone(payload);
  unsafe.candidates[0].activityId = "forbidden";
  await assert.rejects(() => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(completed(JSON.stringify(unsafe))) }), /schema validation/);
  await assert.rejects(() => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response({ status: "incomplete", output: [] }) }), /incomplete/);
});

for (const status of [400, 401, 429, 500]) {
  test(`HTTP ${status} is safely handled without API-key leakage`, async () => {
    await assert.rejects(
      () => extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-secret-key", fetchImpl: async () => response({ error: { code: "safe_code", type: "safe_type", message: "test-secret-key" } }, status) }),
      (error) => error instanceof CvImportProviderError && error.status === status && !error.message.includes("test-secret-key")
    );
  });
}
