import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MAX_BYTES, validateDimensions, validateFile } from "./validation.mjs";
import { createEditState, resetEdits, resetLight } from "./state.mjs";
import { defaultCorners, homography, mapPoint, validateQuadrilateral, warpImageData, warpToCorners } from "./perspective.mjs";
import { compositeOpaqueWhite, maskSelected, rotatedDimensions, scaledDimensions } from "./render-helpers.mjs";
import { canShareImageFile, deliverExport, exportFilename } from "./export-delivery.mjs";
import { connectedMaskFromPixels } from "./connected-mask.mjs";

test("HTML versions matching assets and contains every direct control binding", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("./index.html", import.meta.url), "utf8"),
    readFile(new URL("./photo-corrector.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /photo-corrector\.css\?v=4/);
  assert.match(html, /photo-corrector\.js\?v=6/);
  assert.doesNotMatch(script, /data-guides/);
  assert.match(html, /<section class="workspace" data-workspace>/);
  assert.match(html, /<section class="editor">[\s\S]*data-import-panel/);
  assert.match(script, /renderImage\(canvas\)/);
  assert.match(script, /renderImage\(document\.createElement\("canvas"\),1\)/);
  for (const attribute of ["id=\"image-input\"", "data-canvas", "data-status", "data-editor-status", "data-workspace", "data-file-info", "data-dropzone", "data-import", "data-straighten", "data-warp", "data-warp-actions", "data-apply-warp", "data-cancel-warp", "data-pick-wall", "data-reset-light", "data-reset", "data-before"]) {
    assert.ok(html.includes(attribute), `${attribute} exists in index.html`);
  }
});

test("preview and full-resolution renders retain proportional geometry", () => {
  const preview = scaledDimensions(4000, 2000, .45), full = scaledDimensions(4000, 2000, 1);
  assert.deepEqual(preview, { width: 1800, height: 900 });
  assert.deepEqual(rotatedDimensions(preview.width, preview.height, 90), { width: 900, height: 1800 });
  assert.deepEqual(rotatedDimensions(full.width, full.height, 90), { width: 2000, height: 4000 });
});

test("wall masks map through normalized output coordinates", () => {
  const mask = new Uint8Array(4 * 2); mask[7] = 1;
  assert.equal(maskSelected(mask, 4, 2, 7, 3, 8, 4), true);
  assert.equal(maskSelected(mask, 4, 2, 1, 1, 8, 4), false);
});

test("transparent raster pixels resolve to opaque white", () => {
  const pixels = new Uint8ClampedArray([20, 30, 40, 0, 0, 0, 0, 128]);
  compositeOpaqueWhite(pixels);
  assert.deepEqual([...pixels], [255, 255, 255, 255, 127, 127, 127, 255]);
});

test("connected wall analysis ignores guide pixels drawn on the display overlay", () => {
  const width = 5, height = 5, clean = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < clean.length; index += 4) { clean[index] = 200; clean[index + 1] = 200; clean[index + 2] = 200; clean[index + 3] = 255; }
  const displayed = clean.slice();
  for (let y = 0; y < height; y++) { const offset = (y * width + 2) * 4; displayed[offset] = 0; displayed[offset + 1] = 252; displayed[offset + 2] = 40; }
  assert.notDeepEqual(displayed, clean);
  const mask = connectedMaskFromPixels(clean, width, height, 0, 0, 35);
  assert.equal(mask.every(Boolean), true);
});

class TestFile {
  constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; }
}

function deliveryPlatform({ coarse = false, canShare = false, share, createObjectURL } = {}) {
  const downloads = [], revoked = [];
  return {
    File: TestFile,
    navigator: { canShare: () => canShare, share },
    matchMedia: () => ({ matches: coarse }),
    URL: { createObjectURL: createObjectURL || (() => "blob:corrected"), revokeObjectURL: url => revoked.push(url) },
    document: { createElement: () => ({ click() { downloads.push({ href: this.href, download: this.download }); } }) },
    setTimeout: callback => callback(),
    downloads,
    revoked
  };
}

test("mobile file sharing preserves the Blob, MIME type and filename", async () => {
  const blob = new Blob(["image bytes"], { type: "image/png" }), shared = [];
  const platform = deliveryPlatform({ coarse: true, canShare: true, share: data => shared.push(data) });
  assert.equal(exportFilename("image/png", 123), "corrected-123.png");
  assert.equal(await deliverExport(blob, "corrected-123.png", platform), "shared");
  assert.equal(shared[0].files[0].parts[0], blob);
  assert.equal(shared[0].files[0].name, "corrected-123.png");
  assert.equal(shared[0].files[0].type, "image/png");
  assert.deepEqual(platform.downloads, []);
});

