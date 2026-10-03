import type { Effect } from '../core/types.ts';

// Presentation delay only: authoritative hitscan damage never waits for the rendered bullet.
export function impactDelay(effect: Effect) {
  if (
    !['hit', 'death'].includes(effect.kind) ||
    !effect.weapon ||
    effect.weapon === 'grenade' ||
    !Number.isFinite(effect.fromX) ||
    !Number.isFinite(effect.fromZ)
  )
    return 0;
  return Math.max(
    0.08,
    Math.min(0.24, Math.hypot(effect.x - effect.fromX!, effect.z - effect.fromZ!) / 65),
  );
}
