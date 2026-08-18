import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { FRONTEND_MODES } from "../auth/config.mjs";
import { selectWorkRepository } from "../data/work-repository.mjs";
import { INDEXEDDB_BOUNDARY } from "../data/indexeddb-work-repository.mjs";
import { createSupabaseWorkRepository } from "../data/supabase-work-repository.mjs";
import { createWorkMediaService, MAX_IMAGE_BYTES, UPLOAD_STAGES, validateImageFile } from "../data/work-media-service.mjs";
import { createIdempotencyState, createObjectUrlRegistry, databaseToWork, formToDatabase, isValidWorkId, mapPublicArtworkRows, publicationReadiness, resolveManagedProfileState, WORK_COLUMNS, WORK_SELECT } from "../data/work-mapping.mjs";
import { sanitizeWorkError, WORK_ERROR_CODES } from "../data/work-errors.mjs";

const ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_TWO = "22222222-2222-4222-8222-222222222222";
const IMAGE_THREE = "33333333-3333-4333-8333-333333333333";
const baseForm = { title: "  Work  ", year: "2026", workType: "single-work", format: "painting", materials: "Wood, Steel, wood, ", height: "1.5", width: "2", depth: "0", dimensionUnit: "cm", duration: "", edition: "  1/3 ", description: " Text ", collaboratorName: "Name", collaboratorUrl: "https://example.com/a", photoCreditName: "Photo", photoCreditUrl: "https://example.com/p" };

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
  assert.equal(row.format_discipline, "painting");
  assert.equal(row.primary_medium, null);
  assert.equal(row.support_base, null);
  assert.deepEqual(row.additional_materials, ["Wood", "Steel"]);
  assert.equal(row.height, 1.5);
  assert.equal(row.depth, 0);
  assert.equal(row.duration_text, null);
  assert.equal(row.edition_text, "1/3");
  assert.equal(row.collaborator_url, "https://example.com/a");
  assert.equal(Object.hasOwn(row, "owner_profile_id"), false);
  const client = databaseToWork({ id: ID, owner_profile_id: ID, ...row, visibility: "draft", created_at: "a", updated_at: "b" });
  assert.equal(client.materials, "Wood, Steel");
  assert.equal(client.year, "2026");
  assert.equal(client.height, "1.5");
  assert.deepEqual(client.materialTerms, ["wood", "steel"]);
});

test("legacy materials load once and migrate only when the unified editor saves", () => {
  const legacy = databaseToWork({
    id: ID,
    owner_profile_id: ID,
    title: "LEGACY",
    primary_medium: "Oil",
    support_base: "Linen",
    additional_materials: ["wood", "OIL", "Steel"],
    visibility: "draft",
    created_at: "a",
    updated_at: "b"
  });
  assert.equal(legacy.materials, "Oil, Linen, wood, Steel");
  assert.deepEqual(legacy.materialTerms, ["oil", "linen", "wood", "steel"]);

  const saved = formToDatabase({ ...baseForm, materials: legacy.materials });
  assert.equal(saved.primary_medium, null);
  assert.equal(saved.support_base, null);
  assert.deepEqual(saved.additional_materials, ["Oil", "Linen", "wood", "Steel"]);

  const removed = formToDatabase({ ...baseForm, materials: "Oil, wood, Steel" });
  assert.deepEqual(removed.additional_materials, ["Oil", "wood", "Steel"]);
  assert.equal(databaseToWork({ id: ID, owner_profile_id: ID, ...removed, visibility: "draft", created_at: "a", updated_at: "b" }).materials, "Oil, wood, Steel");
});

test("the Work editor uses one plain comma-separated MATERIALS input", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../dashboard-work-edit.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-form.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /name="materials"\s+placeholder="Use commas to separate materials"/s);
  assert.doesNotMatch(html, /primary-medium|support-base|additional-materials|data-material-combobox|role="listbox"/);
  assert.doesNotMatch(script, /materialOptions|appendMaterialSuggestion|data-material-combobox/);
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

