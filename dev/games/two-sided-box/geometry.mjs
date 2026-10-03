/** Ideal kinematics shared by the renderer and collision rules. */
import { facePoint } from './faces.mjs';
export const BALL_RADIUS = 8;
export const SHAFT_TRAVEL = 64;
export const PLATE_THICKNESS = 3;
export const GEOMETRY_EPSILON = 1e-7;
export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const add = (a, b) => a.map((value, i) => value + b[i]);
export const subtract = (a, b) => a.map((value, i) => value - b[i]);
export const scale = (a, scalar) => a.map((value) => value * scalar);
export const magnitude = (a) => Math.hypot(...a);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function getShaftGeometry(level, state, shaftOrId) {
  const shaft =
    typeof shaftOrId === 'string' ? level.shafts.find((item) => item?.id === shaftOrId) : shaftOrId;
  if (!shaft) throw new Error(`未知滑轴：${shaftOrId}`);
  const base = facePoint(shaft.face, ...shaft.anchor);
  return {
    base,
    handle: add(base, scale(shaft.slideAxis, state.shafts[shaft.id] * SHAFT_TRAVEL)),
    slideAxis: [...shaft.slideAxis],
    railStart: add(base, scale(shaft.slideAxis, shaft.min * SHAFT_TRAVEL)),
    railEnd: add(base, scale(shaft.slideAxis, shaft.max * SHAFT_TRAVEL)),
  };
}

/**
 * A bore at offset d moves to C + axis * (position * travel - d).
 * The outer plate covers the ball route at every detent, preventing edge bypass.
 */
export function getGateGeometry(level, state, gateOrId) {
  const gate =
    typeof gateOrId === 'string' ? level.gates.find((item) => item?.id === gateOrId) : gateOrId;
  if (!gate) throw new Error(`未知挡板：${gateOrId}`);
  const shaft = level.shafts.find((item) => item?.id === gate.shaft);
  const position = state.shafts[shaft.id];
  const axis = shaft.slideAxis;
  const travel = gate.travel ?? SHAFT_TRAVEL;
  const translation = scale(axis, position * travel);
  const transverse = cross(gate.normal, axis);
  const rim = Math.max(20, gate.aperture.radius + BALL_RADIUS);
  const lower =
    Math.min(-shaft.max * travel, ...gate.aperture.offsets.map((offset) => -offset)) - rim;
  const upper =
    Math.max(-shaft.min * travel, ...gate.aperture.offsets.map((offset) => -offset)) + rim;
  const halfWidth = gate.aperture.radius + 12;
  const center = add(gate.center, scale(axis, position * travel + (lower + upper) / 2));
  const apertures = gate.aperture.offsets.map((offset) => ({
    center: add(gate.center, scale(axis, position * travel - offset)),
    radius: gate.aperture.radius,
  }));
  const corners = [
    [lower, -halfWidth],
    [upper, -halfWidth],
    [upper, halfWidth],
    [lower, halfWidth],
  ].map(([along, across]) =>
    add(add(gate.center, translation), add(scale(axis, along), scale(transverse, across))),
  );
  const ballCenter = level.path[gate.pathIndex];
  const clearance = Math.max(
    ...apertures.map(
      (aperture) =>
        aperture.radius - BALL_RADIUS - magnitude(subtract(ballCenter, aperture.center)),
    ),
  );
  return {
    center,
    baseCenter: [...gate.center],
    normal: [...gate.normal],
    slideAxis: [...axis],
    transverse,
    translation,
    position,
    thickness: PLATE_THICKNESS,
    halfWidth,
    halfLength: (upper - lower) / 2,
    corners,
    apertures,
    holes: apertures.map((aperture) => [...aperture.center]),
    ballCenter: [...ballCenter],
    clearance,
    open: clearance >= -GEOMETRY_EPSILON,
  };
}
