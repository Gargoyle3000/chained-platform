import test from "node:test";
import assert from "node:assert/strict";

import { FRONTEND_MODES } from "../auth/config.mjs";
import { selectWorkRepository } from "../data/work-repository.mjs";
import { INDEXEDDB_BOUNDARY } from "../data/indexeddb-work-repository.mjs";
import { createSupabaseWorkRepository } from "../data/supabase-work-repository.mjs";
import { createWorkMediaService, MAX_IMAGE_BYTES, UPLOAD_STAGES, validateImageFile } from "../data/work-media-service.mjs";
import { createIdempotencyState, createObjectUrlRegistry, databaseToWork, formToDatabase, isValidWorkId, mapPublicArtworkRows, publicationReadiness, resolveManagedProfileState, WORK_COLUMNS, WORK_SELECT } from "../data/work-mapping.mjs";
import { sanitizeWorkError, WORK_ERROR_CODES } from "../data/work-errors.mjs";

const ID = "11111111-1111-4111-8111-111111111111";
const baseForm = { title: "  Work  ", year: "2026", workType: "single-work", format: "painting", primaryMedium: "Oil", supportBase: "Linen", additionalMaterials: "Wood, Steel", height: "1.5", width: "2", depth: "0", dimensionUnit: "cm", duration: "", edition: "  1/3 ", description: " Text ", collaboratorName: "Name", collaboratorUrl: "https://example.com/a", photoCreditName: "Photo", photoCreditUrl: "https://example.com/p" };

test("adapter selection is explicit in prototype and local modes", () => {
  const store = { initialiseDatabase() {}, getAllWorks() {}, getWork() {}, createWork() {}, updateWork() {}, deleteWork() {} };
  assert.equal(selectWorkRepository({ mode: FRONTEND_MODES.PROTOTYPE }, store).mode, "prototype");
  const client = { storage: { from: () => ({ getPublicUrl: () => ({ data: {} }) }) } };
  assert.equal(selectWorkRepository({ mode: FRONTEND_MODES.SUPABASE, client, config: {} }, store).mode, "supabase");
});

test("IndexedDB preservation boundary retains the legacy database and store", () => {
  assert.deepEqual(INDEXEDDB_BOUNDARY, { databaseName: "chained-works", version: 1, objectStoreName: "works", migrationMarker: null });
});

test("form and database mapping normalize every supported field", () => {
  const row = formToDatabase(baseForm);
  assert.equal(row.title, "Work");
  assert.equal(row.year_label, "2026");
  assert.equal(row.year_sort, 2026);
  assert.deepEqual(row.additional_materials, ["Wood", "Steel"]);
  assert.equal(row.height, 1.5);
  assert.equal(row.depth, 0);
  assert.equal(row.duration_text, null);
  assert.equal(row.edition_text, "1/3");
  assert.equal(row.collaborator_url, "https://example.com/a");
  assert.equal(Object.hasOwn(row, "owner_profile_id"), false);
  const client = databaseToWork({ id: ID, owner_profile_id: ID, ...row, visibility: "draft", created_at: "a", updated_at: "b" });
  assert.equal(client.additionalMaterials, "Wood, Steel");
  assert.equal(client.year, "2026");
  assert.equal(client.height, "1.5");
  assert.deepEqual(client.materialTerms, ["oil", "linen", "wood", "steel"]);
});

test("Work links add HTTPS when artists omit a protocol", () => {
  const row = formToDatabase({
    ...baseForm,
    collaboratorUrl: "www.example.com/collaborator",
    photoCreditUrl: "example.com/photo"
  });
  assert.equal(row.collaborator_url, "https://www.example.com/collaborator");
  assert.equal(row.photo_credit_url, "https://example.com/photo");
});

test("year, dimensions, and URLs reject invalid values", () => {
  assert.throws(() => formToDatabase({ ...baseForm, year: "circa 2026" }), /YEAR/);
  assert.throws(() => formToDatabase({ ...baseForm, height: "-1" }), /HEIGHT/);
  assert.throws(() => formToDatabase({ ...baseForm, width: "Infinity" }), /WIDTH/);
  assert.throws(() => formToDatabase({ ...baseForm, collaboratorUrl: "javascript:alert(1)" }), /HTTP/);
  assert.throws(() => formToDatabase({ ...baseForm, photoCreditUrl: "https://name:pass@example.com" }), /HTTP/);
});

test("Work IDs accept UUIDs and reject arbitrary route values", () => {
  assert.equal(isValidWorkId(ID), true);
  assert.equal(isValidWorkId("seed-work"), false);
});

test("database selection is explicit", () => {
  assert.ok(WORK_COLUMNS.length > 20);
  assert.equal(WORK_SELECT.includes("*"), false);
  assert.equal(WORK_COLUMNS.includes("deleted_at"), false);
  assert.equal(WORK_COLUMNS.includes("created_by_account_id"), false);
});

