import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createBenchmarkArtifact,
  deleteBenchmarkArtifactRun,
  readBenchmarkArtifact,
  sha256,
  writeBenchmarkArtifact
} from "../scripts/cv-import-benchmark-artifact.mjs";
import { formatBenchmarkReport } from "../scripts/read-cv-import-benchmark.mjs";
import { CV_IMPORT_PDF_BENCHMARK_TIMEOUT_MS } from "../scripts/run-cv-import-luna-pdf-benchmark.mjs";

const sourceBytes = Buffer.from("synthetic CV document");
const source = {
  fileName: "synthetic-cv.pdf",
  fileSize: sourceBytes.length,
  pageCount: 2,
  documentSha256: sha256(sourceBytes)
};
const metadata = {
  requestedModel: "gpt-5.6-luna", returnedModel: "gpt-5.6-luna", httpStatus: 200,
  responseStatus: "completed", latencyMs: 1234, maxOutputTokens: 12000,
  requestTimeoutMs: CV_IMPORT_PDF_BENCHMARK_TIMEOUT_MS,
  inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, reasoningTokens: 1, totalTokens: 15
};
const result = {
  source: { documentKind: "pdf", pageCount: 2, extractedCharacterCount: 0 },
  unsupportedSections: [],
  warnings: ["Unsupported Press section omitted"],
  candidates: [{
    candidateId: "candidate-1", categoryType: "education", yearLabel: "2024", title: "Example Academy",
    organization: null, locationText: null, url: null,
    source: { pageNumber: 1, sectionHeading: "EDUCATION", excerpt: "2024 Example Academy", sequence: 0 },
    confidence: "high", needsReview: false, duplicateState: "new", warnings: []
  }]
};

async function temporaryRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "chained-cv-artifact-test-"));
}

test("completed artifacts persist only normalized CV results and safe metadata outside the repository", async (t) => {
  const root = await temporaryRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifact = createBenchmarkArtifact({ source, metadata: { ...metadata, apiKey: "must-not-persist", rawResponse: "must-not-persist" }, result, createdAt: "2026-09-08T10:00:00.000Z" });
  const artifactPath = await writeBenchmarkArtifact(artifact, { root, runId: "run-completed" });
  const raw = await fs.readFile(artifactPath, "utf8");
  const restored = await readBenchmarkArtifact(artifactPath);
  assert.equal(artifactPath.startsWith(root), true);
  assert.equal(artifactPath.includes(process.cwd()), false);
  assert.equal(restored.result.candidates[0].title, "Example Academy");
  assert.equal(restored.provider.store, false);
  assert.equal(restored.provider.requestTimeoutMs, 180000);
  assert.equal(raw.includes("must-not-persist"), false);
  assert.equal(raw.includes("OPENAI_API_KEY"), false);
  assert.equal(raw.includes("data:application/pdf;base64"), false);
});

test("incomplete artifacts contain safe diagnostics and never partial candidates", async (t) => {
  const root = await temporaryRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const incomplete = createBenchmarkArtifact({
    source,
    metadata: { ...metadata, responseStatus: "incomplete", incompleteReason: "max_output_tokens" },
    outcome: "incomplete"
  });
  assert.equal(incomplete.result, null);
  assert.throws(
    () => createBenchmarkArtifact({ source, metadata: { ...metadata, responseStatus: "incomplete", incompleteReason: "max_output_tokens" }, outcome: "incomplete", result }),
    /cannot contain candidates/
  );
  const artifactPath = await writeBenchmarkArtifact(incomplete, { root, runId: "run-incomplete" });
  const raw = await fs.readFile(artifactPath, "utf8");
  assert.equal(raw.includes("candidate-1"), false);
  assert.equal(raw.includes("max_output_tokens"), true);
});

test("failure artifacts retain only a bounded phase/category/code classification", () => {
  const artifact = createBenchmarkArtifact({ source, metadata: { ...metadata, responseStatus: null }, outcome: "failed", failure: { phase: "fetch_started", category: "network", code: "UND_ERR_CONNECT_TIMEOUT" } });
  assert.deepEqual(artifact.failure, { phase: "fetch_started", category: "network", code: "UND_ERR_CONNECT_TIMEOUT" });
  assert.equal(JSON.stringify(artifact).includes("stack"), false);
  assert.throws(() => createBenchmarkArtifact({ source, metadata, outcome: "failed", failure: { phase: "fetch_started", category: "network", code: "private text" } }), /failure.code/);
});

test("document hashing is deterministic and the offline report summarizes without network access", async (t) => {
  const root = await temporaryRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(sha256(sourceBytes), createHash("sha256").update(sourceBytes).digest("hex"));
  const artifactPath = await writeBenchmarkArtifact(createBenchmarkArtifact({ source, metadata, result }), { root, runId: "run-report" });
  const restored = await readBenchmarkArtifact(artifactPath);
  const report = formatBenchmarkReport(restored, artifactPath);
  const readerSource = await fs.readFile(new URL("../scripts/read-cv-import-benchmark.mjs", import.meta.url), "utf8");
  assert.match(report, /PRIVATE LOCAL BENCHMARK DATA/);
  assert.match(report, /CATEGORY         education: 1/);
  assert.match(report, /NEEDS REVIEW     0/);
  assert.match(report, /REQUEST TIMEOUT MS 180000/);
  assert.match(report, /UNSUPPORTED SECTIONS 0/);
  assert.equal(readerSource.includes("fetch("), false);
});

test("malformed artifacts are rejected and explicit cleanup removes only their run directory", async (t) => {
  const root = await temporaryRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const artifactPath = await writeBenchmarkArtifact(createBenchmarkArtifact({ source, metadata, result }), { root, runId: "run-delete" });
  await fs.writeFile(path.join(root, "run-delete", "bad.json"), JSON.stringify({ secret: "no" }));
  await assert.rejects(() => readBenchmarkArtifact(path.join(root, "run-delete", "bad.json")), /unsupported field/);
  await deleteBenchmarkArtifactRun(artifactPath, { root });
  await assert.rejects(() => fs.access(path.dirname(artifactPath)));
  await assert.rejects(() => deleteBenchmarkArtifactRun(path.join(os.tmpdir(), "other", "result.json"), { root }), /outside the private benchmark root/);
});
