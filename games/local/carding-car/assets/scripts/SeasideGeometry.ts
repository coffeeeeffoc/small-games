import type { ThemeScenery } from './ThemeDefinition.ts';
import { besideRoad, clearOfRoad, roadClearance } from './ThemeScenery.ts';
import { angleDelta } from './KartConfig.ts';
import { pointAt, type TrackData } from './TrackGenerator.ts';

type Point = [number, number, number];
type CoastMesh = NonNullable<ThemeScenery['meshes']>[number];
type Site = {
  kind: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  radius: number;
  distance?: number;
};
const sand = '#e5cd97',
  stone = '#c8ba99',
  grass = '#819c58';
const grid = 6;

/** Positive heading/local X turns left on the chase camera; negative turns right. */
export function seasideTurnDirection(track: TrackData, distance: number): -1 | 0 | 1 {
  const turn = angleDelta(pointAt(track, distance + 35).heading, pointAt(track, distance).heading);
  return Math.abs(turn) < 0.075 ? 0 : turn > 0 ? 1 : -1;
}

/** A conservative height envelope: entire terrain cells stay below nearby sloping roads. */
function shoreHeight(track: TrackData, x: number, z: number, sea: number) {
  let clearance = Infinity,
    roadY = sea + 3,
    ceiling = Infinity;
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
      );
      const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - width / 2;
      if (distance < clearance) {
        clearance = distance;
        roadY = a.y + (b.y - a.y) * t;
      }
      if (distance < grid * Math.SQRT2 + 1) ceiling = Math.min(ceiling, a.y - 0.24, b.y - 0.24);
    }
  const shore = 25 + Math.sin(x * 0.047) * 2 + Math.cos(z * 0.063) * 2;
  const drop = Math.max(0, Math.min(1, (clearance - 7) / (shore - 7)));
  return { y: Math.min(ceiling, (roadY - 0.24) * (1 - drop) + (sea + 0.035) * drop), clearance };
}

