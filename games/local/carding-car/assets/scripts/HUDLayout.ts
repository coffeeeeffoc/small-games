// Design-space rectangles, shared by drawing and touch hit testing.
export type HitRect = { x: number; y: number; width: number; height: number };
export const readyLayout = {
  x: -282,
  width: 284,
  start: { x: -282, y: -163, width: 284, height: 52 },
  home: { x: 390, y: -202, width: 120, height: 48 },
  mode: { x: -282, y: -103, width: 284, height: 44 },
};
export const settingsLayout = {
  open: { x: 430, y: 224, width: 48, height: 48 },
  pause: { x: -424, y: 144, width: 48, height: 48 },
  close: { x: 160, y: 156, width: 60, height: 60 },
  // The whole row is tappable; the smaller switch is only its visual affordance.
  sound: { x: 0, y: 86, width: 360, height: 60 },
  fullscreen: { x: 0, y: 26, width: 360, height: 60 },
  help: { x: 0, y: -34, width: 360, height: 60 },
};
export function contains(rect: HitRect, x: number, y: number) {
  return Math.abs(x - rect.x) <= rect.width / 2 && Math.abs(y - rect.y) <= rect.height / 2;
}
