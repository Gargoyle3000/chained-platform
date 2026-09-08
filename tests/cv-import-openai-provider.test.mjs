import test from "node:test";
import assert from "node:assert/strict";
import {
  CV_IMPORT_MODEL,
  CvImportProviderError,
  extractCvCandidatesWithMetadata
} from "../scripts/cv-import-openai-provider.mjs";

const payload = {
  source: { documentKind: "text", pageCount: 1, extractedCharacterCount: 20 },
  candidates: [{
    candidateId: "candidate-1", categoryType: "education", yearLabel: "2024", title: "Example Academy",
    organization: null, locationText: null, url: null,
    source: { pageNumber: 1, sectionHeading: "EDUCATION", excerpt: "2024 Example Academy", sequence: 0 },
    confidence: "high", needsReview: false, duplicateState: "new", warnings: []
  }],
  warnings: []
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
  assert.equal(body.tools, undefined);
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
});

test("successful structured output reaches the existing CHAINED validator and returns safe usage metadata", async () => {
  const result = await extractCvCandidatesWithMetadata({ text: "Synthetic", apiKey: "test-key", fetchImpl: async () => response(completed()) });
  assert.equal(result.result.candidates[0].title, "Example Academy");
  assert.equal(result.metadata.inputTokens, 10);
  assert.equal(result.metadata.cachedInputTokens, 2);
  assert.equal(result.metadata.reasoningTokens, 1);
  assert.equal(result.metadata.store, false);
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
