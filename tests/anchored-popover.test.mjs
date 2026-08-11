import test from "node:test";
import assert from "node:assert/strict";

import { calculateAnchoredPopoverPosition } from "../data/anchored-popover.mjs";

const viewport = { width: 390, height: 640 };

test("anchored popovers open below their trigger when there is room", () => {
  assert.deepEqual(
    calculateAnchoredPopoverPosition({
      trigger: { left: 100, top: 100, bottom: 120 },
      popover: { width: 160, height: 120 },
      viewport
    }),
    { left: 100, top: 126, placement: "below" }
  );
});

test("anchored popovers open above their trigger near the viewport bottom", () => {
  assert.deepEqual(
    calculateAnchoredPopoverPosition({
      trigger: { left: 100, top: 580, bottom: 600 },
      popover: { width: 160, height: 120 },
      viewport
    }),
    { left: 100, top: 454, placement: "above" }
  );
});

test("anchored popovers remain inside the viewport horizontally", () => {
  assert.equal(
    calculateAnchoredPopoverPosition({
      trigger: { left: 360, top: 100, bottom: 120 },
      popover: { width: 160, height: 120 },
      viewport
    }).left,
    218
  );
});
