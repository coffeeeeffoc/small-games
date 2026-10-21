import { DIRECTIONS, type LevelConfig, type VehicleConfig } from './levels.ts';

export type Point = { x: number; z: number };
export const BAY_X: Record<string, number> = { T1: -7.5, T2: -2.5, T3: 2.5, T4: 7.5 };
export const STEP = 0.05;
export interface Passenger {
  id: string;
  adult: boolean;
  needsGuardian: boolean;
}
export interface Group {
  id: string;
  passengers: Passenger[];
  sequence: number;
  queueBayId: string;
  state: 'ready' | 'reserved' | 'walking' | 'boarding' | 'departed' | 'split';
  allowSplit: boolean;
  parentGroupId?: string;
  splitOrder: number;
  vehicleId?: string;
  committedVehicleId?: string;
  commitmentUntil?: number;
  bayId?: string;
  boarded: number;
  waitSeconds: number;
}
export interface Vehicle extends VehicleConfig {
  sequence: number;
  seatCount: number;
  driverSeatCount: number;
  passengerCapacity: number;
  state: 'holding' | 'reserved' | 'movingToBay' | 'boarding' | 'departing' | 'removed';
  position: Point;
  angle: number;
  groupId?: string;
  committedGroupId?: string;
  bayId?: string;
}
export interface Bay {
  id: string;
  state: 'free' | 'reserved' | 'occupied' | 'clearing';
  vehicleId?: string;
  groupId?: string;
}
export interface Service {
  vehicleId: string;
  groupId?: string;
  bayId?: string;
  phase:
    | 'reserved'
    | 'driving'
    | 'walking'
    | 'boarding'
    | 'closing'
    | 'exitWait'
    | 'departing'
    | 'done';
  elapsed: number;
  duration: number;
  path: Point[];
  pathIndex: number;
  clearedAt?: number;
  walkFrom?: Point;
  assignmentOrder: number;
  pickupPoint?: Point;
  waitingForTraffic?: boolean;
}
export interface Simulation {
  config: LevelConfig;
  time: number;
  ticks: number;
  remainder: number;
  paused: boolean;
  won: boolean;
  groups: Group[];
  vehicles: Vehicle[];
  bays: Bay[];
  services: Service[];
  delivered: Set<string>;
  roadOwner?: string;
  target: number;
  maxWait: number;
  splits: number;
}
export interface Check {
  ok: boolean;
  reason: string;
  group?: Group;
  bay?: Bay;
}
const no = (reason: string): Check => ({ ok: false, reason });
export function createSimulation(config: LevelConfig): Simulation {
  for (const g of config.groups)
    if (!Number.isInteger(g.size) || g.size < 1 || g.size > 6) throw new Error('乘客组须为 1—6 人');
  const groups: Group[] = config.groups.map((g, sequence) => ({
    id: g.id,
    sequence,
    queueBayId: Object.keys(BAY_X)[sequence % 4]!,
    passengers: Array.from({ length: g.size }, (_, i) => ({
      id: `${g.id}/p${i + 1}`,
      adult: true,
      needsGuardian: false,
    })),
    state: 'ready',
    allowSplit: g.allowSplit ?? false,
    splitOrder: 0,
    boarded: 0,
    waitSeconds: 0,
  }));
  const vehicles: Vehicle[] = config.vehicles.map((v, sequence) => ({
    ...v,
    sequence,
    seatCount: v.capacity + 1,
    driverSeatCount: 1,
    passengerCapacity: v.capacity,
    state: 'holding',
    position: { x: -8 + v.column * 4, z: 8 + v.row * 4 },
    angle: Math.atan2(DIRECTIONS[v.direction].x, DIRECTIONS[v.direction].z),
  }));
  if (
    new Set(groups.map((g) => g.id)).size !== groups.length ||
    new Set(vehicles.map((v) => v.id)).size !== vehicles.length
  )
    throw new Error('实体 ID 必须唯一');
  for (const g of groups)
    if (g.passengers.length < 1 || g.passengers.length > 6) throw new Error('乘客组须为 1—6 人');
  for (const v of vehicles)
    if (
      ![4, 6].includes(v.passengerCapacity) ||
      !Number.isInteger(v.column) ||
      !Number.isInteger(v.row) ||
      v.column < 0 ||
      v.column > 4 ||
      v.row < 0 ||
      v.row > 3
    )
      throw new Error('车辆容量或格位无效');
  if (new Set(vehicles.map((v) => `${v.column},${v.row}`)).size !== vehicles.length)
    throw new Error('车辆不能重叠停放');
  return {
    config,
    time: 0,
    ticks: 0,
    remainder: 0,
    paused: false,
    won: false,
    groups,
    vehicles,
    bays: Object.keys(BAY_X).map((id) => ({ id, state: 'free' })),
    services: [],
    delivered: new Set(),
    target: groups.reduce((n, g) => n + g.passengers.length, 0),
    maxWait: 0,
    splits: 0,
  };
}
export function blocker(s: Simulation, v: Vehicle, ignoreId?: string): Vehicle | undefined {
  const dir = DIRECTIONS[v.direction];
  return s.vehicles
    .filter((w) => {
      if (
        w.id === v.id ||
        w.id === ignoreId ||
        !['holding', 'reserved', 'movingToBay'].includes(w.state)
      )
        return false;
      if (
        w.state === 'movingToBay' &&
        (Math.abs(w.position.x) > 10 || w.position.z < 6 || w.position.z > 22)
      )
        return false;
      const dx = w.position.x - v.position.x,
        dz = w.position.z - v.position.z;
      const ahead = dx * dir.x + dz * dir.z;
      const side = Math.abs(dx * dir.z - dz * dir.x);
      const width =
        Math.abs(Math.sin(w.angle) * dir.z - Math.cos(w.angle) * dir.x) * 1.5 +
        Math.abs(Math.cos(w.angle) * dir.z + Math.sin(w.angle) * dir.x) * 0.75;
      return ahead > 0.01 && side < width + 0.75 - 0.02;
    })
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - v.position.x, a.position.z - v.position.z) -
        Math.hypot(b.position.x - v.position.x, b.position.z - v.position.z),
    )[0];
}
export function canSelect(s: Simulation, v: Vehicle): string | undefined {
  if (v.state !== 'holding') return '这辆车正在接驳，不能重复出车';
  const front = blocker(s, v);
  return front ? `${v.id} 的箭头前方被 ${front.id} 挡住，先移走挡路的车` : undefined;
}
export function queueHead(s: Simulation, bayId: string): Group | undefined {
  return s.groups
    .filter((g) => g.state === 'ready' && g.queueBayId === bayId)
    .sort((a, b) => a.sequence - b.sequence || a.splitOrder - b.splitOrder)[0];
}
export function matchGroup(s: Simulation, v: Vehicle, bayId?: string): Check {
  if (bayId && !s.bays.some((b) => b.id === bayId)) return no('找不到上车位');
  if (s.delivered.size === s.target) return { ok: true, reason: '旅客已接完，空车收班离场' };
  let reason = '旅客均已分配，车辆正在并行接驳';
  const groups = s.groups
    .filter((g) => g.state === 'ready' && (!bayId || g.queueBayId === bayId))
    .sort((a, b) => a.sequence - b.sequence || a.splitOrder - b.splitOrder);
  for (const g of groups) {
    if (
      (v.committedGroupId && v.committedGroupId !== g.id) ||
      (g.committedVehicleId && g.committedVehicleId !== v.id)
    ) {
      reason = '该子组已预留车辆，请调度对应车辆';
      continue;
    }
    if (g.passengers.length > v.passengerCapacity) {
      reason = '旅客人数超过容量，请安排大车或分乘';
      continue;
    }
    return {
      ok: true,
      reason: `${g.queueBayId} · 接 ${g.passengers.length} 人`,
      group: g,
      bay: s.bays.find((b) => b.id === g.queueBayId)!,
    };
  }
  return no(reason);
}
export function canDispatch(s: Simulation, vehicleId: string, bayId?: string): Check {
  if (s.paused || s.won) return no('请先继续游戏');
  const v = s.vehicles.find((v) => v.id === vehicleId);
  if (!v) return no('找不到车辆');
  const reason = canSelect(s, v);
  if (reason) return no(reason);
  return matchGroup(s, v, bayId);
}
export function dispatch(s: Simulation, vehicleId: string, bayId?: string): Check {
  const check = canDispatch(s, vehicleId, bayId);
  if (!check.ok) return check;
  const v = s.vehicles.find((v) => v.id === vehicleId)!,
    g = check.group;
  const b = check.bay;
  const pickupPoint = g ? { ...queuePosition(s, g) } : undefined;
  v.state = 'reserved';
  v.groupId = g?.id;
  v.bayId = b?.id;
  if (g && b) {
    g.state = 'reserved';
    g.vehicleId = v.id;
    g.bayId = b.id;
    if (
      b.state === 'free' &&
      !s.services.some((j) => j.bayId === b.id && j.clearedAt === undefined && j.phase !== 'done')
    ) {
      b.state = 'reserved';
      b.vehicleId = v.id;
      b.groupId = g.id;
    }
  }
  const job: Service = {
    vehicleId: v.id,
    groupId: g?.id,
    bayId: b?.id,
    phase: 'reserved',
    elapsed: 0,
    duration: 0,
    path: [],
    pathIndex: 0,
    assignmentOrder: s.services.length,
    pickupPoint,
    walkFrom: pickupPoint,
  };
  s.services.push(job);
  beginPath(s, job, false);
  return {
    ...check,
    reason: `${v.id} ${b ? `→ ${b.id}，接 ${g!.passengers.length} 人` : '收班离场'}`,
  };
}
export interface SplitPlan {
  vehicles: [string, string];
  counts: [number, number];
}
export function splitPlans(s: Simulation, groupId: string): SplitPlan[] {
  const group = s.groups.find((g) => g.id === groupId);
  const g = group && queueHead(s, group.queueBayId);
  if (
    !g ||
    g.id !== groupId ||
    !g.allowSplit ||
    g.passengers.length <= 4 ||
    g.passengers.some((p) => !p.adult || p.needsGuardian)
  )
    return [];
  const first = s.vehicles.find(
    (v) =>
      v.state === 'holding' &&
      v.passengerCapacity < g.passengers.length &&
      !v.committedGroupId &&
      !blocker(s, v),
  );
  const second =
    first &&
    s.vehicles.find(
      (v) =>
        v.id !== first.id &&
        v.state === 'holding' &&
        !v.committedGroupId &&
        !blocker(s, v, first.id),
    );
  if (!first || !second) return [];
  return [...new Set([Math.ceil(g.passengers.length / 2), first.passengerCapacity])]
    .filter(
      (n) =>
        n < g.passengers.length &&
        n <= first.passengerCapacity &&
        g.passengers.length - n <= second.passengerCapacity,
    )
    .map((n) => ({ vehicles: [first.id, second.id], counts: [n, g.passengers.length - n] }));
}
export function splitGroup(
  s: Simulation,
  groupId: string,
  plan: SplitPlan,
  consent: boolean,
): Check {
  if (s.paused || s.won || !consent) return no('请先取得同行组同意');
  const valid = splitPlans(s, groupId).find(
    (p) =>
      p.vehicles.every((id, i) => id === plan.vehicles[i]) &&
      p.counts.every((n, i) => n === plan.counts[i]),
  );
  if (!valid) return no('方案已失效或缺少两辆可以依次出库的车');
  const parent = s.groups.find((g) => g.id === groupId)!;
  let offset = 0;
  const children: Group[] = valid.counts.map((n, i) => {
    const child = {
      ...parent,
      id: `${parent.id}-${i + 1}`,
      passengers: parent.passengers.slice(offset, offset + n),
      parentGroupId: parent.id,
      splitOrder: i + 1,
      allowSplit: false,
      committedVehicleId: valid.vehicles[i],
      commitmentUntil: s.time + 120,
    };
    offset += n;
    return child;
  });
  parent.state = 'split';
  for (const child of children)
    s.vehicles.find((v) => v.id === child.committedVehicleId)!.committedGroupId = child.id;
  s.groups.push(...children);
  s.splits++;
  return {
    ok: true,
    reason: `${valid.counts.join('+')} 人分乘 ${valid.vehicles.join('、')}，依次点车出库`,
  };
}
export function queuePosition(s: Simulation, g: Group): Point {
  const root = g.parentGroupId ? s.groups.find((p) => p.id === g.parentGroupId)! : g;
  const rank = s.groups.filter(
    (p) => !p.parentGroupId && p.queueBayId === g.queueBayId && p.sequence < root.sequence,
  ).length;
  return { x: BAY_X[g.queueBayId]!, z: -3.3 - rank * 1.3 };
}
export function entryPath(v: Vehicle, bayId?: string): Point[] {
  const { x, z } = v.position;
  // One-way ring: east along the north side, south/right, west/bottom, north/left.
  // Northbound parking exits no longer turn back into oncoming traffic.
  const exits: Record<Vehicle['direction'], Point[]> = {
    N: [
      { x, z: 4.5 },
      { x: 16, z: 4.5 },
      { x: 16, z: 28 },
      { x: -16, z: 28 },
      { x: -16, z: 4.5 },
    ],
    E: [
      { x: 16, z },
      { x: 16, z: 28 },
      { x: -16, z: 28 },
      { x: -16, z: 4.5 },
    ],
    S: [
      { x, z: 28 },
      { x: -16, z: 28 },
      { x: -16, z: 4.5 },
    ],
    W: [
      { x: -16, z },
      { x: -16, z: 4.5 },
    ],
  };
  const bx = bayId ? BAY_X[bayId]! : 0;
  return [
    { ...v.position },
    ...exits[v.direction],
    ...(bayId
      ? [
          { x: bx - 2.1, z: 4.5 },
          { x: bx - 1.1, z: 0.5 },
          { x: bx, z: 0.5 },
        ]
      : [{ x: 22, z: 4.5 }]),
  ];
}
function beginPath(s: Simulation, job: Service, departing: boolean) {
  const v = s.vehicles.find((v) => v.id === job.vehicleId)!;
  job.elapsed = 0;
  job.pathIndex = 1;
  job.phase = departing ? 'departing' : 'driving';
  v.state = departing ? 'departing' : 'movingToBay';
  job.path = departing
    ? [
        { ...v.position },
        { x: v.position.x + 1.3, z: 0.5 },
        { x: v.position.x + 2.1, z: 4.5 },
        { x: 22, z: 4.5 },
      ]
    : entryPath(v, job.bayId);
  if (departing) {
    const b = s.bays.find((b) => b.id === job.bayId);
    if (b?.vehicleId === v.id) b.state = 'clearing';
  }
}
// Reserve crossing corridors in click order, including the later departure merge.
// Parallel lanes remain free; a car already leaving a corridor may keep moving out.
// Looking through the departure avoids a later car trapping an earlier car at its pocket.
function crossingReserved(
  s: Simulation,
  candidate: Pick<Vehicle, 'position' | 'angle'>,
  job: Service,
  current: Vehicle,
) {
  for (const other of s.services) {
    if (other.assignmentOrder >= job.assignmentOrder || other.phase === 'done') continue;
    const car = s.vehicles.find((v) => v.id === other.vehicleId)!;
    let start = car.position;
    const bx = other.bayId ? BAY_X[other.bayId]! : undefined;
    const path = ['driving', 'departing'].includes(other.phase)
      ? other.path.slice(other.pathIndex)
      : [];
    if (bx !== undefined && other.phase !== 'departing')
      path.push({ x: bx + 1.3, z: 0.5 }, { x: bx + 2.1, z: 4.5 }, { x: 22, z: 4.5 });
    for (let i = 0; i < path.length; i++) {
      const end = path[i]!,
        dx = end.x - start.x,
        dz = end.z - start.z,
        length = Math.hypot(dx, dz);
      if (length < 0.0001) {
        start = end;
        continue;
      }
      const travel = length,
        ux = dx / length,
        uz = dz / length;
      if (Math.abs(ux * Math.sin(candidate.angle) + uz * Math.cos(candidate.angle)) < 0.95) {
        const projected = Math.max(
          0,
          Math.min(
            travel,
            (candidate.position.x - start.x) * ux + (candidate.position.z - start.z) * uz,
          ),
        );
        const nextDistance = Math.hypot(
          candidate.position.x - start.x - ux * projected,
          candidate.position.z - start.z - uz * projected,
        );
        const oldProjection = Math.max(
          0,
          Math.min(
            travel,
            (current.position.x - start.x) * ux + (current.position.z - start.z) * uz,
          ),
        );
        const oldDistance = Math.hypot(
          current.position.x - start.x - ux * oldProjection,
          current.position.z - start.z - uz * oldProjection,
        );
        if (nextDistance < 3.43 && nextDistance < oldDistance - 0.00001) return true;
      }
      start = end;
    }
  }
  return false;
}
function move(s: Simulation, v: Vehicle, job: Service) {
  let remaining = 9 * STEP;
  job.waitingForTraffic = false;
  // The 3.43m separation encloses two rotating 3m × 1.5m bodies, with a safety margin.
  // Small substeps prevent fast frames from tunnelling through an occupied crossing.
  while (remaining > 0.00001 && job.pathIndex < job.path.length) {
    // A queued car may travel concurrently, but cannot enter another car's boarding pocket.
    const bay = s.bays.find((b) => b.id === job.bayId);
    if (
      job.phase === 'driving' &&
      bay &&
      job.pathIndex >= job.path.length - 2 &&
      bay.vehicleId !== v.id
    ) {
      job.waitingForTraffic = true;
      break;
    }
    const p = job.path[job.pathIndex]!,
      dx = p.x - v.position.x,
      dz = p.z - v.position.z,
      length = Math.hypot(dx, dz);
    if (length < 0.00001) {
      job.pathIndex++;
      continue;
    }
    const distance = Math.min(0.1, remaining, length),
      position = {
        x: v.position.x + (dx / length) * distance,
        z: v.position.z + (dz / length) * distance,
      },
      angle = Math.atan2(dx, dz);
    const candidate = { position, angle };
    if (
      crossingReserved(s, candidate, job, v) ||
      s.vehicles.some(
        (other) =>
          other !== v &&
          other.state !== 'removed' &&
          Math.hypot(
            candidate.position.x - other.position.x,
            candidate.position.z - other.position.z,
          ) < 3.43,
      )
    ) {
      job.waitingForTraffic = true;
      break;
    }
    v.position = position;
    v.angle = angle;
    remaining -= distance;
    if (length <= distance + 0.00001) {
      v.position = { ...p };
      job.pathIndex++;
    }
  }
  return job.pathIndex >= job.path.length;
}
function clearBay(s: Simulation, job: Service, v: Vehicle, g: Group, b: Bay) {
  job.clearedAt = s.time;
  g.state = 'departed';
  if (b.vehicleId === v.id) {
    b.state = 'free';
    b.vehicleId = undefined;
    b.groupId = undefined;
  }
  v.bayId = undefined;
  g.bayId = undefined;
  g.committedVehicleId = undefined;
  g.commitmentUntil = undefined;
  v.committedGroupId = undefined;
  for (const p of g.passengers) s.delivered.add(p.id);
  s.maxWait = Math.max(s.maxWait, g.waitSeconds);
  if (
    g.parentGroupId &&
    s.groups.filter((p) => p.parentGroupId === g.parentGroupId).every((p) => p.state === 'departed')
  )
    s.groups.find((p) => p.id === g.parentGroupId)!.state = 'departed';
}
function tick(s: Simulation) {
  s.ticks++;
  s.time = s.ticks * STEP;
  for (const g of s.groups)
    if (g.state === 'ready' && g.commitmentUntil !== undefined && s.time >= g.commitmentUntil) {
      const v = s.vehicles.find((v) => v.id === g.committedVehicleId);
      if (v) v.committedGroupId = undefined;
      g.committedVehicleId = undefined;
      g.commitmentUntil = undefined;
    }
  for (const bay of s.bays)
    if (bay.state === 'free') {
      const next = s.services.find(
        (j) => j.bayId === bay.id && j.clearedAt === undefined && j.phase !== 'done',
      );
      if (next) {
        bay.state = 'reserved';
        bay.vehicleId = next.vehicleId;
        bay.groupId = next.groupId;
      }
    }
  for (const job of s.services)
    if (job.phase === 'reserved' || job.phase === 'exitWait')
      beginPath(s, job, job.phase === 'exitWait');
  for (const job of s.services) {
    if (['done', 'reserved', 'exitWait'].includes(job.phase)) continue;
    const v = s.vehicles.find((v) => v.id === job.vehicleId)!,
      g = s.groups.find((g) => g.id === job.groupId),
      b = s.bays.find((b) => b.id === job.bayId);
    job.elapsed += STEP;
    if (job.phase === 'driving' || job.phase === 'departing') {
      const finished = move(s, v, job);
      if (job.phase === 'departing' && job.pathIndex >= 3 && job.clearedAt === undefined && g && b)
        clearBay(s, job, v, g, b);
      if (!finished) continue;
      if (job.phase === 'driving' && g && b) {
        v.state = 'boarding';
        b.state = 'occupied';
        g.state = 'walking';
        job.phase = 'walking';
        job.elapsed = 0;
        job.walkFrom = job.pickupPoint ?? queuePosition(s, g);
        job.duration =
          (Math.abs(job.walkFrom.x - BAY_X[b.id]!) + Math.abs(job.walkFrom.z + 0.4)) / 3.5;
      } else {
        v.state = 'removed';
        job.phase = 'done';
        job.clearedAt ??= s.time;
      }
    } else if (g) {
      if (job.phase === 'walking' && job.elapsed >= job.duration) {
        job.phase = 'boarding';
        g.state = 'boarding';
        job.elapsed = 0;
        g.waitSeconds = s.time;
      } else if (job.phase === 'boarding') {
        g.boarded = Math.min(g.passengers.length, Math.floor(job.elapsed / 0.4));
        if (g.boarded === g.passengers.length) {
          job.phase = 'closing';
          job.elapsed = 0;
        }
      } else if (job.phase === 'closing' && job.elapsed >= 0.5) {
        job.phase = 'exitWait';
        job.elapsed = 0;
      }
    }
  }
  s.won = s.delivered.size === s.target && s.vehicles.every((v) => v.state === 'removed');
}
export function advance(s: Simulation, seconds: number) {
  if (s.paused || s.won || !Number.isFinite(seconds) || seconds <= 0) return;
  s.remainder += seconds;
  while (s.remainder + 1e-9 >= STEP && !s.won) {
    s.remainder -= STEP;
    tick(s);
  }
  if (Math.abs(s.remainder) < 1e-9) s.remainder = 0;
}
export function stars(s: Simulation) {
  return s.won ? (s.maxWait <= s.config.stars[0] ? 3 : s.maxWait <= s.config.stars[1] ? 2 : 1) : 0;
}
export function snapshot(s: Simulation) {
  return {
    time: s.time,
    paused: s.paused,
    won: s.won,
    level: s.config.id,
    delivered: [...s.delivered],
    target: s.target,
    roadOwner: s.roadOwner,
    groups: s.groups,
    vehicles: s.vehicles,
    bays: s.bays,
    services: s.services,
    splits: s.splits,
  };
}
