import {
  CV_IMPORT_INSTRUCTIONS,
  CV_IMPORT_RESULT_SCHEMA,
  normalizeCvImportResult
} from "../../../data/cv-import-contract.mjs";

export const CV_IMPORT_MODEL = "gpt-5.6-luna";
export const CV_IMPORT_REQUEST_TIMEOUT_MS = 180_000;
export const CV_IMPORT_MAX_OUTPUT_TOKENS = 12_000;
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export type CvImportProviderCategory =
  | "provider_configuration_error"
  | "provider_request_construction_failed"
  | "provider_timeout"
  | "provider_network_failed"
  | "provider_auth_failed"
  | "provider_permission_denied"
  | "provider_bad_request"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_invalid_response"
  | "chained_schema_validation";

export type CvImportProviderPhase =
  | "provider_request_construction"
  | "provider_fetch_started"
  | "provider_fetch_failed"
  | "provider_http_error"
  | "provider_response_received"
  | "provider_response_parse"
  | "provider_response_validation"
  | "chained_schema_validation"
  | "provider_completed";

export type CvImportProviderDiagnostic = Readonly<{
  phase: CvImportProviderPhase;
  outcome: "started" | "completed" | "failure";
  category?: CvImportProviderCategory;
  requestedModel: string;
  returnedModel?: string | null;
  httpStatus?: number | null;
  responseStatus?: string | null;
  incompleteReason?: string | null;
  providerErrorCode?: string | null;
  providerErrorType?: string | null;
  latencyMs?: number;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
}>;

type DiagnosticReporter = (event: CvImportProviderDiagnostic) => void;

export class CvImportProviderFailure extends Error {
  constructor(
    readonly category: CvImportProviderCategory,
    readonly diagnostic: CvImportProviderDiagnostic
  ) {
    super(category);
    this.name = "CvImportProviderFailure";
  }
}

const SAFE_RESPONSE_STATUSES = new Set([
  "completed", "failed", "in_progress", "cancelled", "queued", "incomplete"
]);
const SAFE_INCOMPLETE_REASONS = new Set(["max_output_tokens", "content_filter"]);
const SAFE_PROVIDER_ERROR_CODES = new Set([
  "invalid_api_key",
  "insufficient_permissions",
  "model_not_found",
  "rate_limit_exceeded",
  "server_error",
  "invalid_request_error"
]);
const SAFE_PROVIDER_ERROR_TYPES = new Set([
  "authentication_error",
  "permission_error",
  "invalid_request_error",
  "rate_limit_error",
  "server_error",
  "api_error"
]);

function emitDiagnostic(reporter: DiagnosticReporter, event: Omit<CvImportProviderDiagnostic, "requestedModel">) {
  try {
    reporter(Object.freeze({ ...event, requestedModel: CV_IMPORT_MODEL }));
  } catch {
    // Observability must never change extraction behavior.
  }
}

function safeEnum(value: unknown, allowed: ReadonlySet<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function safeModel(value: unknown): string | null {
  return typeof value === "string"
    && (value === CV_IMPORT_MODEL || value.startsWith(`${CV_IMPORT_MODEL}-`))
    && /^[a-z0-9][a-z0-9._:-]{0,79}$/i.test(value)
    ? value
    : null;
}

function safeTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeResponseMetadata(body: Record<string, unknown>, httpStatus: number, latencyMs: number) {
  const usage = body.usage && typeof body.usage === "object"
    ? body.usage as Record<string, unknown>
    : {};
  const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === "object"
    ? usage.input_tokens_details as Record<string, unknown>
    : {};
  const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === "object"
    ? usage.output_tokens_details as Record<string, unknown>
    : {};
  const incomplete = body.incomplete_details && typeof body.incomplete_details === "object"
    ? body.incomplete_details as Record<string, unknown>
    : {};
  return {
    returnedModel: safeModel(body.model),
    httpStatus,
    responseStatus: safeEnum(body.status, SAFE_RESPONSE_STATUSES),
    incompleteReason: safeEnum(incomplete.reason, SAFE_INCOMPLETE_REASONS),
    latencyMs,
    inputTokens: safeTokenCount(usage.input_tokens),
    cachedInputTokens: safeTokenCount(inputDetails.cached_tokens),
    outputTokens: safeTokenCount(usage.output_tokens),
    reasoningTokens: safeTokenCount(outputDetails.reasoning_tokens),
    totalTokens: safeTokenCount(usage.total_tokens)
  };
}

function safeProviderErrorMetadata(body: Record<string, unknown>) {
  const error = body.error && typeof body.error === "object"
    ? body.error as Record<string, unknown>
    : {};
  return {
    providerErrorCode: safeEnum(error.code, SAFE_PROVIDER_ERROR_CODES),
    providerErrorType: safeEnum(error.type, SAFE_PROVIDER_ERROR_TYPES)
  };
}

function httpFailureCategory(status: number): CvImportProviderCategory {
  if (status === 401) return "provider_auth_failed";
  if (status === 403) return "provider_permission_denied";
  if (status === 400 || status === 404 || status === 409 || status === 422) return "provider_bad_request";
  if (status === 429) return "provider_rate_limited";
  return "provider_unavailable";
}

function providerFailure(
  category: CvImportProviderCategory,
  phase: CvImportProviderPhase,
  metadata: Partial<CvImportProviderDiagnostic> = {}
) {
  return new CvImportProviderFailure(category, Object.freeze({
    ...metadata,
    requestedModel: CV_IMPORT_MODEL,
    phase,
    outcome: "failure",
    category
  }));
}

function bytesToBase64(bytes: Uint8Array): string {
  return bytes.toBase64();
}

export function createOpenAiCvImportRequest(bytes: Uint8Array, filename: string) {
  return {
    model: CV_IMPORT_MODEL,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: CV_IMPORT_MAX_OUTPUT_TOKENS,
    instructions: CV_IMPORT_INSTRUCTIONS,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "Extract this PDF into the CHAINED CV import contract." },
        {
          type: "input_file",
          filename,
          file_data: `data:application/pdf;base64,${bytesToBase64(bytes)}`,
          detail: "auto"
        }
      ]
    }],
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

