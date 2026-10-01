import { AIRFRAME, FLIGHT, WEAPONS, terrainHeight, type Point, type Point3 } from './Data.ts';

export type Aircraft = Point3 & {
  heading: number; // Display degrees, forward = (sin(yaw), cos(yaw)).
  yaw: number;
  pitch: number;
  bank: number; // Radians, positive lowers the port wing: Ry(yaw) * Rx(-pitch) * Rz(bank).
  radius: number; // Desired orbit radius; transitions fly a continuous path toward this circle.
  altitude: number;
  direction: -1 | 1; // +1 is clockwise when viewed from above with north = -Z.
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class Flight {
  readonly aircraft: Aircraft = {
    x: 0, y: FLIGHT.altitude, z: FLIGHT.radius, heading: 270, yaw: -Math.PI / 2, pitch: 0,
    bank: Math.atan(FLIGHT.speed ** 2 / (FLIGHT.gravity * FLIGHT.radius)),
    radius: FLIGHT.radius, altitude: FLIGHT.altitude, direction: 1,
  };
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
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw Error('Use fixed steps <= 0.1 seconds');
    const a = this.aircraft, y = a.y;
    const blend = 1 - Math.exp(-FLIGHT.response * dt);
    a.radius += clamp((this.radius - a.radius) * blend, -FLIGHT.radiusRate * dt, FLIGHT.radiusRate * dt);
    a.altitude += clamp((this.altitude - a.altitude) * blend, -FLIGHT.climbRate * dt, FLIGHT.climbRate * dt);
    a.y = a.altitude;
    const climb = (a.y - y) / dt;
    const speed = Math.sqrt(FLIGHT.speed ** 2 - climb ** 2);
    const radius = Math.hypot(a.x, a.z), angle = Math.atan2(a.z, a.x);
    // Tangent plus radial correction guides a constant-speed aircraft back to the selected orbit.
    // Reversal changes the desired heading, never the sign of airspeed (no mid-air stop).
    const radial = clamp((a.radius - radius) / a.radius * 2, -1, 1);
    const desired = Math.atan2(-Math.sin(angle) * a.direction + Math.cos(angle) * radial,
      Math.cos(angle) * a.direction + Math.sin(angle) * radial);
    const error = Math.atan2(Math.sin(desired - a.yaw), Math.cos(desired - a.yaw));
    const yawRate = error * FLIGHT.response - a.direction * speed / Math.max(radius, FLIGHT.minRadius);
    // Coordinated-turn relation tan(bank) = v²/(gR) = v * turnRate / g (FAA PHAK ch.5).
    // https://www.faa.gov/sites/faa.gov/files/pilots/pilot_handbook_1.pdf
    const bank = clamp(Math.atan(-speed * yawRate / FLIGHT.gravity), -FLIGHT.maxBank, FLIGHT.maxBank);
    a.bank += clamp(bank - a.bank, -FLIGHT.rollRate * dt, FLIGHT.rollRate * dt);
    const turn = -FLIGHT.gravity * Math.tan(a.bank) / speed * dt;
    const midpoint = a.yaw + turn / 2;
    const travel = speed * dt * (Math.abs(turn) < 1e-8 ? 1 : Math.sin(turn / 2) / (turn / 2));
    a.x += Math.sin(midpoint) * travel;
    a.z += Math.cos(midpoint) * travel;
    a.yaw += turn;
    a.pitch = Math.atan2(climb, speed);
    a.heading = ((a.yaw * 180 / Math.PI) % 360 + 360) % 360;
  }
}

export type AircraftPose = Point3 & { yaw: number; pitch?: number; bank?: number };

/** Shared quaternion for the rendered model, physical gun stations and sensor mount. */
export function aircraftRotation(a: Pick<AircraftPose, 'yaw' | 'pitch' | 'bank'>) {
  const cy = Math.cos(a.yaw / 2), sy = Math.sin(a.yaw / 2);
  const cp = Math.cos((a.pitch ?? 0) / 2), sp = Math.sin((a.pitch ?? 0) / 2);
  const cb = Math.cos((a.bank ?? 0) / 2), sb = Math.sin((a.bank ?? 0) / 2);
  return { x: -cy * sp * cb + sy * cp * sb, y: sy * cp * cb + cy * sp * sb,
    z: cy * cp * sb + sy * sp * cb, w: cy * cp * cb - sy * sp * sb };
}

export function aircraftPoint(a: AircraftPose, mount: Point3): Point3 {
  const q = aircraftRotation(a);
  const x = 2 * (q.y * mount.z - q.z * mount.y);
  const y = 2 * (q.z * mount.x - q.x * mount.z);
  const z = 2 * (q.x * mount.y - q.y * mount.x);
  return {
    x: a.x + mount.x + q.w * x + q.y * z - q.z * y,
    y: a.y + mount.y + q.w * y + q.z * x - q.x * z,
    z: a.z + mount.z + q.w * z + q.x * y - q.y * x,
  };
}

export function muzzlePosition(a: AircraftPose, weapon = 0): Point3 {
  return aircraftPoint(a, WEAPONS[weapon]?.muzzle ?? FLIGHT.muzzle);
}

/** Convert the original metre-authored bay mesh into the selected aircraft-local station. */
export function cabinPoint(point: Point3, weapon = 0): Point3 {
  const mount = WEAPONS[weapon]?.muzzle ?? FLIGHT.muzzle;
  return { x: mount.x + (point.x - AIRFRAME.cabinMuzzle.x) * AIRFRAME.cabinScale,
    y: mount.y + (point.y - AIRFRAME.cabinMuzzle.y) * AIRFRAME.cabinScale,
    z: mount.z + (point.z - AIRFRAME.cabinMuzzle.z) * AIRFRAME.cabinScale };
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
