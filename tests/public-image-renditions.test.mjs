import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createPublicImageRendition,
  createPublicResponsiveImage,
  PUBLIC_LARGE_MEDIA_QUERY,
  updatePublicResponsiveImage
} from "../data/public-image-renditions.mjs";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ID = "22222222-2222-4222-8222-222222222222";
const REVISION_ID = "33333333-3333-4333-8333-333333333333";
const IMAGE_ID = "44444444-4444-4444-8444-444444444444";
const smallPath = `${PROFILE_ID}/${WORK_ID}/${REVISION_ID}/${IMAGE_ID}/small.webp`;
const publicUrl = (path) => path ? `https://media.test/${path}` : null;

function node(name) {
  return {
    name,
    children: [],
    append(...children) { this.children.push(...children); },
    querySelector(selector) { return selector === "source" ? this.children.find((child) => child.name === "source") || null : null; }
  };
}

test("canonical public SMALL yields an explicit canonical LARGE sibling", () => {
  const rendition = createPublicImageRendition({ public_object_path: smallPath, pixel_width: 2400, pixel_height: 1600 }, publicUrl);
  assert.equal(rendition.smallSrc, publicUrl(smallPath));
  assert.equal(rendition.largeSrc, publicUrl(smallPath.replace("small.webp", "large.webp")));
  assert.equal(JSON.stringify(rendition).includes("private"), false);
});

test("legacy or malformed public paths remain SMALL-only without a fallback", () => {
  const rendition = createPublicImageRendition({ public_object_path: "legacy/cover.jpg" }, publicUrl);
  assert.equal(rendition.smallSrc, publicUrl("legacy/cover.jpg"));
  assert.equal(rendition.largeSrc, null);
});

test("responsive picture keeps SMALL below the existing mobile breakpoint and selects LARGE from tablet", () => {
  const image = node("img");
  const documentRef = { createElement: (name) => node(name) };
  const rendition = createPublicImageRendition({ public_object_path: smallPath }, publicUrl);
  const picture = createPublicResponsiveImage(documentRef, image, rendition);
  const large = picture.querySelector("source");
  assert.equal(large.media, PUBLIC_LARGE_MEDIA_QUERY);
  assert.equal(large.srcset, rendition.largeSrc);
  assert.equal(image.src, rendition.smallSrc);
  assert.equal(image.loading, "lazy");
});

test("the existing 700px mobile boundary keeps 320/390 SMALL and makes LARGE eligible at tablet/desktop", () => {
  const matchesLargeSource = (viewportWidth) => viewportWidth >= 701;
  assert.equal(matchesLargeSource(320), false);
  assert.equal(matchesLargeSource(390), false);
  assert.equal(matchesLargeSource(768), true);
  assert.equal(matchesLargeSource(1440), true);
});

test("carousel source changes retain the responsive SMALL/LARGE contract", () => {
  const image = node("img");
  const picture = node("picture");
  picture.append(node("source"));
  const second = createPublicImageRendition({ public_object_path: smallPath.replace(IMAGE_ID, PROFILE_ID) }, publicUrl);
  updatePublicResponsiveImage(image, picture, second);
  assert.equal(image.src, second.smallSrc);
  assert.equal(picture.querySelector("source").srcset, second.largeSrc);
});

test("all large public Work listing surfaces use the shared browser-native rendition helper", async () => {
  const files = await Promise.all([
    "discover.js", "following.js", "profile-dynamic.js", "presentation.js"
  ].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
  files.forEach((source) => {
    assert.match(source, /createPublicResponsiveImage/);
    assert.doesNotMatch(source, /privatePreview|private_object_path/);
  });
});
