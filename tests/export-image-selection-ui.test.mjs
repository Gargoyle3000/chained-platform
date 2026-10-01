import test from "node:test";
import assert from "node:assert/strict";
import { createExportThumbnailSession, openExportImageSelection } from "../data/export-image-selection-ui.mjs";
import { createExportImageSelectionState } from "../data/export-image-selection-state.mjs";

const image = (id = "image-one") => ({ id, src: `https://public.example/${id}.webp` });

test("private picker previews resolve once per image and retain the same URL across selection renders", async () => {
  let calls = 0;
  const session = createExportThumbnailSession({ resolveThumbnail: async (item) => { calls += 1; return `blob:${item.id}`; } });
  assert.equal(await session.resolve(image()), "blob:image-one");
  assert.equal(await session.resolve(image()), "blob:image-one");
  assert.equal(calls, 1);
  assert.equal(session.state(image()).state, "ready");
  assert.equal(session.state(image()).src, "blob:image-one");
});

test("failed picker previews are stable and do not retry during the same session", async () => {
  let calls = 0;
  const session = createExportThumbnailSession({ resolveThumbnail: async () => { calls += 1; throw new Error("unavailable"); } });
  assert.equal(await session.resolve(image()), null);
  assert.equal(await session.resolve(image()), null);
  assert.equal(session.state(image()).state, "failed");
  assert.equal(calls, 1);
});

test("picker disposal revokes each resolved private preview once and a new session resolves again", async () => {
  const revoked = [];
  let calls = 0;
  const resolver = async (item) => { calls += 1; return `blob:${item.id}:${calls}`; };
  const first = createExportThumbnailSession({ resolveThumbnail: resolver, disposeThumbnail: (url) => revoked.push(url) });
  await first.resolve(image());
  first.dispose();
  first.dispose();
  assert.deepEqual(revoked, ["blob:image-one:1"]);
  const second = createExportThumbnailSession({ resolveThumbnail: resolver, disposeThumbnail: (url) => revoked.push(url) });
  assert.equal(await second.resolve(image()), "blob:image-one:2");
  second.dispose();
  assert.equal(calls, 2);
  assert.deepEqual(revoked, ["blob:image-one:1", "blob:image-one:2"]);
});

test("public SELECT thumbnails retain their supplied public source without private preview behavior", async () => {
  const session = createExportThumbnailSession();
  assert.equal(await session.resolve(image("public-image")), "https://public.example/public-image.webp");
  session.dispose();
});

function pickerFixture() {
  const controls = new Map();
  const createElement = (tagName) => ({
    tagName: tagName.toUpperCase(),
    children: [],
    listeners: new Map(),
    hidden: false,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = [...children]; },
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; }
  });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement };
  const dialog = {
    open: false,
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, createElement("div"));
      return controls.get(selector);
    },
    showModal() { this.open = true; },
    close() { this.open = false; this.onclose?.(); }
  };
  const list = dialog.querySelector("[data-export-image-list]");
  return {
    dialog,
    list,
    control: (name) => dialog.querySelector(`[data-export-image-${name}]`),
    restore() { globalThis.document = originalDocument; }
  };
}

function imageRow(list, index = 0) {
  return list.children.filter((child) => child.className === "export-image-choice")[index];
}

test("picker reserves one blank thumbnail slot and reveals a successful image without fallback copy", async () => {
  const fixture = pickerFixture();
  const work = { id: "work", title: "A Work", images: [
    { id: "cover", order: 1, uploadStatus: "ready", isCover: true },
    { id: "detail", order: 2, uploadStatus: "ready" }
  ] };
  const selection = createExportImageSelectionState([work]);
  let resolveCover;
  let changes = 0;
  try {
    openExportImageSelection(fixture.dialog, [work], selection, {
      resolveThumbnail: (image) => image.id === "cover"
        ? new Promise((resolve) => { resolveCover = resolve; })
        : Promise.resolve(null),
      onChange: () => { changes += 1; }
    });
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.list.children[0].textContent, "A Work");
    const first = imageRow(fixture.list);
    const slot = first.children[1];
    const thumbnail = slot.children[0];
    assert.equal(slot.className, "export-image-thumbnail-slot");
    assert.equal(thumbnail.hidden, true);
    assert.equal(thumbnail.src, undefined);
    assert.equal(first.children[2].textContent, "01 · COVER");
    assert.equal(first.children[0].checked, true);
    assert.equal(first.children.length, 3);
    assert.equal(imageRow(fixture.list, 1).children[2].textContent, "02");
    assert.equal(fixture.list.children.some((child) => child.textContent === "IMAGE UNAVAILABLE"), false);

    resolveCover("blob:cover");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(thumbnail.src, "blob:cover");
    assert.equal(thumbnail.hidden, true);
    thumbnail.onload();
    assert.equal(thumbnail.hidden, false);
    assert.equal(imageRow(fixture.list, 1).children[1].children[0].hidden, true);

    const detailCheckbox = imageRow(fixture.list, 1).children[0];
    detailCheckbox.checked = true;
    detailCheckbox.listeners.get("change")();
    assert.deepEqual(selection.ids("work"), ["cover", "detail"]);
    assert.equal(changes, 1);
    assert.equal(imageRow(fixture.list).children[0].checked, true);
    assert.equal(imageRow(fixture.list, 1).children[0].checked, true);
    fixture.dialog.close();
  } finally { fixture.restore(); }
});

test("failed thumbnail loading leaves its reserved area blank without a broken image", async () => {
  const fixture = pickerFixture();
  const work = { id: "work", title: "A Work", images: [{ id: "cover", uploadStatus: "ready", isCover: true }] };
  try {
    openExportImageSelection(fixture.dialog, [work], createExportImageSelectionState([work]), {
      resolveThumbnail: async () => "blob:invalid"
    });
    await new Promise((resolve) => setImmediate(resolve));
    const slot = imageRow(fixture.list).children[1];
    const thumbnail = slot.children[0];
    assert.equal(slot.className, "export-image-thumbnail-slot");
    assert.equal(thumbnail.hidden, true);
    thumbnail.onerror();
    assert.equal(thumbnail.hidden, true);
    assert.equal(thumbnail.src, undefined);
    assert.equal(imageRow(fixture.list).children.length, 3);
    fixture.dialog.close();
  } finally { fixture.restore(); }
});
