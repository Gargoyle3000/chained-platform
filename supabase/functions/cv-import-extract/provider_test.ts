import {
  CV_IMPORT_MAX_OUTPUT_TOKENS,
  CV_IMPORT_MODEL,
  CV_IMPORT_REQUEST_TIMEOUT_MS,
  CvImportProviderFailure,
  createOpenAiCvImportRequest,
  extractCvImportWithOpenAi,
  type CvImportProviderDiagnostic
} from "./provider.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

const bytes = new TextEncoder().encode("%PDF-1.7 synthetic");
const result = {
  source: { documentKind: "pdf", pageCount: 1, extractedCharacterCount: 20 },
  candidates: [], warnings: [],
  unsupportedSections: [{ heading: "PRESS", reason: "unsupported_category", entryCount: 1 }]
};

function providerResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function completed(output = JSON.stringify(result)) {
  return {
    model: CV_IMPORT_MODEL,
    status: "completed",
    output_text: output,
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens: 8,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 20
    }
  };
}

Deno.test("OpenAI request preserves the benchmarked direct-PDF contract", () => {
  const request = createOpenAiCvImportRequest(bytes, "cv.pdf");
  assert(request.model === CV_IMPORT_MODEL);
  assert(request.store === false);
  assert(request.reasoning.effort === "low");
  assert(request.max_output_tokens === CV_IMPORT_MAX_OUTPUT_TOKENS);
  assert(request.text.format.type === "json_schema" && request.text.format.strict === true);
  assert(request.text.format.schema.properties.candidates.items.properties.categoryType.enum.includes("publication") === false);
  const fileInput = request.input[0].content.find((item) => item.type === "input_file") as { file_data?: string } | undefined;
  assert(fileInput?.file_data?.startsWith("data:application/pdf;base64,") === true);
  assert((request as Record<string, unknown>).tools === undefined);
});

Deno.test("provider records construction, fetch start, safe response metadata, validation, and completion", async () => {
  let calls = 0;
  let timeout = 0;
  const timer = {} as number;
  let cleared = false;
  const diagnostics: CvImportProviderDiagnostic[] = [];
  const response = await extractCvImportWithOpenAi({
    bytes,
    filename: "cv.pdf",
    apiKey: "test-secret",
    diagnostic: (event) => diagnostics.push(event),
    setTimeoutImpl: ((_callback: () => void, delay: number) => { timeout = delay; return timer; }) as typeof setTimeout,
    clearTimeoutImpl: ((value: number) => { cleared = value === timer; }) as typeof clearTimeout,
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      assert(diagnostics.at(-1)?.phase === "provider_fetch_started");
      const body = JSON.parse(String(init?.body));
      assert(body.store === false && body.model === CV_IMPORT_MODEL);
      assert((init?.headers as Record<string, string>).authorization === "Bearer test-secret");
      return providerResponse(completed());
    }) as typeof fetch
  });
  assert(calls === 1);
  assert(timeout === CV_IMPORT_REQUEST_TIMEOUT_MS);
  assert(cleared);
  assert((response.result as typeof result).unsupportedSections.length === 1);
  assert(response.metadata.inputTokens === 12 && response.metadata.cachedInputTokens === 3);
  assert(response.metadata.outputTokens === 8 && response.metadata.reasoningTokens === 2);
  assert(response.metadata.totalTokens === 20 && response.metadata.responseStatus === "completed");
  assert(diagnostics.findIndex((event) => event.phase === "provider_fetch_started")
    < diagnostics.findIndex((event) => event.phase === "provider_response_received"));
  assert(diagnostics.at(-1)?.phase === "provider_completed");
  const serialized = JSON.stringify(diagnostics);
  assert(!serialized.includes("test-secret") && !serialized.includes("data:application/pdf"));
});

Deno.test("request construction failure is distinct and occurs before fetch", async () => {
  let calls = 0;
  const diagnostics: CvImportProviderDiagnostic[] = [];
  try {
    await extractCvImportWithOpenAi({
      bytes,
      filename: "private-person.pdf",
      apiKey: "sk-private",
      diagnostic: (event) => diagnostics.push(event),
      createRequestImpl: (() => { throw new Error("candidate@example.com PDF base64 secret"); }) as typeof createOpenAiCvImportRequest,
      fetchImpl: (async () => { calls += 1; return providerResponse(completed()); }) as typeof fetch
    });
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof CvImportProviderFailure);
    assert(error.category === "provider_request_construction_failed");
    assert(error.diagnostic.phase === "provider_request_construction");
  }
  assert(calls === 0);
  const serialized = JSON.stringify(diagnostics);
  assert(!serialized.includes("candidate@example.com") && !serialized.includes("sk-private"));
});

