import { stationDeparturePath, type Point } from './geometry.ts';
import type { Simulation, Service, Vehicle } from './simulation.ts';
export interface StationMovement {
  from: Point;
  to: Point;
  pathIndex: number;
}
const CLEARANCE = 3.43;
const SPEED = 9;
const STEP = 0.05;
function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const dx = b.x - a.x,
    dz = b.z - a.z,
    ex = d.x - c.x,
    ez = d.z - c.z;
  if (
    Math.abs(dx * ez - dz * ex) > 0.00001 &&
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0
  )
    return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}
function grant(s: Simulation, v: Vehicle, job: Service, to: Point): StationMovement | undefined {
  const bay =
    job.phase === 'driving' && job.bayId && job.pathIndex >= job.path.length - 2
      ? s.bays.find((b) => b.id === job.bayId)
      : undefined;
  const enteringBay = bay && job.pathIndex === job.path.length - 2;
  const destination = enteringBay ? s.geometry.bays.find((b) => b.id === bay.id)!.point : undefined;
  if (bay?.vehicleId && bay.vehicleId !== v.id) return undefined;
  if (bay) {
    const group = s.groups.find((g) => g.id === job.groupId)!;
    if (group.arrivesAt === undefined || group.arrivesAt > s.time) return undefined;
  }
  // A waiting taxi must leave the neighbouring curb's complete exit clear.
  if (
    s.bays.some((occupied) => {
      if (!occupied.vehicleId || occupied.vehicleId === v.id) return false;
      const geometry = s.geometry.bays.find((b) => b.id === occupied.id)!;
      if (distanceToSegment(to, geometry.point, geometry.exit) >= CLEARANCE) return false;
      // A taxi with an assigned empty bay can cross the neighbour's exit in
      // one reserved maneuver. The curb car will wait for that maneuver to end.
      return !(
        destination &&
        occupied.id !== bay?.id &&
        distanceToSegment(s.vehicles.find((car) => car.id === occupied.vehicleId)!.position,
          to, destination) >= CLEARANCE
      );
    })
  )
    return undefined;
  // Let traffic already inside a merge clear, then leave a gap for the taxi at the curb.
  if (
    s.services.some((other) => {
      if (
        other === job ||
        !other.bayId ||
        !(
          other.phase === 'closing' ||
          other.phase === 'exitWait' ||
          (other.phase === 'departing' && other.pathIndex === 1)
        )
      )
        return false;
      const origin = s.geometry.bays.find((b) => b.id === other.bayId)!.point;
      const exit = stationDeparturePath(s.geometry, origin)[1]!;
      return (
        distanceToSegment(v.position, origin, exit) >= CLEARANCE &&
        segmentDistance(v.position, to, origin, exit) < CLEARANCE
      );
    })
  )
    return undefined;
  // Acquire the complete next crossing and its safe downstream waiting cell atomically.
  // No car can enter a junction, stop inside it, then wait for another movement's lock.
  if (
    s.vehicles.some(
      (other) =>
        other !== v &&
        other.state !== 'removed' &&
        distanceToSegment(other.position, v.position, to) < CLEARANCE,
    )
  )
    return undefined;
  if (
    Object.entries(s.movements ?? {}).some(
      ([id, m]) => id !== v.id && segmentDistance(v.position, to, m.from, m.to) < CLEARANCE,
    )
  )
    return undefined;
  if (bay) {
    bay.state = 'reserved';
    bay.vehicleId = v.id;
    bay.groupId = job.groupId;
  }
  const movement = { from: { ...v.position }, to: { ...to }, pathIndex: job.pathIndex };
  (s.movements ??= {})[v.id] = movement;
  return movement;
}
export function moveStation(s: Simulation, v: Vehicle, job: Service) {
  let remaining = SPEED * STEP;
  job.waitingForTraffic = false;
  while (remaining > 0.00001 && job.pathIndex < job.path.length) {
    const to = job.path[job.pathIndex]!,
      dx = to.x - v.position.x,
      dz = to.z - v.position.z,
      length = Math.hypot(dx, dz);
    if (length < 0.00001) {
      job.pathIndex++;
      continue;
    }
    const movement = s.movements?.[v.id] ?? grant(s, v, job, to);
    if (!movement) {
      job.waitingForTraffic = true;
      break;
    }
    const distance = Math.min(0.1, remaining, length);
    v.angle = Math.atan2(dx, dz);
    v.position = {
      x: v.position.x + (dx / length) * distance,
      z: v.position.z + (dz / length) * distance,
    };
    job.travelled = (job.travelled ?? 0) + distance;
    remaining -= distance;
    if (length <= distance + 0.00001) {
      v.position = { ...to };
      job.pathIndex++;
      if (!(job.phase === 'driving' && job.bayId && job.pathIndex === job.path.length - 1))
        delete s.movements![v.id];
    }
  }
  const finished = job.pathIndex >= job.path.length;
  if (finished && job.phase === 'driving' && job.bayId) v.angle = Math.PI / 2;
  return finished;
}
