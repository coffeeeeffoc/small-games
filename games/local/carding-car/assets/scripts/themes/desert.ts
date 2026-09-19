import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import { besideRoad, clearOfRoad } from '../ThemeScenery.ts';
import type { TrackData } from '../TrackGenerator.ts';

type Point = [number, number, number];
type Mesh = NonNullable<ThemeScenery['meshes']>[number]['geometry'];
const sandstone = ['#c58243', '#e6a453', '#efb866', '#ffd48c'];

function createScenery(track: TrackData): ThemeScenery {
  const shapes: NonNullable<ThemeScenery['shapes']> = [];
  const models: NonNullable<ThemeScenery['models']> = [];
  const meshes = new Map<string, Mesh>();
  const occupied: { x: number; z: number; radius: number }[] = [];

  function triangle(color: string, a: Point, b: Point, c: Point) {
    let g = meshes.get(color);
    if (!g) meshes.set(color, (g = { positions: [], normals: [], indices: [] }));
    const u = b.map((n, i) => n - a[i]),
      v = c.map((n, i) => n - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1,
      start = g.positions.length / 3;
    for (const p of [a, b, c]) {
      g.positions.push(...p);
      g.normals.push(...n.map((value) => value / length));
    }
    g.indices.push(start, start + 1, start + 2);
  }
  function quad(color: string, a: Point, b: Point, c: Point, d: Point) {
    triangle(color, a, b, c);
    triangle(color, a, c, d);
  }
  // Rings form actual overhanging caps and eroded silhouettes, not coloured cones.
  function rock(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    seed: number,
    mesa = false,
  ) {
    const levels = mesa
      ? [
          [0, 1],
          [0.18, 0.96],
          [0.24, 0.85],
          [0.65, 0.81],
          [0.7, 0.88],
          [0.88, 0.82],
          [1, 0.72],
        ]
      : [
          [0, 1],
          [0.12, 0.86],
          [0.35, 0.65],
          [0.64, 0.44],
          [0.69, 0.77],
          [0.79, 0.86],
          [0.83, 0.73],
          [0.95, 0.77],
          [1, 0.62],
        ];
    const at = (ring: number, index: number): Point => {
      index %= 14;
      const angle = (index * Math.PI) / 7;
      const r =
        radius *
        levels[ring][1] *
        (0.88 + 0.08 * Math.sin(index * 2.7 + seed) + 0.04 * Math.cos(index * 1.3 + ring));
      return [x + Math.cos(angle) * r, y + height * levels[ring][0], z + Math.sin(angle) * r];
    };
    for (let ring = 0; ring < levels.length - 1; ring++)
      for (let i = 0; i < 14; i++)
        quad(
          sandstone[ring % 4],
          at(ring, i),
          at(ring + 1, i),
          at(ring + 1, i + 1),
          at(ring, i + 1),
        );
    for (let i = 0; i < 14; i++)
      triangle(
        sandstone[3],
        [x, y + height, z],
        at(levels.length - 1, i + 1),
        at(levels.length - 1, i),
      );
  }
  // Move the complete landmark until its full footprint misses every road branch.
  function anchor(distance: number, side: number, radius: number) {
    for (const extra of [0, 12, 28, 48])
      for (let step = 0; step < 8; step++) {
        const p = besideRoad(
          track,
          distance + step * 14,
          side * (track.width / 2 + radius + 5 + extra),
        );
        if (!clearOfRoad(track, p.x, p.z, radius + 1)) continue;
        if (
          occupied.some(
            (other) => Math.hypot(other.x - p.x, other.z - p.z) < other.radius + radius + 3,
          )
        )
          continue;
        occupied.push({ ...p, radius });
        return p;
      }
  }
  function ball(color: string, x: number, y: number, z: number, sx: number, sy: number, sz = sx) {
    shapes.push({ kind: 'ball', color, x, y, z, sx, sy, sz });
  }
  function palm(x: number, y: number, z: number, scale: number, yaw: number) {
    models.push({ asset: 'palm/palm', x, y, z, scale, yaw });
  }

  // Two self-contained white sandstone supply stations, visible from each half-lap.
  for (const [distance, side] of [
    [58, 1],
    [track.length * 0.54, -1],
  ]) {
    const p = anchor(distance, side, 22);
    if (!p) continue;
    const yaw = p.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const at = (x: number, y: number, z: number): Point => [
      p.x + x * c + z * s,
      p.y + y,
      p.z + z * c - x * s,
    ];
    const box = (
      color: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const pos = at(x, y, z);
      shapes.push({ kind: 'box', color, x: pos[0], y: pos[1], z: pos[2], sx, sy, sz, yaw });
    };
    // Raised routes receive a sandstone terrace all the way down to the desert floor.
    if (p.y > 0.1) box('#c58243', 0, -p.y / 2 - 0.1, 0, 33, p.y, 24);
    box('#e6a453', 0, -0.28, 0, 33, 0.4, 24);
    box('#f8e4bd', 0, 3.2, -3, 16, 6.4, 8);
    box('#fff1d3', 0, 6.5, -3, 16.8, 0.65, 8.8);
    box('#e6a453', 0, 1.05, 1.05, 16, 0.45, 0.22);
    box('#774e31', 0, 2.1, 1.15, 2.3, 4.2, 0.25);
    for (const x of [-5.2, 5.2]) {
      box('#daaf6c', x, 3.2, 1.25, 3, 2.4, 0.4);
      box('#315965', x, 3.2, 1.48, 2.25, 1.7, 0.1);
      box('#fff1d3', x, 2.2, 1.45, 3.1, 0.28, 0.65);
    }
    // Elevated lookout has a soft domed roof; the broad canopy is visibly sloped.
    box('#f8e4bd', 5, 8, -3, 5.5, 3.2, 5.5);
    const dome = at(5, 9.65, -3);
    ball('#fff1d3', dome[0], dome[1], dome[2], 6.1, 1.8);
    box('#315965', 5, 8.2, -0.2, 1.4, 1.6, 0.13);
    for (let stripe = 0; stripe < 8; stripe++) {
      const x = -9 + stripe * 2.25;
      const color = stripe % 2 ? '#f9aa41' : '#ec7d23';
      quad(color, at(x, 5.6, 1.6), at(x, 4.6, 9), at(x + 2.25, 4.6, 9), at(x + 2.25, 5.6, 1.6));
      box(color, x + 1.125, 4.35, 9, 2.25, 0.5, 0.12);
    }
    for (const x of [-8.7, 8.7]) box('#95602e', x, 2.3, 8.8, 0.32, 4.6, 0.32);
    for (const x of [-6, -3, 6]) {
      box('#ad7336', x, 0.55, 4, 1.8, 1.1, 1.5);
      box('#e7b466', x, 1.16, 4, 1.95, 0.12, 1.65);
    }
    for (const x of [-14, 14]) {
      const tree = at(x, 0, -2);
      palm(tree[0], tree[1], tree[2], 1.5, yaw + x);
    }
  }

  // An irregular shoreline, layered water and a low waterfall make the oasis readable in motion.
  for (const [distance, side] of [
    [145, -1],
    [track.length * 0.72, 1],
  ]) {
    const p = anchor(distance, side, 30);
    if (!p) continue;
    if (p.y > 0.1) rock(p.x, -0.15, p.z, 29, p.y + 0.05, 12, true);
    ball('#e6a453', p.x, p.y - 0.5, p.z, 42, 1.2, 35);
    ball('#98ad62', p.x, p.y - 0.16, p.z, 38, 0.5, 31);
    ball('#259fae', p.x, p.y + 0.03, p.z, 34, 0.26, 27);
    ball('#5dd5c5', p.x + 1, p.y + 0.17, p.z - 1, 27, 0.11, 20);
    for (let i = 0; i < 9; i++) {
      const angle = (i * Math.PI * 2) / 9;
      const x = p.x + Math.cos(angle) * 20,
        z = p.z + Math.sin(angle) * 17;
      palm(x, p.y, z, 1.3 + (i % 3) * 0.15, angle);
      ball('#6f973e', x + 2, p.y + 0.7, z, 3.4, 2.2, 2.6);
    }
    const backX = p.x + Math.cos(p.heading) * side * 11,
      backZ = p.z - Math.sin(p.heading) * side * 11;
    rock(backX, p.y, backZ, 7, 5.4, 17, true);
    const fx = -Math.cos(p.heading) * side,
      fz = Math.sin(p.heading) * side,
      tx = fz,
      tz = -fx;
    const lip = (across: number, y: number, forward: number): Point => [
      backX + tx * across + fx * forward,
      p.y + y,
      backZ + tz * across + fz * forward,
    ];
    for (let i = 0; i < 5; i++) {
      const x = -2.75 + i * 1.1;
      quad(
        i % 2 ? '#dafaf0' : '#8ae8dd',
        lip(x, 5.43, 2),
        lip(x, 0.35, 8),
        lip(x + 1.1, 0.35, 8),
        lip(x + 1.1, 5.43, 2),
      );
    }
    const foam = lip(0, 0.4, 8);
    ball('#dafaf0', foam[0], foam[1], foam[2], 8, 0.22, 4);
  }

  for (let i = 0; i < 22; i++) {
    const radius = 7 + (i % 3) * 1.5;
    const p = anchor(30 + (i * track.length) / 22, i % 2 ? 1 : -1, radius + 2);
    if (!p) continue;
    rock(p.x, -0.15, p.z, radius, Math.max(0, p.y) + 22 + (i % 5) * 4, i * 3.7);
    for (const side of [-1, 1])
      models.push({
        asset: 'expansion/props/desert-rock',
        x: p.x + side * radius * 0.7,
        y: p.y,
        z: p.z,
        scale: 0.35,
        yaw: i,
      });
  }

  // Put the panorama outside the selected route bounds, including the shortcut.
  const points = [...track.main, ...track.shortcut];
  const loX = Math.min(...points.map((p) => p.x)),
    hiX = Math.max(...points.map((p) => p.x)),
    loZ = Math.min(...points.map((p) => p.z)),
    hiZ = Math.max(...points.map((p) => p.z));
  const cx = (loX + hiX) / 2,
    cz = (loZ + hiZ) / 2;
  const extent =
    Math.hypot(hiX - loX, hiZ - loZ) / 2 + Math.max(track.width, track.shortcutWidth) / 2;
  for (let i = 0; i < 18; i++) {
    const angle = (i * Math.PI) / 9,
      radius = 36 + (i % 3) * 9;
    const x = cx + Math.cos(angle) * (extent + 80),
      z = cz + Math.sin(angle) * (extent + 80);
    if (!clearOfRoad(track, x, z, radius)) continue;
    rock(x, -0.15, z, radius, 38 + (i % 4) * 10, i, true);
    ball('#f3c97d', x * 0.85 + cx * 0.15, 0, z * 0.85 + cz * 0.15, 62, 15, 50);
    // Clouds are modest clustered silhouettes, not a second environment or sky mesh.
    if (i % 3 === 0)
      for (let j = 0; j < 3; j++) ball('#fff5df', x + j * 16, 105 + (j % 2) * 6, z, 34, 12, 17);
  }
  return { shapes, models, meshes: Array.from(meshes, ([color, geometry]) => ({ color, geometry })) };
}

export const theme: ThemeDefinition = {
  id: 'desert',
  name: '沙漠',
  tagline: '穿过风蚀岩柱与绿洲瀑布，掠过橙棚驿站',
  colors: {
    ground: '#edbf76',
    road: '#494645',
    shoulder: '#fff1d3',
    rail: '#d8ddd8',
    accent: '#e85f40',
    sky: '#72bde9',
  },
  scenery: createScenery,
};
