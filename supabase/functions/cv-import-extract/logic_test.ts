import { createCvImportHandler, MAX_CV_IMPORT_PDF_BYTES, type CvImportDependencies } from "./logic.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

const USER_ID = "11111111-1111-4111-8111-111111111111";
const result = {
  source: { documentKind: "pdf", pageCount: 2, extractedCharacterCount: 100 },
  candidates: [{
    candidateId: "one", categoryType: "education", yearLabel: "2020", title: "Private Academy",
    organization: null, locationText: null, url: null,
    source: { pageNumber: 1, sectionHeading: "EDUCATION", excerpt: "Private Academy", sequence: 0 },
    confidence: "high", needsReview: false, duplicateState: "new", warnings: []
  }],
  warnings: [],
  unsupportedSections: [{ heading: "PRESS", reason: "unsupported_category", entryCount: 2 }]
};

function request(bytes = new TextEncoder().encode("%PDF-1.7 private contents"), token = "user-token") {
  const form = new FormData();
  form.set("pdf", new File([bytes], "private-cv.pdf", { type: "application/pdf" }));
  return new Request("https://local/functions/v1/cv-import-extract", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form
  });
}

function dependencies(overrides: Partial<CvImportDependencies> = {}) {
  const logs: unknown[] = [];
  let calls = 0;
  const value: CvImportDependencies & { logs: unknown[]; calls(): number } = {
    allowedOrigins: new Set(),
    betaUserIds: new Set([USER_ID]),
    authenticate: async () => ({ id: USER_ID, active: true }),
    extract: async () => {
      calls += 1;
      return { result, metadata: { httpStatus: 200, latencyMs: 1234, totalTokens: 700 } };
    },
    log: (event) => logs.push(event),
    now: () => 1000,
    ...overrides,
    logs,
    calls: () => calls
  };
  return value;
}

Deno.test("anonymous, invalid, inactive, and non-beta callers are rejected before provider spend", async () => {
  for (const setup of [
    { req: request(undefined, ""), deps: dependencies(), status: 401 },
    { req: request(), deps: dependencies({ authenticate: async () => { throw new Error("invalid"); } }), status: 401 },
    { req: request(), deps: dependencies({ authenticate: async () => ({ id: USER_ID, active: false }) }), status: 403 },
    { req: request(), deps: dependencies({ betaUserIds: new Set() }), status: 403 }
  ]) {
    const response = await createCvImportHandler(setup.deps)(setup.req);
    assert(response.status === setup.status);
    assert(setup.deps.calls() === 0);
  }
});

Deno.test("allowed active caller sends one valid PDF to provider and receives only validated contract output", async () => {
  const deps = dependencies();
  const response = await createCvImportHandler(deps)(request());
  const body = await response.json();
  assert(response.status === 200);
  assert(deps.calls() === 1);
  assert(body.candidates[0].title === "Private Academy");
  assert(body.provider === undefined && body.metadata === undefined);
  const log = JSON.stringify(deps.logs);
  assert(!log.includes("Private Academy") && !log.includes("private contents") && !log.includes("user-token"));
});

Deno.test("invalid and oversized PDFs fail before the provider call", async () => {
  const invalid = dependencies();
  const invalidResponse = await createCvImportHandler(invalid)(request(new TextEncoder().encode("not-pdf")));
  assert(invalidResponse.status === 400 && invalid.calls() === 0);

  const oversized = dependencies();
  const oversizedResponse = await createCvImportHandler(oversized)(request(new Uint8Array(MAX_CV_IMPORT_PDF_BYTES + 1)));
  assert(oversizedResponse.status === 413 && oversized.calls() === 0);
});

Deno.test("malformed or forbidden provider candidates fail closed without returning provider data", async () => {
  for (const unsafe of [
    { raw: "provider response" },
    { ...result, candidates: [{ ...result.candidates[0], categoryType: "publication" }] }
  ]) {
    const deps = dependencies({ extract: async () => ({ result: unsafe, metadata: { latencyMs: 1 } }) });
    const response = await createCvImportHandler(deps)(request());
    const body = await response.json();
    assert(response.status === 502);
    assert(body.code === "cv_import_invalid_result");
    assert(!JSON.stringify(body).includes("provider response"));
  }
});

Deno.test("provider failure is safe, single-shot, and never logs credentials or PDF contents", async () => {
  let calls = 0;
  const deps = dependencies({
    extract: async () => {
      calls += 1;
      const error = new Error("secret user-token private contents") as Error & { category: string };
      error.category = "provider";
      throw error;
    }
  });
  const response = await createCvImportHandler(deps)(request());
  assert(response.status === 502 && calls === 1);
  const serialized = JSON.stringify(deps.logs);
  assert(!serialized.includes("secret") && !serialized.includes("user-token") && !serialized.includes("private contents"));
});

Deno.test("provider categories become a small provider-neutral client error contract", async () => {
  const cases = [
    ["provider_auth_failed", "provider_http_error", 503, "cv_import_service_authorization_failed"],
    ["provider_permission_denied", "provider_http_error", 503, "cv_import_service_authorization_failed"],
    ["provider_network_failed", "provider_fetch_failed", 503, "cv_import_service_unavailable"],
    ["provider_rate_limited", "provider_http_error", 503, "cv_import_service_unavailable"],
    ["provider_invalid_response", "provider_response_parse", 502, "cv_import_invalid_result"],
    ["chained_schema_validation", "chained_schema_validation", 502, "cv_import_invalid_result"]
  ] as const;

  for (const [category, phase, status, code] of cases) {
    const deps = dependencies({
      extract: async () => {
        throw {
          category,
          diagnostic: {
            phase,
            message: "candidate@example.com",
            authorization: "Bearer secret"
          }
        };
      }
    });
    const response = await createCvImportHandler(deps)(request());
    const body = await response.json();
    assert(response.status === status && body.code === code);
    const serialized = JSON.stringify(deps.logs);
    assert(serialized.includes(phase) && serialized.includes(category));
    assert(!serialized.includes("candidate@example.com") && !serialized.includes("Bearer secret"));
  }
});

Deno.test("successful aggregate diagnostics retain safe provider metadata only", async () => {
  const deps = dependencies({
    extract: async () => ({
      result,
      metadata: {
        requestedModel: "gpt-5.6-luna",
        returnedModel: "gpt-5.6-luna-2026-08-01",
        httpStatus: 200,
        responseStatus: "completed",
        incompleteReason: null,
        latencyMs: 1234,
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 50,
        reasoningTokens: 10,
        totalTokens: 150
      }
    })
  });
  const response = await createCvImportHandler(deps)(request());
  assert(response.status === 200);
  const serialized = JSON.stringify(deps.logs);
  assert(serialized.includes("provider_completed") && serialized.includes("gpt-5.6-luna"));
  assert(serialized.includes("\"inputTokens\":100") && serialized.includes("\"totalTokens\":150"));
  assert(!serialized.includes("Private Academy") && !serialized.includes("private contents"));
});
