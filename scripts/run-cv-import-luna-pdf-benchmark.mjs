#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createBenchmarkArtifact, sha256, writeBenchmarkArtifact } from "./cv-import-benchmark-artifact.mjs";
import { CV_IMPORT_MODEL, extractCvCandidatesWithMetadata, validateCvPdfInput } from "./cv-import-openai-provider.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasArgument(name) {
  return process.argv.includes(name);
}

function optionalPositiveInteger(name) {
  const value = argumentValue(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 256 || parsed > 12_000) throw new Error(`${name} must be an integer between 256 and 12000`);
  return parsed;
}

function countPdfPages(bytes) {
  return (Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

function categoryCounts(candidates) {
  return Object.entries(candidates.reduce((counts, candidate) => {
    counts[candidate.categoryType] = (counts[candidate.categoryType] || 0) + 1;
    return counts;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
}

async function main() {
  const pdfPath = argumentValue("--pdf");
  if (!pdfPath) throw new Error("Usage: node scripts/run-cv-import-luna-pdf-benchmark.mjs --pdf <local-path>");
  const resolvedPath = path.resolve(pdfPath);
  const maxOutputTokens = optionalPositiveInteger("--max-output-tokens");
  const [bytes, stat] = await Promise.all([fs.readFile(resolvedPath), fs.stat(resolvedPath)]);
  const filename = path.basename(resolvedPath);
  validateCvPdfInput(bytes, filename);
  const pageCount = countPdfPages(bytes);
  const source = { fileName: filename, fileSize: stat.size, pageCount, documentSha256: sha256(bytes) };
  const configuredMaxOutputTokens = maxOutputTokens ?? 4000;
  let result;
  let metadata;
  let artifactPath;
  try {
    ({ result, metadata } = await extractCvCandidatesWithMetadata({
      pdfBytes: bytes,
      filename,
      source: { documentKind: "pdf", pageCount, extractedCharacterCount: 0 },
      maxOutputTokens
    }));
    artifactPath = await writeBenchmarkArtifact(createBenchmarkArtifact({ source, metadata, result }));
  }
  catch (error) {
    const diagnostics = error?.diagnostics || {
      requestedModel: CV_IMPORT_MODEL,
      returnedModel: null,
      httpStatus: error?.status ?? null,
      responseStatus: null,
      latencyMs: null,
      maxOutputTokens: configuredMaxOutputTokens,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      incompleteReason: null
    };
    const outcome = diagnostics.responseStatus === "incomplete" ? "incomplete" : "failed";
    artifactPath = await writeBenchmarkArtifact(createBenchmarkArtifact({ source, metadata: diagnostics, outcome }));
    error.artifactPath = artifactPath;
    throw error;
  }
  console.log("CV IMPORT LUNA PDF BENCHMARK");
  console.log(`FILE SIZE BYTES  ${stat.size}`);
  console.log(`PAGE COUNT       ${pageCount || "unavailable"}`);
  console.log(`ARTIFACT         ${artifactPath}`);
  console.log(`CANDIDATES       ${result.candidates.length}`);
  for (const [category, count] of categoryCounts(result.candidates)) console.log(`CATEGORY         ${category}: ${count}`);
  if (hasArgument("--summary")) {
    for (const candidate of result.candidates) {
      const details = [candidate.title, candidate.organization, candidate.locationText].filter(Boolean).join(" · ");
      console.log(`CANDIDATE        ${candidate.categoryType} | ${candidate.yearLabel ?? ""} | ${details}`);
    }
  }
  console.log(`NEEDS REVIEW     ${result.candidates.filter((candidate) => candidate.needsReview).length}`);
  console.log(`WARNINGS         ${result.warnings.length}`);
  for (const warning of result.warnings) console.log(`WARNING          ${warning}`);
  console.log(`HTTP STATUS      ${metadata.httpStatus}`);
  console.log(`RESPONSE STATUS  ${metadata.responseStatus}`);
  console.log(`REQUESTED MODEL  ${metadata.requestedModel}`);
  console.log(`RETURNED MODEL   ${metadata.returnedModel ?? "unavailable"}`);
  console.log(`LATENCY MS       ${metadata.latencyMs}`);
  console.log(`INPUT TOKENS     ${metadata.inputTokens ?? "unavailable"}`);
  console.log(`CACHED TOKENS    ${metadata.cachedInputTokens ?? "unavailable"}`);
  console.log(`OUTPUT TOKENS    ${metadata.outputTokens ?? "unavailable"}`);
  console.log(`REASONING TOKENS ${metadata.reasoningTokens ?? "unavailable"}`);
  console.log(`TOTAL TOKENS     ${metadata.totalTokens ?? "unavailable"}`);
  console.log(`MAX OUTPUT TOKENS ${configuredMaxOutputTokens}`);
  console.log("STORE             false");
}

function printSafeDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object") return;
  console.error(`HTTP STATUS      ${diagnostics.httpStatus ?? "unavailable"}`);
  console.error(`RESPONSE STATUS  ${diagnostics.responseStatus ?? "unavailable"}`);
  console.error(`INCOMPLETE REASON ${diagnostics.incompleteReason ?? "unavailable"}`);
  console.error(`REQUESTED MODEL  ${diagnostics.requestedModel ?? "unavailable"}`);
  console.error(`RETURNED MODEL   ${diagnostics.returnedModel ?? "unavailable"}`);
  console.error(`LATENCY MS       ${diagnostics.latencyMs ?? "unavailable"}`);
  console.error(`INPUT TOKENS     ${diagnostics.inputTokens ?? "unavailable"}`);
  console.error(`CACHED INPUT TOKENS ${diagnostics.cachedInputTokens ?? "unavailable"}`);
  console.error(`OUTPUT TOKENS    ${diagnostics.outputTokens ?? "unavailable"}`);
  console.error(`REASONING TOKENS ${diagnostics.reasoningTokens ?? "unavailable"}`);
  console.error(`TOTAL TOKENS     ${diagnostics.totalTokens ?? "unavailable"}`);
  console.error(`MAX OUTPUT TOKENS ${diagnostics.maxOutputTokens ?? "unavailable"}`);
}

main().catch((error) => {
  const details = [error.status ? `HTTP ${error.status}` : null, error.code, error.type].filter(Boolean).join("; ");
  console.error(`CV IMPORT LUNA PDF BENCHMARK ERROR: ${error.message}${details ? ` (${details})` : ""}`);
  printSafeDiagnostics(error.diagnostics);
  if (typeof error.artifactPath === "string") console.error(`ARTIFACT         ${error.artifactPath}`);
  process.exitCode = 1;
});
