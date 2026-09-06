import assert from "node:assert/strict";
import test from "node:test";
import { parseLegacyPromotionArguments, requirePromotionProductionGuard } from "../scripts/promote-legacy-public-derivatives-options.mjs";
import { promotionRpcArguments, runLegacyPublicDerivativePromotion, safePromotionSummary, verifyDerivativeBytes } from "../scripts/promote-legacy-public-derivatives.mjs";
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

const revisionId = "b9000000-0000-4000-8000-000000000001";
const operatorEnvironment = Object.freeze({ CHAINED_PRODUCTION_LEGACY_PROMOTION: "1", CHAINED_PRODUCTION_SUPABASE_SECRET_KEY: "service-key-never-logged" });

function webp(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([..."RIFF"].map((value) => value.charCodeAt(0)), 0);
  bytes.set([..."WEBPVP8X"].map((value) => value.charCodeAt(0)), 8);
  bytes[24] = width - 1;
  bytes[27] = height - 1;
  return bytes;
}

function derivative(stagingObjectPath, publicObjectPath, bytes) {
  return Object.freeze({
    staging_object_path: stagingObjectPath,
    public_object_path: publicObjectPath,
    file_size: bytes.byteLength,
    pixel_width: bytes[24] + 1,
    pixel_height: bytes[27] + 1,
    checksum_sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const promotionRow = Object.freeze({
  title: "INTERRUPTION FIXTURE", work_id: workId, image_id: imageId, publication_revision: revisionId,
  current_public_state: "legacy_jpg", original_verified: true, small_ready: true, small_staged: true,
  large_ready: true, large_staged: true, historic_publish: true, no_active_operation: true,
});

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function webpResponse(bytes) {
  return new Response(bytes, { status: 200, headers: { "content-type": "image/webp" } });
}

function createPromotionFetch({ small, large, smallUploadStatus = 200, largeUploadStatus = 200, finalizerStatus = 200, calls }) {
  const plan = Object.freeze({ status: "ready_to_promote", small, large });
  return async (url, init = {}) => {
    const target = String(url);
    const method = init.method || "GET";
    const label = target.includes("service_legacy_public_derivative_promotion_plan") ? "plan"
      : target.includes("service_finalize_legacy_public_derivative_promotion") ? "finalize"
        : target.includes(small.staging_object_path) ? "stage-small"
          : target.includes(large.staging_object_path) ? "stage-large"
            : target.includes(small.public_object_path) ? (method === "POST" ? "copy-small" : "public-small")
              : target.includes(large.public_object_path) ? (method === "POST" ? "copy-large" : "public-large")
                : "unexpected";
    calls.push(label);
    if (label === "plan") return json(plan);
    if (label === "finalize") return finalizerStatus === 200 ? json({ status: "promoted" }) : json({ code: "finalizer_unavailable" }, finalizerStatus);
    if (label === "stage-small" || label === "public-small") return webpResponse(small.bytes);
    if (label === "stage-large" || label === "public-large") return webpResponse(large.bytes);
    if (label === "copy-small") return new Response(null, { status: smallUploadStatus });
    if (label === "copy-large") return new Response(null, { status: largeUploadStatus });
    throw new Error(`unexpected_request:${target}`);
  };
}

function promotionDependencies(fetch) {
  return Object.freeze({ targetRows: () => [promotionRow], fetch });
}

test("interrupted LARGE copy fails without finalizing, then a verified 409 retry promotes safely", async () => {
  const smallBytes = webp(100, 140);
  const largeBytes = webp(200, 280);
  const small = { ...derivative("stage/small.webp", "canonical/small.webp", smallBytes), bytes: smallBytes };
  const large = { ...derivative("stage/large.webp", "canonical/large.webp", largeBytes), bytes: largeBytes };
  const failedCalls = [];

  await assert.rejects(
    runLegacyPublicDerivativePromotion({ apply: true, workId, imageIds: [] }, operatorEnvironment, promotionDependencies(createPromotionFetch({ small, large, largeUploadStatus: 500, calls: failedCalls }))),
    (error) => {
      assert.match(error.message, /promotion_public_copy_failed/);
      assert.doesNotMatch(error.message, /service-key-never-logged/);
      return true;
    },
  );
  assert.deepEqual(failedCalls, ["plan", "stage-small", "copy-small", "public-small", "stage-large", "copy-large"]);
  assert.equal(failedCalls.includes("finalize"), false);
  assert.doesNotMatch(JSON.stringify(failedCalls), /service-key-never-logged/);

  const retryCalls = [];
  const retry = await runLegacyPublicDerivativePromotion(
    { apply: true, workId, imageIds: [] },
    operatorEnvironment,
    promotionDependencies(createPromotionFetch({ small, large, smallUploadStatus: 409, calls: retryCalls })),
  );
  assert.equal(retry.results[0].action, "promoted");
  assert.deepEqual(retryCalls, ["plan", "stage-small", "copy-small", "public-small", "stage-large", "copy-large", "public-large", "finalize"]);
});

test("finalizer interruption never reports promotion and a verified-copy retry is finalized by the trusted RPC", async () => {
  const smallBytes = webp(101, 141);
  const largeBytes = webp(201, 281);
  const small = { ...derivative("stage/small-finalizer.webp", "canonical/small-finalizer.webp", smallBytes), bytes: smallBytes };
  const large = { ...derivative("stage/large-finalizer.webp", "canonical/large-finalizer.webp", largeBytes), bytes: largeBytes };
  const failedCalls = [];

  await assert.rejects(
    runLegacyPublicDerivativePromotion({ apply: true, workId, imageIds: [] }, operatorEnvironment, promotionDependencies(createPromotionFetch({ small, large, finalizerStatus: 500, calls: failedCalls }))),
    (error) => {
      assert.match(error.message, /promotion_rpc_failed:service_finalize_legacy_public_derivative_promotion/);
      assert.doesNotMatch(error.message, /service-key-never-logged/);
      return true;
    },
  );
  assert.deepEqual(failedCalls, ["plan", "stage-small", "copy-small", "public-small", "stage-large", "copy-large", "public-large", "finalize"]);
  assert.doesNotMatch(JSON.stringify(failedCalls), /service-key-never-logged/);

  const retryCalls = [];
  const retry = await runLegacyPublicDerivativePromotion(
    { apply: true, workId, imageIds: [] },
    operatorEnvironment,
    promotionDependencies(createPromotionFetch({ small, large, smallUploadStatus: 409, largeUploadStatus: 409, calls: retryCalls })),
  );
  assert.equal(retry.results[0].action, "promoted");
  assert.deepEqual(retryCalls, ["plan", "stage-small", "copy-small", "public-small", "stage-large", "copy-large", "public-large", "finalize"]);
});
