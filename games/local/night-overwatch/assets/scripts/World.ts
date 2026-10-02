import {
  Camera,
  Color,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Vec3,
  Quat,
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
  mapRoute,
  routeLength,
  riverX,
  type BattlefieldId,
  AIRFRAME,
  ROUTE,
  ROUTE_LENGTH,
  HOLD_POINTS,
  PROTECTED,
  MISSION,
  routePoint,
  UNITS,
  TERRAIN,
  terrainHeight,
  aircraft,
  type Point,
  type Kind,
} from './core/Data';
import type { Simulation, BattleEvent } from './core/Simulation';
import {
  aircraftCamera,
  groundAxes,
  terrainRay,
  terrainSlope,
  heightfieldHeight,
  type Position,
} from './core/CameraMath';
import { recoilOffset } from './core/Flight';
import { AircraftModel } from './AircraftModel';

type Geometry = {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  grounded?: boolean;
  height?: (x: number, z: number) => number;
};
const color = (s: string) => new Color().fromHEX(s);
const geometry = (): Geometry => ({ positions: [], normals: [], colors: [], indices: [] });
const box = primitives.box();
const cylinder = primitives.cylinder(0.5, 0.5, 1, { radialSegments: 10 });
const rock = primitives.sphere(0.5, { segments: 6 });
const roof = primitives.cylinder(0.5, 0.5, 1, { radialSegments: 3 });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const noise = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const terrainExtent = { x: MAP.halfWidth * 1.8, z: MAP.halfDepth * 1.8 };
const horizonExtent = { x: 1400, z: 1400 };
// Decorative foothills only outside the playable region; all combat terrain uses Data.terrainHeight.
function sceneryHeight(x: number, z: number, map: BattlefieldId = 'valley') {
  const outside = Math.hypot(
    Math.max(0, Math.abs(x) - MAP.halfWidth),
    Math.max(0, Math.abs(z) - MAP.halfDepth),
  );
  const fade = clamp(outside / 75, 0, 1);
  const distant = clamp((Math.hypot(x, z) - 270) / 850, 0, 1);
  return (
    terrainHeight(x, z, map) +
    fade *
      fade *
      (3 - 2 * fade) *
      (16 +
        10 * Math.sin(x * 0.019 + z * 0.006) * Math.cos(z * 0.014 - x * 0.01) +
        5 * Math.sin(z * 0.037 + x * 0.021)) +
    distant * (38 + 22 * Math.sin(x * 0.01 + z * 0.007) + 18 * Math.sin(z * 0.012 - x * 0.004))
  );
}

function terrainAxis(near: number, far: number) {
  const result: number[] = [];
  for (let x = -far; x < -near; x += 32) result.push(x);
  const count = Math.ceil((near * 2) / 3);
  for (let i = 0; i <= count; i++) result.push(-near + (near * 2 * i) / count);
  for (let x = near + 32; x < far; x += 32) result.push(x);
  result.push(far);
  return result;
}
const terrainXs = terrainAxis(terrainExtent.x, horizonExtent.x);
const terrainZs = terrainAxis(terrainExtent.z, horizonExtent.z);
type Tree = Position & { h: number; seed: number };

function treeVertex(g: Geometry, p: Position, n: Position, shade: number, bark = false) {
  const length = Math.hypot(n.x, n.y, n.z);
  const nx = n.x / length,
    ny = n.y / length,
    nz = n.z / length;
  // Unlit linearizes both colors, then HDR ACES compresses their dark product again.
  // Keep a foliage shadow floor; thermal palettes compensate for these brighter vertex colors.
  const sun = Math.max(0, -nx * 0.58 + ny * 0.42 + nz * 0.66);
  const light = bark
    ? Math.min(shade, 0.85) * (0.72 + sun * 0.22)
    : 0.36 + Math.min(shade, 0.85) * 0.28 + sun * 0.16;
  g.positions.push(p.x, p.y, p.z);
  g.normals.push(nx, ny, nz);
  g.colors.push(
    light * (bark ? 1.25 : 0.94),
    light * (bark ? 0.88 : 1),
    light * (bark ? 0.8 : 0.98),
    1,
  );
}

// Notched, shallow leaf masses plus small terminal sprays; no spherical middle ring.
function treeCrown(
  g: Geometry,
  p: Position,
  r: Position,
  seed: number,
  yaw: number,
  shade: number,
  distant: boolean,
  spray = false,
) {
  const sides = distant || spray ? 5 : 9;
  const rings = spray ? [0] : [-0.4, 0.38];
  const start = g.positions.length / 3,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const vertex = (x: number, y: number, z: number) => {
    // A small lean and different radial lengths break rotational symmetry, including at the poles.
    const dx = x * r.x + y * r.x * (noise(seed + 107) - 0.5) * 0.5,
      dz = z * r.z + x * r.z * (noise(seed + 109) - 0.5) * 0.35;
    const nx = x / r.x,
      ny = y / r.y,
      nz = z / r.z;
    treeVertex(
      g,
      { x: p.x + dx * c + dz * s, y: p.y + y * r.y, z: p.z + dz * c - dx * s },
      { x: nx * c + nz * s, y: ny, z: nz * c - nx * s },
      shade *
        (0.72 + noise(seed + (g.positions.length / 3 - start) * 17) * 0.16 + Math.max(0, y) * 0.04),
    );
  };
  vertex(-0.12, -0.85, 0.08);
  for (let row = 0; row < rings.length; row++) {
    const y = rings[row];
    for (let i = 0; i < sides; i++) {
      const angle = (i * Math.PI * 2) / sides + (noise(seed + i * 7) - 0.5) * 0.4 + row * 0.12;
      // Alternate recesses and leaf fans, retaining the notches through both shoulder rings.
      const radius = (i % 2 ? 0.64 : 0.97) + noise(seed + i * 11 + row * 31) * 0.16;
      vertex(
        Math.cos(angle) * radius,
        y + (noise(seed + i * 19 + row) - 0.5) * 0.24,
        Math.sin(angle) * radius,
      );
    }
  }
  vertex(0.16, 0.9, -0.12);
  const top = g.positions.length / 3 - 1;
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    g.indices.push(start, start + 1 + i, start + 1 + next);
    for (let row = 0; row < rings.length - 1; row++) {
      const a = start + 1 + row * sides + i,
        b = start + 1 + row * sides + next;
      g.indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
    const last = start + 1 + (rings.length - 1) * sides;
    g.indices.push(last + i, top, last + next);
  }
}

