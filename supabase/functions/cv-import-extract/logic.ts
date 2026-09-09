import { normalizeCvImportResult } from "../../../data/cv-import-contract.mjs";

export const MAX_CV_IMPORT_PDF_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = MAX_CV_IMPORT_PDF_BYTES + (1024 * 1024);

export type CvImportCaller = Readonly<{ id: string; active: boolean }>;
export type CvImportSafeLog = Readonly<{
  outcome: "success" | "failure";
  category: string;
  pdfBytes: number;
  latencyMs: number;
  candidateCount?: number;
  unsupportedSectionCount?: number;
  providerStatus?: number | null;
  providerPhase?: string | null;
  providerCategory?: string | null;
  requestedModel?: string | null;
  returnedModel?: string | null;
  responseStatus?: string | null;
  incompleteReason?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
}>;

export interface CvImportDependencies {
  authenticate(token: string): Promise<CvImportCaller>;
  betaUserIds: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  extract(input: { bytes: Uint8Array; filename: string }): Promise<{
    result: unknown;
    metadata: {
      requestedModel?: string | null;
      returnedModel?: string | null;
      httpStatus?: number | null;
      responseStatus?: string | null;
      incompleteReason?: string | null;
      latencyMs: number;
      inputTokens?: number | null;
      cachedInputTokens?: number | null;
      outputTokens?: number | null;
      reasoningTokens?: number | null;
      totalTokens?: number | null;
    };
  }>;
  log(event: CvImportSafeLog): void;
  now(): number;
}

class RequestFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly providerPhase: string | null = null,
    readonly providerCategory: string | null = null
  ) {
    super(code);
  }
}

function jsonResponse(status: number, body: Record<string, unknown>, corsHeaders: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders
    }
  });
}

function resolveCors(request: Request, allowedOrigins: ReadonlySet<string>): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowedOrigins.has(origin)) throw new RequestFailure(403, "origin_not_allowed");
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    vary: "Origin"
  };
}

function bearerToken(request: Request): string {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1]) throw new RequestFailure(401, "missing_authorization");
  return match[1];
}

async function readPdf(request: Request): Promise<{ bytes: Uint8Array; filename: string }> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_REQUEST_BYTES) {
    throw new RequestFailure(413, "pdf_too_large");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new RequestFailure(400, "invalid_request");
  }

  const value = form.get("pdf");
  if (!(value instanceof File)) throw new RequestFailure(400, "file_required");
  if (value.size <= 0) throw new RequestFailure(400, "invalid_pdf");
  if (value.size > MAX_CV_IMPORT_PDF_BYTES) throw new RequestFailure(413, "pdf_too_large");
  if (!/\.pdf$/i.test(value.name) || (value.type && value.type.toLowerCase() !== "application/pdf")) {
    throw new RequestFailure(400, "invalid_pdf");
  }

  const bytes = new Uint8Array(await value.arrayBuffer());
  if (new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new RequestFailure(400, "invalid_pdf");
  }
  return { bytes, filename: value.name };
}

function safeProviderFailure(error: unknown): RequestFailure {
  const category = error && typeof error === "object" && "category" in error
    ? String((error as { category?: unknown }).category ?? "")
    : "";
  const rawPhase = error && typeof error === "object" && "diagnostic" in error
    ? (error as { diagnostic?: { phase?: unknown } }).diagnostic?.phase
    : null;
  const phase = typeof rawPhase === "string" && new Set([
    "provider_request_construction",
    "provider_fetch_started",
    "provider_fetch_failed",
    "provider_http_error",
    "provider_response_received",
    "provider_response_parse",
    "provider_response_validation",
    "chained_schema_validation",
    "provider_completed"
  ]).has(rawPhase) ? rawPhase : null;

  if (["provider_configuration_error", "provider_auth_failed", "provider_permission_denied"].includes(category)) {
    return new RequestFailure(503, "cv_import_service_authorization_failed", phase, category);
  }
  if (category === "provider_timeout") {
    return new RequestFailure(504, "cv_import_timeout", phase, category);
  }
  if ([
    "provider_request_construction_failed",
    "provider_network_failed",
    "provider_rate_limited",
    "provider_unavailable"
  ].includes(category)) {
    return new RequestFailure(503, "cv_import_service_unavailable", phase, category);
  }
  if (["provider_bad_request", "provider_invalid_response", "chained_schema_validation"].includes(category)) {
    return new RequestFailure(502, "cv_import_invalid_result", phase, category);
  }
  return new RequestFailure(502, "cv_import_failed", phase, null);
}

export function createCvImportHandler(dependencies: CvImportDependencies) {
  return async (request: Request): Promise<Response> => {
    let corsHeaders: HeadersInit = {};
    let pdfBytes = 0;
    const startedAt = dependencies.now();

    try {
      corsHeaders = resolveCors(request, dependencies.allowedOrigins);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      if (request.method !== "POST") throw new RequestFailure(405, "method_not_allowed");

      let caller: CvImportCaller;
      try {
        caller = await dependencies.authenticate(bearerToken(request));
      } catch {
        throw new RequestFailure(401, "invalid_token");
      }
      if (!caller.active) throw new RequestFailure(403, "account_inactive");
      if (!dependencies.betaUserIds.has(caller.id)) throw new RequestFailure(403, "cv_import_not_enabled");

      const pdf = await readPdf(request);
      pdfBytes = pdf.bytes.byteLength;

      let extracted;
      try {
        extracted = await dependencies.extract(pdf);
      } catch (error) {
        throw safeProviderFailure(error);
      }

      let result;
      try {
        result = normalizeCvImportResult(extracted.result);
      } catch {
        throw new RequestFailure(
          502,
          "cv_import_invalid_result",
          "chained_schema_validation",
          "chained_schema_validation"
        );
      }

      dependencies.log({
        outcome: "success",
        category: "completed",
        pdfBytes,
        latencyMs: extracted.metadata.latencyMs,
        candidateCount: result.candidates.length,
        unsupportedSectionCount: result.unsupportedSections.length,
        providerStatus: extracted.metadata.httpStatus ?? null,
        providerPhase: "provider_completed",
        requestedModel: extracted.metadata.requestedModel ?? null,
        returnedModel: extracted.metadata.returnedModel ?? null,
        responseStatus: extracted.metadata.responseStatus ?? null,
        incompleteReason: extracted.metadata.incompleteReason ?? null,
        inputTokens: extracted.metadata.inputTokens ?? null,
        cachedInputTokens: extracted.metadata.cachedInputTokens ?? null,
        outputTokens: extracted.metadata.outputTokens ?? null,
        reasoningTokens: extracted.metadata.reasoningTokens ?? null,
        totalTokens: extracted.metadata.totalTokens ?? null
      });
      return jsonResponse(200, result, corsHeaders);
    } catch (error) {
      const failure = error instanceof RequestFailure
        ? error
        : new RequestFailure(500, "internal_error");
      dependencies.log({
        outcome: "failure",
        category: failure.code,
        pdfBytes,
        latencyMs: Math.max(0, dependencies.now() - startedAt),
        providerPhase: failure.providerPhase,
        providerCategory: failure.providerCategory
      });
      return jsonResponse(failure.status, { code: failure.code }, corsHeaders);
    }
  };
}
