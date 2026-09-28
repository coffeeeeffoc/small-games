import { FLIGHT, terrainHeight, type Point, type Point3 } from './Data.ts';

export type Aircraft = Point3 & {
  heading: number; // Display degrees, forward = (sin(yaw), cos(yaw)).
  yaw: number;
  pitch: number;
  radius: number;
  altitude: number;
  direction: -1 | 1; // +1 is clockwise when viewed from above with north = -Z.
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class Flight {
  readonly aircraft: Aircraft = {
    x: 0, y: FLIGHT.altitude, z: FLIGHT.radius, heading: 270, yaw: -Math.PI / 2, pitch: 0,
    radius: FLIGHT.radius, altitude: FLIGHT.altitude, direction: 1,
  };
  private angle = Math.PI / 2;
  private speed: number = FLIGHT.speed;
  private altitude: number = FLIGHT.altitude;
  private radius: number = FLIGHT.radius;

  setDirection(direction: -1 | 1) {
    if (direction === -1 || direction === 1) this.aircraft.direction = direction;
  }
  adjustAltitude(delta: number) {
    if (Number.isFinite(delta)) this.altitude = clamp(this.altitude + delta, FLIGHT.minAltitude, FLIGHT.maxAltitude);
  }
  adjustRadius(delta: number) {
    if (Number.isFinite(delta)) this.radius = clamp(this.radius + delta, FLIGHT.minRadius, FLIGHT.maxRadius);
  }
  step(dt: number) {
    const a = this.aircraft, x = a.x, y = a.y, z = a.z;
    const blend = 1 - Math.exp(-FLIGHT.response * dt);
    a.radius += clamp((this.radius - a.radius) * blend, -FLIGHT.radiusRate * dt, FLIGHT.radiusRate * dt);
    a.altitude += clamp((this.altitude - a.altitude) * blend, -FLIGHT.climbRate * dt, FLIGHT.climbRate * dt);
    this.speed += (FLIGHT.speed * a.direction - this.speed) * blend;
    this.angle += this.speed / a.radius * dt;
    a.x = Math.cos(this.angle) * a.radius;
    a.z = Math.sin(this.angle) * a.radius;
    a.y = a.altitude;
    const horizontal = Math.hypot(a.x - x, a.z - z);
    if (horizontal > 1e-8) {
      const desired = Math.atan2(a.x - x, a.z - z);
      const turn = Math.atan2(Math.sin(desired - a.yaw), Math.cos(desired - a.yaw));
      a.yaw += clamp(turn, -FLIGHT.yawRate * dt, FLIGHT.yawRate * dt);
      a.pitch = Math.atan2(a.y - y, horizontal);
    }
    a.heading = ((a.yaw * 180 / Math.PI) % 360 + 360) % 360;
  }
}

export function muzzlePosition(a: Aircraft): Point3 {
  const mount = FLIGHT.muzzle;
  const y = mount.y * Math.cos(a.pitch) + mount.z * Math.sin(a.pitch);
  const z = mount.z * Math.cos(a.pitch) - mount.y * Math.sin(a.pitch);
  return {
    x: a.x + mount.x * Math.cos(a.yaw) + z * Math.sin(a.yaw),
    y: a.y + y,
    z: a.z - mount.x * Math.sin(a.yaw) + z * Math.cos(a.yaw),
  };
}

// Low ballistic arc at the specified muzzle speed. Stable quadratic root in t².
export function ballisticLaunch(origin: Point3, target: Point, speed: number) {
  if (![origin.x, origin.y, origin.z, target.x, target.z, speed].every(Number.isFinite) ||
      speed <= 0 || origin.y <= terrainHeight(origin.x, origin.z)) return;
  const targetY = terrainHeight(target.x, target.z);
  const dx = target.x - origin.x, dy = targetY - origin.y, dz = target.z - origin.z;
  const distance2 = dx * dx + dy * dy + dz * dz;
  const k = speed * speed - FLIGHT.gravity * dy;
  const discriminant = k * k - FLIGHT.gravity * FLIGHT.gravity * distance2;
  if (discriminant < 0 || !Number.isFinite(discriminant)) return;
  const duration = Math.sqrt(2 * distance2 / (k + Math.sqrt(discriminant)));
  if (duration <= 0 || !Number.isFinite(duration)) return;
  return {
    duration, targetY,
    velocity: { x: dx / duration, y: dy / duration + 0.5 * FLIGHT.gravity * duration, z: dz / duration },
  };
}

export type Trajectory = { origin: Point3; velocity: Point3; born: number; due: number };
export function shotPosition(shot: Trajectory, time: number): Point3 {
  const t = clamp(time, shot.born, shot.due) - shot.born;
  return {
    x: shot.origin.x + shot.velocity.x * t,
    y: shot.origin.y + shot.velocity.y * t - 0.5 * FLIGHT.gravity * t * t,
    z: shot.origin.z + shot.velocity.z * t,
  };
}

export function terrainContact(shot: Trajectory, from: number, to: number) {
  let start = Math.max(shot.born, from);
  const end = Math.min(shot.due, to);
  if (end < start) return;
  // ponytail: 0.5-unit sweeps resolve these broad hills; use mesh CCD if terrain gains cliffs/caves.
  const count = Math.max(1, Math.ceil((end - start) * Math.hypot(
    shot.velocity.x, shot.velocity.y - FLIGHT.gravity * (end - shot.born), shot.velocity.z,
  ) / 0.5));
  const begin = start;
  for (let i = 1; i <= count; i++) {
    let stop = begin + (end - begin) * i / count;
    const p = shotPosition(shot, stop);
    if (p.y <= terrainHeight(p.x, p.z) + 1e-8) {
      for (let n = 0; n < 24; n++) {
        const mid = (start + stop) / 2, q = shotPosition(shot, mid);
        if (q.y <= terrainHeight(q.x, q.z)) stop = mid;
        else start = mid;
      }
      const point = shotPosition(shot, stop);
      point.y = terrainHeight(point.x, point.z);
      return { time: stop, point };
    }
    start = stop;
  }
}
