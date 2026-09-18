import { KartConfig as C, angleDelta, clamp, type KartInput } from './KartConfig.ts';
import type { Barrier } from './TrackBarriers.ts';

export function createKart(x: number, z: number, heading: number) {
  return {
    x,
    z,
    y: 0,
    heading,
    velocityHeading: heading,
    speed: 0,
    verticalSpeed: 0,
    charge: 0,
    boost: 0,
    nitroCooldown: 0,
    nitroHeld: false,
    drifting: false,
    driftSide: 0,
    tier: 0,
    collision: 0,
    recovery: 0,
    offRoad: 0,
    airborne: false,
  };
}
export type KartState = ReturnType<typeof createKart>;

/** Separating-axis test for the kart cuboid footprint and an actual visible guardrail box. */
export function barrierOverlap(k: KartState, b: Barrier) {
  const dx = k.x - b.x,
    dz = k.z - b.z,
    reach = b.halfLength + b.halfWidth + C.collisionHalfLength + C.collisionHalfWidth;
  if (dx * dx + dz * dz > reach * reach || k.y > b.y + 0.75 || k.y + 2.2 < b.y) return;
  const kr = [Math.cos(k.heading), -Math.sin(k.heading)],
    kf = [Math.sin(k.heading), Math.cos(k.heading)];
  const br = [Math.cos(b.heading), -Math.sin(b.heading)],
    bf = [Math.sin(b.heading), Math.cos(b.heading)];
  let depth = Infinity,
    nx = 0,
    nz = 0;
  for (const [x, z] of [kr, kf, br, bf]) {
    const kartRadius =
      C.collisionHalfWidth * Math.abs(x * kr[0] + z * kr[1]) +
      C.collisionHalfLength * Math.abs(x * kf[0] + z * kf[1]);
    const wallRadius =
      b.halfWidth * Math.abs(x * br[0] + z * br[1]) +
      b.halfLength * Math.abs(x * bf[0] + z * bf[1]);
    const distance = dx * x + dz * z,
      overlap = kartRadius + wallRadius - Math.abs(distance);
    if (overlap <= 0) return;
    if (overlap < depth) {
      depth = overlap;
      nx = x * (distance < 0 ? -1 : 1);
      nz = z * (distance < 0 ? -1 : 1);
    }
  }
  return { depth, nx, nz };
}

export function resolveKartBarriers(k: KartState, barriers: Barrier[]) {
  let hit: Barrier | undefined;
  // Adjacent boxes meet at corners; repeat separation so resolving one cannot embed us in the next.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const b of barriers) {
      const contact = barrierOverlap(k, b);
      if (!contact) continue;
      // Use the road-facing plane, not a neighbouring box's end cap: end-cap normals
      // can alternately push a long kart into both boxes at an inside corner.
      const nx = b.inwardX,
        nz = b.inwardZ;
      const radius =
        C.collisionHalfWidth * Math.abs(nx * Math.cos(k.heading) - nz * Math.sin(k.heading)) +
        C.collisionHalfLength * Math.abs(nx * Math.sin(k.heading) + nz * Math.cos(k.heading));
      const depth = b.halfWidth + radius - ((k.x - b.x) * nx + (k.z - b.z) * nz);
      k.x += nx * (depth + 0.002);
      k.z += nz * (depth + 0.002);
      const vx = Math.sin(k.velocityHeading),
        vz = Math.cos(k.velocityHeading),
        inward = Math.min(0, vx * nx + vz * nz);
      if (inward < 0) {
        const tx = vx - nx * inward,
          tz = vz - nz * inward;
        const tangent = Math.hypot(tx, tz);
        k.speed *= tangent;
        if (tangent > 0.001) k.velocityHeading = Math.atan2(tx, tz);
      }
      hit = b;
      moved = true;
    }
    if (!moved) break;
  }
  if (hit) collideKart(k);
  return hit;
}

export function collideKart(k: KartState) {
  if (k.collision <= 0) k.speed *= C.collisionResponse;
  k.collision = 0.3;
  k.charge = k.tier = k.boost = 0;
  k.drifting = false;
}

