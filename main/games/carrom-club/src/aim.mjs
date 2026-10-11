import { aimPreview, clamp } from './core.mjs';

const DEAD_ZONE = 1.75;
const RETURN_RADIUS = 6;
const SETTLE_MS = 70;
const QUIET_MS = 100;

export function createAimGesture(id, x, y, pixelsPerUnit, now, game = null) {
  return {
    id,
    x,
    y,
    pixelsPerUnit,
    game,
    point: { x, y },
    rawAngle: null,
    angle: null,
    acceptedAt: now,
    pending: null,
    shot: { dx: 0, dy: 0, power: 0, pull: 0 },
  };
}

export function updateAimGesture(gesture, point, now, settled = false) {
  const { x, y, pixelsPerUnit } = gesture;
  const dx = x - point.x,
    dy = y - point.y;
  const pull = Math.hypot(dx, dy);
  const distance = Math.hypot(point.x - gesture.point.x, point.y - gesture.point.y) * pixelsPerUnit;
  if (pull * pixelsPerUnit <= RETURN_RADIUS) {
    gesture.angle = gesture.rawAngle = null;
    gesture.pending = null;
    gesture.point = point;
    gesture.acceptedAt = now;
    gesture.shot = { dx: 0, dy: 0, power: 0, pull: 0 };
    return gesture.shot;
  }
  if (distance < DEAD_ZONE) {
    gesture.pending = null;
    return gesture.shot;
  }
  // A small, isolated movement after resting often comes from the fingertip lifting.
  // Keep both the preview and the eventual shot unchanged until that movement persists.
  if (!settled && gesture.angle !== null && distance <= 6 && now - gesture.acceptedAt >= QUIET_MS) {
    gesture.pending = { point, at: gesture.pending?.at ?? now };
    if (now - gesture.pending.at < SETTLE_MS) return gesture.shot;
  }
  const rawAngle = Math.atan2(dy, dx);
  if (gesture.angle === null) gesture.angle = rawAngle;
  else {
    const delta = Math.atan2(
      Math.sin(rawAngle - gesture.rawAngle),
      Math.cos(rawAngle - gesture.rawAngle),
    );
    const previousPull = Math.hypot(x - gesture.point.x, y - gesture.point.y);
    // Slow down only while the displayed ray actually hits a live coin. Keep
    // incremental rotation in both modes, so acquiring/leaving a target never
    // snaps the aim back to the finger's absolute angle.
    const target =
      gesture.game &&
      gesture.shot.power > 0.015 &&
      aimPreview(gesture.game, gesture.shot.dx, gesture.shot.dy)?.hit;
    // A minimum effective lever length still protects short pulls from jitter.
    const gain =
      (target ? 0.22 : 1) *
      Math.min((((pull + previousPull) / 2) * pixelsPerUnit) / (target ? 70 : 36), 1);
    gesture.angle += delta * gain;
  }
  gesture.rawAngle = rawAngle;
  gesture.point = point;
  gesture.acceptedAt = now;
  gesture.pending = null;
  gesture.shot = {
    dx: Math.cos(gesture.angle),
    dy: Math.sin(gesture.angle),
    pull: Math.min(pull, 207),
    power: Math.pow(clamp((pull - 12) / 195, 0, 1), 1.35),
  };
  return gesture.shot;
}

export function settleAimGesture(gesture, now) {
  if (gesture.pending && now - gesture.pending.at >= SETTLE_MS)
    return updateAimGesture(gesture, gesture.pending.point, now, true);
  return gesture.shot;
}
