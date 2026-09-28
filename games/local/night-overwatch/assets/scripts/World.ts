import {
  Camera,
  Color,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Vec3,
  primitives,
  utils,
  resources,
  Prefab,
  instantiate,
  isValid,
  view,
} from 'cc';
import {
  MAP,
  ROUTE,
  ROUTE_LENGTH,
  HOLD_POINTS,
  PROTECTED,
  MISSION,
  routePoint,
  UNITS,
  type Point,
  type Kind,
} from './core/Data';
import type { Simulation } from './core/Simulation';

type Geometry = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };
const color = (s: string) => new Color().fromHEX(s);
const geometry = (): Geometry => ({ positions: [], normals: [], colors: [], indices: [] });
const box = primitives.box();
const cylinder = primitives.cylinder(0.5, 0.5, 1, { radialSegments: 10 });
const cone = primitives.cone(0.5, 1, { radialSegments: 7 });
const rock = primitives.sphere(0.5, { segments: 6 });
const roof = primitives.cylinder(0.5, 0.5, 1, { radialSegments: 3 });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const noise = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Bake shapes, orientation and directional shading into one mesh per palette / vehicle.
function addShape(
  g: Geometry,
  shape: ReturnType<typeof primitives.box>,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shade = 1,
  yaw = 0,
  pitch = 0,
  roll = 0,
) {
  const offset = g.positions.length / 3,
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    cr = Math.cos(roll),
    sr = Math.sin(roll);
  const rotate = (a: number, b: number, c: number) => {
    const rx = a * cr - b * sr,
      ry = a * sr + b * cr,
      py = ry * cp - c * sp,
      pz = ry * sp + c * cp;
    return [rx * cy + pz * sy, py, pz * cy - rx * sy];
  };
  for (let i = 0; i < shape.positions.length; i += 3) {
    const p = rotate(
      shape.positions[i] * w,
      shape.positions[i + 1] * h,
      shape.positions[i + 2] * d,
    );
    const n = rotate(shape.normals![i] / w, shape.normals![i + 1] / h, shape.normals![i + 2] / d);
    const len = Math.hypot(...n) || 1;
    const nx = n[0] / len,
      ny = n[1] / len,
      nz = n[2] / len;
    g.positions.push(x + p[0], y + p[1], z + p[2]);
    g.normals.push(nx, ny, nz);
    const light = shade * (0.52 + Math.max(0, -nx * 0.45 + ny * 0.82 + nz * 0.35) * 0.48);
    g.colors.push(light, light, light, 1);
  }
  for (const index of shape.indices!) g.indices.push(index + offset);
}
function addBox(
  g: Geometry,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shade = 1,
  yaw = 0,
) {
  addShape(g, box, x, y, z, w, h, d, shade, yaw);
}
function addRoof(
  g: Geometry,
  x: number,
  eave: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shade = 1,
) {
  addShape(
    g,
    roof,
    x,
    eave + h / 3,
    z,
    w / Math.sqrt(0.75),
    d,
    (h * 4) / 3,
    shade,
    0,
    -Math.PI / 2,
  );
}
function segmentDistance(x: number, z: number, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
const roadDistance = (x: number, z: number) =>
  Math.min(...ROUTE.slice(1).map((p, i) => segmentDistance(x, z, ROUTE[i], p)));
const riverX = (z: number) => Math.sin((z - 1) * 0.045) * 1.6;
function combatDistance(x: number, z: number) {
  return Math.min(
    roadDistance(x, z),
    ...MISSION.events.map((e) =>
      e.kind === 'heavy'
        ? Math.min(...ROUTE.map((p) => segmentDistance(x, z, e, p)))
        : Math.hypot(x - e.x, z - e.z) - (e.kind === 'light' ? 5 : 0),
    ),
  );
}
function groundHeight(x: number, z: number) {
  const bank = Math.abs(x - riverX(z));
  if (bank < 6) return -2.4 * (1 - clamp((bank - 3.3) / 2.7, 0, 1));
  const rim = clamp(
    Math.max((Math.abs(z) - MAP.halfDepth * 0.57) / 24, (Math.abs(x) - MAP.halfWidth * 0.83) / 18),
    0,
    1,
  );
  const clearing = clamp((combatDistance(x, z) - 14) / 12, 0, 1);
  return rim * rim * clearing * (10 + 5 * Math.sin(x * 0.075 + z * 0.06) + 3 * Math.cos(z * 0.19));
}

export class World {
  root: Node;
  camera: Camera;
  cameraNode: Node;
  center: Point = { x: 0, z: 0 };
  zoom = 1.3;
  temporary = false;
  thermal = true;
  views = new Map<number, { node: Node; material: Material }>();
  terrain: { material: Material; day: string; heat: string }[] = [];
  meshes = new Map<Kind, Mesh>();
  modelImport = 'loading';
  assets = new Set<string>();
  triangleCount = 0;
  private ownedMeshes = new Set<Mesh>();
  private disposed = false;

  constructor(parent: Node) {
    this.root = new Node('Battlefield');
    parent.addChild(this.root);
    this.root.once(Node.EventType.NODE_DESTROYED, this.dispose, this);
    this.cameraNode = new Node('ObservationCamera');
    parent.addChild(this.cameraNode);
    this.camera = this.cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 800;
    this.camera.clearColor = color('#10191d');

    this.terrainBatch('terrain.ground', '#69715a', '#253036', (g) => {
      // Flat triangles keep the valley legible without a terrain component or textures.
      const extentX = MAP.halfWidth * 1.8,
        extentZ = MAP.halfDepth * 1.8,
        nx = Math.ceil((extentX * 2) / 4),
        nz = Math.ceil((extentZ * 2) / 4);
      for (let ix = 0; ix < nx; ix++)
        for (let iz = 0; iz < nz; iz++) {
          const points = [
            [ix, iz],
            [ix, iz + 1],
            [ix + 1, iz],
            [ix + 1, iz + 1],
          ].map(([a, b]) => {
            const x = -extentX + (a * extentX * 2) / nx,
              z = -extentZ + (b * extentZ * 2) / nz;
            return new Vec3(x, groundHeight(x, z) - 0.14, z);
          });
          for (const ids of [
            [0, 1, 2],
            [2, 1, 3],
          ]) {
            const [a, b, c] = ids.map((i) => points[i]);
            const normal = Vec3.cross(
              new Vec3(),
              Vec3.subtract(new Vec3(), b, a),
              Vec3.subtract(new Vec3(), c, a),
            ).normalize();
            const shade =
              (0.92 + noise(ix * 91 + iz) * 0.045) *
              (0.62 + Math.max(0, -normal.x * 0.45 + normal.y * 0.82 + normal.z * 0.35) * 0.38);
            const start = g.positions.length / 3;
            for (const p of [a, b, c]) {
              g.positions.push(p.x, p.y, p.z);
              g.normals.push(normal.x, normal.y, normal.z);
              g.colors.push(shade, shade, shade, 1);
            }
            g.indices.push(start, start + 1, start + 2);
          }
        }
    });
    this.terrainBatch('terrain.water', '#325c60', '#101c24', (g) => {
      for (let z = -MAP.halfDepth; z < MAP.halfDepth; z += 3) {
        const end = Math.min(z + 3, MAP.halfDepth),
          mid = (z + end) / 2;
        addBox(g, riverX(mid), -0.68, mid, 7.1, 0.12, end - z + 0.1, 0.9 + noise(z) * 0.1);
        addBox(g, riverX(mid) + Math.sin(z) * 1.5, -0.607, mid, 0.1, 0.012, 1.7, 1.2);
      }
    });
    this.terrainBatch('terrain.roads', '#414442', '#182127', (g) => {
      for (let i = 1; i < ROUTE.length; i++) {
        const a = ROUTE[i - 1],
          b = ROUTE[i];
        addBox(
          g,
          (a.x + b.x) / 2,
          -0.055,
          (a.z + b.z) / 2,
          7,
          0.11,
          Math.hypot(b.x - a.x, b.z - a.z),
          1,
          Math.atan2(b.x - a.x, b.z - a.z),
        );
      }
      for (const p of ROUTE) addShape(g, cylinder, p.x, -0.056, p.z, 7, 0.11, 7);
    });
    this.terrainBatch('terrain.markings', '#d3c7a4', '#4a595e', (g) => {
      for (let d = 0; d < ROUTE_LENGTH; d += 4) {
        const p = routePoint(d);
        addBox(
          g,
          p.x,
          0.024,
          p.z,
          0.14,
          0.025,
          Math.min(1.7, ROUTE_LENGTH - d + 0.01),
          1,
          p.heading,
        );
      }
      for (const d of HOLD_POINTS) {
        const p = routePoint(d);
        for (const offset of [-0.6, 0.6])
          addBox(
            g,
            p.x + Math.sin(p.heading) * offset,
            0.04,
            p.z + Math.cos(p.heading) * offset,
            6.4,
            0.035,
            0.22,
            1,
            p.heading,
          );
      }
      for (let x = -7; x <= 7; x += 2)
        for (const z of [-2.65, 4.65]) addBox(g, x, 0.7, z, 0.45, 0.17, 0.27);
    });

    const exit = ROUTE[ROUTE.length - 1],
      shelter = PROTECTED[0];
    const station = { x: MAP.halfWidth * 0.49, z: MAP.halfDepth * 0.59 };
    const houses = [
      [-50, 23, 6.2, 4.5, 3],
      [-39, 34, 7, 5, 3.2],
      [-28, 29, 5, 4.5, 2.6],
      [-52, 35, 5, 6, 2.8],
      [-27, 41, 7, 4, 3.4],
      [-42, 44, 5, 5, 2.8],
      [26, 32, 6, 5, 3],
      [37, 35, 5, 4, 2.6],
      [24, 44, 8, 5, 3.2],
    ].filter(([x, z, w, d]) => combatDistance(x, z) > Math.hypot(w, d) / 2 + 6);
    const camp = [0, 1, 2].map((i) => ({ x: exit.x - 8 + i * 7, z: exit.z + 12 }));
    const trees: { x: number; z: number; y: number; h: number }[] = [];
    for (let i = 0; i < 430; i++) {
      const x = (noise(i * 3) * 2 - 1) * (MAP.halfWidth - 4),
        z = (noise(i * 3 + 1) * 2 - 1) * (MAP.halfDepth - 4);
      if (
        Math.abs(z) < MAP.halfDepth * 0.63 ||
        Math.abs(x - riverX(z)) < 8 ||
        combatDistance(x, z) < 12 ||
        Math.hypot(x - station.x, z - station.z) < 13
      )
        continue;
      trees.push({ x, z, y: groundHeight(x, z), h: 3.2 + noise(i * 3 + 2) * 3.8 });
    }
    this.terrainBatch('terrain.ridges', '#858778', '#3a454b', (g) => {
      for (let i = 0; i < 120; i++) {
        const x = (noise(i + 920) * 2 - 1) * (MAP.halfWidth - 4),
          z = (noise(i + 1520) * 2 - 1) * (MAP.halfDepth - 4),
          size = 1.5 + noise(i + 620) * 4;
        if (
          combatDistance(x, z) < size + 12 ||
          Math.abs(z) < MAP.halfDepth * 0.61 ||
          Math.abs(x - riverX(z)) < 7
        )
          continue;
        addShape(
          g,
          rock,
          x,
          groundHeight(x, z) + size * 0.19,
          z,
          size * 1.4,
          size,
          size * 0.9,
          0.85,
          i,
        );
      }
      for (let i = 1; i < ROUTE.length; i++) {
        const a = ROUTE[i - 1],
          b = ROUTE[i];
        if (Math.abs(a.x) <= 8 && Math.abs(b.x) <= 8) continue;
        addBox(
          g,
          (a.x + b.x) / 2,
          -0.11,
          (a.z + b.z) / 2,
          8.4,
          0.05,
          Math.hypot(b.x - a.x, b.z - a.z),
          0.8,
          Math.atan2(b.x - a.x, b.z - a.z),
        );
      }
    });
    this.terrainBatch('terrain.fields', '#8b8255', '#303a3b', (g) => {
      for (const [x, z, w, d] of [
        [-82, -26, 21, 15],
        [-45, -39, 26, 16],
        [22, 19, 19, 12],
        [67, 20, 24, 17],
      ]) {
        addBox(g, x, -0.055, z, w, 0.1, d, 0.74);
        for (let row = -d / 2 + 0.8; row < d / 2; row += 1.2)
          addBox(g, x, 0.035, z + row, w - 1.2, 0.17, 0.36, 0.85 + noise(row) * 0.2);
        for (const edge of [-1, 1]) addBox(g, x + (edge * w) / 2, 0.05, z, 0.35, 0.2, d, 0.6);
      }
    });
    this.terrainBatch('terrain.structures', '#b8af91', '#49535a', (g) => {
      // The road deck remains at y=0; river, piers and beams sit below the combat plane.
      addBox(g, 0, -0.24, 1, 16, 0.36, 7.6);
      for (const x of [-6, 6])
        for (const z of [-1.5, 3.5]) addBox(g, x, -1.5, z, 0.9, 2.4, 0.9, 0.75);
      for (const z of [-2.7, 4.7]) {
        addBox(g, 0, 0.32, z, 16, 0.64, 0.28, 0.85);
        for (let x = -8; x <= 8; x += 2) addBox(g, x, 0.64, z, 0.24, 0.6, 0.36);
      }
      for (const [x, z, w, d, h] of houses) {
        addBox(g, x, h / 2, z, w, h, d, 0.85 + noise(x) * 0.15);
        addBox(g, x, 0.1, z, w + 0.6, 0.2, d + 0.6, 0.68);
        addBox(g, x + w * 0.25, h + 0.7, z - d * 0.2, 0.55, 1.4, 0.6, 0.8);
      }
      addBox(g, station.x, 1.5, station.z, 8, 3, 5);
      addBox(g, station.x + 7, 0.3, station.z, 4, 0.6, 4, 0.7);
      for (const p of camp) addBox(g, p.x, 0.1, p.z, 5.5, 0.2, 7, 0.7);
      for (const p of PROTECTED)
        for (const sign of [-1, 1])
          addBox(g, p.x + sign * (p.radius - 0.7), 0.3, p.z, 0.5, 0.6, p.radius * 1.4, 0.8);
    });
    this.terrainBatch('terrain.roofs', '#87654e', '#344149', (g) => {
      for (const [x, z, w, d, h] of houses)
        addRoof(g, x, h, z, w + 0.8, 1.5, d + 0.8, 0.9 + noise(z) * 0.1);
      addRoof(g, station.x, 3, station.z, 8.5, 0.8, 5.5, 0.85);
    });
    this.terrainBatch('terrain.forest', '#3f5944', '#202e32', (g) => {
      for (const t of trees)
        for (let tier = 0; tier < 3; tier++) {
          const width = t.h * (0.65 - tier * 0.14);
          addShape(
            g,
            cone,
            t.x,
            t.y + t.h * (0.43 + tier * 0.2),
            t.z,
            width,
            t.h * (0.62 - tier * 0.1),
            width,
            0.8 + noise(t.x + tier) * 0.2,
            t.x,
          );
        }
    });
    this.terrainBatch('terrain.details', '#343e37', '#19262c', (g) => {
      for (const t of trees)
        addShape(g, cylinder, t.x, t.y + t.h * 0.22, t.z, 0.3, t.h * 0.44, 0.3);
      for (const [x, z, w, d, h] of houses) {
        addBox(g, x, 0.9, z + d / 2 + 0.03, 0.85, 1.8, 0.06);
        for (const side of [-1, 1])
          for (const offset of [-0.28, 0.28])
            addBox(g, x + offset * w, h * 0.63, z + side * (d / 2 + 0.03), 0.85, 0.8, 0.06, 1.3);
      }
      for (const z of [-2.7, 4.7]) addBox(g, 0, 0.93, z, 16.4, 0.1, 0.15, 1.4);
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          addBox(g, station.x + 7 + dx, 5, station.z + dz, 0.17, 10, 0.17, 1.4);
      for (let y = 1; y < 10; y += 2)
        for (const dz of [-1, 1])
          addShape(
            g,
            box,
            station.x + 7,
            y,
            station.z + dz,
            0.12,
            2.7,
            0.12,
            1.4,
            0,
            0,
            Math.PI / 4,
          );
      addBox(g, station.x + 7, 10, station.z, 0.15, 4, 0.15, 1.5);
      addShape(g, rock, station.x + 7, 8, station.z + 1, 1.6, 1.6, 0.3, 1.8);
    });
    this.terrainBatch('zone.shelter', '#9cc9b4', '#718d85', (g) => {
      for (const p of PROTECTED) {
        for (let i = 0; i < 32; i++) {
          const a = (i * Math.PI) / 16;
          addBox(
            g,
            p.x + Math.sin(a) * p.radius,
            0.04,
            p.z + Math.cos(a) * p.radius,
            0.12,
            0.04,
            0.8,
            1,
            a + Math.PI / 2,
          );
        }
        addBox(g, p.x, 0.04, p.z, 3, 0.04, 0.7);
        addBox(g, p.x, 0.05, p.z, 0.7, 0.04, 3);
      }
    });
    this.terrainBatch('zone.exit', '#8eaa89', '#4d6867', (g) => {
      for (const dx of [-1, 1]) addBox(g, exit.x + dx * 4, 0.04, exit.z, 0.16, 0.04, 7);
      for (const p of camp) {
        addBox(g, p.x, 0.8, p.z, 5, 1.6, 6, 0.8);
        addRoof(g, p.x, 1.6, p.z, 5.3, 1.6, 6.3);
      }
    });
    const beacon = { x: exit.x + 6, z: exit.z + 3 };
    this.terrainBatch('prop.beaconFallback', '#82bfae', '#659389', (g) => {
      addShape(g, cylinder, beacon.x, 0.2, beacon.z, 1.5, 0.4, 1.5);
      addShape(g, cylinder, beacon.x, 1.8, beacon.z, 0.3, 3.2, 0.3);
    });
    const fallback = this.root.getChildByName('asset:prop.beaconFallback')!;
    for (const kind of Object.keys(UNITS) as Kind[]) {
      const g = geometry(),
        heavy = kind === 'heavy',
        rescue = kind === 'rescue';
      if (kind === 'turret') {
        addShape(g, cylinder, 0, 0.2, 0, 2.6, 0.4, 2.6, 0.5);
        addShape(g, cylinder, 0, 0.7, 0, 0.8, 0.8, 0.8, 0.65);
        addShape(g, cylinder, 0, 1.2, 0, 1.7, 0.7, 1.7);
        addBox(g, 0, 1.3, 0.6, 1.5, 0.9, 0.2, 0.8);
        for (const x of [-0.3, 0.3])
          addShape(g, cylinder, x, 1.4, 1.4, 0.2, 2.3, 0.2, 0.6, 0, Math.PI / 2);
      } else {
        const w = heavy ? 2.65 : rescue ? 2.1 : 1.8,
          d = heavy || rescue ? 4.2 : 3.2;
        addBox(g, 0, 0.45, 0, w * 0.85, 0.35, d * 0.92, 0.35);
        for (const x of [-1, 1])
          for (const z of heavy ? [-1.4, -0.47, 0.47, 1.4] : [-d * 0.3, d * 0.3]) {
            const r = heavy ? 0.45 : 0.38;
            addShape(g, cylinder, x * w * 0.49, r, z, r * 2, 0.35, r * 2, 0.18, 0, 0, Math.PI / 2);
            addShape(g, cylinder, x * (w * 0.49 + 0.19), r, z, r, 0.035, r, 0.6, 0, 0, Math.PI / 2);
          }
        addBox(g, 0, 0.8, 0, w, 0.5, d * 0.92);
        addShape(g, box, 0, 1.02, d * 0.3, w * 0.9, 0.22, d * 0.32, 0.85, 0, -0.18);
        if (heavy) {
          addShape(g, cylinder, 0, 1.45, -0.2, 1.85, 0.8, 2);
          addShape(g, cylinder, 0, 1.91, -0.4, 0.7, 0.12, 0.7, 0.65);
          addBox(g, 0, 1.5, 0.8, 0.65, 0.4, 0.4, 0.7);
          addShape(g, cylinder, 0, 1.5, 2, 0.25, 2.3, 0.25, 0.65, 0, Math.PI / 2);
          addBox(g, 0, 1.5, 3.2, 0.4, 0.3, 0.3, 0.4);
        } else {
          addBox(g, 0, 1.2, 0.5, w * 0.85, 0.45, 1.1, 0.9);
          addBox(g, 0, 1.45, 1.07, w * 0.72, 0.38, 0.05, 0.3);
          for (const x of [-1, 1]) addBox(g, x * w * 0.44, 1.43, 0.5, 0.05, 0.35, 0.8, 0.3);
          addBox(g, 0, 1.68, 0.5, w * 0.95, 0.14, 1.25);
          if (rescue) {
            addBox(g, 0, 1.4, -1, w * 0.95, 1.4, 2);
            addBox(g, 0, 2.15, -1, w, 0.1, 2.1, 0.9);
            addBox(g, 0, 2.22, -1, 1.35, 0.04, 0.33, 0.35);
            addBox(g, 0, 2.23, -1, 0.33, 0.04, 1.35, 0.35);
          } else {
            addBox(g, 0, 1.07, -1, w * 0.75, 0.1, 0.9, 0.3);
            for (const x of [-1, 1]) addBox(g, x * w * 0.45, 1.23, -1, 0.14, 0.4, 1, 0.85);
            addBox(g, 0, 1.23, -1.47, w * 0.9, 0.4, 0.12, 0.85);
            if (kind === 'escort') {
              addShape(g, cylinder, 0, 1.8, 0.4, 0.8, 0.18, 0.8, 0.6);
              addBox(g, 0, 2, 0.85, 0.16, 0.15, 1.1, 0.4);
            }
          }
        }
        for (const x of [-1, 1]) addBox(g, x * w * 0.32, 0.9, d * 0.47, 0.25, 0.18, 0.08, 1.1);
        addBox(g, 0, 0.6, d * 0.5, w * 0.96, 0.16, 0.15, 0.45);
      }
      this.meshes.set(kind, this.mesh(g));
    }
    resources.load('models/beacon/beacon', Prefab, (error, prefab) => {
      if (this.disposed || !isValid(this.root, true)) return;
      if (error) {
        this.modelImport = 'fallback';
        return;
      }
      const n = instantiate(prefab);
      n.name = 'asset:prop.beacon';
      this.root.addChild(n);
      n.setPosition(beacon.x, 0, beacon.z);
      const day = '#90d8c5',
        heat = '#659389',
        m = new Material();
      m.initialize({ effectName: 'builtin-unlit' });
      m.setProperty('mainColor', color(this.thermal ? heat : day));
      for (const r of n.getComponentsInChildren(MeshRenderer)) r.setMaterial(m, 0);
      this.terrain.push({ material: m, day, heat });
      fallback.active = false;
      this.modelImport = 'loaded';
      this.assets.add('prop.beacon');
    });
    this.updateCamera();
  }
  private mesh(g: Geometry) {
    if (g.positions.length / 3 > 65535) throw Error('World batch exceeds 16-bit vertex budget');
    const mesh = utils.createMesh(g);
    this.ownedMeshes.add(mesh);
    this.triangleCount += g.indices.length / 3;
    return mesh;
  }
  material(hex: string) {
    const m = new Material();
    m.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
    m.setProperty('mainColor', color(hex));
    return m;
  }
  terrainBatch(id: string, day: string, heat: string, build: (g: Geometry) => void) {
    const g = geometry();
    build(g);
    const n = new Node('asset:' + id);
    this.root.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = this.mesh(g);
    const m = this.material(this.thermal ? heat : day);
    r.setMaterial(m, 0);
    this.terrain.push({ material: m, day, heat });
    this.assets.add(id);
  }
  updateCamera() {
    const size = view.getVisibleSizeInPixel(),
      frame = view.getFrameSize(),
      aspect = Math.max(0.01, size.width / Math.max(1, size.height)),
      tilt = 0.6,
      cos = 1 / Math.hypot(1, tilt),
      sin = tilt * cos,
      zoom = Math.max(0.25, this.zoom * (this.temporary ? 1.5 : 1));
    const targets = [...ROUTE, ...MISSION.events],
      minZ = Math.min(...targets.map((p) => p.z)),
      maxZ = Math.max(...targets.map((p) => p.z)),
      midZ = (minZ + maxZ) / 2;
    // Frame mission targets between HUD bands. The offset is part of the real camera transform.
    const top = Math.min(89, frame.height * 0.25),
      bottom = Math.min(188, frame.height * 0.5),
      safeHeight = Math.max(40, frame.height - top - bottom),
      shift = (bottom - top) / 2;
    const scale = Math.max(
      0.05,
      Math.min(
        frame.width / (2 * (MAP.halfWidth + 8)),
        (frame.height / 2 - shift - 8) / ((MAP.halfDepth + midZ) * cos + 24 * sin),
        (frame.height / 2 + shift - 8) / ((MAP.halfDepth - midZ) * cos + 4),
        safeHeight / ((maxZ - minZ) * cos + 4 * sin),
      ),
    );
    this.camera.orthoHeight = frame.height / (2 * scale * zoom);
    const limitX = zoom <= 1 ? 0 : Math.max(0, MAP.halfWidth - this.camera.orthoHeight * aspect),
      limitZ = zoom <= 1 ? 0 : Math.max(0, MAP.halfDepth - safeHeight / (2 * scale * zoom * cos));
    this.center.x = clamp(this.center.x, -limitX, limitX);
    this.center.z = clamp(this.center.z, -limitZ, limitZ);
    const targetZ = this.center.z + midZ + shift / (scale * zoom * cos);
    this.cameraNode.setPosition(this.center.x, 280, targetZ + 280 * tilt);
    this.cameraNode.lookAt(new Vec3(this.center.x, 0, targetZ));
    this.camera.camera?.update(true);
  }
  aimAt(x: number, y: number): Point {
    const ray = this.camera.screenPointToRay(x, y),
      t = -ray.o.y / ray.d.y;
    return { x: ray.o.x + ray.d.x * t, z: ray.o.z + ray.d.z * t };
  }
  project(p: Point, y = 0) {
    return this.camera.worldToScreen(new Vec3(p.x, y, p.z));
  }
  sensor() {
    this.thermal = !this.thermal;
    this.camera.clearColor = color(this.thermal ? '#10191d' : '#53635a');
    for (const t of this.terrain)
      t.material.setProperty('mainColor', color(this.thermal ? t.heat : t.day));
  }
  locate(u: Point) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.z)) return;
    this.center = { x: u.x, z: u.z };
    this.updateCamera();
  }
  private clearViews() {
    for (const v of Array.from(this.views.values())) {
      v.node.active = false;
      v.node.destroy();
      v.material.destroy();
    }
    this.views.clear();
  }
  reset() {
    this.clearViews();
    this.center = { x: 0, z: 0 };
    this.zoom = 1.3;
    this.temporary = false;
    this.updateCamera();
  }
  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearViews();
    for (const t of this.terrain) t.material.destroy();
    for (const mesh of Array.from(this.ownedMeshes)) mesh.destroy();
    this.terrain.length = 0;
    this.ownedMeshes.clear();
    this.meshes.clear();
    if (isValid(this.cameraNode, true)) this.cameraNode.destroy();
  }
  update(s: Simulation) {
    for (const u of s.units) {
      let v = this.views.get(u.id);
      if (!v) {
        const node = new Node('asset:' + UNITS[u.kind].assetId);
        this.root.addChild(node);
        const r = node.addComponent(MeshRenderer);
        r.mesh = this.meshes.get(u.kind)!;
        const material = this.material('#ffffff');
        r.setMaterial(material, 0);
        v = { node, material };
        this.views.set(u.id, v);
        this.assets.add(UNITS[u.kind].assetId);
      }
      v.node.setPosition(u.x, u.hp <= 0 ? 0.05 : 0, u.z);
      v.node.setRotationFromEuler(
        u.hp <= 0 ? 13 : 0,
        (u.heading * 180) / Math.PI,
        u.hp <= 0 ? 17 : 0,
      );
      v.node.setScale(1, u.hp <= 0 ? 0.35 : 1, 1);
      const heat = u.hp > 0 ? UNITS[u.kind].heat : Math.max(0.16, 0.9 - (s.time - u.deadAt) * 0.09);
      const c = this.thermal
        ? new Color(heat * 255, heat * 255, heat * 245)
        : color(u.friendly ? '#afc7b5' : u.kind === 'heavy' ? '#988376' : '#b3a68b');
      v.material.setProperty('mainColor', u.hit > 0 ? Color.WHITE : c);
    }
  }
}
