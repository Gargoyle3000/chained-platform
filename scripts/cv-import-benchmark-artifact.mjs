import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeCvImportResult } from "./cv-import-prototype.mjs";

export const CV_BENCHMARK_ARTIFACT_VERSION = 1;
const ARTIFACT_FILE_NAME = "result.json";
const TOP_LEVEL_KEYS = new Set(["version", "createdAt", "outcome", "source", "provider", "failure", "result"]);
const FAILURE_KEYS = new Set(["phase", "category", "code"]);
const SOURCE_KEYS = new Set(["fileName", "fileSize", "pageCount", "documentSha256"]);
const PROVIDER_KEYS = new Set([
  "requestedModel", "returnedModel", "httpStatus", "responseStatus", "latencyMs", "maxOutputTokens", "requestTimeoutMs",
  "usage", "store", "incompleteReason"
]);
const USAGE_KEYS = new Set(["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "totalTokens"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function optionalInteger(value, label) {
  if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(`${label} must be a non-negative integer or null`);
}

function optionalText(value, label) {
  if (value !== null && typeof value !== "string") throw new Error(`${label} must be a string or null`);
}

export function defaultBenchmarkArtifactRoot() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "CHAINED", "cv-import-benchmarks");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeSource(source) {
  assertExactKeys(source, SOURCE_KEYS, "source");
  if (typeof source.fileName !== "string" || source.fileName.trim() === "") throw new Error("source.fileName is required");
  for (const key of ["fileSize", "pageCount"]) {
    if (!Number.isInteger(source[key]) || source[key] < 0) throw new Error(`source.${key} must be a non-negative integer`);
  }
  if (typeof source.documentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(source.documentSha256)) {
    throw new Error("source.documentSha256 must be a SHA-256 hex digest");
  }
  return { ...source };
}

function normalizeProvider(provider, outcome) {
  assertExactKeys(provider, PROVIDER_KEYS, "provider");
  for (const key of ["requestedModel", "returnedModel", "responseStatus"]) optionalText(provider[key], `provider.${key}`);
  optionalInteger(provider.httpStatus, "provider.httpStatus");
  optionalInteger(provider.latencyMs, "provider.latencyMs");
  optionalInteger(provider.maxOutputTokens, "provider.maxOutputTokens");
  optionalInteger(provider.requestTimeoutMs, "provider.requestTimeoutMs");
  if (provider.store !== false) throw new Error("provider.store must be false");
  if (provider.incompleteReason !== null && (typeof provider.incompleteReason !== "string" || !/^[a-z_]+$/.test(provider.incompleteReason))) {
    throw new Error("provider.incompleteReason is invalid");
  }
  if (outcome === "incomplete" && provider.incompleteReason === null) throw new Error("incomplete artifacts require provider.incompleteReason");
  assertExactKeys(provider.usage, USAGE_KEYS, "provider.usage");
  for (const key of USAGE_KEYS) optionalInteger(provider.usage[key], `provider.usage.${key}`);
  return {
    requestedModel: provider.requestedModel,
    returnedModel: provider.returnedModel,
    httpStatus: provider.httpStatus,
    responseStatus: provider.responseStatus,
    latencyMs: provider.latencyMs,
    maxOutputTokens: provider.maxOutputTokens,
    requestTimeoutMs: provider.requestTimeoutMs,
    usage: { ...provider.usage },
    store: false,
    incompleteReason: provider.incompleteReason
  };
}

function normalizeFailure(failure, outcome) {
  if (outcome === "completed") {
    if (failure !== null) throw new Error("completed artifacts cannot contain failure diagnostics");
    return null;
  }
  if (failure === null) return null;
  assertExactKeys(failure, FAILURE_KEYS, "failure");
  if (!new Set(["credential_retrieval", "source_file_validation", "request_construction", "fetch_started", "response_body_parse", "provider_response_validation", "chained_schema_validation", "artifact_write"]).has(failure.phase)) throw new Error("failure.phase is invalid");
  if (!new Set(["credential", "file", "network", "timeout", "http", "response_parse", "provider", "chained_validation", "artifact"]).has(failure.category)) throw new Error("failure.category is invalid");
  if (failure.code !== null && !new Set(["AbortError", "TypeError", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "HTTP_ERROR", "INVALID_JSON", "SCHEMA_INVALID", "UNKNOWN"]).has(failure.code)) throw new Error("failure.code is invalid");
  return { ...failure };
}

