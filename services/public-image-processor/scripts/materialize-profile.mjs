import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = `${root}assets/chained-srgb-v4.icc`;
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, Buffer.from((await readFile(`${root}assets/chained-srgb-v4.icc.base64`, "utf8")).trim(), "base64"));
