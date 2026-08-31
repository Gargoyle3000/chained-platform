import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createLocalWorkIntegrationFixture } from "./local-work-integration-fixture.mjs";

const retainedStateFile = fileURLToPath(new URL("./.local/retained-derivative-fixture.json", import.meta.url));

function sanitizeDiagnostic(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<redacted-database-url>")
    .replace(/https?:\/\/\S+/gi, "<redacted-url>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/\b(authorization|apikey|token|access_token|refresh_token|service_role(?:_key)?|secret(?:_key)?|password)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/g, "<redacted-key>")
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/g, "<redacted-jwt>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function queryDerivativeFixture(imageId) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_CHAINED", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-q", "-t", "-A"], {
    input: `
      select json_build_object(
        'image', json_build_object(
          'id', image.id,
          'workId', image.work_id,
          'privateObjectPath', image.private_object_path,
          'uploadStatus', image.upload_status,
          'originalVerifiedAt', image.original_verified_at,
          'pixelWidth', image.pixel_width,
          'pixelHeight', image.pixel_height
        ),
        'jobs', coalesce((
          select json_agg(json_build_object(
            'id', job.id,
            'workImageId', job.work_image_id,
            'state', job.state,
            'sourceMatchesImage', job.source_private_object_path = image.private_object_path
          ))
          from private.work_image_derivative_jobs job
          where job.work_image_id = image.id
        ), '[]'::json),
        'derivatives', coalesce((
          select json_agg(json_build_object(
            'workImageId', derivative.work_image_id,
            'renditionKey', derivative.rendition_key,
            'state', derivative.state,
            'sourceMatchesImage', derivative.source_private_object_path = image.private_object_path
          ) order by derivative.rendition_key)
          from private.work_image_derivatives derivative
          where derivative.work_image_id = image.id
        ), '[]'::json)
      )
      from public.work_images image
      where image.id = '${imageId}'::uuid;
    `,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error("retained_fixture_derivative_query_failed");
  const output = result.stdout.trim();
  if (!output) throw new Error("retained_fixture_image_missing");
  return JSON.parse(output);
}

function verifyDerivativeFixture(snapshot, imageId, workId) {
  const image = snapshot?.image;
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
  const derivatives = Array.isArray(snapshot?.derivatives) ? snapshot.derivatives : [];
  const small = derivatives.find((derivative) => derivative.renditionKey === "small");
  const large = derivatives.find((derivative) => derivative.renditionKey === "large");
  const job = jobs[0];

  if (!image || image.id !== imageId || image.workId !== workId
    || image.uploadStatus !== "ready" || !image.originalVerifiedAt
    || !Number.isInteger(image.pixelWidth) || image.pixelWidth <= 0
    || !Number.isInteger(image.pixelHeight) || image.pixelHeight <= 0) {
    throw new Error("retained_fixture_image_not_finalized");
  }
  if (jobs.length !== 1 || !job?.id || job.workImageId !== imageId || job.state !== "pending" || !job.sourceMatchesImage) {
    throw new Error("retained_fixture_derivative_job_not_pending");
  }
  if (derivatives.length !== 2 || !small || !large
    || small.workImageId !== imageId || large.workImageId !== imageId
    || small.state !== "pending" || large.state !== "pending"
    || !small.sourceMatchesImage || !large.sourceMatchesImage) {
    throw new Error("retained_fixture_derivatives_not_pending");
  }
  return { image, job, small, large };
}

let fixture;
let retained = false;

try {
  if (existsSync(retainedStateFile)) {
    throw new Error("retained_fixture_state_exists: clean the retained fixture before creating another");
  }

  fixture = await createLocalWorkIntegrationFixture();
  const { runId, ownerId, delegateId, artistId, institutionId, ownerRepository, createRgbJpegFile } = fixture;
  const work = await ownerRepository.createWork({
    title: "RETAINED DERIVATIVE FIXTURE",
    year: "2026",
    workType: "single-work",
    format: "digital",
    materials: "TEST PNG",
    height: "1",
    width: "1",
    depth: "",
    dimensionUnit: "cm",
    duration: "",
    edition: "",
    description: "LOCAL RETAINED DERIVATIVE FIXTURE",
    collaboratorName: "",
    collaboratorUrl: "",
    photoCreditName: "",
    photoCreditUrl: ""
  }, artistId);
  await ownerRepository.media.upload(work.id, createRgbJpegFile(), true, () => {});
  const finalizedWork = await ownerRepository.getWork(work.id);
  const imageId = finalizedWork?.images?.[0]?.id;
  if (!imageId || finalizedWork.images.length !== 1) throw new Error("retained_fixture_image_missing");

  const verified = verifyDerivativeFixture(queryDerivativeFixture(imageId), imageId, work.id);
  const state = {
    runId,
    ownerProfileId: artistId,
    delegateProfileId: institutionId,
    ownerAccountId: ownerId,
    delegateAccountId: delegateId,
    workId: work.id,
    imageId,
    derivativeJobId: verified.job.id
  };
  mkdirSync(new URL("./.local/", import.meta.url), { recursive: true });
  writeFileSync(retainedStateFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  retained = true;
  process.stdout.write(JSON.stringify({
    ok: true,
    runId,
    stateFile: "tests/.local/retained-derivative-fixture.json",
    fixture: state,
    derivativeJobId: verified.job.id,
    derivativeJobState: verified.job.state,
    smallState: verified.small.state,
    largeState: verified.large.state,
    trustedWidth: verified.image.pixelWidth,
    trustedHeight: verified.image.pixelHeight
  }));
} catch (error) {
  process.stderr.write(`Retained derivative fixture creation failed: ${sanitizeDiagnostic(error)}.`);
  process.exitCode = 1;
} finally {
  if (fixture && !retained) {
    try {
      await fixture.cleanup();
    } catch (cleanupError) {
      process.stderr.write(` Retained fixture cleanup failed: ${sanitizeDiagnostic(cleanupError)}.`);
      process.exitCode = 1;
    }
  }
}