test("managed profile resolution covers zero, one, and multiple", () => {
  assert.equal(resolveManagedProfileState([]).kind, "none");
  assert.equal(resolveManagedProfileState([{ id: 1 }]).selected.id, 1);
  assert.equal(resolveManagedProfileState([{ id: 1 }, { id: 2 }]).kind, "multiple");
});

test("file validation enforces MIME, nonzero, and the 50 MiB boundary", () => {
  assert.equal(validateImageFile({ type: "image/avif", size: MAX_IMAGE_BYTES }).size, MAX_IMAGE_BYTES);
  assert.throws(() => validateImageFile({ type: "image/svg+xml", size: 1 }), /JPEG/);
  assert.throws(() => validateImageFile({ type: "image/png", size: 0 }), /EMPTY/);
  assert.throws(() => validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }), /50 MB/);
});

test("upload reports only the four real stages", async () => {
  const stages = [];
  const client = {
    rpc: async () => ({ data: [{ work_image_id: ID, bucket_id: "work-originals", object_path: "private", mime_type: "image/png", file_size: 1 }], error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: {} }) }) },
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) }
  };
  await createWorkMediaService(client).upload(ID, { name: "x.png", type: "image/png", size: 1 }, true, (stage) => stages.push(stage));
  assert.deepEqual(stages, UPLOAD_STAGES);
});

test("upload errors are sanitized", async () => {
  const client = { rpc: async () => ({ data: null, error: new Error("private path leaked") }), storage: { from: () => ({ getPublicUrl: () => ({ data: {} }) }) }, functions: {} };
  await assert.rejects(() => createWorkMediaService(client).upload(ID, { name: "x.png", type: "image/png", size: 1 }, true), /IMAGE COULD NOT BE ADDED/);
});

test("publication readiness denies missing, unready, and coverless images", () => {
  const work = { title: "A", year: "2026", workType: "video", images: [] };
  assert.deepEqual(publicationReadiness(work).reasons, ["missing_image"]);
  assert.ok(publicationReadiness({ ...work, images: [{ uploadStatus: "reserved", isCover: true }] }).reasons.includes("unready_image"));
  assert.ok(publicationReadiness({ ...work, images: [{ uploadStatus: "ready", isCover: false }] }).reasons.includes("missing_cover"));
  assert.equal(publicationReadiness({ ...work, images: [{ uploadStatus: "ready", isCover: true }] }).ready, true);
});

test("idempotency key is reused until reset", () => {
  let count = 0;
  const state = createIdempotencyState(() => `key-${++count}`);
  assert.equal(state.current(), state.current());
  state.reset();
  assert.equal(state.current(), "key-2");
});

test("public artwork mapping hides nonpublic rows and suppresses private paths", () => {
  const work = { id: ID, owner_profile_id: ID, title: "A", year_label: "2026", visibility: "published", created_at: "a", updated_at: "b" };
  const profile = { display_name: "Artist", slug: "artist", publication_status: "published" };
  assert.equal(mapPublicArtworkRows([{ ...work, visibility: "draft" }], [profile], [], () => ""), null);
  const mapped = mapPublicArtworkRows([work], [profile], [{ id: ID, work_id: ID, private_object_path: "secret", public_object_path: "public", sort_order: 0, is_cover: true }], () => "safe");
  assert.equal(mapped.images[0].privatePath, null);
  assert.equal(JSON.stringify(mapped).includes("secret"), false);
});

test("object URLs are revoked individually and on teardown", () => {
  const revoked = [];
  let count = 0;
  const registry = createObjectUrlRegistry({ createObjectURL: () => `blob:${++count}`, revokeObjectURL: (url) => revoked.push(url) });
  const first = registry.create({});
  registry.create({});
  registry.revoke(first);
  registry.revokeAll();
  assert.deepEqual(revoked, ["blob:1", "blob:2"]);
});

test("generic and authorization errors never expose raw details", () => {
  assert.equal(sanitizeWorkError(new Error("database secret")).message, "WORK IS CURRENTLY UNAVAILABLE");
  assert.equal(sanitizeWorkError({ status: 403, message: "policy detail" }).code, WORK_ERROR_CODES.UNAUTHORIZED);
});

test("optimistic update maps an empty conditional update to a conflict", async () => {
  let call = 0;
  const builder = (result) => ({ update: () => builder(result), select: () => builder(result), eq: () => builder(result), maybeSingle: async () => result });
  const client = {
    from: () => ++call === 1 ? builder({ data: null, error: null }) : builder({ data: { id: ID }, error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: {} }) }) }
  };
  const repository = createSupabaseWorkRepository(client, {});
  await assert.rejects(() => repository.updateWork({ id: ID, ...baseForm }, "old"), (error) => error.code === WORK_ERROR_CODES.CONFLICT);
});
