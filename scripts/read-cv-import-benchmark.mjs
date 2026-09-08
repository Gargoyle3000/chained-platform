#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteBenchmarkArtifactRun, readBenchmarkArtifact } from "./cv-import-benchmark-artifact.mjs";

function categoryCounts(candidates) {
  return Object.entries(candidates.reduce((counts, candidate) => {
    counts[candidate.categoryType] = (counts[candidate.categoryType] || 0) + 1;
    return counts;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
}

export function formatBenchmarkReport(artifact, artifactPath) {
  const lines = [
    "PRIVATE LOCAL BENCHMARK DATA",
    "CV IMPORT REAL BENCHMARK",
    `ARTIFACT         ${path.resolve(artifactPath)}`,
    "",
    "SOURCE",
    `FILE             ${artifact.source.fileName}`,
    `SIZE BYTES       ${artifact.source.fileSize}`,
    `PAGE COUNT       ${artifact.source.pageCount || "unavailable"}`,
    `SHA-256          ${artifact.source.documentSha256}`,
    "",
    "PROVIDER",
    `OUTCOME          ${artifact.outcome}`,
    `HTTP STATUS      ${artifact.provider.httpStatus ?? "unavailable"}`,
    `RESPONSE STATUS  ${artifact.provider.responseStatus ?? "unavailable"}`,
    `REQUESTED MODEL  ${artifact.provider.requestedModel ?? "unavailable"}`,
    `RETURNED MODEL   ${artifact.provider.returnedModel ?? "unavailable"}`,
    `LATENCY MS       ${artifact.provider.latencyMs ?? "unavailable"}`,
    `MAX OUTPUT TOKENS ${artifact.provider.maxOutputTokens ?? "unavailable"}`,
    `STORE            ${artifact.provider.store}`,
    `INPUT TOKENS     ${artifact.provider.usage.inputTokens ?? "unavailable"}`,
    `CACHED TOKENS    ${artifact.provider.usage.cachedInputTokens ?? "unavailable"}`,
    `OUTPUT TOKENS    ${artifact.provider.usage.outputTokens ?? "unavailable"}`,
    `REASONING TOKENS ${artifact.provider.usage.reasoningTokens ?? "unavailable"}`,
    `TOTAL TOKENS     ${artifact.provider.usage.totalTokens ?? "unavailable"}`
  ];
  if (artifact.outcome !== "completed") {
    lines.push(`INCOMPLETE REASON ${artifact.provider.incompleteReason ?? "unavailable"}`);
    return lines.join("\n");
  }
  const candidates = artifact.result.candidates;
  lines.push("", "EXTRACTION", `CANDIDATES       ${candidates.length}`);
  for (const [category, count] of categoryCounts(candidates)) lines.push(`CATEGORY         ${category}: ${count}`);
  lines.push(`NEEDS REVIEW     ${candidates.filter((candidate) => candidate.needsReview).length}`);
  lines.push(`WARNINGS         ${artifact.result.warnings.length}`);
  for (const warning of artifact.result.warnings) lines.push(`WARNING          ${warning}`);
  for (const candidate of candidates) {
    const summary = [candidate.title, candidate.organization, candidate.locationText].filter(Boolean).join(" · ");
    lines.push(`CANDIDATE        ${candidate.categoryType} | ${candidate.yearLabel ?? ""} | ${summary}`);
  }
  return lines.join("\n");
}

async function main() {
  const [artifactPath, command] = process.argv.slice(2);
  if (!artifactPath) throw new Error("Usage: node scripts/read-cv-import-benchmark.mjs <artifact-path> [--delete]");
  const artifact = await readBenchmarkArtifact(artifactPath);
  console.log(formatBenchmarkReport(artifact, artifactPath));
  if (command === "--delete") {
    await deleteBenchmarkArtifactRun(artifactPath);
    console.log("ARTIFACT RUN DELETED");
  }
  else if (command !== undefined) throw new Error(`Unsupported option: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`CV IMPORT BENCHMARK READER ERROR: ${error.message}`); process.exitCode = 1; });
}