/** Existing GLBs plus small batched marine props; never contains a drivable road or collider. */
export function createSeasideScenery(track: TrackData) {
  const shapes: NonNullable<ThemeScenery['shapes']> = [];
  const models: NonNullable<ThemeScenery['models']> = [];
  const sites: Site[] = [];
  const groups = new Map<string, CoastMesh>();
  const points = [...track.main, ...track.shortcut];
  const seaY = Math.min(...points.map((p) => p.y)) - 3;
  const minX = Math.floor((Math.min(...points.map((p) => p.x)) - 60) / grid) * grid;
  const minZ = Math.floor((Math.min(...points.map((p) => p.z)) - 60) / grid) * grid;
  const maxX = Math.max(...points.map((p) => p.x)) + 60;
  const maxZ = Math.max(...points.map((p) => p.z)) + 60;
  const centerX = (minX + maxX) / 2,
    centerZ = (minZ + maxZ) / 2;
  const mesh = (color: string) => {
    if (!groups.has(color))
      groups.set(color, { color, geometry: { positions: [], normals: [], indices: [] } });
    return groups.get(color)!.geometry;
  };
  function triangle(color: string, a: Point, b: Point, c: Point) {
    const g = mesh(color),
      start = g.positions.length / 3;
    const u = b.map((v, i) => v - a[i]),
      v = c.map((n, i) => n - a[i]);
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const length = Math.hypot(...normal) || 1;
    for (const p of [a, b, c]) {
      g.positions.push(...p);
      g.normals.push(...normal.map((n) => n / length));
    }
    g.indices.push(start, start + 1, start + 2, start + 2, start + 1, start);
  }
  function quad(color: string, a: Point, b: Point, c: Point, d: Point) {
    triangle(color, a, b, c);
    triangle(color, a, c, d);
  }
  function local(site: Site, x: number, y: number, z: number): Point {
    const c = Math.cos(site.heading),
      s = Math.sin(site.heading);
    return [site.x + x * c + z * s, site.y + y, site.z + z * c - x * s];
  }
  function box(
    site: Site,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const p = local(site, x, y, z);
    shapes.push({ kind: 'box', color, x: p[0], y: p[1], z: p[2], sx, sy, sz, yaw: site.heading });
  }
  function ball(
    site: Site,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
  ) {
    const p = local(site, x, y, z);
    shapes.push({ kind: 'ball', color, x: p[0], y: p[1], z: p[2], sx, sy, sz });
  }
  function model(site: Site, asset: string, x = 0, z = 0, scale = 1, yaw = 0) {
    const p = local(site, x, 0, z);
    models.push({ asset, x: p[0], y: p[1], z: p[2], scale, yaw: site.heading + yaw });
  }
  function island(site: Site, radius = site.radius, top = sand) {
    for (let i = 0; i < 20; i++) {
      const angle = (j: number) => (j * Math.PI) / 10;
      const p = (j: number, r: number, y: number): Point => [
        site.x + Math.cos(angle(j)) * r,
        y,
        site.z + Math.sin(angle(j)) * r,
      ];
      const a = p(i, radius * 0.78, site.y - 0.05),
        b = p(i + 1, radius * 0.78, site.y - 0.05);
      triangle(top, [site.x, site.y - 0.05, site.z], b, a);
      quad(i % 3 ? stone : '#ad9e81', a, b, p(i + 1, radius, seaY - 0.2), p(i, radius, seaY - 0.2));
    }
  }
  function site(
    kind: string,
    distance: number,
    side: number,
    gap: number,
    radius: number,
    sea = false,
  ) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const p = besideRoad(
        track,
        distance + Math.floor(attempt / 3) * 13,
        side * (track.width / 2 + gap + (attempt % 3) * 8),
      );
      if (
        !clearOfRoad(track, p.x, p.z, radius) ||
        sites.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.radius + radius + 2)
      )
        continue;
      const result = {
        kind,
        ...p,
        y: sea ? seaY + 0.2 : p.y - 0.16,
        radius,
        distance: distance + Math.floor(attempt / 3) * 13,
      };
      sites.push(result);
      return result;
    }
    return undefined;
  }
  function canopy(p: Site, width: number, length: number, height: number) {
    for (const x of [-width / 2, width / 2])
      for (const z of [-length / 2, length / 2])
        box(p, '#9e713e', x, height / 2, z, 0.24, height, 0.24);
    const corners = [
      [-width / 2 - 0.5, -length / 2 - 0.5],
      [width / 2 + 0.5, -length / 2 - 0.5],
      [width / 2 + 0.5, length / 2 + 0.5],
      [-width / 2 - 0.5, length / 2 + 0.5],
    ];
    for (let i = 0; i < 4; i++) {
      const [x, z] = corners[i],
        [nx, nz] = corners[(i + 1) % 4];
      triangle(
        i % 2 ? '#fff4d4' : '#d85f48',
        local(p, x, height, z),
        local(p, 0, height + 2, 0),
        local(p, nx, height, nz),
      );
    }
  }
  // Grid terrain forms beaches and lagoons around the selected road, including every shortcut.
  // ponytail: 6m terrain cells cap local geometry; use a heightfield LOD only if mobile profiling needs it.
  const rows: { x: number; z: number; y: number; clearance: number }[][] = [];
  for (let z = minZ; z <= maxZ + grid; z += grid) {
    const row: (typeof rows)[number] = [];
    for (let x = minX; x <= maxX + grid; x += grid)
      row.push({ x, z, ...shoreHeight(track, x, z, seaY) });
    rows.push(row);
  }
  for (let z = 1; z < rows.length; z++)
    for (let x = 1; x < rows[z].length; x++) {
      const cell = [rows[z - 1][x - 1], rows[z][x - 1], rows[z][x], rows[z - 1][x]];
      const clearance = Math.min(...cell.map((p) => p.clearance));
      if (clearance > 48) continue;
      const color =
        clearance > 36
          ? '#36adbd'
          : clearance > 24
            ? '#65c9c5'
            : clearance > 17
              ? '#d7c799'
              : clearance > 5
                ? sand
                : grass;
      quad(color, ...(cell.map((p) => [p.x, p.y, p.z] as Point) as [Point, Point, Point, Point]));
    }
  const terrainMeshes = Array.from(groups.values());
  groups.clear();

  // A shallow foundation at the exact shoulder elevation closes gaps on steep routes.
  for (const [branch, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    for (let i = 1; i < branch.length; i++)
      for (const side of [-1, 1]) {
        const a = branch[i - 1],
          b = branch[i],
          heading = Math.atan2(b.x - a.x, b.z - a.z);
        const edge = (p: typeof a): Point => [
          p.x + Math.cos(heading) * side * (width / 2 + 1.4),
          p.y - 0.12,
          p.z - Math.sin(heading) * side * (width / 2 + 1.4),
        ];
        const pa = edge(a),
          pb = edge(b);
        const baseA: Point = [pa[0], shoreHeight(track, pa[0], pa[2], seaY).y - 0.1, pa[2]];
        const baseB: Point = [pb[0], shoreHeight(track, pb[0], pb[2], seaY).y - 0.1, pb[2]];
        const steps = Math.ceil(Math.hypot(pa[0] - pb[0], pa[2] - pb[2]));
        // <= 1m steps plus .6m clearance keep the whole edge outside every branch.
        // A circular bound would incorrectly remove narrow walls beside steep slopes.
        let fits = true;
        for (let sample = 0; sample <= steps; sample++) {
          const t = sample / Math.max(1, steps);
          if (
            roadClearance(track, pa[0] + (pb[0] - pa[0]) * t, pa[2] + (pb[2] - pa[2]) * t) < 0.6
          ) {
            fits = false;
            break;
          }
        }
        if (fits) quad(stone, pa, pb, baseB, baseA);
      }
  }

  const lighthouse = site('lighthouse', 75, -1, 84, 25, true);
  if (lighthouse) {
    lighthouse.y = seaY + 4.5;
    island(lighthouse, 25, grass);
    model(lighthouse, 'lighthouse/lighthouse');
    for (let i = 0; i < 5; i++)
      model(
        lighthouse,
        'coastal-rocks/coastal-rocks',
        Math.cos(i * 1.26) * 12,
        Math.sin(i * 1.26) * 12,
        1.8,
        i,
      );
  }
  const stand = site('grandstand', 40, 1, 24, 18);
  if (stand) {
    island(stand);
    canopy(stand, 11, 23, 5.5);
    for (let row = 0; row < 4; row++) {
      box(stand, '#aa8355', -4 + row * 2, 0.6 + row * 0.55, 0, 1.6, 0.35, 20);
      for (let seat = 0; seat < 10; seat++)
        ball(
          stand,
          ['#d9674d', '#f4d27f', '#82ad9b'][seat % 3],
          -4 + row * 2,
          1.15 + row * 0.55,
          -9 + seat * 2,
          0.6,
          0.9,
          0.6,
        );
    }
  }
  for (const [i, fraction] of [0.18, 0.63].entries()) {
    const p = site('pavilion', track.length * fraction, i % 2 ? 1 : -1, 21, 13);
    if (!p) continue;
    island(p);
    canopy(p, 10, 10, 4.4);
    for (const z of [-3, 3]) {
      box(p, '#bd9257', 0, 1.3, z, 7, 0.25, 1.4);
      for (const x of [-3, 3]) box(p, '#946940', x, 0.65, z, 0.28, 1.3, 0.28);
    }
    for (const x of [-8, 8]) box(p, '#986c38', x, 3.4, -6, 0.18, 6.8, 0.18);
    box(p, '#dac18a', 0, 6.7, -6, 16, 0.06, 0.06);
    for (let flag = 0; flag < 10; flag++) {
      const x = -7.4 + flag * 1.5;
      triangle(
        ['#e87957', '#f7d681', '#fff2cf', '#68b9ba'][flag % 4],
        local(p, x, 6.65, -6),
        local(p, x + 1.1, 6.65, -6),
        local(p, x + 0.55, 5.65, -6),
      );
    }
  }
  for (let i = 0; i < 7; i++) {
    const p = site('coastal-cliff', 140 + (track.length * i) / 7, i % 2 ? -1 : 1, 24, 11);
    if (!p) continue;
    p.y = shoreHeight(track, p.x, p.z, seaY).y;
    island(p, 8, stone);
    model(p, 'coastal-rocks/coastal-rocks', 0, 0, 2.5 + (i % 3) * 0.3, i * 0.8);
  }
  const dock = site('dock', 145, -1, 48, 14, true);
  if (dock) {
    dock.y = seaY + 0.75;
    for (let board = 0; board < 20; board++)
      box(dock, board % 2 ? '#b99567' : '#aa8254', 0, 0, -10 + board, 5, 0.25, 0.92);
    for (const x of [-2.4, 2.4])
      for (const z of [-9, -3, 3, 9]) box(dock, '#705239', x, -0.2, z, 0.28, 3, 0.28);
    box(dock, '#c8a976', 0, 0.01, 7, 17, 0.23, 3);
  }
  for (let i = 0; i < 6; i++) {
    const p = site(
      'sailboat',
      (track.length * (i + 0.13)) / 6,
      i % 2 ? 1 : -1,
      80 + (i % 3) * 24,
      8,
      true,
    );
    if (!p) continue;
    p.heading += i * 0.57;
    ball(p, '#fff7df', 0, 0, 0, 2.6, 1, 7.5);
    box(p, '#a57f50', 0, 3.7, 0, 0.12, 7.4, 0.12);
    triangle(
      '#fff9e6',
      local(p, 0.07, 0.9, 0.15),
      local(p, 0.07, 7.2, 0),
      local(p, 0.07, 1.1, 3.4),
    );
    triangle(
      '#e7c586',
      local(p, -0.07, 1, -0.2),
      local(p, -0.07, 6.1, 0),
      local(p, -0.07, 1.2, -2.8),
    );
  }
  for (let i = 0; i < 28; i++) {
    const p = site('vegetation', 15 + (track.length * i) / 28, i % 2 ? 1 : -1, 10 + (i % 3) * 2, 6);
    if (!p) continue;
    p.y = shoreHeight(track, p.x, p.z, seaY).y + 0.05;
    island(p, 4, grass);
    model(p, i % 3 ? 'palm/palm' : 'broadleaf/broadleaf', 0, 0, 0.85 + (i % 3) * 0.08, i * 2.4);
    for (let bush = 0; bush < 3; bush++)
      ball(p, bush % 2 ? '#768d40' : '#a2af58', -2 + bush * 1.8, 0.3, 2, 1.8, 0.9, 1.5);
  }
  for (let i = 0; i < 18; i++) {
    const p = site('rocks', 28 + (track.length * i) / 18, i % 2 ? -1 : 1, 13, 4);
    if (!p) continue;
    p.y = shoreHeight(track, p.x, p.z, seaY).y;
    island(p, 3);
    model(p, 'coastal-rocks/coastal-rocks', 0, 0, 0.9 + (i % 3) * 0.15, i * 1.7);
  }
  for (let i = 0; i < 14; i++) {
    const p = site('turn-sign', 70 + (track.length * i) / 14, i % 2 ? 1 : -1, 5, 2);
    if (!p) continue;
    const direction = seasideTurnDirection(track, p.distance);
    if (!direction) {
      sites.pop();
      continue;
    }
    island(p, 1);
    box(p, '#886638', 0, 2, 0, 0.18, 4, 0.18);
    box(p, '#e7b737', 0, 3.45, 0, 2.6, 1.4, 0.18);
    const line = [
      [-0.7, 3.95],
      [-0.1, 3.45],
      [-0.7, 2.95],
      [-0.1, 2.95],
      [0.5, 3.45],
      [-0.1, 3.95],
    ];
    for (const z of [-0.1, 0.1]) {
      const mark = (i: number) => local(p, line[i][0] * direction, line[i][1], z);
      triangle('#293b3b', mark(0), mark(1), mark(5));
      quad('#293b3b', mark(1), mark(2), mark(3), mark(4));
    }
  }
  const extent = Math.max(...points.map((p) => Math.hypot(p.x - centerX, p.z - centerZ))) + 130;
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI * 2) / 7;
    const p: Site = {
      kind: 'distant-island',
      x: centerX + Math.cos(angle) * extent,
      z: centerZ + Math.sin(angle) * extent,
      y: seaY,
      heading: angle,
      radius: 50,
    };
    if (!clearOfRoad(track, p.x, p.z, p.radius)) continue;
    sites.push(p);
    ball(p, '#7e9c87', 0, 4, 0, 85, 30 + (i % 3) * 7, 43);
    ball(p, '#b5bba3', 10, 9, 0, 37, 26, 30);
    const cloud: Site = { ...p, y: Math.max(...points.map((p) => p.y)) + 80 + (i % 2) * 12 };
    for (let j = 0; j < 3; j++)
      ball(cloud, '#f4f0de', -18 + j * 15, (j % 2) * 4, 0, 31, 12 + j * 3, 16);
  }
  return {
    seaY,
    centerX,
    centerZ,
    sites,
    terrainMeshes,
    meshes: Array.from(groups.values()),
    shapes,
    models,
  };
}