function treeBranch(
  g: Geometry,
  a: Position,
  b: Position,
  radius: number,
  tip: number,
  shade: number,
) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz),
    horizontal = Math.hypot(dx, dz);
  const c = horizontal ? dz / horizontal : 1,
    s = horizontal ? dx / horizontal : 0;
  const start = g.positions.length / 3;
  for (let ring = 0; ring < (tip ? 2 : 1); ring++) {
    const p = ring ? b : a,
      r = ring ? tip : radius;
    for (let i = 0; i < 4; i++) {
      const u = Math.cos((i * Math.PI) / 2),
        v = Math.sin((i * Math.PI) / 2);
      const nx = u * c + (v * s * dy) / length,
        ny = (-v * horizontal) / length;
      const nz = -u * s + (v * c * dy) / length;
      treeVertex(
        g,
        { x: p.x + nx * r, y: p.y + ny * r, z: p.z + nz * r },
        { x: nx, y: ny, z: nz },
        shade,
        true,
      );
    }
  }
  if (!tip) treeVertex(g, b, { x: dx, y: dy, z: dz }, shade, true);
  for (let i = 0; i < 4; i++) {
    const a = start + i,
      b = start + ((i + 1) % 4);
    g.indices.push(a, tip ? a + 4 : start + 4, b);
    if (tip) g.indices.push(b, a + 4, b + 4);
  }
}

