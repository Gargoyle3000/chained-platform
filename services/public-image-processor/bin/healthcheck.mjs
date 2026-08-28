import sharp from "sharp";
import { PIPELINE_VERSION } from "../lib/constants.mjs";
console.log(JSON.stringify({ ok: true, pipelineVersion: PIPELINE_VERSION, sharp: sharp.versions }));
