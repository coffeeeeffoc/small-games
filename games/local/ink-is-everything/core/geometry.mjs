import { clamp } from './math.mjs';

export function solidObstacles(room) {
  return room.obstacles.filter(
    (obstacle) =>
      !obstacle.bridgeId || !room.bridges.find((bridge) => bridge.id === obstacle.bridgeId)?.drawn,
  );
}
export function circleRect(actor, rectangle) {
  return (
    Math.hypot(
      actor.x - clamp(actor.x, rectangle.x, rectangle.x + rectangle.w),
      actor.y - clamp(actor.y, rectangle.y, rectangle.y + rectangle.h),
    ) < actor.r
  );
}
export function blocked(room, actor) {
  const margin = room.boundary ?? 33;
  return (
    actor.x - actor.r < margin ||
    actor.y - actor.r < margin ||
    actor.x + actor.r > room.width - margin ||
    actor.y + actor.r > room.height - margin ||
    solidObstacles(room).some((rectangle) => circleRect(actor, rectangle))
  );
}
export function moveActor(room, actor, dx, dy) {
  const margin = room.boundary ?? 33;
  const obstacles = solidObstacles(room);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
  let moved = false;
  for (let index = 0; index < steps; index++) {
    const oldX = actor.x;
    actor.x = clamp(actor.x + dx / steps, margin + actor.r, room.width - margin - actor.r);
    if (obstacles.some((rectangle) => circleRect(actor, rectangle))) actor.x = oldX;
    const oldY = actor.y;
    actor.y = clamp(actor.y + dy / steps, margin + actor.r, room.height - margin - actor.r);
    if (obstacles.some((rectangle) => circleRect(actor, rectangle))) actor.y = oldY;
    moved ||= actor.x !== oldX || actor.y !== oldY;
  }
  return moved;
}
export function lineOfSight(room, from, to, { includePits = false, radius = 1 } = {}) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8));
  const obstacles = solidObstacles(room).filter(
    (rectangle) => includePits || rectangle.kind !== 'pit',
  );
  for (let index = 1; index <= steps; index++) {
    const point = {
      x: from.x + ((to.x - from.x) * index) / steps,
      y: from.y + ((to.y - from.y) * index) / steps,
      r: radius,
    };
    if (obstacles.some((rectangle) => circleRect(point, rectangle))) return false;
  }
  return true;
}
/** Spill drops land on reachable floor, never inside a pillar or across a sealed chasm. */
export function reachableDropPosition(room, origin, angle, reach, radius = 8) {
  const result = { x: origin.x, y: origin.y, r: radius };
  moveActor(room, result, Math.cos(angle) * reach, Math.sin(angle) * reach);
  return { x: result.x, y: result.y };
}