Deno.test("fetch start is recorded before a safe network failure", async () => {
  const diagnostics: CvImportProviderDiagnostic[] = [];
  try {
    await extractCvImportWithOpenAi({
      bytes,
      filename: "cv.pdf",
      apiKey: "test-secret",
      diagnostic: (event) => diagnostics.push(event),
      fetchImpl: (async () => { throw new Error("Bearer private candidate name"); }) as typeof fetch
    });
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof CvImportProviderFailure && error.category === "provider_network_failed");
  }
  assert(diagnostics.some((event) => event.phase === "provider_fetch_started" && event.outcome === "started"));
  assert(diagnostics.at(-1)?.phase === "provider_fetch_failed");
  assert(!JSON.stringify(diagnostics).includes("candidate name"));
});

Deno.test("timeout remains distinct, single-shot, and clears its abort timer", async () => {
  const diagnostics: CvImportProviderDiagnostic[] = [];
  let timeoutCallback: (() => void) | null = null;
  const timer = {} as number;
  let cleared = false;
  let calls = 0;
  try {
    await extractCvImportWithOpenAi({
      bytes,
      filename: "cv.pdf",
      apiKey: "test-secret",
      diagnostic: (event) => diagnostics.push(event),
      setTimeoutImpl: ((callback: () => void) => { timeoutCallback = callback; return timer; }) as typeof setTimeout,
      clearTimeoutImpl: ((value: number) => { cleared = value === timer; }) as typeof clearTimeout,
      fetchImpl: (async () => {
        calls += 1;
        timeoutCallback?.();
        const error = new Error("private timeout detail");
        error.name = "AbortError";
        throw error;
      }) as typeof fetch
    });
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof CvImportProviderFailure && error.category === "provider_timeout");
    assert(error.diagnostic.phase === "provider_fetch_failed");
  }
  assert(calls === 1 && cleared);
  assert(!JSON.stringify(diagnostics).includes("private timeout detail"));
});

Deno.test("provider HTTP failures map by status and retain only allowlisted error metadata", async () => {
  const cases = [
    [401, "provider_auth_failed", "invalid_api_key", "authentication_error"],
    [403, "provider_permission_denied", "insufficient_permissions", "permission_error"],
    [400, "provider_bad_request", "invalid_request_error", "invalid_request_error"],
    [429, "provider_rate_limited", "rate_limit_exceeded", "rate_limit_error"],
    [500, "provider_unavailable", "server_error", "server_error"]
  ] as const;

  for (const [status, category, code, type] of cases) {
    const diagnostics: CvImportProviderDiagnostic[] = [];
    try {
      await extractCvImportWithOpenAi({
        bytes,
        filename: "cv.pdf",
        apiKey: "test-secret",
        diagnostic: (event) => diagnostics.push(event),
        fetchImpl: (async () => providerResponse({
          error: {
            code,
            type,
            message: "candidate@example.com sk-private raw provider body",
            param: "data:application/pdf;base64,PRIVATE"
          }
        }, status)) as typeof fetch
      });
      throw new Error("expected rejection");
    } catch (error) {
      assert(error instanceof CvImportProviderFailure && error.category === category);
      assert(error.diagnostic.phase === "provider_http_error");
      assert(error.diagnostic.httpStatus === status);
      assert(error.diagnostic.providerErrorCode === code);
      assert(error.diagnostic.providerErrorType === type);
    }
    const serialized = JSON.stringify(diagnostics);
    assert(!serialized.includes("candidate@example.com"));
    assert(!serialized.includes("sk-private"));
    assert(!serialized.includes("data:application/pdf"));
    assert(!serialized.includes("raw provider body"));
  }
});

