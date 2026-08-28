import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { processImage, ProcessorFailure } from "../lib/processor.mjs";

const args = process.argv.slice(2);
const valueFor = (name) => args[args.indexOf(name) + 1];
const input = valueFor("--input");
const outputDir = valueFor("--output-dir");
if (!input || !outputDir) { console.log(JSON.stringify({ ok: false, code: "usage", detail: "Use --input <path> --output-dir <path>." })); process.exitCode = 2; }
else try {
  const result = await processImage(resolve(input), resolve(outputDir));
  await mkdir(resolve(outputDir), { recursive: true });
  await writeFile(resolve(outputDir, "result.json"), `${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  const code = error instanceof ProcessorFailure ? error.code : "processing_failed";
  console.log(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
}
