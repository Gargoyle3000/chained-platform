import {
  CV_IMPORT_INSTRUCTIONS,
  CV_IMPORT_RESULT_SCHEMA,
  normalizeCvImportResult
} from "../../../data/cv-import-contract.mjs";

export const CV_IMPORT_MODEL = "gpt-5.6-luna";
export const CV_IMPORT_REQUEST_TIMEOUT_MS = 180_000;
export const CV_IMPORT_MAX_OUTPUT_TOKENS = 12_000;
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

export class CvImportProviderFailure extends Error {
  constructor(readonly category: "configuration" | "timeout" | "provider" | "invalid_response") {
    super(category);
  }
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

function responseText(body: Record<string, unknown>): string {
  if (body.status !== "completed") throw new CvImportProviderFailure("provider");
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
  throw new CvImportProviderFailure("invalid_response");
}

export async function extractCvImportWithOpenAi({
  bytes,
  filename,
  apiKey,
  fetchImpl = fetch,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
}: {
  bytes: Uint8Array;
  filename: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}) {
  if (!apiKey?.trim()) throw new CvImportProviderFailure("configuration");
  const controller = new AbortController();
  const timer = setTimeoutImpl(() => controller.abort(), CV_IMPORT_REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    let response: Response;
    try {
      response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(createOpenAiCvImportRequest(bytes, filename)),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new CvImportProviderFailure("timeout");
      }
      throw new CvImportProviderFailure("provider");
    }
    if (!response.ok) throw new CvImportProviderFailure("provider");

    let body: Record<string, unknown>;
    try {
      body = await response.json();
    } catch {
      throw new CvImportProviderFailure("invalid_response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText(body));
      parsed = normalizeCvImportResult(parsed);
    } catch (error) {
      if (error instanceof CvImportProviderFailure) throw error;
      throw new CvImportProviderFailure("invalid_response");
    }

    const usage = body.usage && typeof body.usage === "object"
      ? body.usage as Record<string, unknown>
      : {};
    return {
      result: parsed,
      metadata: {
        httpStatus: response.status,
        latencyMs: Math.round(performance.now() - startedAt),
        totalTokens: Number.isInteger(usage.total_tokens) ? usage.total_tokens as number : null
      }
    };
  } finally {
    clearTimeoutImpl(timer);
  }
}