test("private media requests use deduplicated image IDs, purpose, and gateway response order", async () => {
  const calls = [];
  const preview = createWorkMediaService({
    functions: {
      invoke: async (name, { body }) => {
        calls.push({ name, body });
        return {
          data: {
            ok: true,
            purpose: body.purpose,
            media: body.imageIds.map((imageId) => ({ imageId, url: `https://signed.example/${imageId}`, mimeType: "image/png", fileSize: 1 }))
          },
          error: null
        };
      }
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://public.example/image" } }) }) }
  });

  const media = await preview.authorizedPrivateMedia([{ id: IMAGE_TWO }, { id: ID, privatePath: "not-sent" }, { id: IMAGE_TWO }], { purpose: "pdf_export" });
  assert.deepEqual(calls, [{ name: "authorized-private-media", body: { imageIds: [IMAGE_TWO, ID], purpose: "pdf_export" } }]);
  assert.deepEqual(media.map((item) => item.imageId), [IMAGE_TWO, ID]);
  assert.equal(JSON.stringify(calls).includes("not-sent"), false);
  assert.equal(preview.publicUrl("public/path"), "https://public.example/image");
});

test("private previews batch gateway authorization, create revocable blobs, and never use direct Storage", async () => {
  const calls = [];
  const downloads = [];
  const preview = createWorkMediaService(
    {
      functions: {
        invoke: async (name, { body }) => {
          calls.push({ name, body });
          return { data: { ok: true, purpose: "preview", media: body.imageIds.map((imageId) => ({ imageId, url: `https://signed.example/${imageId}`, mimeType: "image/png", fileSize: 1 })) }, error: null };
        }
      }
    },
    {},
    { fetcher: async (url) => { downloads.push(url); return new Response(new Blob(["image"], { type: "image/png" }), { status: 200 }); } }
  );
  const previews = await preview.privatePreviewBatch([{ id: ID, privatePath: "private/path" }, { id: IMAGE_TWO }]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { imageIds: [ID, IMAGE_TWO], purpose: "preview" });
  assert.deepEqual(downloads, [`https://signed.example/${ID}`, `https://signed.example/${IMAGE_TWO}`]);
  assert.equal(downloads.some((url) => url.includes("/storage/v1/object/authenticated/work-originals/")), false);
  assert.equal(previews.get(ID).startsWith("blob:"), true);
  assert.equal(preview.urls.size(), 2);
  preview.urls.revoke(previews.get(ID));
  preview.urls.revokeAll();
  assert.equal(preview.urls.size(), 0);
});

test("private media rejects malformed or partial gateway responses without a Storage fallback", async () => {
  let downloads = 0;
  const preview = createWorkMediaService(
    { functions: { invoke: async () => ({ data: { ok: true, purpose: "preview", media: [{ imageId: ID, url: "https://signed.example/one", mimeType: "image/png", fileSize: 1 }] }, error: null }) } },
    {},
    { fetcher: async () => { downloads += 1; return new Response(); } }
  );
  await assert.rejects(() => preview.privatePreviewBatch([{ id: ID }, { id: IMAGE_TWO }]));
  assert.equal(downloads, 0);
});

test("private signed downloads re-sign only expired items once with bounded concurrency", async () => {
  const calls = [];
  const attempts = new Map();
  let active = 0;
  let peak = 0;
  const preview = createWorkMediaService(
    {
      functions: {
        invoke: async (_name, { body }) => {
          calls.push(body.imageIds);
          return { data: { ok: true, purpose: "pdf_export", media: body.imageIds.map((imageId) => ({ imageId, url: `https://signed.example/${imageId}/${calls.length}`, mimeType: "image/png", fileSize: 1 })) }, error: null };
        }
      }
    },
    {},
    {
      fetcher: async (url) => {
        const imageId = url.split("/").at(-2);
        attempts.set(imageId, (attempts.get(imageId) || 0) + 1);
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return imageId === IMAGE_TWO && attempts.get(imageId) === 1
          ? new Response(null, { status: 403 })
          : new Response(new Blob([imageId]), { status: 200 });
      }
    }
  );
  const media = await preview.downloadAuthorizedPrivateMedia([{ id: ID }, { id: IMAGE_TWO }, { id: IMAGE_THREE }], { purpose: "pdf_export", concurrency: 2 });
  assert.deepEqual(calls, [[ID, IMAGE_TWO, IMAGE_THREE], [IMAGE_TWO]]);
  assert.deepEqual(media.map((item) => item.imageId), [ID, IMAGE_TWO, IMAGE_THREE]);
  assert.equal(attempts.get(ID), 1);
  assert.equal(attempts.get(IMAGE_TWO), 2);
  assert.ok(peak <= 2);
});

test("private media chunks more than 100 image IDs and retries temporary gateway failures twice", async () => {
  const ids = Array.from({ length: 101 }, (_, index) => `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`);
  const calls = [];
  let attempts = 0;
  const waits = [];
  const preview = createWorkMediaService(
    {
      functions: {
        invoke: async (_name, { body }) => {
          attempts += 1;
          calls.push(body.imageIds);
          if (attempts <= 2) return { data: null, error: { status: 503 } };
          return { data: { ok: true, purpose: "preview", media: body.imageIds.map((imageId) => ({ imageId, url: `https://signed.example/${imageId}`, mimeType: "image/png", fileSize: 1 })) }, error: null };
        }
      }
    },
    {},
    { wait: async (milliseconds) => waits.push(milliseconds), random: () => 0 }
  );
  const media = await preview.authorizedPrivateMedia(ids, { purpose: "preview" });
  assert.equal(media.length, 101);
  assert.deepEqual(calls.map((batch) => batch.length), [100, 100, 100, 1]);
  assert.equal(waits.length, 2);
});

test("private preview sanitizes failed signed downloads without logging credentials", async () => {
  const privatePath = "private/object.png";
  const consoleErrors = [];
  const originalConsoleError = console.error;
  const preview = createWorkMediaService(
    { functions: { invoke: async (_name, { body }) => ({ data: { ok: true, purpose: body.purpose, media: [{ imageId: ID, url: "https://signed.example/private", mimeType: "image/png", fileSize: 1 }] }, error: null }) } },
    {},
    { fetcher: async () => new Response(null, { status: 404 }) }
  );

  console.error = (...entry) => consoleErrors.push(entry);
  try {
    await assert.rejects(() => preview.privatePreview({ id: ID, privatePath }), (error) => {
      assert.equal(error.code, WORK_ERROR_CODES.NOT_FOUND);
      assert.equal(error.message.includes(privatePath), false);
      return true;
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(consoleErrors, []);
  assert.equal(preview.urls.size(), 0);
});

test("private preview consumers use shared batches while public published media stays public", async () => {
  const [editor, works, overview, portfolio, service] = await Promise.all([
    readFile(new URL("../dashboard-form.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-works.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-overview.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-portfolio-export.js", import.meta.url), "utf8"),
    readFile(new URL("../data/work-media-service.mjs", import.meta.url), "utf8")
  ]);
  assert.match(editor, /privatePreviewBatch\(privateImages\)/);
  assert.match(works, /privatePreviewBatch\(privateCovers\)/);
  assert.match(overview, /privatePreviewBatch\(privateCovers\)/);
  assert.match(portfolio, /downloadAuthorizedPrivateMedia\(images, \{ purpose: "pdf_export", concurrency: 4 \}\)/);
  assert.doesNotMatch(portfolio, /privatePreview\(/);
  assert.match(works, /repository\.media\.publicUrl\(cover\.publicPath\)/);
  assert.doesNotMatch(service, /storage\/v1\/object\/authenticated\/work-originals/);
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
  const work = {
    id: ID,
    owner_profile_id: ID,
    title: "A",
    year_label: "2026",
    primary_medium: "Oil",
    support_base: "Canvas",
    additional_materials: ["oil", "STUDS"],
    visibility: "published",
    created_at: "a",
    updated_at: "b"
  };
  const profile = { display_name: "Artist", slug: "artist", publication_status: "published" };
  assert.equal(mapPublicArtworkRows([{ ...work, visibility: "draft" }], [profile], [], () => ""), null);
  const mapped = mapPublicArtworkRows([work], [profile], [{ id: ID, work_id: ID, private_object_path: "secret", public_object_path: "public", sort_order: 0, is_cover: true }], () => "safe");
  assert.equal(mapped.images[0].privatePath, null);
  assert.equal(JSON.stringify(mapped).includes("secret"), false);
  assert.equal(mapped.materials, "Oil, Canvas, STUDS");
  assert.deepEqual(mapped.materialTerms, ["oil", "canvas", "studs"]);
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
