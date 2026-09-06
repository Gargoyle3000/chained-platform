import test from "node:test";
import assert from "node:assert/strict";
import { createPdfDelivery, PDF_DELIVERY_MIME_TYPE } from "../data/pdf-delivery.mjs";

const bytes = new Uint8Array([37, 80, 68, 70]);

test("PDF delivery exposes file sharing only when the capability accepts the generated File", async () => {
  let shared = null;
  const navigatorRef = {
    canShare(payload) {
      assert.equal(payload.files.length, 1);
      return true;
    },
    async share(payload) { shared = payload; }
  };
  const delivery = createPdfDelivery(bytes, { filename: "chained-select.pdf", navigatorRef });
  assert.equal(delivery.canShareFile, true);
  assert.equal(shared, null, "sharing is never started when the PDF becomes ready");
  assert.deepEqual(await delivery.share(), { status: "shared" });
  assert.equal(shared.files[0] instanceof File, true);
  assert.equal(shared.files[0].name, "chained-select.pdf");
  assert.equal(shared.files[0].type, PDF_DELIVERY_MIME_TYPE);
});

test("PDF delivery falls back when file sharing is unavailable or rejected by canShare", async () => {
  const delivery = createPdfDelivery(bytes, {
    filename: "portfolio.pdf",
    navigatorRef: { share: async () => {}, canShare: () => false }
  });
  assert.equal(delivery.canShareFile, false);
  assert.deepEqual(await delivery.share(), { status: "unavailable" });
});

test("share cancellation and failure retain a ready delivery for another share or download", async () => {
  let cancelledDownload = null;
  const cancellation = createPdfDelivery(bytes, {
    filename: "cancelled.pdf",
    navigatorRef: { canShare: () => true, async share() { const error = new Error("cancelled"); error.name = "AbortError"; throw error; } },
    download(data, options) { cancelledDownload = { data, options }; }
  });
  assert.deepEqual(await cancellation.share(), { status: "cancelled" });
  cancellation.download();
  assert.equal(cancelledDownload.options.filename, "cancelled.pdf");
  let downloaded = null;
  const failure = createPdfDelivery(bytes, {
    filename: "failed.pdf",
    navigatorRef: { canShare: () => true, async share() { throw new Error("share unavailable"); } },
    download(data, options) { downloaded = { data, options }; }
  });
  assert.deepEqual(await failure.share(), { status: "failed" });
  failure.download();
  assert.equal(downloaded.options.filename, "failed.pdf");
  assert.equal(downloaded.options.mimeType, PDF_DELIVERY_MIME_TYPE);
  assert.equal(downloaded.data instanceof Blob, true);
});

test("PDF delivery uses the normal injected download path and releases an obsolete session", () => {
  const calls = [];
  const first = createPdfDelivery(bytes, {
    filename: "first.pdf",
    navigatorRef: {},
    download(data, options) { calls.push({ data, options }); }
  });
  first.download();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.filename, "first.pdf");
  first.dispose();
  assert.throws(() => first.download(), /unavailable/);
  const second = createPdfDelivery(bytes, {
    filename: "second.pdf",
    navigatorRef: {},
    download(data, options) { calls.push({ data, options }); }
  });
  second.download();
  assert.deepEqual(calls.map((entry) => entry.options.filename), ["first.pdf", "second.pdf"]);
});
