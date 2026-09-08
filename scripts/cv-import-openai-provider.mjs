import { CV_CATEGORY_TYPES, normalizeCvImportResult } from "./cv-import-prototype.mjs";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const CV_IMPORT_MODEL = "gpt-5.6-luna";
export const CV_IMPORT_TIMEOUT_MS = 45_000;

export class CvImportProviderError extends Error {
  constructor(message, { status = null, code = null, type = null } = {}) {
    super(message);
    this.name = "CvImportProviderError";
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

const nullableString = (maxLength) => ({ type: ["string", "null"], maxLength });
const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pageNumber", "sectionHeading", "excerpt", "sequence"],
  properties: {
    pageNumber: { type: ["integer", "null"], minimum: 1 },
    sectionHeading: { type: "string", minLength: 1 },
    excerpt: { type: "string", minLength: 1 },
    sequence: { type: "integer", minimum: 0 }
  }
};

export const CV_IMPORT_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["source", "candidates", "warnings"],
  properties: {
    source: {
      type: "object",
      additionalProperties: false,
      required: ["documentKind", "pageCount", "extractedCharacterCount"],
      properties: {
        documentKind: { type: "string", enum: ["pdf", "text"] },
        pageCount: { type: "integer", minimum: 0 },
        extractedCharacterCount: { type: "integer", minimum: 0 }
      }
    },
    candidates: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId", "categoryType", "yearLabel", "title", "organization",
          "locationText", "url", "source", "confidence", "needsReview",
          "duplicateState", "warnings"
        ],
        properties: {
          candidateId: { type: "string", minLength: 1 },
          categoryType: { type: "string", enum: CV_CATEGORY_TYPES },
          yearLabel: nullableString(40),
          title: { type: "string", minLength: 1, maxLength: 300 },
          organization: nullableString(300),
          locationText: nullableString(300),
          url: nullableString(2_000),
          source: sourceSchema,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          needsReview: { type: "boolean" },
          duplicateState: { type: "string", enum: ["new", "possible", "duplicate"] },
          warnings: { type: "array", items: { type: "string" } }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
};

const INSTRUCTIONS = [
  "Translate the supplied CV text into CHAINED manual CV candidates only.",
  "Preserve source wording, names, punctuation, and year/period text.",
  "Do not embellish, infer missing venue/city/country, rewrite institutions, or fabricate facts.",
  "Use only the supplied category enum. If an entry is ambiguous, retain it only when supported by source text and set needsReview true.",
  "Confidence describes extraction confidence only. Include concise source provenance for human review.",
  "Never create Presentations, activities, IDs, database relationships, or sourceActivityId values. Output the schema only."
].join(" ");

function safeApiError(status, body) {
  const error = body && typeof body === "object" ? body.error : null;
  const code = typeof error?.code === "string" ? error.code : null;
  const type = typeof error?.type === "string" ? error.type : null;
  const suffix = [code, type].filter(Boolean).join(", ");
  return new CvImportProviderError(
    `OpenAI CV extraction request failed (HTTP ${status}${suffix ? `; ${suffix}` : ""})`,
    { status, code, type }
  );
}

function responseText(body) {
  if (body?.status !== "completed") {
    if (body?.status === "incomplete") throw new CvImportProviderError("OpenAI CV extraction response was incomplete");
    const refused = body?.output?.some((item) => item?.content?.some((content) => content?.type === "refusal"));
    if (refused) throw new CvImportProviderError("OpenAI CV extraction was refused");
    throw new CvImportProviderError("OpenAI CV extraction did not complete");
  }
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text;
  for (const item of body.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text;
    }
  }
  throw new CvImportProviderError("OpenAI CV extraction returned no structured output");
}

function usageMetadata(body, latencyMs, httpStatus) {
  const usage = body?.usage || {};
  return {
    requestedModel: CV_IMPORT_MODEL,
    returnedModel: typeof body?.model === "string" ? body.model : null,
    httpStatus,
    responseStatus: typeof body?.status === "string" ? body.status : null,
    latencyMs,
    inputTokens: usage.input_tokens ?? null,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    store: false
  };
}

export function createCvImportRequest({ text, source }) {
  if (typeof text !== "string" || text.trim() === "") throw new CvImportProviderError("CV text is required");
  const documentSource = source || { documentKind: "text", pageCount: 1, extractedCharacterCount: text.length };
  return {
    model: CV_IMPORT_MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: 4_000,
    instructions: INSTRUCTIONS,
    input: `DOCUMENT SOURCE: ${JSON.stringify(documentSource)}\n\nCV TEXT:\n${text}`,
    text: {
      format: {
        type: "json_schema",
        name: "chained_cv_import_result",
        strict: true,
        schema: CV_IMPORT_RESULT_SCHEMA
      }
    }
  };
}

export async function extractCvCandidatesWithMetadata({
  text,
  source = undefined,
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = globalThis.fetch,
  endpoint = OPENAI_RESPONSES_ENDPOINT,
  timeoutMs = CV_IMPORT_TIMEOUT_MS
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") throw new CvImportProviderError("OpenAI API key is unavailable");
  if (typeof fetchImpl !== "function") throw new CvImportProviderError("Fetch is unavailable for OpenAI CV extraction");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(createCvImportRequest({ text, source })),
        signal: controller.signal
      });
    }
    catch (error) {
      const message = error?.name === "AbortError" ? "OpenAI CV extraction timed out" : "OpenAI CV extraction network request failed";
      throw new CvImportProviderError(message);
    }
    let body;
    try { body = await response.json(); }
    catch { throw new CvImportProviderError(`OpenAI CV extraction returned invalid JSON (HTTP ${response.status})`, { status: response.status }); }
    if (!response.ok) throw safeApiError(response.status, body);
    let payload;
    try { payload = JSON.parse(responseText(body)); }
    catch (error) {
      if (error instanceof CvImportProviderError) throw error;
      throw new CvImportProviderError("OpenAI CV extraction structured output was invalid JSON");
    }
    let result;
    try { result = normalizeCvImportResult(payload); }
    catch { throw new CvImportProviderError("OpenAI CV extraction failed CHAINED schema validation"); }
    return { result, metadata: usageMetadata(body, Math.round(performance.now() - startedAt), response.status) };
  }
  finally {
    clearTimeout(timer);
  }
}

export async function extractCvCandidates(input) {
  return (await extractCvCandidatesWithMetadata(input)).result;
}
