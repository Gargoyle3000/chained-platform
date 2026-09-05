import assert from "node:assert/strict";
import test from "node:test";
import { parseLegacyPromotionArguments, requirePromotionProductionGuard } from "../scripts/promote-legacy-public-derivatives-options.mjs";
import { promotionRpcArguments, safePromotionSummary, verifyDerivativeBytes } from "../scripts/promote-legacy-public-derivatives.mjs";
import { createHash } from "node:crypto";
import { derivativeLargePublicPath } from "../data/work-mapping.mjs";

const workId = "b3000000-0000-4000-8000-000000000001";
const imageId = "b4000000-0000-4000-8000-000000000001";

test("legacy public promotion requires an explicit Work or image scope", () => {
  assert.throws(() => parseLegacyPromotionArguments([]), /explicit_target_required/);
  assert.throws(() => parseLegacyPromotionArguments(["--work-id", workId, "--image-id", imageId]), /explicit_target_required/);
  assert.deepEqual(parseLegacyPromotionArguments(["--work-id", workId]), { apply: false, workId, imageIds: [] });
  assert.deepEqual(parseLegacyPromotionArguments(["--image-id", imageId, "--apply"]), { apply: true, workId: "", imageIds: [imageId] });
});

test("promotion apply requires its own production guard and service credential", () => {
  const options = parseLegacyPromotionArguments(["--work-id", workId, "--apply"]);
  assert.throws(() => requirePromotionProductionGuard(options, {}), /production_guard_failed/);
  assert.throws(() => requirePromotionProductionGuard(options, { CHAINED_PRODUCTION_LEGACY_PROMOTION: "1" }), /production_secret_unavailable/);
  assert.doesNotThrow(() => requirePromotionProductionGuard(options, { CHAINED_PRODUCTION_LEGACY_PROMOTION: "1", CHAINED_PRODUCTION_SUPABASE_SECRET_KEY: "not-printed" }));
});

test("promotion RPC bodies use the exact named PostgREST contract", () => {
  assert.deepEqual(promotionRpcArguments({ work_id: workId, image_id: imageId, publication_revision: "b9000000-0000-4000-8000-000000000001" }), {
    target_work_id: workId,
    target_image_id: imageId,
    expected_publication_revision: "b9000000-0000-4000-8000-000000000001",
  });
});

test("public derivative verification requires exact WebP bytes, dimensions, MIME, and checksum", () => {
  const bytes = new Uint8Array(30);
  bytes.set([..."RIFF"].map((value) => value.charCodeAt(0)), 0);
  bytes.set([..."WEBPVP8X"].map((value) => value.charCodeAt(0)), 8);
  bytes[24] = 99; // 100 px wide
  bytes[27] = 139; // 140 px high
  const expected = { file_size: bytes.byteLength, pixel_width: 100, pixel_height: 140, checksum_sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.equal(verifyDerivativeBytes(bytes, "image/webp", expected), true);
  assert.equal(verifyDerivativeBytes(bytes, "image/jpeg", expected), false);
  assert.equal(verifyDerivativeBytes(bytes, "image/webp", { ...expected, pixel_width: 101 }), false);
  assert.equal(verifyDerivativeBytes(bytes, "image/webp", { ...expected, checksum_sha256: "0".repeat(64) }), false);
});

test("dry-run summaries show only safe readiness facts and redact storage paths", () => {
  const summary = safePromotionSummary({ title: "CANARY", work_id: workId, image_id: imageId, current_public_state: "legacy_jpg", original_verified: true, small_ready: true, small_staged: true, large_ready: true, large_staged: true, historic_publish: true, no_active_operation: true, publication_revision: "b9000000-0000-4000-8000-000000000001", private_object_path: "private/source/never-output.jpg", staging_object_path: "internal/staging/never-output.webp" });
  assert.equal(summary.state, "needs_promotion");
  assert.equal(summary.small_staged, true);
  assert.equal(summary.large_staged, true);
  assert.doesNotMatch(JSON.stringify(summary), /private\/source|internal\/staging/);
});

test("dry-run blocks partial or canonical state instead of presenting it as promotable", () => {
  const base = { title: "PARTIAL", work_id: workId, image_id: imageId, current_public_state: "legacy_jpg", original_verified: true, small_ready: true, small_staged: true, large_ready: true, large_staged: true, historic_publish: true, no_active_operation: true, publication_revision: "b9000000-0000-4000-8000-000000000001" };
  const partial = safePromotionSummary({ ...base, already_small: true });
  assert.equal(partial.state, "blocked");
  const canonical = safePromotionSummary({ ...base, canonical_small_pointer: true, already_small: true, already_large: true });
  assert.equal(canonical.state, "already_promoted");
});

test("strict-LARGE public mapping rejects legacy paths and accepts the promoted canonical SMALL pointer", () => {
  const profileId = "b2000000-0000-4000-8000-000000000001";
  const revisionId = "b9000000-0000-4000-8000-000000000001";
  assert.equal(derivativeLargePublicPath("legacy/published.jpg", imageId), null);
  assert.equal(derivativeLargePublicPath(`${profileId}/${workId}/${revisionId}/${imageId}/small.webp`, imageId), `${profileId}/${workId}/${revisionId}/${imageId}/large.webp`);
});