/** Advances only driving forces; track constraints are applied by RaceManager. */
export function driveKart(k: KartState, input: KartInput, dt: number) {
  dt = clamp(dt, 0, 1 / 30);
  const steer = clamp(input.steer, -1, 1);
  const throttle = input.brake ? 0 : clamp(input.throttle, 0, 1);
  const wasDrifting = k.drifting;
  k.boost = Math.max(0, k.boost - dt);
  k.collision = Math.max(0, k.collision - dt);
  k.nitroCooldown = Math.max(0, k.nitroCooldown - dt);
  if (input.nitro && !k.nitroHeld && k.nitroCooldown === 0 && !input.brake && k.collision === 0) {
    k.boost = Math.max(k.boost, C.nitroDuration);
    k.nitroCooldown = C.nitroCooldown;
  }
  k.nitroHeld = !!input.nitro;
  k.drifting =
    input.drift &&
    !input.brake &&
    k.speed >= C.driftMinSpeed &&
    (wasDrifting || Math.abs(steer) > 0.2) &&
    k.collision <= 0 &&
    !k.airborne;
  if (k.drifting && !wasDrifting) k.driftSide = Math.sign(steer);
  if (wasDrifting && !k.drifting) {
    if (!input.drift && !input.brake && k.tier > 0)
      k.boost = Math.max(k.boost, C.boostDurations[k.tier - 1]);
    k.charge = 0;
    k.tier = 0;
  }
  const turning =
    C.steering + (C.highSpeedSteering - C.steering) * clamp(k.speed / C.maxSpeed, 0, 1);
  // Tire forces act in the body frame; yaw cannot rotate momentum for free.
  const forwardSpeed = k.speed * Math.cos(k.velocityHeading - k.heading);
  const reversing =
    input.brake &&
    input.reverse &&
    forwardSpeed <= 0.1 &&
    Math.abs(k.speed * Math.sin(k.velocityHeading - k.heading)) < 0.5;
  if (!k.airborne)
    k.heading -=
      steer * turning * clamp(forwardSpeed / 5, -1, 1) * (k.drifting ? C.driftSteering : 1) * dt;
  const slip = angleDelta(k.velocityHeading, k.heading);
  let forward = k.speed * Math.cos(slip),
    lateral = k.speed * Math.sin(slip);
  const boosted = k.boost > 0 && !input.brake;
  if (!k.airborne) {
    // Retain only the existing small drift slip; never create lateral velocity on entry.
    const driftLimit = k.drifting ? Math.max(0, forward) * Math.tan(C.driftAngle) : 0;
    const retained = clamp(lateral * k.driftSide, 0, driftLimit) * k.driftSide;
    lateral = retained + (lateral - retained) * Math.exp(-(k.drifting ? C.driftGrip : C.grip) * dt);
    forward +=
      (reversing
        ? -C.reverseAcceleration
        : throttle * C.acceleration + (boosted ? C.boostAcceleration : 0)) * dt;
  }
  const speed = Math.hypot(forward, lateral);
  const resistance =
    C.drag * speed * speed +
    (k.airborne
      ? 0
      : C.rollingResistance +
        (input.brake && !reversing ? C.brake : 0) +
        (k.drifting ? Math.abs(steer) * C.lateralFriction : 0));
  k.speed = Math.max(0, speed - resistance * dt);
  if (k.speed > 0) k.velocityHeading = k.heading + Math.atan2(lateral, forward);
  if (
    k.drifting &&
    Math.abs(steer) > 0.15 &&
    Math.abs(angleDelta(k.heading, k.velocityHeading)) > 0.12
  ) {
    k.charge = Math.min(C.chargeThresholds[1], k.charge + dt);
    k.tier = k.charge >= C.chargeThresholds[1] ? 2 : k.charge >= C.chargeThresholds[0] ? 1 : 0;
  }
  const cap = reversing ? C.reverseMaxSpeed : C.maxSpeed * (boosted ? C.boostSpeed : 1);
  if (k.speed > cap) k.speed += (cap - k.speed) * Math.min(1, 4 * dt);
  k.x += Math.sin(k.velocityHeading) * k.speed * dt;
  k.z += Math.cos(k.velocityHeading) * k.speed * dt;
}
