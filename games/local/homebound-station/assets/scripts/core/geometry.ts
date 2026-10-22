import type { LevelConfig } from './levels.ts';
export type Point = { x: number; z: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };
export interface Lane {
  id: string;
  kind: 'collector' | 'approach' | 'departure' | 'bay-entry' | 'bay-exit';
  points: Point[];
  width: number;
  oneWay: true;
}
export interface StationBayGeometry {
  id: string;
  point: Point;
  entry: Point;
  exit: Point;
  door: Point;
}
export interface StationGeometry {
  mode: 'legacy' | 'station';
  bounds: Bounds;
  parking: { columns: number; rows: number; pitch: number; origin: Point; bounds: Bounds };
  station: { bounds: Bounds };
  lanes: Lane[];
  bays: StationBayGeometry[];
  /** Marked safe stopping cells; queues may visibly back up into the parking exits. */
  waitingSlots: Point[];
  crosswalks: { bayId: string; from: Point; to: Point }[];
  collector: { left: number; right: number; north: number; south: number };
  approachZ: number;
  departureZ: number;
  exitPoint: Point;
}
const PITCH = 4;
function unique(points: Point[]) {
  const seen = new Set<string>();
  return points.filter((p) => {
    const key = `${p.x}/${p.z}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function range(from: number, to: number) {
  const values: number[] = [];
  for (let n = from; n <= to + 0.001; n += PITCH) values.push(n);
  return values;
}
export function parkingPosition(g: StationGeometry, column: number, row: number): Point {
  return {
    x: g.parking.origin.x + column * g.parking.pitch,
    z: g.parking.origin.z + row * g.parking.pitch,
  };
}
export function getStationGeometry(config: Pick<LevelConfig, 'columns' | 'rows'>): StationGeometry {
  const modern = config.columns !== undefined || config.rows !== undefined;
  const columns = config.columns ?? 5,
    rows = config.rows ?? 4;
  if (
    !Number.isInteger(columns) ||
    columns < 3 ||
    columns > 6 ||
    !Number.isInteger(rows) ||
    rows < 3 ||
    rows > 9
  )
    throw new Error('停车阵列须为3–6列、3–9行');
  const origin = { x: (-(columns - 1) * PITCH) / 2, z: modern ? 12 : 8 };
  let left = origin.x - PITCH;
  while (left > -10) left -= PITCH;
  const right = -left,
    north = origin.z - PITCH,
    south = origin.z + rows * PITCH;
  const approachZ = modern ? 4 : 4.5,
    departureZ = -4;
  const bays = (modern ? [-6, -2, 2, 6] : [-7.5, -2.5, 2.5, 7.5]).map((x, i) => ({
    id: `T${i + 1}`,
    point: { x, z: modern ? 0 : 0.5 },
    entry: { x, z: approachZ },
    exit: { x, z: departureZ },
    door: { x, z: -6 },
  }));
  const topXs = range(left, right),
    sideZs = range(north, south);
  const exitPoint = { x: right + 8, z: departureZ };
  const approachPoints = [
    { x: left, z: approachZ },
    ...bays.map((b) => b.entry),
    { x: bays[3]!.point.x + 4, z: approachZ },
  ];
  const departurePoints = range(bays[0]!.point.x, exitPoint.x).map((x) => ({ x, z: departureZ }));
  if (departurePoints.at(-1)!.x !== exitPoint.x) departurePoints.push(exitPoint);
  const lanes: Lane[] = [
    {
      id: 'north-collector',
      kind: 'collector',
      points: [...topXs].reverse().map((x) => ({ x, z: north })),
      width: 3.4,
      oneWay: true as const,
    },
    {
      id: 'east-collector',
      kind: 'collector',
      points: [...sideZs].reverse().map((z) => ({ x: right, z })),
      width: 3.4,
      oneWay: true as const,
    },
    {
      id: 'south-collector',
      kind: 'collector',
      points: [...topXs].reverse().map((x) => ({ x, z: south })),
      width: 3.4,
      oneWay: true as const,
    },
    {
      id: 'west-collector',
      kind: 'collector',
      points: [...sideZs]
        .reverse()
        .map((z) => ({ x: left, z }))
        .concat([{ x: left, z: approachZ }]),
      width: 3.4,
      oneWay: true as const,
    },
    {
      id: 'station-approach',
      kind: 'approach',
      points: approachPoints,
      width: 3.4,
      oneWay: true as const,
    },
    {
      id: 'station-departure',
      kind: 'departure',
      points: departurePoints,
      width: 3.4,
      oneWay: true as const,
    },
    ...bays.flatMap((b) => [
      {
        id: `${b.id}-entry`,
        kind: 'bay-entry' as const,
        points: [b.entry, b.point],
        width: 3.4,
        oneWay: true as const,
      },
      {
        id: `${b.id}-exit`,
        kind: 'bay-exit' as const,
        points: [b.point, b.exit],
        width: 3.4,
        oneWay: true as const,
      },
    ]),
    {
      id: 'empty-taxi-exit',
      kind: 'bay-exit',
      points: [
        approachPoints.at(-1)!,
        { x: approachPoints.at(-1)!.x, z: 0 },
        { x: approachPoints.at(-1)!.x, z: departureZ },
      ],
      width: 3.4,
      oneWay: true as const,
    },
  ];
  return {
    mode: modern ? 'station' : 'legacy',
    bounds: { left: left - 3, right: right + 3, top: -11, bottom: south + 3 },
    parking: {
      columns,
      rows,
      pitch: PITCH,
      origin,
      bounds: {
        left: origin.x - 2,
        right: -origin.x + 2,
        top: origin.z - 2,
        bottom: origin.z + (rows - 1) * PITCH + 2,
      },
    },
    station: { bounds: { left: -10, right: 10, top: -10, bottom: -6 } },
    lanes,
    bays,
    waitingSlots: unique(
      lanes
        .filter((l) => l.kind === 'collector' || l.kind === 'approach' || l.kind === 'departure')
        .flatMap((l) => l.points),
    ).filter((p) => p.x <= right + 3),
    crosswalks: bays.map((b) => ({ bayId: b.id, from: b.door, to: b.point })),
    collector: { left, right, north, south },
    approachZ,
    departureZ,
    exitPoint,
  };
}
function append(points: Point[], point: Point) {
  const last = points.at(-1);
  if (!last || Math.hypot(last.x - point.x, last.z - point.z) > 0.0001) points.push({ ...point });
}
export function stationEntryPath(
  g: StationGeometry,
  position: Point,
  direction: 'N' | 'E' | 'S' | 'W',
  bayId?: string,
): Point[] {
  const path: Point[] = [{ ...position }],
    { left, right, north, south } = g.collector;
  const xs = range(left, right),
    zs = range(north, south);
  if (direction === 'N') append(path, { x: position.x, z: north });
  if (direction === 'E') {
    append(path, { x: right, z: position.z });
    for (const z of [...zs].reverse()) if (z < position.z) append(path, { x: right, z });
  }
  if (direction === 'N' || direction === 'E') {
    const x = path.at(-1)!.x;
    for (const next of [...xs].reverse()) if (next < x) append(path, { x: next, z: north });
  }
  if (direction === 'S') {
    append(path, { x: position.x, z: south });
    for (const x of [...xs].reverse()) if (x < position.x) append(path, { x, z: south });
  }
  if (direction === 'W') append(path, { x: left, z: position.z });
  if (direction === 'S' || direction === 'W')
    for (const z of [...zs].reverse()) if (z < path.at(-1)!.z) append(path, { x: left, z });
  append(path, { x: left, z: g.approachZ });
  const bay = g.bays.find((b) => b.id === bayId);
  for (const b of g.bays) {
    if (bay && b.point.x > bay.point.x) break;
    append(path, b.entry);
  }
  if (bay) append(path, bay.point);
  else {
    const x = g.bays.at(-1)!.point.x + 4;
    append(path, { x, z: g.approachZ });
    append(path, { x, z: 0 });
    append(path, { x, z: g.departureZ });
    for (const p of g.lanes.find((l) => l.id === 'station-departure')!.points)
      if (p.x > x) append(path, p);
  }
  return path;
}
export function stationDeparturePath(g: StationGeometry, position: Point): Point[] {
  const path = [{ ...position }, { x: position.x, z: g.departureZ }];
  for (const p of g.lanes.find((l) => l.id === 'station-departure')!.points)
    if (p.x > position.x) append(path, p);
  return path;
}
