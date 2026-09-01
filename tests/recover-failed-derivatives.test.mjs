import assert from "node:assert/strict";
import test from "node:test";
import { parseArguments, run } from "../scripts/recover-failed-derivatives.mjs";
const work="11111111-1111-4111-8111-111111111111", image="22222222-2222-4222-8222-222222222222";
const bytes=new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x20,0,0,0,0,0,0,0,0x9d,1,0x2a,0x45,5,8,7]);
function deps(calls,remove){return {targetRow:()=>({private_object_path:"private/original.webp",pixel_width:1285,pixel_height:2055,job_id:"33333333-3333-4333-8333-333333333333",derivatives:[{key:"small",path:"private/s.webp"},{key:"large",path:"private/l.webp"}]}),original:async()=>({bytes,mimeType:"image/webp"}),remove:remove??(async p=>calls.push(["remove",p])),requeue:async(i,d)=>calls.push(["requeue",i,d])};}
test("dry run is non-mutating and reports safe corrected dimensions",async()=>{const calls=[];const out=await run(parseArguments(["--work-id",work,"--image-id",image]),deps(calls));assert.equal(calls.length,0);assert.deepEqual(out[0].authoritative_dimensions,{width:1349,height:1800});assert.equal(JSON.stringify(out).includes("private/original.webp"),false);});
test("apply deletes exact staging outputs before requeue",async()=>{const calls=[];await run(parseArguments(["--apply","--work-id",work,"--image-id",image]),deps(calls));assert.equal(calls[0][0],"remove");assert.equal(calls[1][0],"requeue");});
test("cleanup failure prevents requeue",async()=>{const calls=[];await assert.rejects(()=>run(parseArguments(["--apply","--work-id",work,"--image-id",image]),deps(calls,async()=>{throw new Error("staging_cleanup_failed");})),/staging_cleanup_failed/);assert.equal(calls.length,0);});
