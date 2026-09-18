import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MAX_BYTES, validateDimensions, validateFile } from "./validation.mjs";
import { createEditState, resetEdits, resetLight } from "./state.mjs";
import { defaultCorners, homography, mapPoint, validateQuadrilateral, warpImageData, warpToCorners } from "./perspective.mjs";
import { compositeOpaqueWhite, maskSelected, rotatedDimensions, scaledDimensions } from "./render-helpers.mjs";

test("HTML versions matching assets and contains every direct control binding", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("./index.html", import.meta.url), "utf8"),
    readFile(new URL("./photo-corrector.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /photo-corrector\.css\?v=4/);
  assert.match(html, /photo-corrector\.js\?v=4/);
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
