#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchmarkCvImport } from "./cv-import-prototype.mjs";
import { extractCvCandidatesWithMetadata } from "./cv-import-openai-provider.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "cv-import-prototype");

async function main() {
  const [text, referenceText] = await Promise.all([
    fs.readFile(path.join(root, "sample-cv.txt"), "utf8"),
    fs.readFile(path.join(root, "sample-reference.json"), "utf8")
  ]);
  const { result, metadata } = await extractCvCandidatesWithMetadata({
    text,
    source: { documentKind: "text", pageCount: 1, extractedCharacterCount: text.length }
  });
  const report = benchmarkCvImport(JSON.parse(referenceText), result);
  console.log("CV IMPORT LUNA SYNTHETIC SMOKE");
  console.log(`CANDIDATES      ${result.candidates.length}`);
  for (const candidate of result.candidates) {
    console.log(`- ${candidate.categoryType} | ${candidate.yearLabel ?? ""} | ${candidate.title}`);
  }
  console.log(`EXPECTED        ${report.expected}`);
  console.log(`MATCHED         ${report.matched}`);
  console.log(`MISSED          ${report.missed.length}`);
  console.log(`UNMATCHED       ${report.unmatched.length}`);
  console.log(`NEEDS REVIEW    ${report.needsCorrection}`);
  console.log(`HTTP STATUS     ${metadata.httpStatus}`);
  console.log(`RESPONSE STATUS ${metadata.responseStatus}`);
  console.log(`LATENCY MS      ${metadata.latencyMs}`);
  console.log(`INPUT TOKENS    ${metadata.inputTokens ?? "unavailable"}`);
  console.log(`CACHED TOKENS   ${metadata.cachedInputTokens ?? "unavailable"}`);
  console.log(`OUTPUT TOKENS   ${metadata.outputTokens ?? "unavailable"}`);
  console.log(`REASONING TOKENS ${metadata.reasoningTokens ?? "unavailable"}`);
  console.log(`TOTAL TOKENS    ${metadata.totalTokens ?? "unavailable"}`);
  console.log("STORE            false");
}

main().catch((error) => {
  const details = [error.status ? `HTTP ${error.status}` : null, error.code, error.type].filter(Boolean).join("; ");
  console.error(`CV IMPORT LUNA SMOKE ERROR: ${error.message}${details ? ` (${details})` : ""}`);
  process.exitCode = 1;
});
