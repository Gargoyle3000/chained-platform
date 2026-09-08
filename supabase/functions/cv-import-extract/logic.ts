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
  totalTokens?: number | null;
}>;

export interface CvImportDependencies {
  authenticate(token: string): Promise<CvImportCaller>;
  betaUserIds: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  extract(input: { bytes: Uint8Array; filename: string }): Promise<{
    result: unknown;
    metadata: { httpStatus?: number | null; latencyMs: number; totalTokens?: number | null };
  }>;
  log(event: CvImportSafeLog): void;
  now(): number;
}

class RequestFailure extends Error {
  constructor(readonly status: number, readonly code: string) {
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
  if (category === "timeout") return new RequestFailure(504, "cv_import_timeout");
  if (category === "configuration") return new RequestFailure(503, "cv_import_unavailable");
  return new RequestFailure(502, "cv_import_failed");
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
        throw new RequestFailure(502, "cv_import_failed");
      }

      dependencies.log({
        outcome: "success",
        category: "completed",
        pdfBytes,
        latencyMs: extracted.metadata.latencyMs,
        candidateCount: result.candidates.length,
        unsupportedSectionCount: result.unsupportedSections.length,
        providerStatus: extracted.metadata.httpStatus ?? null,
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
        latencyMs: Math.max(0, dependencies.now() - startedAt)
      });
      return jsonResponse(failure.status, { code: failure.code }, corsHeaders);
    }
  };
}