function addTree(foliage: Geometry | null, wood: Geometry | null, t: Tree, distant = false) {
  const evergreen = noise(t.seed + 401) < 0.43;
  const yaw = noise(t.seed + 71) * Math.PI * 2;
  const leanX = (noise(t.seed + 91) - 0.5) * 0.13,
    leanZ = (noise(t.seed + 93) - 0.5) * 0.13;
  const point = (x: number, y: number, z: number): Position => ({
    x: t.x + (x + leanX * y) * t.h,
    y: t.y + y * t.h,
    z: t.z + (z + leanZ * y) * t.h,
  });
  const fork = point(0, evergreen ? 0.33 : 0.4, 0);
  if (wood) {
    // Roots are buried once at the trunk. Crowns/branches stay rigid on sloped ground.
    treeBranch(
      wood,
      point(0, -0.08, 0),
      distant ? point(0, 0.8, 0) : fork,
      t.h * 0.027,
      t.h * 0.012,
      0.55,
    );
    if (!distant) treeBranch(wood, fork, point(0, 0.91, 0), t.h * 0.017, t.h * 0.003, 0.52);
  }
  const count = distant ? 3 : evergreen ? 4 : 3 + Math.floor(noise(t.seed + 407) * 2);
  const sprays = distant ? 0 : (count === 4 ? 7 : 9) - Math.floor(noise(t.seed + 409) * 2);
  for (let i = 0; i < count; i++) {
    const seed = t.seed + i * 43,
      angle = yaw + i * 2.399963 + (noise(seed + 11) - 0.5) * 0.55;
    const level = evergreen
      ? 0.4 + (i / (count - 1)) * 0.49 + (noise(seed + 17) - 0.5) * 0.05
      : i === count - 1
        ? 0.84
        : 0.52 + noise(seed + 19) * 0.24;
    const reach = evergreen
      ? (0.15 + noise(seed + 29) * 0.08) * (1 - (i / count) * 0.65)
      : i === count - 1
        ? 0.06
        : 0.18 + noise(seed + 29) * 0.09;
    const p = point(Math.sin(angle) * reach, level, Math.cos(angle) * reach);
    if (wood && !distant) {
      const branchRoot = evergreen ? point(0, level - 0.09, 0) : fork;
      treeBranch(wood, branchRoot, p, t.h * (evergreen ? 0.009 : 0.015), t.h * 0.003, 0.55);
    }
    const width = (evergreen ? 0.22 - (i / (count - 1)) * 0.13 : 0.16) + noise(seed + 23) * 0.04;
    const shade = (evergreen ? 0.79 : 0.87) * (0.86 + noise(seed + 37) * 0.14);
    if (foliage) {
      treeCrown(
        foliage,
        p,
        {
          x: t.h * width,
          y: t.h * (evergreen ? 0.1 : 0.13 + noise(seed + 31) * 0.04),
          z: t.h * width * (0.64 + noise(seed + 41) * 0.22),
        },
        seed,
        angle,
        shade,
        distant,
      );
    }
    for (let j = i; j < sprays; j += count) {
      const twigSeed = seed + j * 67;
      const twigAngle =
        angle + (Math.floor(j / count) - 0.8) * 1.15 + (noise(twigSeed + 47) - 0.5) * 0.45;
      const length = width * (0.75 + noise(twigSeed + 53) * 0.4);
      const tip = {
        x: p.x + Math.sin(twigAngle) * t.h * length,
        y: p.y + (noise(twigSeed + 59) - 0.35) * t.h * 0.18,
        z: p.z + Math.cos(twigAngle) * t.h * length,
      };
      if (wood) treeBranch(wood, p, tip, t.h * 0.004, 0, 0.5);
      if (foliage) {
        const size = t.h * (0.08 + noise(twigSeed + 61) * 0.04);
        treeCrown(
          foliage,
          tip,
          { x: size, y: size * 0.65, z: size * 0.78 },
          twigSeed + 101,
          twigAngle,
          shade * 0.9,
          false,
          true,
        );
      }
    }
  }
}

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
  const surfaceHeight = g.height || terrainHeight;
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
    if (g.grounded) {
      const slope = terrainSlope(surfaceHeight, x + p[0], z + p[2]);
      p[1] += surfaceHeight(x + p[0], z + p[2]);
      n[0] -= n[1] * slope.x;
      n[2] -= n[1] * slope.z;
    }
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
  const surfaceHeight = g.height || terrainHeight;
  if (g.grounded && h <= 0.25 && Math.max(w, d) > 3) {
    // Thin roads/fields need interior samples: raising only their corners bridges over valleys.
    const nx = Math.max(1, Math.ceil(w / 1.5)),
      nz = Math.max(1, Math.ceil(d / 1.5));
    const start = g.positions.length / 3,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let ix = 0; ix <= nx; ix++)
      for (let iz = 0; iz <= nz; iz++) {
        const lx = (ix / nx - 0.5) * w,
          lz = (iz / nz - 0.5) * d;
        const px = x + lx * c + lz * s,
          pz = z + lz * c - lx * s;
        const slope = terrainSlope(surfaceHeight, px, pz),
          n = Math.hypot(slope.x, 1, slope.z);
        g.positions.push(px, surfaceHeight(px, pz) + y + h / 2, pz);
        g.normals.push(-slope.x / n, 1 / n, -slope.z / n);
        g.colors.push(shade, shade, shade, 1);
        if (ix < nx && iz < nz) {
          const a = start + ix * (nz + 1) + iz,
            b = a + nz + 1;
          g.indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    return;
  }
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
export class World {
  root: Node;
  camera: Camera;
  cameraNode: Node;
  readonly aircraftModel: AircraftModel;
  center: Point = { x: 0, z: 0 };
  zoom = 1;
  follow = false;
  focusSpan?: { x: number; z: number };
  temporary = false;
  thermal = false;
  views = new Map<number, { node: Node; material: Material; wreck: boolean }>();
  impactClouds: BattleEvent[] = [];
  private lastImpact = 0;
  terrain: { material: Material; day: string; heat: string }[] = [];
  meshes = new Map<Kind, Mesh>();
  private wreckMeshes = new Map<Kind, Mesh>();
  modelImport = 'loading';
  assets = new Set<string>();
  triangleCount = 0;
  private ownedMeshes = new Set<Mesh>();
  private disposed = false;
  private plane: Position & { heading: number; yaw?: number; pitch?: number; bank?: number } = aircraft(0);
  private sensorRotation = 0;
  recoil = { x: 0, y: 0 };
  private cameraTime = -1;
  private cameraPaused = false;
  private cameraFrame = aircraftCamera(this.plane, this.center, terrainHeight, 1, 16 / 9, 0);

  height = (x: number, z: number) => terrainHeight(x, z, this.map);
  private elevations: number[][];
  private cloudLayer?: Node;
  private waterGlints?: Node;
  private surfaceHeight = (x: number, z: number) => Math.abs(x) <= MAP.halfWidth && Math.abs(z) <= MAP.halfDepth
    ? this.height(x, z) : heightfieldHeight(terrainXs, terrainZs, this.elevations, x, z);
  private roadDistance = (x: number, z: number) => Math.min(...mapRoute(this.map).slice(1)
    .map((p, i) => segmentDistance(x, z, mapRoute(this.map)[i], p)));
  constructor(parent: Node, readonly map: BattlefieldId = 'valley') {
    const terrainHeight = this.height, surfaceHeight = this.surfaceHeight, roadDistance = this.roadDistance;
    const ROUTE = mapRoute(map), ROUTE_LENGTH = routeLength(map), HOLD_POINTS = [ROUTE_LENGTH * .28, ROUTE_LENGTH * .64];
    const mapPoint = (d: number) => routePoint(d, map);
    const combatDistance = (x: number, z: number) => Math.min(roadDistance(x, z),
      ...MISSION.events.map(e => Math.hypot(x - e.x, z - e.z) - (e.kind === 'light' ? 2 : 0)));
    const terrainHeights = this.elevations = terrainXs.map(x => terrainZs.map(z => sceneryHeight(x, z, map) - (map === 'valley' ? Math.max(0, 1 - Math.abs(x - riverX(z)) / 6) * 1.3 : 0)));
    this.root = new Node('Battlefield');
    parent.addChild(this.root);
    this.root.once(Node.EventType.NODE_DESTROYED, this.dispose, this);
    this.aircraftModel = new AircraftModel(this.root);
    this.cameraNode = new Node('ObservationCamera');
    parent.addChild(this.cameraNode);
    this.camera = this.cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.PERSPECTIVE;
    this.camera.near = AIRFRAME.cameraNear;
    this.camera.far = 2700;
    this.camera.clearColor = color('#26354e');

    this.terrainBatch('terrain.sky', '#ffffff', '#14222c', (g) => {
      const bands = [
        [-100, map === 'valley' ? '#46566c' : '#796f6e'],
        [70, map === 'valley' ? '#546b88' : '#8f8080'],
        [170, '#4e6788'],
        [400, '#465e80'],
        [900, '#273c59'],
        [1800, '#172a45'],
      ] as const;
      for (const [y, hex] of bands)
        for (let i = 0; i <= 64; i++) {
          const angle = (i * Math.PI) / 32,
            tint = color(hex);
          g.positions.push(Math.sin(angle) * 1900, y, Math.cos(angle) * 1900);
          g.normals.push(-Math.sin(angle), 0, -Math.cos(angle));
          g.colors.push(tint.r / 255, tint.g / 255, tint.b / 255, 1);
        }
      for (let band = 0; band < bands.length - 1; band++)
        for (let i = 0; i < 64; i++) {
          const a = band * 65 + i,
            b = a + 65;
          g.indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    });

    this.cloudLayer = this.terrainBatch('terrain.clouds', '#f0f2f4', '#23313c', g => {
      // Soft alpha edges keep the cloud bank from looking like solid ellipsoids.
      for (let i = 0; i < 15; i++) {
        const a = i * 2.39996, radius = 650 + noise(i + 880) * 400;
        const x = Math.sin(a) * radius, z = Math.cos(a) * radius, y = 105 + noise(i + 900) * 55;
        for (let j = 0; j < 9; j++) {
          const start = g.positions.length / 3, offset = (j - 4) * 16;
          const width = 28 + noise(i * 41 + j) * 28, height = 10 + noise(i * 13 + j) * 15;
          for (let ring = 0; ring < 5; ring++) for (let k = 0; k < 24; k++) {
            const angle = k * Math.PI / 12, r = ring / 4;
            const dx = offset + Math.cos(angle) * width * r;
            g.positions.push(x + Math.cos(a) * dx, y + Math.sin(j * 1.8) * 8 + Math.sin(angle) * height * r, z - Math.sin(a) * dx);
            g.normals.push(-Math.sin(a), 0, -Math.cos(a));
            const shade = .82 + Math.sin(angle) * r * .1;
            g.colors.push(shade, shade, shade, [.48, .4, .22, .06, 0][ring]);
            if (ring < 4) {
              const p = start + ring * 24 + k, next = start + ring * 24 + (k + 1) % 24;
              g.indices.push(p, next + 24, p + 24, p, next, next + 24);
            }
          }
        }
      }
    });
    this.terrainBatch('terrain.moon', '#fff4cc', '#536977', g => {
      addShape(g, primitives.sphere(.5, { segments: 24 }), -420, 182, -1250, 36, 36, 36, 1.8);
    });
    this.terrainBatch('terrain.ground', '#ffffff', '#314654', (g) => {
      // One shared, non-uniform grid: no separate ground colors, skirts or disconnected LOD seams.
      const xs = terrainXs,
        zs = terrainZs;
      for (let ix = 0; ix < xs.length; ix++)
        for (let iz = 0; iz < zs.length; iz++) {
          const x = xs[ix],
            z = zs[iz];
          const slope = terrainSlope((x, z) => sceneryHeight(x, z, map), x, z),
            normal = new Vec3(-slope.x, 1, -slope.z).normalize();
          const light =
            0.42 + Math.max(0, -normal.x * 0.58 + normal.y * 0.42 + normal.z * 0.66) * 0.8;
          const variation =
            0.92 + 0.08 * Math.sin(x * 0.07 + Math.sin(z * 0.035) * 3) * Math.cos(z * 0.065);
          const haze = clamp((Math.hypot(x, z) - 100) / 1500, 0, 0.78);
          g.positions.push(x, terrainHeights[ix][iz] - 0.045, z);
          g.normals.push(normal.x, normal.y, normal.z);
          for (const [near, far] of [
            [map === 'valley' ? 47 : 84, 116],
            [map === 'valley' ? 67 : 77, 122],
            [map === 'valley' ? 65 : 68, 143],
          ])
            g.colors.push((near * light * variation * (1 - haze) + far * haze) / 255);
          g.colors.push(1);
          if (ix < xs.length - 1 && iz < zs.length - 1) {
            const a = ix * zs.length + iz,
              b = a + zs.length;
            g.indices.push(a, a + 1, b, b, a + 1, b + 1);
          }
        }
    });
    if (map === 'valley') this.terrainBatch('terrain.water', '#476879', '#101c24', (g) => {
      // A continuous ribbon avoids seams between individual river tiles.
      for (let z = -650; z <= 650; z++) {
        for (const dx of [-2.9, 0, 2.9]) {
          const x = riverX(z) + dx;
          g.positions.push(x, terrainHeight(x, z) + .025, z);
          g.normals.push(0, 1, 0);
          const light = dx === 0 ? 1.05 : .68;
          g.colors.push(light, light, light, 1);
        }
        if (z < 650) for (let j = 0; j < 2; j++) {
          const i = (z + 650) * 3 + j;
          g.indices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4);
        }
      }
    });
    if (map === 'valley') this.waterGlints = this.terrainBatch('terrain.reflections', '#afc9d9', '#344750', g => {
      for (let i = 0; i < 520; i++) {
        const z = -500 + i * 1.92, x = riverX(z) + (noise(i + 2800) - .5) * 4.4;
        addBox(g, x, .065, z, .2 + noise(i + 3000) * .8, .008, .025 + noise(i) * .025, .2 + noise(i + 88) * .5);
      }
    });
    this.terrainBatch('terrain.roads', '#18272e', '#182127', (g) => {
      for (let i = 1; i < ROUTE.length; i++) {
        const a = ROUTE[i - 1],
          b = ROUTE[i];
        addBox(
          g,
          (a.x + b.x) / 2,
          TERRAIN.roadLift - 0.055,
          (a.z + b.z) / 2,
          1.4,
          0.11,
          Math.hypot(b.x - a.x, b.z - a.z),
          1,
          Math.atan2(b.x - a.x, b.z - a.z),
        );
      }
      for (const p of ROUTE) addShape(g, cylinder, p.x, TERRAIN.roadLift - 0.056, p.z, 1.4, 0.11, 1.4);
    });
    this.terrainBatch('terrain.markings', '#d3c7a4', '#4a595e', (g) => {
      for (let d = 0; d < ROUTE_LENGTH; d += 4) {
        const p = mapPoint(d);
        addBox(
          g,
          p.x,
          TERRAIN.roadLift + 0.024,
          p.z,
          0.025,
          0.025,
          Math.min(0.4, ROUTE_LENGTH - d + 0.01),
          1,
          p.heading,
        );
      }
      for (const d of HOLD_POINTS) {
        const p = mapPoint(d);
        for (const offset of [-0.6, 0.6])
          addBox(
            g,
            p.x + Math.sin(p.heading) * offset,
            TERRAIN.roadLift + 0.04,
            p.z + Math.cos(p.heading) * offset,
            1.2,
            0.035,
            0.045,
            1,
            p.heading,
          );
      }
      for (let x = -7; x <= 7; x += 2)
        for (const z of [0.5, 2.3]) addBox(g, x, 0.3, z, 0.09, 0.05, 0.07);
    });

    const exit = ROUTE[ROUTE.length - 1];
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
      [-92, -44, 5, 4, 2.6],
      [-101, -38, 6, 5, 2.8],
      [72, 50, 5, 4, 2.5],
      [82, 42, 6, 5, 2.8],
      [-143, 48, 5, 4, 2.6],
      [-151, 58, 6, 5, 2.8],
      [-138, 61, 5, 5, 3],
      [138, -40, 6, 4, 2.8],
      [148, -46, 5, 5, 2.6],
      [151, -33, 7, 4, 3],
      [132, 80, 6, 5, 2.8],
      [144, 92, 5, 4, 2.5],
      [157, 88, 7, 5, 3],
      [-60, -102, 5, 4, 2.6],
      [-72, -111, 6, 5, 2.8],
      [-78, -97, 5, 5, 3],
    ].filter(([x, z, w, d]) => combatDistance(x, z) > Math.hypot(w, d) / 2 + 3);
    const fields = [
      [-82, -26, 21, 15],
      [-45, -39, 26, 16],
      [22, 19, 19, 12],
      [67, 20, 24, 17],
      [-89, 57, 22, 12],
      [88, 49, 18, 11],
      [-19, -53, 22, 13],
      [45, 54, 20, 12],
      [-147, 12, 26, 18],
      [154, 36, 24, 17],
      [-54, -89, 26, 13],
    ];
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.399963,
        radius = 230 + noise(i + 611) * 340;
      const x = Math.sin(angle) * radius,
        z = Math.cos(angle) * radius;
      fields.push([x, z, 25 + noise(i + 510) * 20, 18 + noise(i + 515) * 16]);
      if (i % 2 === 0)
        for (let j = 0; j < 3; j++)
          houses.push([x + 25 + j * 7, z + 10 + noise(j + i) * 6, 4.5, 4, 2.6 + noise(i + j)]);
    }
    const camp = [0, 1, 2].map((i) => ({ x: exit.x - 8 + i * 7, z: exit.z + 12 }));
    const trees: Tree[] = [];
    // At most 105 crown vertices/tree: 620 trees still fit one 16-bit forest batch.
    for (let i = 0; i < 1000 && trees.length < 400; i++) {
      const extent = i < 620 ? 1 : 1.7;
      const x = (noise(i * 3) * 2 - 1) * (MAP.halfWidth - 4) * extent,
        z = (noise(i * 3 + 1) * 2 - 1) * (MAP.halfDepth - 4) * extent;
      if (
        (map === 'valley' && Math.abs(x - riverX(z)) < 5) ||
        combatDistance(x, z) < 5.5 ||
        Math.hypot(x - station.x, z - station.z) < 13 ||
        houses.some(
          ([hx, hz, w, d]) => Math.abs(x - hx) < w / 2 + 2 && Math.abs(z - hz) < d / 2 + 2,
        ) ||
        fields.some(
          ([fx, fz, w, d]) => Math.abs(x - fx) < w / 2 + 1 && Math.abs(z - fz) < d / 2 + 1,
        ) ||
        PROTECTED.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 2) ||
        camp.some((p) => Math.hypot(x - p.x, z - p.z) < 6)
      )
        continue;
      trees.push({ x, z, y: surfaceHeight(x, z), h: 1.5 + noise(i * 3 + 2) * 2.2, seed: i });
    }
    this.terrainBatch('terrain.ridges', '#34434b', '#3a454b', (g) => {
      for (let i = 0; i < 120; i++) {
        const x = (noise(i + 920) * 2 - 1) * (MAP.halfWidth - 4),
          z = (noise(i + 1520) * 2 - 1) * (MAP.halfDepth - 4),
          size = 1.5 + noise(i + 620) * 4;
        if (
          combatDistance(x, z) < size + 5 ||
          fields.some(
            ([fx, fz, w, d]) => Math.abs(x - fx) < w / 2 + size && Math.abs(z - fz) < d / 2 + size,
          ) ||
          (map === 'valley' && Math.abs(x - riverX(z)) < 7)
        )
          continue;
        addShape(g, rock, x, size * 0.19, z, size * 1.4, size, size * 0.9, 0.85, i);
      }
      for (let i = 1; i < ROUTE.length; i++) {
        const a = ROUTE[i - 1],
          b = ROUTE[i];
        if (Math.abs(a.x) <= 8 && Math.abs(b.x) <= 8) continue;
        addBox(
          g,
          (a.x + b.x) / 2,
          0.015,
          (a.z + b.z) / 2,
          1.8,
          0.05,
          Math.hypot(b.x - a.x, b.z - a.z),
          0.8,
          Math.atan2(b.x - a.x, b.z - a.z),
        );
      }
    });
    this.terrainBatch('terrain.fields', '#354137', '#303a3b', (g) => {
      for (const [x, z, w, d] of fields) {
        addBox(g, x, -0.055, z, w, 0.1, d, 0.74);
        const spacing = Math.abs(x) > MAP.halfWidth || Math.abs(z) > MAP.halfDepth ? 2.4 : 1.2;
        for (let row = -d / 2 + 0.8; row < d / 2; row += spacing)
          addBox(g, x, 0.035, z + row, w - 1.2, 0.17, 0.36, 0.85 + noise(row) * 0.2);
        for (const edge of [-1, 1]) addBox(g, x + (edge * w) / 2, 0.05, z, 0.35, 0.2, d, 0.6);
      }
    });
    this.terrainBatch('terrain.structures', '#414e53', '#49535a', (g) => {
      // The original crossing follows the shared road surface; all scenery offsets are local to terrain.
      if (map === 'valley') {
      addBox(g, 0, -0.24, 1.4, 24, 0.36, 1.8);
      for (const x of [-6, 6])
        for (const z of [0.7, 2.1]) addBox(g, x, -1.5, z, 0.4, 2.4, 0.4, 0.75);
      for (const z of [0.5, 2.3]) {
        addBox(g, 0, 0.16, z, 16, 0.3, 0.06, 0.85);
        for (let x = -8; x <= 8; x += 2) addBox(g, x, 0.25, z, 0.06, 0.3, 0.08);
      }
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
    this.terrainBatch('terrain.windows', '#ffd595', '#697773', g => {
      for (const [x, z, w, d, h] of houses) for (const side of [-1, 1]) for (const offset of [-.28, .28])
        addBox(g, x + offset * w, h * .63, z + side * (d / 2 + .08), .64, .57, .035, 1.4);
    });
    this.terrainBatch('terrain.roofs', '#4a3940', '#344149', (g) => {
      for (const [x, z, w, d, h] of houses)
        addRoof(g, x, h, z, w + 0.8, 1.5, d + 0.8, 0.9 + noise(z) * 0.1);
      addRoof(g, station.x, 3, station.z, 8.5, 0.8, 5.5, 0.85);
    });
    this.terrainBatch('terrain.forest', '#3d5142', '#0b1215', (g) => {
      for (const t of trees) addTree(g, null, t);
    });
    this.terrainBatch('terrain.distantForest', '#354e43', '#0d161a', (g) => {
      // ponytail: fixed scenery detail; 1,440 * 44 vertices max, use spatial LOD if the forest expands.
      for (let grove = 0; grove < 60; grove++) {
        const angle = grove * 2.399963,
          radius = 210 + noise(grove + 811) * 570;
        const cx = Math.sin(angle) * radius,
          cz = Math.cos(angle) * radius;
        for (let i = 0; i < 24; i++) {
          const x = cx + (noise(grove * 101 + i * 2) - 0.5) * 65;
          const z = cz + (noise(grove * 101 + i * 2 + 1) - 0.5) * 50;
          if (
            fields.some(
              ([fx, fz, w, d]) => Math.abs(x - fx) < w / 2 + 3 && Math.abs(z - fz) < d / 2 + 3,
            )
          )
            continue;
          addTree(
            g,
            g,
            {
              x,
              z,
              y: surfaceHeight(x, z),
              h: 1.4 + noise(grove * 53 + i) * 1.6,
              seed: grove * 101 + i + 2000,
            },
            true,
          );
        }
      }
    });
    this.terrainBatch('terrain.details', '#343e37', '#19262c', (g) => {
      for (const t of trees) addTree(null, g, t);
      for (const [x, z, w, d, h] of houses) {
        addBox(g, x, 0.9, z + d / 2 + 0.03, 0.85, 1.8, 0.06);
        for (const side of [-1, 1])
          for (const offset of [-0.28, 0.28])
            addBox(g, x + offset * w, h * 0.63, z + side * (d / 2 + 0.03), 0.85, 0.8, 0.06, 1.3);
      }
      for (const z of [0.5, 2.3]) addBox(g, 0, 0.4, z, 16.4, 0.03, 0.04, 1.4);
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
      const wreck = geometry();
      const w = heavy ? 2.65 : rescue ? 2.1 : 1.8;
      const d = kind === 'turret' ? 2.6 : heavy || rescue ? 4.2 : 3.2;
      addBox(wreck, 0, 0.35, 0, w, 0.4, d, 0.5);
      addShape(wreck, box, -0.15, 0.65, -0.25, w * 0.7, 0.65, d * 0.5, 0.32, 0.12, 0.16, 0.24);
      if (heavy || kind === 'turret') {
        addShape(wreck, cylinder, 0.5, 0.55, 0.75, 1.5, 0.6, 1.5, 0.35, 0.5, 0.6);
        addShape(wreck, cylinder, 0.9, 0.25, 1.65, 0.2, 1.8, 0.2, 0.3, 0.5, Math.PI / 2);
      }
      for (let i = 0; i < 5; i++) {
        const angle = i * 2.4;
        addShape(wreck, box, Math.cos(angle) * (w * 0.6 + i * 0.16), 0.12,
          Math.sin(angle) * (d * 0.55 + i * 0.1), 0.4, 0.16, 0.65, 0.35, angle, 0.1, 0.15);
      }
      this.wreckMeshes.set(kind, this.mesh(wreck));
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
      const axes = groundAxes(terrainHeight, beacon.x, beacon.z, 0);
      n.setPosition(beacon.x, terrainHeight(beacon.x, beacon.z), beacon.z);
      n.setRotation(Quat.fromAxes(new Quat(), axes.right, axes.up, axes.forward));
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
  material(hex: string, transparent = false) {
    const m = new Material();
    m.initialize({ effectName: 'builtin-unlit', technique: transparent ? 1 : 0, defines: { USE_VERTEX_COLOR: true } });
    m.setProperty('mainColor', color(hex));
    return m;
  }
  terrainBatch(id: string, day: string, heat: string, build: (g: Geometry) => void) {
    const g = geometry();
    g.grounded = !['terrain.ground', 'terrain.foothills', 'terrain.sky', 'terrain.clouds', 'terrain.moon'].includes(id);
    g.height = this.surfaceHeight;
    build(g);
    const n = new Node('asset:' + id);
    this.root.addChild(n);
    const r = n.addComponent(MeshRenderer);
    r.mesh = this.mesh(g);
    const m = this.material(this.thermal ? heat : day, id === 'terrain.clouds');
    r.setMaterial(m, 0);
    this.terrain.push({ material: m, day, heat });
    this.assets.add(id);
    return n;
  }
  updateCamera() {
    if (this.cameraPaused) return;
    const size = view.getVisibleSizeInPixel();
    const aspect = Math.max(0.1, size.width / Math.max(1, size.height));
    this.center.x = clamp(
      Number.isFinite(this.center.x) ? this.center.x : 0,
      -MAP.halfWidth,
      MAP.halfWidth,
    );
    this.center.z = clamp(
      Number.isFinite(this.center.z) ? this.center.z : 0,
      -MAP.halfDepth,
      MAP.halfDepth,
    );
    this.zoom = clamp(Number.isFinite(this.zoom) ? this.zoom : 1, 0.65, 5);
    this.cameraFrame = aircraftCamera(
      this.plane,
      this.center,
      this.height,
      this.zoom * (this.temporary ? 1.5 : 1),
      aspect,
      this.sensorRotation,
    );
    const frame = this.cameraFrame;
    this.camera.fovAxis = Camera.FOVAxis.VERTICAL;
    this.camera.fov = frame.fov;
    this.cameraPose(true);
  }
  private cameraPose(shake: boolean) {
    const frame = this.cameraFrame, pos = frame.position, target = new Vec3(frame.target.x, frame.target.y, frame.target.z);
    const up = new Vec3(frame.up.x, frame.up.y, frame.up.z);
    if (shake && (this.recoil.x || this.recoil.y)) {
      const forward = Vec3.subtract(new Vec3(), target, new Vec3(pos.x, pos.y, pos.z)).normalize();
      const right = Vec3.cross(new Vec3(), forward, up).normalize();
      const scale = 2 * frame.range * Math.tan(frame.fov * Math.PI / 360) / Math.max(1, view.getFrameSize().height);
      Vec3.scaleAndAdd(target, target, right, this.recoil.x * scale);
      Vec3.scaleAndAdd(target, target, up, this.recoil.y * scale);
    }
    this.cameraNode.setPosition(pos.x, pos.y, pos.z);
    this.cameraNode.lookAt(target, up);
    this.camera.camera?.update(true);
  }
  adjustZoom(factor: number, screenX?: number, screenY?: number) {
    if (this.cameraPaused || !Number.isFinite(factor) || factor <= 0) return;
    const anchor = screenX === undefined || screenY === undefined ? null : this.aimAt(screenX, screenY);
    this.zoom = clamp(this.zoom * factor, 0.65, 5);
    this.updateCamera();
    // Preserve the terrain under the gesture, with bounded correction for perspective and hills.
    if (anchor && screenX !== undefined && screenY !== undefined) {
      for (let i = 0; i < 3; i++) {
        const next = this.aimAt(screenX, screenY);
        if (!next) break;
        this.center.x += anchor.x - next.x;
        this.center.z += anchor.z - next.z;
        this.updateCamera();
      }
      this.follow = false;
    }
  }
  /** Rotate the actual sensor around its optical axis, independent of aircraft orbital direction. */
  rotate(deltaDegrees: number) {
    if (this.cameraPaused || !Number.isFinite(deltaDegrees)) return;
    this.sensorRotation = (((this.sensorRotation + deltaDegrees) % 360) + 360) % 360;
    this.updateCamera();
  }
  get cameraSnapshot() {
    const frame = this.cameraFrame;
    return Object.freeze({
      position: Object.freeze({ ...frame.position }),
      target: Object.freeze({ ...frame.target }),
      up: Object.freeze({ ...frame.up }),
      center: Object.freeze({ ...this.center }),
      sensorRotation: frame.sensorRotation,
      elevation: frame.elevation,
      range: frame.range,
      fov: frame.fov,
      near: this.camera.near,
      far: this.camera.far,
      projection: 'perspective' as const,
      paused: this.cameraPaused,
    });
  }
  aimAt(x: number, y: number): Point | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    this.cameraPose(false);
    const ray = this.camera.screenPointToRay(x, y);
    this.cameraPose(true);
    const hit = terrainRay(
      ray.o,
      ray.d,
      this.surfaceHeight,
      horizonExtent.x,
      horizonExtent.z,
      this.camera.far,
    );
    return hit ? { x: hit.x, z: hit.z } : null;
  }
  project(p: Point, y = 0, stable = false) {
    if (stable) this.cameraPose(false);
    const point = this.projectAir({ x: p.x, y: this.surfaceHeight(p.x, p.z) + y, z: p.z });
    if (stable) this.cameraPose(true);
    return point;
  }
  /** Forward camera distance in world units; Effects can clip actual ballistic segments at camera.near. */
  cameraDepth(p: Position) {
    const { position, target, range } = this.cameraFrame;
    return (
      ((p.x - position.x) * (target.x - position.x) +
        (p.y - position.y) * (target.y - position.y) +
        (p.z - position.z) * (target.z - position.z)) /
      range
    );
  }
  projectAir(p: Position): Vec3 {
    if (![p.x, p.y, p.z].every(Number.isFinite) || this.cameraDepth(p) < this.camera.near)
      return new Vec3(-1000000, -1000000, -1);
    return this.camera.worldToScreen(new Vec3(p.x, p.y, p.z));
  }
  sensor() {
    this.thermal = !this.thermal;
    this.camera.clearColor = color(this.thermal ? '#10191d' : '#26354e');
    for (const t of this.terrain)
      t.material.setProperty('mainColor', color(this.thermal ? t.heat : t.day));
  }
  locate(u: Point) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.z)) return;
    this.center = { x: u.x, z: u.z };
    this.follow = true;
    this.updateCamera();
  }
  private clearViews() {
    for (const v of Array.from(this.views.values())) {
      v.node.active = false;
      v.node.destroy();
      v.material.destroy();
    }
    this.views.clear();
    this.impactClouds = [];
    this.lastImpact = 0;
  }
  reset() {
    this.clearViews();
    this.focusSpan = undefined;
    this.follow = view.getFrameSize().height < 500;
    this.center = this.follow ? { x: mapRoute(this.map)[0].x + 12, z: mapRoute(this.map)[0].z - 6 } : { x: 0, z: 0 };
    this.zoom = this.follow ? 1.35 : 1;
    this.temporary = false;
    this.recoil = { x: 0, y: 0 };
    this.plane = aircraft(0);
    this.cameraTime = -1;
    this.cameraPaused = false;
    this.sensorRotation = 0;
    this.updateCamera();
  }
  private dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.aircraftModel.dispose();
    this.clearViews();
    for (const t of this.terrain) t.material.destroy();
    for (const mesh of Array.from(this.ownedMeshes)) mesh.destroy();
    this.terrain.length = 0;
    this.ownedMeshes.clear();
    this.meshes.clear();
    this.wreckMeshes.clear();
    if (isValid(this.cameraNode, true)) this.cameraNode.destroy();
  }
  update(s: Simulation, reduced = false) {
    this.cloudLayer?.setPosition(Math.sin(s.time * .008) * 14, 0, Math.cos(s.time * .006) * 8);
    if (this.waterGlints && !this.thermal) {
      const glint = 190 + Math.sin(s.time * 1.4) * 22;
      this.waterGlints.getComponent(MeshRenderer)!.getMaterial(0)!.setProperty('mainColor', new Color(glint * .86, glint * .95, glint));
    }
    for (const event of s.events) {
      if (event.id > this.lastImpact && event.type === 'impact') this.impactClouds.push(event);
      this.lastImpact = Math.max(this.lastImpact, event.id);
    }
    // ponytail: keep 24 large clouds plus 8 recent small impacts; spatial pooling if missions grow.
    this.impactClouds = [
      ...this.impactClouds.filter((e) => e.weapon > 0 && s.time - e.time < (e.weapon === 2 ? 16 : 10)).slice(-24),
      ...this.impactClouds.filter((e) => e.weapon === 0 && s.time - e.time < 1.5).slice(-8),
    ];
    const cursor = this.project(s.aim, 0, true);
    this.recoil = s.paused || s.phase !== 'playing' ? { x: 0, y: 0 } : recoilOffset(s.events, s.time, reduced);
    const elapsed = this.cameraTime < 0 ? 0 : clamp(s.time - this.cameraTime, 0, 0.1);
    this.cameraPaused = s.paused;
    this.cameraTime = s.time;
    if (!s.paused) {
      this.plane = { ...s.aircraft };
      this.aircraftModel.update(s.aircraft, s.aircraft.yaw, s.aircraft.pitch, s.aircraft.direction, s.aircraft.bank, s.selected);
      if (this.aircraftModel.status === 'ready') this.assets.add('aircraft.cabin');
    }
    if (this.follow && s.phase === 'playing' && !s.paused) {
      const nearby = s.units.filter(
        (u) =>
          (u.hp > 0 || s.time - u.deadAt < 2) &&
          Math.hypot(u.x - s.rescue.x, u.z - s.rescue.z) < 46,
      );
      const points = [...nearby, { x: s.rescue.x + 12, z: s.rescue.z }];
      const minX = Math.min(...points.map((p) => p.x)),
        maxX = Math.max(...points.map((p) => p.x));
      const minZ = Math.min(...points.map((p) => p.z)),
        maxZ = Math.max(...points.map((p) => p.z));
      const smoothing = this.focusSpan ? 1 - Math.exp(-elapsed * 3) : 1;
      this.center.x += ((minX + maxX) / 2 - this.center.x) * smoothing;
      this.center.z += ((minZ + maxZ) / 2 - this.center.z) * smoothing;
      const span = this.focusSpan || { x: maxX - minX, z: maxZ - minZ };
      span.x += (maxX - minX - span.x) * smoothing;
      span.z += (maxZ - minZ - span.z) * smoothing;
      this.focusSpan = span;
    }
    // The aircraft continues moving even when convoy-follow is off. Simulation pause freezes its pose.
    this.updateCamera();
    if (!s.paused && s.phase === 'playing' && elapsed > 0 && cursor.z >= 0) {
      const aim = this.aimAt(cursor.x, cursor.y);
      if (aim) s.aim = aim;
    }
    for (const u of s.units) {
      let v = this.views.get(u.id);
      if (!v) {
        const node = new Node('asset:' + UNITS[u.kind].assetId);
        this.root.addChild(node);
        const r = node.addComponent(MeshRenderer);
        r.mesh = this.meshes.get(u.kind)!;
        const material = this.material('#ffffff');
        r.setMaterial(material, 0);
        v = { node, material, wreck: false };
        this.views.set(u.id, v);
        this.assets.add(UNITS[u.kind].assetId);
      }
      const axes = groundAxes(this.height, u.x, u.z, u.heading);
      const orientation = Quat.fromAxes(new Quat(), axes.right, axes.up, axes.forward);
      const lift = this.roadDistance(u.x, u.z) < 0.8 ? TERRAIN.roadLift : 0;
      v.node.setPosition(u.x, this.height(u.x, u.z) + lift, u.z);
      v.node.setRotation(orientation);
      if (u.hp <= 0 && !v.wreck) {
        v.node.getComponent(MeshRenderer)!.mesh = this.wreckMeshes.get(u.kind)!;
        v.wreck = true;
      }
      v.node.setScale(0.25, 0.25, 0.25);
      const heat = u.hp > 0 ? UNITS[u.kind].heat : Math.max(0.16, 0.9 - (s.time - u.deadAt) * 0.09);
      const c = this.thermal
        ? new Color(heat * 255, heat * 255, heat * 245)
        : u.hp <= 0 ? color('#302e2b') : color(u.friendly ? '#afc7b5' : u.kind === 'heavy' ? '#988376' : '#b3a68b');
      if (!this.thermal && u.hp > 0) {
        const shade = 0.45 + 0.55 * u.hp / u.maxHp;
        c.r *= shade; c.g *= shade; c.b *= shade;
      }
      v.material.setProperty('mainColor', u.hit > 0 ? Color.WHITE : c);
    }
  }
}
