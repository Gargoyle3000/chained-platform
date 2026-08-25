import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  attachPublicWorkCarousel,
  createPublicWorkCarouselState,
  nextCarouselIndex
} from "../public-work-carousel.mjs";

function classList() {
  const values = new Set();
  return { add: (value) => values.add(value), contains: (value) => values.has(value) };
}

function element() {
  const target = new EventTarget();
  const captures = new Set();
  target.attributes = new Map();
  target.dataset = {};
  target.classList = classList();
  target.style = { setProperty() {} };
  target.setAttribute = (key, value) => target.attributes.set(key, String(value));
  target.getAttribute = (key) => target.attributes.get(key) || null;
  target.setPointerCapture = (pointerId) => captures.add(pointerId);
  target.hasPointerCapture = (pointerId) => captures.has(pointerId);
  target.releasePointerCapture = (pointerId) => captures.delete(pointerId);
  target.hasCapturedPointer = (pointerId) => captures.has(pointerId);
  return target;
}

function pointer(type, values = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId ?? 1 },
    clientX: { value: values.clientX ?? 0 },
    clientY: { value: values.clientY ?? 0 },
    key: { value: values.key }
  });
  return event;
}

const images = Object.freeze([
  { id: "cover", src: "cover.webp", width: 1200, height: 800 },
  { id: "second", src: "second.webp", width: 800, height: 1200 },
  { id: "third", src: "third.webp", width: 900, height: 900 }
]);

test("carousel state starts on the cover and clamps three-image navigation", () => {
  assert.equal(createPublicWorkCarouselState(images).activeIndex, 0);
  assert.equal(nextCarouselIndex(0, -1, 3), 0);
  assert.equal(nextCarouselIndex(0, 1, 3), 1);
  assert.equal(nextCarouselIndex(2, 1, 3), 2);
});

test("a cover-only card makes no secondary request or navigation change until it is interacted with", () => {
  const link = element();
  const image = element();
  const article = element();
  let requests = 0;
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => { requests += 1; return [images[0]]; }, label: "View Work"
  });
  assert.equal(requests, 0);
  assert.equal(image.src, undefined);
  assert.equal(article.classList.contains("has-public-work-carousel"), false);
});

test("desktop drag disables native image dragging and prevents scoped dragstart", () => {
  const link = element();
  const image = element();
  const article = element();
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  assert.equal(image.draggable, false);
  const dragStart = new Event("dragstart", { cancelable: true });
  image.dispatchEvent(dragStart);
  assert.equal(dragStart.defaultPrevented, true);
});

test("swipe changes images, vertical movement does not, and a completed drag suppresses navigation", async () => {
  const link = element();
  const image = element();
  const article = element();
  image.src = "cover.webp";
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  link.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 40 }));
  await Promise.resolve();
  link.dispatchEvent(pointer("pointermove", { clientX: 80, clientY: 42 }));
  const up = pointer("pointerup", { clientX: 80, clientY: 42 });
  link.dispatchEvent(up);
  assert.equal(image.src, "second.webp");
  assert.equal(up.defaultPrevented, true);
  const click = new Event("click", { cancelable: true });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);

  link.dispatchEvent(pointer("pointerdown", { clientX: 80, clientY: 40 }));
  link.dispatchEvent(pointer("pointermove", { clientX: 84, clientY: 120 }));
  const verticalUp = pointer("pointerup", { clientX: 84, clientY: 120 });
  link.dispatchEvent(verticalUp);
  assert.equal(image.src, "second.webp");
  assert.equal(verticalUp.defaultPrevented, false);
});

