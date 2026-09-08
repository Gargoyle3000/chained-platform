import { CV_CATEGORY_TYPES, normalizeCvImportResult } from "./cv-import-prototype.mjs";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const CV_IMPORT_MODEL = "gpt-5.6-luna";
export const CV_IMPORT_TIMEOUT_MS = 45_000;
export const MAX_CV_PDF_BYTES = 20 * 1024 * 1024;
export const CV_IMPORT_DEFAULT_MAX_OUTPUT_TOKENS = 4_000;

export class CvImportProviderError extends Error {
  constructor(message, { status = null, code = null, type = null, diagnostics = null, failure = null } = {}) {
    super(message);
    this.name = "CvImportProviderError";
    this.status = status;
    this.code = code;
    this.type = type;
    this.diagnostics = diagnostics;
    this.failure = failure;
  }
}

const SAFE_NETWORK_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);
function failure(phase, category, code = null) { return { phase, category, code: SAFE_NETWORK_CODES.has(code) || code === "AbortError" || code === "TypeError" || code === "HTTP_ERROR" || code === "INVALID_JSON" || code === "SCHEMA_INVALID" ? code : "UNKNOWN" }; }

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
  "Translate the supplied CV content into CHAINED manual CV candidates only.",
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

function safeIncompleteReason(body) {
  const reason = body?.incomplete_details?.reason;
  return typeof reason === "string" && /^[a-z_]+$/.test(reason) ? reason : "unknown";
}

function responseText(body, metadata) {
  if (body?.status !== "completed") {
    if (body?.status === "incomplete") {
      const incompleteReason = safeIncompleteReason(body);
      throw new CvImportProviderError(
        `OpenAI CV extraction response was incomplete (${incompleteReason})`,
        { status: metadata.httpStatus, diagnostics: { ...metadata, incompleteReason } }
      );
    }
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

function usageMetadata(body, latencyMs, httpStatus, maxOutputTokens) {
  const usage = body?.usage || {};
  return {
    requestedModel: CV_IMPORT_MODEL,
    maxOutputTokens,
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

export function validateCvPdfInput(pdfBytes, filename) {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.byteLength === 0) throw new CvImportProviderError("A non-empty PDF input is required");
  if (pdfBytes.byteLength > MAX_CV_PDF_BYTES) throw new CvImportProviderError("PDF input exceeds the local prototype size limit");
  if (!/^%PDF-/.test(Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii"))) throw new CvImportProviderError("CV input must be a PDF");
  if (typeof filename !== "string" || !/\.pdf$/i.test(filename)) throw new CvImportProviderError("CV PDF filename is required");
}

export function createCvImportRequest({
  text = undefined,
  source = undefined,
  pdfBytes = undefined,
  filename = undefined,
  maxOutputTokens = CV_IMPORT_DEFAULT_MAX_OUTPUT_TOKENS
} = {}) {
  const hasText = typeof text === "string" && text.trim() !== "";
  const hasPdf = pdfBytes !== undefined;
  if (hasText === hasPdf) throw new CvImportProviderError("Provide exactly one CV text or PDF input");
  if (hasPdf) validateCvPdfInput(pdfBytes, filename);
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 12_000) {
    throw new CvImportProviderError("CV extraction output token limit is invalid");
  }
  const documentSource = source || (hasPdf
    ? { documentKind: "pdf", pageCount: 0, extractedCharacterCount: 0 }
    : { documentKind: "text", pageCount: 1, extractedCharacterCount: text.length });
  const input = hasPdf
    ? [{
      role: "user",
      content: [
        { type: "input_text", text: `DOCUMENT SOURCE: ${JSON.stringify(documentSource)}` },
        {
          type: "input_file",
          filename,
          file_data: `data:application/pdf;base64,${Buffer.from(pdfBytes).toString("base64")}`,
          detail: "auto"
        }
      ]
    }]
    : `DOCUMENT SOURCE: ${JSON.stringify(documentSource)}\n\nCV TEXT:\n${text}`;
  return {
    model: CV_IMPORT_MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: maxOutputTokens,
    instructions: INSTRUCTIONS,
    input,
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
  pdfBytes = undefined,
  filename = undefined,
  maxOutputTokens = CV_IMPORT_DEFAULT_MAX_OUTPUT_TOKENS,
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = globalThis.fetch,
  endpoint = OPENAI_RESPONSES_ENDPOINT,
  timeoutMs = CV_IMPORT_TIMEOUT_MS
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") throw new CvImportProviderError("OpenAI API key is unavailable", { failure: failure("credential_retrieval", "credential") });
  if (typeof fetchImpl !== "function") throw new CvImportProviderError("Fetch is unavailable for OpenAI CV extraction", { failure: failure("fetch_started", "network") });
  let request;
  try { request = createCvImportRequest({ text, source, pdfBytes, filename, maxOutputTokens }); }
  catch (error) { throw new CvImportProviderError("OpenAI CV request construction failed", { failure: failure("request_construction", "file") }); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal
      });
    }
    catch (error) {
      const timedOut = error?.name === "AbortError";
      throw new CvImportProviderError(timedOut ? "OpenAI CV extraction timed out" : "OpenAI CV extraction network request failed", { failure: failure("fetch_started", timedOut ? "timeout" : "network", timedOut ? "AbortError" : error?.code || error?.name) });
    }
    let body;
    try { body = await response.json(); }
    catch { throw new CvImportProviderError(`OpenAI CV extraction returned invalid JSON (HTTP ${response.status})`, { status: response.status, failure: failure("response_body_parse", "response_parse", "INVALID_JSON") }); }
    if (!response.ok) { const error = safeApiError(response.status, body); error.failure = failure("fetch_started", "http", "HTTP_ERROR"); throw error; }
    const metadata = usageMetadata(body, Math.round(performance.now() - startedAt), response.status, request.max_output_tokens);
    let payload;
    try { payload = JSON.parse(responseText(body, metadata)); }
    catch (error) {
      if (error instanceof CvImportProviderError) throw error;
      throw new CvImportProviderError("OpenAI CV extraction structured output was invalid JSON", { failure: failure("provider_response_validation", "provider", "INVALID_JSON") });
    }
    let result;
    try { result = normalizeCvImportResult(payload); }
    catch { throw new CvImportProviderError("OpenAI CV extraction failed CHAINED schema validation", { failure: failure("chained_schema_validation", "chained_validation", "SCHEMA_INVALID") }); }
    return { result, metadata };
  }
  finally {
    clearTimeout(timer);
  }
}

export async function extractCvCandidates(input) {
  return (await extractCvCandidatesWithMetadata(input)).result;
}
