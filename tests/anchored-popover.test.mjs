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

test("anchored popovers keep Archive Work menus visible at desktop and narrow viewport edges", () => {
  const cases = [
    { viewport: { width: 1440, height: 900 }, trigger: { left: 1360, top: 840, bottom: 860 }, popover: { width: 190, height: 120 } },
    { viewport: { width: 390, height: 640 }, trigger: { left: 350, top: 590, bottom: 610 }, popover: { width: 190, height: 120 } },
    { viewport: { width: 320, height: 568 }, trigger: { left: 290, top: 520, bottom: 540 }, popover: { width: 190, height: 120 } }
  ];

  cases.forEach(({ viewport, trigger, popover }) => {
    const placement = calculateAnchoredPopoverPosition({ trigger, popover, viewport });
    assert.equal(placement.placement, "above");
    assert.ok(placement.left >= 12);
    assert.ok(placement.left + popover.width <= viewport.width - 12);
    assert.ok(placement.top >= 12);
    assert.ok(placement.top + popover.height <= viewport.height - 12);
  });
});
