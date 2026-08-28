import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error("usage: node scripts/run-real-image-validation.mjs <A.jpg> <1.jpg>");
const outputRoot = resolve("real-output");
await mkdir(outputRoot, { recursive: true });
for (const input of inputs) {
  const output = resolve(outputRoot, Buffer.from(resolve(input)).toString("base64url"));
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["bin/process-image.mjs", "--input", resolve(input), "--output-dir", output], { stdio: "inherit" });
    child.once("exit", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`processor exited ${code}`)));
  });
}
