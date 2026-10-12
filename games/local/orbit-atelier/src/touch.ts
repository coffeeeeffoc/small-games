import { hasBandAt, isLocked, type Point, type State } from './core.ts';

/** Resolve a thumb hit without letting a locked ring steal an overlapping active ring. */
export function pickTouchRing(state: State, point: Point, scale: number, selected: string | null) {
  const radius = Math.max(16, 22 / Math.max(scale, 0.01));
  const candidates = state.rings.filter(ring => !ring.removed).map(ring => ({
    ring,
    distance: Math.abs(Math.hypot(point.x - ring.x, point.y - ring.y) - ring.r),
    angle: Math.atan2(point.y - ring.y, point.x - ring.x),
  })).filter(hit => hit.distance <= radius && hasBandAt(hit.ring, hit.angle))
    .sort((a, b) => a.distance - b.distance);
  const movable = candidates.filter(hit => !isLocked(state, hit.ring.id));
  const choices = movable.length ? movable : candidates;
  if (!choices.length) return undefined;
  const remembered = choices.find(hit => hit.ring.id === selected && hit.distance <= choices[0].distance + 8 / Math.max(scale, 0.01));
  return (remembered ?? choices[0]).ring;
}
