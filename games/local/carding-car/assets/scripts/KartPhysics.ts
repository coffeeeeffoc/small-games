import { KartConfig as C, angleDelta, clamp, type KartInput } from './KartConfig.ts';

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
  const throttle = clamp(input.throttle, 0, 1);
  const wasDrifting = k.drifting;
  k.boost = Math.max(0, k.boost - dt);
  k.collision = Math.max(0, k.collision - dt);
  k.drifting =
    input.drift &&
    !input.brake &&
    k.speed >= C.driftMinSpeed &&
    (wasDrifting || Math.abs(steer) > 0.2) &&
    !k.airborne;
  if (k.drifting && !wasDrifting) k.driftSide = Math.sign(steer);
  if (wasDrifting && !k.drifting) {
    if (!input.drift && !input.brake && k.tier > 0) k.boost = C.boostDurations[k.tier - 1];
    k.charge = 0;
    k.tier = 0;
  }
  const turning =
    C.steering + (C.highSpeedSteering - C.steering) * clamp(k.speed / C.maxSpeed, 0, 1);
  k.heading += steer * turning * Math.min(1, k.speed / 5) * (k.drifting ? C.driftSteering : 1) * dt;
  const desired = k.heading - (k.drifting ? k.driftSide * C.driftAngle : 0);
  k.velocityHeading +=
    angleDelta(desired, k.velocityHeading) *
    (1 - Math.exp(-(k.drifting ? C.driftGrip : C.grip) * dt));
  if (
    k.drifting &&
    Math.abs(steer) > 0.15 &&
    Math.abs(angleDelta(k.heading, k.velocityHeading)) > 0.12
  ) {
    k.charge = Math.min(C.chargeThresholds[1], k.charge + dt);
    k.tier = k.charge >= C.chargeThresholds[1] ? 2 : k.charge >= C.chargeThresholds[0] ? 1 : 0;
  }
  const boosted = k.boost > 0;
  const cap = C.maxSpeed * (boosted ? C.boostSpeed : 1);
  k.speed = Math.max(
    0,
    k.speed +
      (throttle * C.acceleration +
        (boosted ? C.boostAcceleration : 0) -
        C.drag * k.speed * k.speed -
        (input.brake ? C.brake : 0) -
        (k.drifting ? Math.abs(steer) * C.lateralFriction : 0)) *
        dt,
  );
  if (k.speed > cap) k.speed += (cap - k.speed) * Math.min(1, 4 * dt);
  k.x += Math.sin(k.velocityHeading) * k.speed * dt;
  k.z += Math.cos(k.velocityHeading) * k.speed * dt;
}