test("share cancellation is quiet and genuine share failures remain failures", async () => {
  const blob = new Blob(["image bytes"], { type: "image/jpeg" });
  const cancelled = deliveryPlatform({ coarse: true, canShare: true, share: () => Promise.reject(Object.assign(new Error(), { name: "AbortError" })) });
  assert.equal(await deliverExport(blob, "corrected-123.jpg", cancelled), "cancelled");
  const failed = deliveryPlatform({ coarse: true, canShare: true, share: () => Promise.reject(new Error("share failed")) });
  await assert.rejects(() => deliverExport(blob, "corrected-123.jpg", failed), /share failed/);
});

test("desktop and unsupported sharing use the current download fallback and revoke its URL", async () => {
  const blob = new Blob(["image bytes"], { type: "image/jpeg" });
  const desktop = deliveryPlatform({ coarse: false, canShare: true, share: () => assert.fail("desktop must not share") });
  assert.equal(canShareImageFile(desktop, new TestFile([blob], "corrected-123.jpg", { type: blob.type })), false);
  assert.equal(await deliverExport(blob, "corrected-123.jpg", desktop), "downloaded");
  assert.deepEqual(desktop.downloads, [{ href: "blob:corrected", download: "corrected-123.jpg" }]);
  assert.deepEqual(desktop.revoked, ["blob:corrected"]);
  const unsupported = deliveryPlatform({ coarse: true, canShare: false });
  assert.equal(await deliverExport(blob, "corrected-123.jpg", unsupported), "downloaded");
  const throwing = deliveryPlatform({ coarse: true });
  throwing.navigator.canShare = () => { throw new TypeError("unsupported files"); };
  assert.equal(await deliverExport(blob, "corrected-123.jpg", throwing), "downloaded");
});

test("accepts supported files within the 20 MB limit", () => {
  assert.equal(validateFile({ type: "image/jpeg", size: MAX_BYTES }).valid, true);
  assert.equal(validateFile({ type: "image/png", size: MAX_BYTES + 1 }).valid, false);
  assert.equal(validateFile({ type: "image/webp", size: 1 }).valid, false);
});

test("rejects source dimensions above 50 megapixels", () => {
  assert.equal(validateDimensions(10_000, 5_000).valid, true);
  assert.equal(validateDimensions(10_001, 5_000).valid, false);
});

test("edit state resets perspective geometry", () => {
  const state = createEditState(); state.light.exposure = 1; state.rotation = 90; resetLight(state);
  assert.equal(state.light.exposure, 0); resetEdits(state);
  assert.equal(state.rotation, 0);
  state.perspectiveApplied = true; resetEdits(state); assert.equal(state.perspectiveApplied, false);
  assert.deepEqual(state.warpCorners, defaultCorners());
  assert.deepEqual(state.guides, { leftX: .12, rightX: .88, topY: .12, bottomY: .88 });
});

test("validates corner ordering and maps identity geometry", () => {
  const corners=defaultCorners(); assert.equal(validateQuadrilateral(corners).valid,true);
  assert.equal(validateQuadrilateral({topLeft:{x:0,y:0},topRight:{x:1,y:1},bottomRight:{x:1,y:0},bottomLeft:{x:0,y:1}}).valid,false);
  const h=homography([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]);
  assert.deepEqual(mapPoint(h,{x:3,y:7}),{x:3,y:7});
});

test("resamples a trapezium to a rectangle with bilinear pixels", () => {
  const data=new Uint8ClampedArray(4*4*4); for(let i=0;i<data.length;i+=4){data[i]=i/4;data[i+3]=255;}
  const warped=warpImageData(data,4,4,{topLeft:{x:.25,y:0},topRight:{x:.75,y:0},bottomRight:{x:1,y:1},bottomLeft:{x:0,y:1}});
  assert.equal(warped.width,3);assert.equal(warped.height,4);assert.equal(warped.data.length,48);
});

test("free warp changes pixels while guide state remains independent", () => {
  const data=new Uint8ClampedArray(4*4*4);data.forEach((_,index)=>{data[index]=index%4===3?255:index;});
  const warped=warpToCorners(data,4,4,{topLeft:{x:0,y:0},topRight:{x:.75,y:.25},bottomRight:{x:1,y:1},bottomLeft:{x:0,y:1}});
  assert.equal(warped.width,4);assert.equal(warped.height,4);assert.notDeepEqual(warped.data,data);
});
