import assert from "node:assert/strict";
import test from "node:test";
import { createPortfolioOrderDrag } from "../data/portfolio-order-drag.mjs";
import { createPortfolioSelectionState } from "../data/portfolio-selection-state.mjs";
import { createPortfolioPlan } from "../data/portfolio-export.mjs";

function classList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); }
  };
}

function fixture(count = 12) {
  const state = createPortfolioSelectionState(Array.from({ length: count }, (_, index) => `work-${index + 1}`));
  Array.from({ length: count }, (_, index) => `work-${index + 1}`).forEach((id) => state.select(id));
  const listeners = new Map();
  const frames = new Map();
  let nextFrame = 0;
  const view = {
    innerHeight: 2000,
    scrollY: 0,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollBy(_x, y) { this.scrollY += y; }
  };
  const root = {
    ownerDocument: { defaultView: view },
    classList: classList(),
    rows: [],
    querySelectorAll: () => root.rows,
    contains: (element) => root.rows.some((row) => row.handle === element),
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); }
  };
  function render() {
    root.rows = state.ids().map((id, index) => {
      const row = {
        dataset: { workId: id },
        classList: classList(),
        getBoundingClientRect: () => ({ top: index * 60, height: 60 })
      };
      row.handle = {
        closest: (selector) => selector === ".portfolio-drag-handle" ? row.handle : row,
        setPointerCapture(pointerId) { this.captured = pointerId; },
        hasPointerCapture(pointerId) { return this.captured === pointerId; },
        releasePointerCapture() { this.captured = null; }
      };
      return row;
    });
  }
  render();
  const moved = [];
  const controller = createPortfolioOrderDrag(root, {
    moveTo(id, index) {
      moved.push([id, index]);
      if (state.moveTo(id, index)) render();
    }
  });
  function dispatch(type, target, clientY, pointerId = 1) {
    listeners.get(type)?.({
      target,
      clientY,
      pointerId,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      preventDefault() { this.prevented = true; }
    });
  }
  function flushFrame() {
    const [id, callback] = frames.entries().next().value || [];
    if (callback) { frames.delete(id); callback(); }
  }
  return { state, root, listeners, moved, controller, dispatch, render, view, frames, flushFrame };
}

test("pointer drag shows the matching drop line and moves Work 02 to 12 in canonical export order", () => {
  const ui = fixture();
  const dragged = ui.root.rows[1];
  ui.dispatch("pointerdown", dragged.handle, 90);
  ui.dispatch("pointermove", dragged.handle, 730);
  assert.equal(dragged.classList.contains("is-dragging"), true);
  assert.equal(ui.root.rows.at(-1).classList.contains("is-drop-after"), true);
  ui.dispatch("pointerup", dragged.handle, 730);
  assert.deepEqual(ui.moved, [["work-2", 11]]);
  assert.equal(ui.state.ids().at(-1), "work-2");
  assert.equal(new Set(ui.state.ids()).size, 12);
  assert.equal(dragged.classList.contains("is-dragging"), false);
  const works = ui.state.ids().map((id) => ({ id, title: id, images: [{ id: `${id}-image`, uploadStatus: "ready" }] }));
  assert.equal(createPortfolioPlan(works).works.at(-1).work.id, "work-2");
  ui.controller.dispose();
});

test("drop before a middle row matches the visual indicator and supports later renders", () => {
  const ui = fixture(5);
  const dragged = ui.root.rows[4];
  ui.dispatch("pointerdown", dragged.handle, 270);
  ui.dispatch("pointermove", dragged.handle, 80);
  assert.equal(ui.root.rows[1].classList.contains("is-drop-before"), true);
  ui.dispatch("pointerup", dragged.handle, 80);
  assert.deepEqual(ui.state.ids(), ["work-1", "work-5", "work-2", "work-3", "work-4"]);
  assert.equal(ui.listeners.size, 5);
  const next = ui.root.rows[2];
  ui.dispatch("pointerdown", next.handle, 150);
  ui.dispatch("pointermove", next.handle, 10);
  ui.dispatch("pointerup", next.handle, 10);
  assert.deepEqual(ui.state.ids(), ["work-2", "work-1", "work-5", "work-3", "work-4"]);
  assert.equal(ui.listeners.size, 5);
  ui.controller.dispose();
  assert.equal(ui.listeners.size, 0);
});

test("cancel, action controls, and an unmoved handle do not reorder", () => {
  const ui = fixture(3);
  const original = ui.state.ids();
  const handle = ui.root.rows[0].handle;
  ui.dispatch("pointerdown", handle, 30);
  ui.dispatch("pointermove", handle, 170);
  ui.dispatch("pointercancel", handle, 170);
  assert.deepEqual(ui.state.ids(), original);
  assert.equal(ui.root.rows[0].classList.contains("is-dragging"), false);
  ui.dispatch("pointerdown", { closest: () => null }, 30);
  ui.dispatch("pointermove", handle, 170);
  ui.dispatch("pointerup", handle, 170);
  ui.dispatch("pointerdown", handle, 30);
  ui.dispatch("pointerup", handle, 30);
  assert.deepEqual(ui.state.ids(), original);
  assert.deepEqual(ui.moved, []);
  assert.equal(ui.state.move("work-2", -1), true);
  assert.deepEqual(ui.state.ids(), ["work-2", "work-1", "work-3"]);
  ui.controller.dispose();
});

test("render cancellation clears active drag before replacing rows", () => {
  const ui = fixture(3);
  const old = ui.root.rows[0];
  ui.dispatch("pointerdown", old.handle, 30);
  ui.dispatch("pointermove", old.handle, 170);
  ui.controller.cancel();
  ui.render();
  ui.dispatch("pointerup", old.handle, 170);
  assert.deepEqual(ui.state.ids(), ["work-1", "work-2", "work-3"]);
  assert.equal(ui.root.classList.contains("is-reordering"), false);
  ui.controller.dispose();
});

test("touch drag scrolls near a viewport edge and stops on release", () => {
  const ui = fixture(12);
  ui.view.innerHeight = 300;
  const handle = ui.root.rows[1].handle;
  ui.dispatch("pointerdown", handle, 90);
  ui.dispatch("pointermove", handle, 290);
  assert.equal(ui.frames.size, 1);
  ui.flushFrame();
  assert.equal(ui.view.scrollY, 12);
  assert.equal(ui.frames.size, 1);
  ui.dispatch("pointercancel", handle, 290);
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.root.classList.contains("is-reordering"), false);
  assert.equal(handle.captured, null);
  ui.controller.dispose();
});
