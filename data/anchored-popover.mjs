export function calculateAnchoredPopoverPosition({ trigger, popover, viewport, gap = 6, gutter = 12 }) {
  const maximumLeft = Math.max(gutter, viewport.width - gutter - popover.width);
  const left = Math.min(maximumLeft, Math.max(gutter, trigger.left));
  const fitsBelow = trigger.bottom + gap + popover.height <= viewport.height - gutter;
  const top = fitsBelow
    ? trigger.bottom + gap
    : Math.max(gutter, trigger.top - gap - popover.height);

  return Object.freeze({ left, top, placement: fitsBelow ? "below" : "above" });
}