function responseText(body: Record<string, unknown>): string | null {
  if (body.status !== "completed") return null;
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text;
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

export async function extractCvImportWithOpenAi({
  bytes,
  filename,
  apiKey,
  fetchImpl = fetch,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  createRequestImpl = createOpenAiCvImportRequest,
  diagnostic = () => {}
}: {
  bytes: Uint8Array;
  filename: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  createRequestImpl?: typeof createOpenAiCvImportRequest;
  diagnostic?: DiagnosticReporter;
}) {
  if (!apiKey?.trim()) {
    const failure = providerFailure("provider_configuration_error", "provider_request_construction");
    emitDiagnostic(diagnostic, failure.diagnostic);
    throw failure;
  }

  emitDiagnostic(diagnostic, { phase: "provider_request_construction", outcome: "started" });
  let requestBody: string;
  try {
    requestBody = JSON.stringify(createRequestImpl(bytes, filename));
  } catch {
    const failure = providerFailure("provider_request_construction_failed", "provider_request_construction");
    emitDiagnostic(diagnostic, failure.diagnostic);
    throw failure;
  }
  emitDiagnostic(diagnostic, { phase: "provider_request_construction", outcome: "completed" });

  const controller = new AbortController();
  const timer = setTimeoutImpl(() => controller.abort(), CV_IMPORT_REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    let response: Response;
    emitDiagnostic(diagnostic, { phase: "provider_fetch_started", outcome: "started" });
    try {
      response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: requestBody,
        signal: controller.signal
      });
    } catch (error) {
      const timedOut = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      const category: CvImportProviderCategory = timedOut ? "provider_timeout" : "provider_network_failed";
      const failure = providerFailure(category, "provider_fetch_failed", {
        latencyMs: Math.round(performance.now() - startedAt)
      });
      emitDiagnostic(diagnostic, failure.diagnostic);
      throw failure;
    }

    const responseLatencyMs = Math.round(performance.now() - startedAt);
    emitDiagnostic(diagnostic, {
      phase: "provider_response_received",
      outcome: "completed",
      httpStatus: response.status,
      latencyMs: responseLatencyMs
    });
    emitDiagnostic(diagnostic, {
      phase: "provider_response_parse",
      outcome: "started",
      httpStatus: response.status,
      latencyMs: responseLatencyMs
    });

    let body: Record<string, unknown>;
    try {
      const parsed = await response.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid response root");
      body = parsed as Record<string, unknown>;
    } catch {
      const category = response.ok ? "provider_invalid_response" : httpFailureCategory(response.status);
      const phase: CvImportProviderPhase = response.ok ? "provider_response_parse" : "provider_http_error";
      const failure = providerFailure(category, phase, {
        httpStatus: response.status,
        latencyMs: Math.round(performance.now() - startedAt)
      });
      emitDiagnostic(diagnostic, failure.diagnostic);
      throw failure;
    }

    const metadata = safeResponseMetadata(body, response.status, Math.round(performance.now() - startedAt));
    emitDiagnostic(diagnostic, { phase: "provider_response_parse", outcome: "completed", ...metadata });

    if (!response.ok) {
      const failure = providerFailure(httpFailureCategory(response.status), "provider_http_error", {
        ...metadata,
        ...safeProviderErrorMetadata(body)
      });
      emitDiagnostic(diagnostic, failure.diagnostic);
      throw failure;
    }

    emitDiagnostic(diagnostic, { phase: "provider_response_validation", outcome: "started", ...metadata });
    const text = responseText(body);
    if (!text) {
      const failure = providerFailure("provider_invalid_response", "provider_response_validation", {
        ...metadata,
        ...safeProviderErrorMetadata(body)
      });
      emitDiagnostic(diagnostic, failure.diagnostic);
      throw failure;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const failure = providerFailure("provider_invalid_response", "provider_response_validation", metadata);
      emitDiagnostic(diagnostic, failure.diagnostic);
      throw failure;
    }
    emitDiagnostic(diagnostic, { phase: "provider_response_validation", outcome: "completed", ...metadata });

    emitDiagnostic(diagnostic, { phase: "chained_schema_validation", outcome: "started", ...metadata });
    let result: unknown;
    try {
      result = normalizeCvImportResult(parsed);
    } catch {
      const failure = providerFailure("chained_schema_validation", "chained_schema_validation", metadata);
      emitDiagnostic(diagnostic, failure.diagnostic);
      throw failure;
    }
    emitDiagnostic(diagnostic, { phase: "chained_schema_validation", outcome: "completed", ...metadata });
    emitDiagnostic(diagnostic, { phase: "provider_completed", outcome: "completed", ...metadata });

    return { result, metadata };
  } finally {
    clearTimeoutImpl(timer);
  }
}
