import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createLocalWorkIntegrationFixture } from "./local-work-integration-fixture.mjs";

const outcomes = [];
let stage = "reading local status";
let fixture;
let runFailed = false;

function record(name, condition) {
  assert.equal(Boolean(condition), true, name);
  outcomes.push(name);
}

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

try {
  fixture = await createLocalWorkIntegrationFixture({ onStage: (value) => { stage = value; } });
  const { status, runId, ownerId, delegateId, artistId, institutionId, grantId, ownerClient, ownerRepository, delegateRepository, createPngFile, runSql } = fixture;

  stage = "testing repository metadata flow";
  const profiles = await ownerRepository.listManagedProfiles();
  record("one managed artist profile resolves", profiles.length === 1 && profiles[0].id === artistId);
  record("empty Supabase Work list renders", (await ownerRepository.listWorks([artistId])).length === 0);
  const form = { title: "INTEGRATION WORK", year: "2026", workType: "single-work", format: "digital", materials: "LIGHT, STEEL", height: "10", width: "20", depth: "", dimensionUnit: "cm", duration: "", edition: "1/1", description: "LOCAL INTEGRATION", collaboratorName: "CHAINED TEST", collaboratorUrl: "https://example.com/collaborator", photoCreditName: "LOCAL TEST", photoCreditUrl: "https://example.com/photo" };
  let work = await ownerRepository.createWork(form, artistId);
  const workId = work.id;
  record("draft is created through the repository mapping", work.visibility === "draft" && work.title === "INTEGRATION WORK");
  work = await ownerRepository.getWork(work.id);
  record("refresh reloads the Supabase Work", work?.materials === "LIGHT, STEEL");
  const staleTimestamp = work.updatedAt;
  work = await ownerRepository.updateWork({ ...work, title: "INTEGRATION WORK EDITED" }, staleTimestamp);
  record("metadata editing persists", work.title === "INTEGRATION WORK EDITED");
  let staleDetected = false;
  try { await ownerRepository.updateWork({ ...work, title: "STALE WRITE" }, staleTimestamp); } catch (error) { staleDetected = error.code === "conflict"; }
  record("stale metadata update is detected", staleDetected);

  stage = "testing delegated access";
  record("valid delegated gallery can read the Work", (await delegateRepository.getWork(work.id))?.title === "INTEGRATION WORK EDITED");
  runSql(`update public.profile_access_grants set status='revoked',revoked_at=now(),revoked_by_account_id='${ownerId}'::uuid where id='${grantId}'::uuid;`);
  record("revoked delegation fails immediately", (await delegateRepository.getWork(work.id)) === null);

  stage = "testing media workflow";
  const file = createPngFile();
  const stages = [];
  await ownerRepository.media.upload(work.id, file, true, (value) => stages.push(value));
  work = await ownerRepository.getWork(work.id);
  const imageId = work.images[0].id;
  record("reserve upload finalize reaches ready", stages.join(",") === "RESERVING,UPLOADING,VERIFYING,READY" && work.images.length === 1 && work.images[0].uploadStatus === "ready");
  const privatePath = work.images[0].privatePath;
  const publicPathBeforePublish = work.images[0].publicPath;
  const previewUrl = await ownerRepository.media.privatePreview(work.images[0]);
  record("authorised private preview loads", typeof previewUrl === "string" && previewUrl.startsWith("blob:"));
  ownerRepository.media.urls.revoke(previewUrl);
  const anonymousPrivate = await fetch(`${status.api}/storage/v1/object/authenticated/work-originals/${privatePath.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: status.publishable } });
  record("anonymous private-original access is denied", !anonymousPrivate.ok);

  stage = "testing publication workflow";
  const publishKey = randomUUID();
  const publication = await ownerRepository.media.publish(work.id, publishKey);
  record("publication succeeds", publication.status === "published");
  work = await ownerRepository.getWork(work.id);
  const publishedPublicPath = work.images[0].publicPath;
  const publicWork = await ownerRepository.getPublishedWork(work.id);
  record("anonymous artwork data and public image load", publicWork?.visibility === "published" && (await fetch(publicWork.images[0].src)).ok);
  const publicationRetry = await ownerRepository.media.publish(work.id, publishKey);
  record("publication retry is idempotent", publicationRetry.idempotent === true && work.images.length === 1);

  stage = "testing unpublication and deletion";
  const unpublication = await ownerRepository.media.unpublish(work.id, randomUUID());
  record("unpublication hides public artwork", unpublication.status === "draft" && (await ownerRepository.getPublishedWork(work.id)) === null);
  const oldPublicResponse = await fetch(`${status.api}/storage/v1/object/public/work-public/${publishedPublicPath.split("/").map(encodeURIComponent).join("/")}`);
  const privatePreviewAfterUnpublish = await ownerRepository.media.privatePreview(work.images[0]);
  record("public copy is removed and private original preview remains", !oldPublicResponse.ok && privatePreviewAfterUnpublish.startsWith("blob:"));
  ownerRepository.media.urls.revoke(privatePreviewAfterUnpublish);
  const deletion = await ownerRepository.media.deleteImage(work.images[0].id);
  work = await ownerRepository.getWork(work.id);
  record("image deletion removes the original", deletion.status === "deleted" && work.images.length === 0 && (await ownerClient.storage.from("work-originals").download(privatePath)).error !== null);
  await ownerRepository.deleteWork(work.id);
  record("soft deletion hides Work from dashboard list", (await ownerRepository.listWorks([artistId])).length === 0);

  record("prototype IndexedDB contract remains unchanged", /databaseName = "chained-works"/.test(await (await import("node:fs/promises")).readFile(new URL("../work-store.js", import.meta.url), "utf8")) && publicPathBeforePublish === null);
  process.stdout.write(JSON.stringify({
    ok: true,
    assertions: outcomes.length,
    runId,
    fixture: {
      ownerProfileId: artistId,
      delegateProfileId: institutionId,
      ownerAccountId: ownerId,
      delegateAccountId: delegateId,
      workId,
      imageId
    }
  }));
} catch (error) {
  const safe = sanitizeDiagnostic(error);
  process.stderr.write(`Local Work integration failed while ${stage}: ${safe}.`);
  runFailed = true;
} finally {
  try {
    await fixture?.cleanup();
  } catch (error) {
    process.stderr.write(`\nLocal Work fixture cleanup failed: ${sanitizeDiagnostic(error)}.`);
    runFailed = true;
  }
}

if (runFailed) process.exitCode = 1;
