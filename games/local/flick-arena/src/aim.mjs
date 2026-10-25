// Distances are in the shared 390×780 logical view, independent of CSS size and DPR.
export const aimGesture = Object.freeze({ cancelDistance: 9, fullPowerDistance: 115 });

export function aimFromDrag(dx, dy) {
  const distance = Math.hypot(dx, dy);
  const power =
    Number.isFinite(distance) && distance >= aimGesture.cancelDistance
      ? Math.min(1, Math.max(0.08, distance / aimGesture.fullPowerDistance))
      : 0;
  return { x: -dx, y: -dy, power };
}