test("pointer capture keeps an intentional drag alive outside the stage and releases on pointerup", async () => {
  const link = element();
  const image = element();
  const article = element();
  image.src = "cover.webp";
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  link.dispatchEvent(pointer("pointerdown", { pointerId: 7, clientX: 140, clientY: 40 }));
  assert.equal(link.hasCapturedPointer(7), true);
  await Promise.resolve();
  link.dispatchEvent(pointer("pointermove", { pointerId: 7, clientX: 80, clientY: 42 }));
  const up = pointer("pointerup", { pointerId: 7, clientX: 80, clientY: 42 });
  link.dispatchEvent(up);
  assert.equal(image.src, "second.webp");
  assert.equal(link.hasCapturedPointer(7), false);
});

test("pointercancel clears the gesture and releases capture", () => {
  const link = element();
  const image = element();
  const article = element();
  image.src = "cover.webp";
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  link.dispatchEvent(pointer("pointerdown", { pointerId: 8, clientX: 140, clientY: 40 }));
  const cancel = pointer("pointercancel", { pointerId: 8, clientX: 80, clientY: 42 });
  link.dispatchEvent(cancel);
  link.dispatchEvent(pointer("pointermove", { pointerId: 8, clientX: 20, clientY: 42 }));
  link.dispatchEvent(pointer("pointerup", { pointerId: 8, clientX: 20, clientY: 42 }));
  assert.equal(image.src, "cover.webp");
  assert.equal(link.hasCapturedPointer(8), false);
});

test("normal click remains unmodified when no drag was completed", () => {
  const link = element();
  const image = element();
  const article = element();
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  const click = new Event("click", { cancelable: true });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
});

test("a missing synthetic swipe click cannot suppress the next deliberate activation", async () => {
  const link = element();
  const image = element();
  const article = element();
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  link.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 40 }));
  await Promise.resolve();
  link.dispatchEvent(pointer("pointermove", { clientX: 80, clientY: 42 }));
  link.dispatchEvent(pointer("pointerup", { clientX: 80, clientY: 42 }));

  // Some touch browsers do not emit a click after the prevented drag.
  link.dispatchEvent(pointer("pointerdown", { clientX: 80, clientY: 42 }));
  const laterClick = new Event("click", { cancelable: true });
  link.dispatchEvent(laterClick);
  assert.equal(laterClick.defaultPrevented, false);

  link.dispatchEvent(pointer("pointerdown", { clientX: 140, clientY: 40 }));
  link.dispatchEvent(pointer("pointermove", { clientX: 80, clientY: 42 }));
  link.dispatchEvent(pointer("pointerup", { clientX: 80, clientY: 42 }));
  link.dispatchEvent(pointer("keydown", { key: "Enter" }));
  const keyboardClick = new Event("click", { cancelable: true });
  link.dispatchEvent(keyboardClick);
  assert.equal(keyboardClick.defaultPrevented, false);
});

test("keyboard changes the accessible current-image position without adding visible controls", async () => {
  const link = element();
  const image = element();
  const article = element();
  attachPublicWorkCarousel({
    link, image, article, workId: "11111111-1111-4111-8111-111111111111",
    coverImage: images[0], loadImages: async () => images, label: "View Work"
  });
  link.dispatchEvent(pointer("keydown", { key: "ArrowRight" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(image.src, "second.webp");
  assert.equal(link.getAttribute("aria-label"), "View Work. Image 2 of 3");
  assert.equal(link.dataset.carouselCount, "3");
});

test("carousel integration remains limited to the three public listing surfaces", async () => {
  const [discover, following, profile, artwork] = await Promise.all([
    readFile(new URL("../discover.js", import.meta.url), "utf8"),
    readFile(new URL("../following.js", import.meta.url), "utf8"),
    readFile(new URL("../profile-dynamic.js", import.meta.url), "utf8"),
    readFile(new URL("../artwork-dynamic.js", import.meta.url), "utf8")
  ]);
  assert.equal(discover.includes("attachPublicWorkCarousel"), true);
  assert.equal(following.includes("attachPublicWorkCarousel"), true);
  assert.equal(profile.includes("attachPublicWorkCarousel"), true);
  assert.equal(artwork.includes("public-work-carousel"), false);
});
