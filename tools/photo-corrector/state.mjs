import { defaultCorners } from "./perspective.mjs";
export function createEditState() {
  return {
    rotation: 0, straighten: 0, crop: null,
    guides: { leftX: .12, rightX: .88, topY: .12, bottomY: .88 },
    warpCorners: defaultCorners(), perspectiveApplied: false,
    light: { exposure: 0, contrast: 0, highlights: 0, temperature: 0 },
    wall: { tolerance: 35, brightness: 0, neutralize: 0, feather: 0, mask: null, maskWidth: 0, maskHeight: 0 }
  };
}
export function resetLight(state) { state.light = createEditState().light; return state; }
export function resetEdits(state) { Object.assign(state, createEditState()); return state; }
