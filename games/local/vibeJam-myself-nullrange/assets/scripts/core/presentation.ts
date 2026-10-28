import type { State } from './rules.ts';

export type Insets = { left: number; top: number; right: number; bottom: number };
export const ZERO_INSETS: Insets = { left: 0, top: 0, right: 0, bottom: 0 };
export function logicalInsets(physical: Insets, rotated: boolean, scale: number): Insets {
  const px = (n: number) => (Number.isFinite(n) ? Math.max(0, n) / scale : 0);
  return rotated
    ? {
        left: px(physical.top),
        top: px(physical.right),
        right: px(physical.bottom),
        bottom: px(physical.left),
      }
    : {
        left: px(physical.left),
        top: px(physical.top),
        right: px(physical.right),
        bottom: px(physical.bottom),
      };
}
export function safeBounds(width: number, height: number, web: Insets, native: Insets) {
  const edge = (a: number, b: number, limit: number) => Math.min(limit * 0.25, Math.max(0, a, b));
  const left = edge(web.left, native.left, width) + 18;
  const top = edge(web.top, native.top, height) + 12;
  const right = width - edge(web.right, native.right, width) - 18;
  const bottom = height - edge(web.bottom, native.bottom, height) - 12;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
// Heading-up radar: screen-up is the aircraft's actual forward vector, not world north.
export function radarContacts(s: State, range = 900) {
  const c = Math.cos(s.player.yaw),
    sn = Math.sin(s.player.yaw);
  return s.enemies
    .filter((e) => e.hp > 0)
    .map((e) => {
      const dx = e.x - s.player.x,
        dz = e.z - s.player.z;
      const right = dx * c + dz * sn,
        forward = dx * sn - dz * c;
      const length = Math.hypot(right, forward);
      const factor = 1 / Math.max(range, length);
      return {
        id: e.id,
        x: right * factor,
        y: -forward * factor,
        distance: length,
        outside: length > range,
      };
    });
}
export function missionRating(s: State) {
  // A debrief assessment only: no currency, unlock or reward is granted here.
  return s.status === 'won' ? 1 + Number(s.player.hull >= 50) + Number(s.player.hull >= 80) : 0;
}
