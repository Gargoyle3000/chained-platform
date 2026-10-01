/** Pointer reordering for an export-local Work list. The caller owns canonical order. */
export function createPortfolioOrderDrag(root, { moveTo }) {
  const view = root.ownerDocument.defaultView;
  let drag = null;
  let scrollFrame = null;

  const rows = () => [...root.querySelectorAll(".portfolio-selected-work[data-work-id]")];

  function stopAutoScroll() {
    if (scrollFrame !== null) view.cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  }

  function showDropPosition(clientY) {
    const others = rows().filter((row) => row !== drag.row);
    const targetIndex = others.findIndex((row) => clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    drag.targetIndex = targetIndex < 0 ? others.length : targetIndex;
    drag.indicator?.classList.remove("is-drop-before", "is-drop-after");
    const indicator = others[drag.targetIndex] || others.at(-1);
    drag.indicator = indicator || null;
    indicator?.classList.add(drag.targetIndex === others.length ? "is-drop-after" : "is-drop-before");
  }

  function autoScroll() {
    scrollFrame = null;
    if (!drag?.moved) return;
    const edge = 48;
    const direction = drag.clientY < edge ? -1 : drag.clientY > view.innerHeight - edge ? 1 : 0;
    if (!direction) return;
    const before = view.scrollY;
    view.scrollBy(0, direction * 12);
    showDropPosition(drag.clientY);
    if (view.scrollY !== before) scrollFrame = view.requestAnimationFrame(autoScroll);
  }

  function finish(commit = false) {
    if (!drag) return;
    const current = drag;
    drag = null;
    stopAutoScroll();
    current.row.classList.remove("is-dragging");
    current.indicator?.classList.remove("is-drop-before", "is-drop-after");
    root.classList.remove("is-reordering");
    if (current.handle.hasPointerCapture?.(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    if (commit && current.moved && current.targetIndex !== current.fromIndex) {
      moveTo(current.workId, current.targetIndex);
    }
  }

  function onPointerDown(event) {
    if (drag || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    const handle = event.target.closest?.(".portfolio-drag-handle");
    if (!handle || !root.contains(handle)) return;
    const row = handle.closest(".portfolio-selected-work[data-work-id]");
    const fromIndex = rows().indexOf(row);
    if (fromIndex < 0) return;
    drag = {
      pointerId: event.pointerId,
      handle,
      row,
      workId: row.dataset.workId,
      fromIndex,
      targetIndex: fromIndex,
      startY: event.clientY,
      clientY: event.clientY,
      moved: false,
      indicator: null
    };
    row.classList.add("is-dragging");
    root.classList.add("is-reordering");
    handle.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.clientY = event.clientY;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    showDropPosition(event.clientY);
    stopAutoScroll();
    scrollFrame = view.requestAnimationFrame(autoScroll);
  }

  function onPointerUp(event) {
    if (drag && event.pointerId === drag.pointerId) finish(true);
  }

  function onPointerCancel(event) {
    if (drag && event.pointerId === drag.pointerId) finish();
  }

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerCancel);
  root.addEventListener("lostpointercapture", onPointerCancel);

  return Object.freeze({
    cancel: () => finish(),
    dispose() {
      finish();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("lostpointercapture", onPointerCancel);
    }
  });
}