export function createBenchmarkArtifact({ source, metadata, failure = null, result = null, outcome = "completed", createdAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(CV_BENCHMARK_ARTIFACT_VERSION)) throw new Error("artifact version is invalid");
  if (!Object.hasOwn({ completed: true, incomplete: true, failed: true }, outcome)) throw new Error("artifact outcome is invalid");
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) throw new Error("createdAt must be an ISO timestamp");
  const provider = normalizeProvider({
    requestedModel: metadata?.requestedModel ?? null,
    returnedModel: metadata?.returnedModel ?? null,
    httpStatus: metadata?.httpStatus ?? null,
    responseStatus: metadata?.responseStatus ?? null,
    latencyMs: metadata?.latencyMs ?? null,
    maxOutputTokens: metadata?.maxOutputTokens ?? null,
    requestTimeoutMs: metadata?.requestTimeoutMs ?? null,
    usage: {
      inputTokens: metadata?.inputTokens ?? null,
      cachedInputTokens: metadata?.cachedInputTokens ?? null,
      outputTokens: metadata?.outputTokens ?? null,
      reasoningTokens: metadata?.reasoningTokens ?? null,
      totalTokens: metadata?.totalTokens ?? null
    },
    store: false,
    incompleteReason: metadata?.incompleteReason ?? null
  }, outcome);
  if (outcome === "completed" && result === null) throw new Error("completed artifacts require a result");
  if (outcome !== "completed" && result !== null) throw new Error("failed artifacts cannot contain candidates");
  return {
    version: CV_BENCHMARK_ARTIFACT_VERSION,
    createdAt,
    outcome,
    source: normalizeSource(source),
    provider,
    failure: normalizeFailure(failure, outcome),
    result: result === null ? null : normalizeCvImportResult(result)
  };
}

export function validateBenchmarkArtifact(artifact) {
  assertExactKeys(artifact, TOP_LEVEL_KEYS, "artifact");
  return createBenchmarkArtifact({
    source: artifact.source,
    metadata: {
      ...artifact.provider,
      inputTokens: artifact.provider?.usage?.inputTokens,
      cachedInputTokens: artifact.provider?.usage?.cachedInputTokens,
      outputTokens: artifact.provider?.usage?.outputTokens,
      reasoningTokens: artifact.provider?.usage?.reasoningTokens,
      totalTokens: artifact.provider?.usage?.totalTokens
    },
    result: artifact.result,
    failure: artifact.failure,
    outcome: artifact.outcome,
    createdAt: artifact.createdAt
  });
}

export async function writeBenchmarkArtifact(artifact, { root = defaultBenchmarkArtifactRoot(), runId = randomUUID() } = {}) {
  const normalized = validateBenchmarkArtifact(artifact);
  const resolvedRoot = path.resolve(root);
  const runDirectory = path.resolve(resolvedRoot, runId);
  if (!runDirectory.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("artifact run directory escapes root");
  await fs.mkdir(runDirectory, { recursive: true });
  const artifactPath = path.join(runDirectory, ARTIFACT_FILE_NAME);
  const temporaryPath = path.join(runDirectory, `${ARTIFACT_FILE_NAME}.${randomUUID()}.tmp`);
  await fs.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporaryPath, artifactPath);
  return artifactPath;
}

export async function readBenchmarkArtifact(artifactPath) {
  const parsed = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  return validateBenchmarkArtifact(parsed);
}

export async function deleteBenchmarkArtifactRun(artifactPath, { root = defaultBenchmarkArtifactRoot() } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedArtifact = path.resolve(artifactPath);
  const expectedSuffix = `${path.sep}${ARTIFACT_FILE_NAME}`;
  if (!resolvedArtifact.startsWith(`${resolvedRoot}${path.sep}`) || !resolvedArtifact.endsWith(expectedSuffix)) {
    throw new Error("artifact path is outside the private benchmark root");
  }
  await fs.rm(path.dirname(resolvedArtifact), { recursive: true, force: false });
}
