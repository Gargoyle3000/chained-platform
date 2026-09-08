import {
  CV_IMPORT_MAX_OUTPUT_TOKENS,
  CV_IMPORT_MODEL,
  CV_IMPORT_REQUEST_TIMEOUT_MS,
  CvImportProviderFailure,
  createOpenAiCvImportRequest,
  extractCvImportWithOpenAi
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

Deno.test("provider performs one request, uses 180 second abort boundary, validates output, and clears timer", async () => {
  let calls = 0;
  let timeout = 0;
  const timer = {} as number;
  let cleared = false;
  const response = await extractCvImportWithOpenAi({
    bytes,
    filename: "cv.pdf",
    apiKey: "test-secret",
    setTimeoutImpl: ((_callback: () => void, delay: number) => { timeout = delay; return timer; }) as typeof setTimeout,
    clearTimeoutImpl: ((value: number) => { cleared = value === timer; }) as typeof clearTimeout,
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body));
      assert(body.store === false && body.model === CV_IMPORT_MODEL);
      assert((init?.headers as Record<string, string>).authorization === "Bearer test-secret");
      return new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify(result), usage: { total_tokens: 20 } }), { status: 200 });
    }) as typeof fetch
  });
  assert(calls === 1);
  assert(timeout === CV_IMPORT_REQUEST_TIMEOUT_MS);
  assert(cleared);
  assert((response.result as typeof result).unsupportedSections.length === 1);
  assert(response.metadata.totalTokens === 20);
});

Deno.test("malformed and forbidden structured results fail closed", async () => {
  for (const output of ["not-json", JSON.stringify({ ...result, candidates: [{ categoryType: "publication" }] })]) {
    let calls = 0;
    try {
      await extractCvImportWithOpenAi({
        bytes, filename: "cv.pdf", apiKey: "test-secret",
        fetchImpl: (async () => {
          calls += 1;
          return new Response(JSON.stringify({ status: "completed", output_text: output }), { status: 200 });
        }) as typeof fetch
      });
      throw new Error("expected rejection");
    } catch (error) {
      assert(error instanceof CvImportProviderFailure && error.category === "invalid_response");
      assert(calls === 1);
    }
  }
});