Deno.test("unrecognized provider error fields are discarded rather than logged", async () => {
  const diagnostics: CvImportProviderDiagnostic[] = [];
  try {
    await extractCvImportWithOpenAi({
      bytes,
      filename: "cv.pdf",
      apiKey: "test-secret",
      diagnostic: (event) => diagnostics.push(event),
      fetchImpl: (async () => providerResponse({
        error: {
          code: "sk-test",
          type: "candidate@example.com",
          message: "Bearer raw provider body"
        }
      }, 500)) as typeof fetch
    });
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof CvImportProviderFailure);
    assert(error.diagnostic.providerErrorCode === null);
    assert(error.diagnostic.providerErrorType === null);
  }
  const serialized = JSON.stringify(diagnostics);
  assert(!serialized.includes("sk-private"));
  assert(!serialized.includes("candidate@example.com"));
  assert(!serialized.includes("Bearer raw provider body"));
});

Deno.test("malformed provider JSON, structured output, and CHAINED schema failures remain distinct", async () => {
  const cases = [
    {
      response: providerResponse("not-json"),
      category: "provider_invalid_response",
      phase: "provider_response_parse"
    },
    {
      response: providerResponse(completed("not-json")),
      category: "provider_invalid_response",
      phase: "provider_response_validation"
    },
    {
      response: providerResponse(completed(JSON.stringify({ ...result, candidates: [{ categoryType: "publication" }] }))),
      category: "chained_schema_validation",
      phase: "chained_schema_validation"
    }
  ];

  for (const setup of cases) {
    try {
      await extractCvImportWithOpenAi({
        bytes,
        filename: "cv.pdf",
        apiKey: "test-secret",
        fetchImpl: (async () => setup.response) as typeof fetch
      });
      throw new Error("expected rejection");
    } catch (error) {
      assert(error instanceof CvImportProviderFailure);
      assert(error.category === setup.category && error.diagnostic.phase === setup.phase);
    }
  }
});

Deno.test("incomplete responses retain only safe enum metadata and no candidate content", async () => {
  const diagnostics: CvImportProviderDiagnostic[] = [];
  try {
    await extractCvImportWithOpenAi({
      bytes,
      filename: "cv.pdf",
      apiKey: "test-secret",
      diagnostic: (event) => diagnostics.push(event),
      fetchImpl: (async () => providerResponse({
        model: CV_IMPORT_MODEL,
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens", private: "candidate name" },
        output_text: "candidate@example.com"
      })) as typeof fetch
    });
    throw new Error("expected rejection");
  } catch (error) {
    assert(error instanceof CvImportProviderFailure);
    assert(error.category === "provider_invalid_response");
    assert(error.diagnostic.responseStatus === "incomplete");
    assert(error.diagnostic.incompleteReason === "max_output_tokens");
  }
  const serialized = JSON.stringify(diagnostics);
  assert(!serialized.includes("candidate name") && !serialized.includes("candidate@example.com"));
});

Deno.test("diagnostic serialization excludes secret-like model, CV, PDF, and provider payload values", async () => {
  const diagnostics: CvImportProviderDiagnostic[] = [];
  const privateResult = {
    ...result,
    candidates: [{
      candidateId: "private-person",
      categoryType: "education",
      yearLabel: "2024",
      title: "Candidate Private Name",
      organization: null,
      locationText: null,
      url: null,
      source: {
        pageNumber: 1,
        sectionHeading: "candidate@example.com",
        excerpt: "Bearer private contact text",
        sequence: 0
      },
      confidence: "high",
      needsReview: false,
      duplicateState: "new",
      warnings: []
    }]
  };
  await extractCvImportWithOpenAi({
    bytes,
    filename: "private-person.pdf",
    apiKey: "sk-private",
    diagnostic: (event) => diagnostics.push(event),
    fetchImpl: (async () => providerResponse({
      ...completed(JSON.stringify(privateResult)),
      model: "sk-returned-private",
      raw: "data:application/pdf;base64,PRIVATE",
      error: { message: "raw provider body" }
    })) as typeof fetch
  });
  const serialized = JSON.stringify(diagnostics);
  for (const forbidden of [
    "sk-private",
    "Candidate Private Name",
    "candidate@example.com",
    "Bearer private",
    "data:application/pdf;base64",
    "raw provider body",
    "private-person.pdf"
  ]) {
    assert(!serialized.includes(forbidden));
  }
  assert(diagnostics.at(-1)?.returnedModel === null);
});
