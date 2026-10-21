import {
  Camera,
  Color,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Vec3,
  primitives,
  utils,
  view,
} from 'cc';
import { BAY_X, queuePosition, type Simulation, type Vehicle, type Point } from './core/simulation';
import { DIRECTIONS } from './core/levels';
const INK = '#24524f',
  CREAM = '#eee2c8',
  GOLD = '#f4be4f',
  ROAD = '#7d9198';
const color = (hex: string) => new Color().fromHEX(hex);
/** Colour-batched geometry with deterministic baked daylight: no external model downloads. */
class Batch {
  groups = new Map<
    string,
    { positions: number[]; normals: number[]; colors: number[]; indices: number[] }
  >();
  add(
    hex: string,
    geo: primitives.IGeometry,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    let g = this.groups.get(hex);
    if (!g) {
      g = { positions: [], normals: [], colors: [], indices: [] };
      this.groups.set(hex, g);
    }
    const base = g.positions.length / 3;
    for (let i = 0; i < geo.positions.length; i += 3) {
      g.positions.push(
        x + geo.positions[i]! * sx,
        y + geo.positions[i + 1]! * sy,
        z + geo.positions[i + 2]! * sz,
      );
      const nx = geo.normals?.[i] ?? 0,
        ny = geo.normals?.[i + 1] ?? 1,
        nz = geo.normals?.[i + 2] ?? 0;
      const light = 0.67 + 0.33 * Math.max(0, -nx * 0.35 + ny * 0.8 + nz * 0.4);
      g.normals.push(nx, ny, nz);
      g.colors.push(light, light, light, 1);
    }
    g.indices.push(...(geo.indices ?? []).map((i) => i + base));
  }
  box(hex: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    this.add(hex, primitives.box(), x, y, z, w, h, d);
  }
  ball(hex: string, x: number, y: number, z: number, w: number, h = w, d = w) {
    this.add(hex, primitives.sphere(0.5, { segments: 10 }), x, y, z, w, h, d);
  }
  cylinder(hex: string, x: number, y: number, z: number, r: number, h: number) {
    this.add(
      hex,
      primitives.cylinder(0.5, 0.5, 1, { radialSegments: 10 }),
      x,
      y,
      z,
      r * 2,
      h,
      r * 2,
    );
  }
}
export class StationWorld {
  root: Node;
  camera: Camera;
  private scenery: Node;
  private entities: Node;
  private materials = new Map<string, Material>();
  private meshes: Mesh[] = [];
  private entityMeshes: Mesh[] = [];
  cars = new Map<string, Node>();
  people = new Map<string, Node>();
  constructor(parent: Node) {
    this.root = new Node('Homebound miniature town');
    parent.addChild(this.root);
    this.scenery = new Node('Station district');
    this.root.addChild(this.scenery);
    this.entities = new Node('Vehicles and passengers');
    this.root.addChild(this.entities);
    const cn = new Node('Station camera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.visibility = Layers.Enum.DEFAULT;
    this.camera.clearColor = color('#dce7d4');
    cn.setPosition(0, 45, 42);
    cn.lookAt(new Vec3(0, 0, 8));
    this.buildDistrict();
  }
  private make(batch: Batch, parent: Node, name: string, entity = false) {
    const root = new Node(name);
    parent.addChild(root);
    for (const [hex, geo] of batch.groups) {
      const n = new Node(hex);
      root.addChild(n);
      n.layer = Layers.Enum.DEFAULT;
      let mat = this.materials.get(hex);
      if (!mat) {
        mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        mat.setProperty('mainColor', color(hex));
        this.materials.set(hex, mat);
      }
      const mesh = utils.createMesh(geo, undefined, { calculateBounds: true });
      (entity ? this.entityMeshes : this.meshes).push(mesh);
      const renderer = n.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(mat, 0);
    }
    return root;
  }
  private buildDistrict() {
    const b = new Batch();
    b.box('#bbd0b1', 0, -0.65, 8, 56, 1, 57);
    b.box('#d9cdb4', 0, -0.12, -4, 33, 0.3, 16);
    b.box(ROAD, 0, -0.1, 15, 35, 0.24, 30);
    // Parallel curb lanes and warm stone edges make traffic legible.
    b.box('#d9cdb4', -18, 0.05, 15, 1.8, 0.35, 31);
    b.box('#d9cdb4', 18, 0.05, 15, 1.8, 0.35, 31);
    b.box('#abbca2', 0, 0.03, 30, 37, 0.3, 2);
    for (let z = 3; z < 29; z += 3)
      for (const x of [-16, 16]) b.box('#edf0df', x, 0.05, z, 0.13, 0.03, 1.1);
    for (let x = -13; x < 16; x += 3) b.box('#edf0df', x, 0.05, 28, 1.2, 0.03, 0.12);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 5; c++) {
        const x = -8 + c * 4,
          z = 8 + r * 4;
        for (const k of [-1.7, 1.7]) b.box('#c3d0c9', x + k, 0.04, z, 0.055, 0.025, 2.9);
        b.box('#c3d0c9', x, 0.04, z + 1.65, 3.4, 0.025, 0.055);
      }
    // Train-station facade, recessed glazing, clock tower and generous canopy.
    b.box(CREAM, 0, 2, -10.4, 27, 4, 3.6);
    b.box('#f7efd9', 0, 4.06, -10.4, 27.7, 0.22, 4);
    b.box('#337b73', 0, 4.4, -10.4, 28, 0.55, 4.5);
    b.box('#26645f', 0, 4.75, -10.4, 25, 0.22, 3.2);
    for (let x = -13; x <= 13; x += 1.1) b.box('#4a9083', x, 4.72, -10.4, 0.035, 0.03, 4.1);
    b.box('#f5e9d1', 0, 4.8, -10.3, 5.3, 3, 3.8);
    b.ball('#f5e9d1', 0, 6.2, -10.3, 5.3, 2.3, 3.8);
    b.ball('#26716c', 0, 6.55, -10.3, 5.7, 2.2, 4);
    b.box('#f6eddb', 0, 5.2, -8.2, 4.5, 2.9, 0.35);
    b.ball('#d4b77b', 0, 5.7, -7.97, 1.7, 1.7, 0.18);
    b.ball('#fff5dc', 0, 5.7, -7.85, 1.43, 1.43, 0.1);
    b.box(INK, 0, 5.92, -7.77, 0.07, 0.56, 0.04);
    b.box(INK, 0.23, 5.7, -7.77, 0.5, 0.07, 0.04);
    b.box(INK, 0, 3.38, -8.23, 7, 0.86, 0.2);
    for (let x = -11.6; x <= 12; x += 2.6) {
      b.box('#28494a', x, 1.5, -8.55, 1.9, 2.7, 0.15);
      b.box('#78a5a0', x, 2.25, -8.42, 1.7, 0.9, 0.05);
      b.box('#f8eacf', x - 1.06, 1.7, -8.35, 0.17, 3.2, 0.3);
      b.box('#d9c29c', x, 1.1, -8.32, 1.9, 0.08, 0.16);
    }
    b.box('#337b73', 0, 2.9, -7.5, 28, 0.18, 2);
    b.box('#a8c5a9', 0, 3.03, -7.5, 28, 0.07, 2);
    for (const x of [-13, -8, -3, 3, 8, 13]) b.cylinder(INK, x, 1.4, -6.8, 0.07, 2.8);
    for (let x = -14; x <= 14; x += 2) b.box('#bdc3b1', x, 0.06, -3.2, 0.03, 0.02, 7.4);
    for (let z = -6; z < 1; z += 1.4) b.box('#bdc3b1', 0, 0.06, z, 30, 0.02, 0.03);
    for (const x of Object.values(BAY_X)) {
      b.box('#478b7a', x, 0.06, 0.5, 4.5, 0.06, 2.6);
      for (const z of [-0.9, 1.9]) b.box('#f4d897', x, 0.11, z, 4.5, 0.02, 0.06);
      for (const dx of [-2.2, 2.2]) b.box('#f4d897', x + dx, 0.11, 0.5, 0.06, 0.02, 2.8);
      b.box('#ead6ac', x, 0.14, -1.15, 4, 0.24, 0.24);
      for (const dx of [-1.8, 1.8])
        for (const z of [-2.5, -4.5]) b.cylinder('#8b9c8e', x + dx, 0.45, z, 0.035, 0.9);
    }
    const tree = (x: number, z: number, seed: number) => {
      b.box('#c6b991', x, 0.15, z, 1.7, 0.4, 1.7);
      b.cylinder('#8b7054', x, 1.1, z, 0.13, 1.8);
      b.ball(seed % 2 ? '#81a66c' : '#619774', x, 2.5, z, 2.6, 3.1, 2.4);
      b.ball('#a2bd79', x - 0.5, 3.1, z - 0.3, 1.7, 1.9, 1.8);
      for (let i = 0; i < 4; i++)
        b.ball(i % 2 ? '#f4ca73' : '#d49187', x - 0.6 + i * 0.4, 0.6, z + 0.7, 0.33, 0.42, 0.32);
    };
    for (let z = -8, i = 0; z <= 28; z += 6, i++) {
      tree(-20, z, i);
      tree(20, z, i + 1);
    }
    // A rear street and foreground garden remain visible in the narrow phone framing.
    for (const side of [-1, 1]) {
      const x = side * 10.5;
      b.box('#e6c6a4', x, 1.55, -16.4, 7.6, 3.1, 4.5);
      b.box('#b87860', x, 3.25, -16.4, 8.1, 0.4, 5);
      b.box('#d39270', x, 3.54, -16.4, 7.4, 0.18, 4.3);
      for (const dx of [-2.3, 0, 2.3]) b.box('#527e76', x + dx, 1.9, -14.1, 1.2, 1.3, 0.08);
      tree(side * 16, -14.5, side + 2);
      tree(side * 12.5, 33.5, side + 3);
      b.box('#d6c8a4', side * 6.4, 0.1, 33.2, 6, 0.2, 2.5);
      b.box('#a97850', side * 6.4, 0.7, 33.2, 3.7, 0.2, 0.85);
      b.box('#a97850', side * 6.4, 1.1, 33.6, 3.7, 0.6, 0.12);
      for (const dx of [-1.4, 1.4]) b.box(INK, side * 6.4 + dx, 0.35, 33.2, 0.14, 0.7, 0.6);
    }
    // Side streets and small terracotta shops frame the playfield without filling it.
    for (const side of [-1, 1])
      for (let j = 0; j < 3; j++) {
        const x = side * 24,
          z = -7 + j * 10;
        b.box(j % 2 ? '#d7ad91' : '#e9caa8', x, 2.2, z, 6, 4.4, 6);
        b.box('#b8745d', x, 4.6, z, 6.4, 0.5, 6.5);
        b.box('#da9875', x, 4.96, z, 5.6, 0.24, 5.8);
        for (let k = -1; k <= 1; k++) b.box('#426f6b', x + k * 1.4, 2.6, z + 3.04, 0.9, 1.3, 0.1);
        b.box('#f7dbad', x, 1.5, z + 3.7, 6, 0.17, 1.5);
        for (let k = -2; k <= 2; k++)
          b.box(k % 2 ? '#f6e4be' : '#b97758', x + k, 1.61, z + 3.7, 0.75, 0.08, 1.5);
      }
    for (const x of [-18.5, 18.5])
      for (const z of [-3, 8, 20]) {
        b.cylinder(INK, x, 1.6, z, 0.075, 3.2);
        b.box(INK, x, 3.14, z, 0.6, 0.12, 0.6);
        b.box('#ffe1a0', x, 2.88, z, 0.37, 0.45, 0.37);
        b.box('#345d51', x, 0.12, z, 0.4, 0.22, 0.4);
      }
    this.make(b, this.scenery, 'Batched station and neighbourhood');
  }
  reset(s: Simulation) {
    for (const n of [...this.entities.children]) n.destroy();
    this.cars.clear();
    this.people.clear();
    this.entityMeshes.forEach((m) => m.destroy());
    this.entityMeshes = [];
    for (const v of s.vehicles) this.car(v);
    for (const g of s.groups)
      for (const [i, p] of g.passengers.entries()) this.person(p.id, g.sequence + i);
    this.sync(s);
  }
  private car(v: Vehicle) {
    const b = new Batch(),
      paint = [GOLD, '#efb13f', '#e8c869'][v.sequence % 3]!;
    b.box('#637b75', 0, 0.08, 0, 1.8, 0.04, 3.2);
    b.box(paint, 0, 0.6, 0, 1.45, 0.7, 2.9);
    b.ball(paint, 0, 0.62, 1, 1.45, 0.65, 0.9);
    b.ball(paint, 0, 0.62, -1, 1.45, 0.65, 0.9);
    b.box('#28494c', 0, 1.06, -0.1, 1.22, 0.65, 1.45);
    b.box(paint, 0, 1.4, -0.2, 1.32, 0.16, 1.22);
    b.box('#92c2bd', 0, 1.12, 0.66, 1.1, 0.4, 0.06);
    b.box('#c2c9b4', 0, 0.42, 1.49, 1.3, 0.16, 0.09);
    b.box('#264944', 0, 0.62, 1.48, 0.65, 0.24, 0.06);
    for (const x of [-0.47, 0.47]) {
      b.ball('#fff0b5', x, 0.75, 1.46, 0.28, 0.24, 0.08);
      b.box('#cb7158', x, 0.7, -1.46, 0.26, 0.19, 0.08);
    }
    b.box('#fff3cd', 0, 1.6, -0.1, 0.6, 0.22, 0.32);
    b.box(INK, 0, 1.61, 0.07, 0.35, 0.1, 0.02);
    for (const x of [-0.76, 0.76])
      for (const z of [-0.9, 0.9]) {
        b.ball('#2f4748', x, 0.33, z, 0.26, 0.63, 0.63);
        b.ball('#d0c3a6', x * 1.1, 0.33, z, 0.08, 0.28, 0.28);
      }
    const node = this.make(b, this.entities, `Taxi ${v.id}`, true);
    if (v.capacity === 6) node.setScale(1, 1, 1.03);
    this.cars.set(v.id, node);
    return node;
  }
  private person(id: string, index: number) {
    const b = new Batch(),
      shirt = ['#dd916a', '#648d99', '#8aa87a', '#b59abb', '#e7bc65'][index % 5]!;
    b.box('#486373', 0, 0.22, 0, 0.3, 0.44, 0.25);
    b.ball(shirt, 0, 0.65, 0, 0.57, 0.72, 0.35);
    b.ball('#e8c39e', 0, 1.16, 0, 0.45, 0.48, 0.43);
    b.ball('#64594d', 0, 1.32, -0.035, 0.46, 0.27, 0.43);
    b.box('#be9772', 0.38, 0.22, 0, 0.27, 0.42, 0.25);
    const node = this.make(b, this.entities, `Passenger ${id}`, true);
    this.people.set(id, node);
    return node;
  }
  resize(w: number, h: number, home = false) {
    const aspect = w / h;
    this.camera.orthoHeight = Math.max(24, (home ? 22 : 18.5) / aspect);
    this.camera.node.setPosition(home ? 9 : 0, home ? 38 : 45, home ? 46 : 42);
    this.camera.node.lookAt(new Vec3(0, 0, home ? 6 : 8));
  }
  project(p: Point, height = 1.5) {
    const q = this.camera.worldToScreen(new Vec3(p.x, height, p.z));
    return { x: q.x / view.getScaleX(), y: view.getVisibleSize().height - q.y / view.getScaleY() };
  }
  arrow(v: Vehicle) {
    const d = DIRECTIONS[v.direction],
      a = this.project(v.position, 2.5),
      b = this.project({ x: v.position.x + d.x, z: v.position.z + d.z }, 2.5);
    return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  sync(s: Simulation) {
    for (const v of s.vehicles) {
      const n = this.cars.get(v.id) ?? this.car(v);
      n.active = v.state !== 'removed';
      n.setPosition(v.position.x, 0, v.position.z);
      n.setRotationFromEuler(0, (v.angle * 180) / Math.PI, 0);
    }
    const visible = new Set<string>();
    for (const g of s.groups) {
      if (g.state === 'split' || g.state === 'departed') continue;
      const job = s.services.find((j) => j.groupId === g.id),
        origin = job?.walkFrom ?? queuePosition(s, g),
        car = s.vehicles.find((v) => v.id === g.vehicleId);
      const f =
        g.state === 'walking' && job
          ? Math.min(1, job.elapsed / Math.max(0.01, job.duration))
          : g.state === 'boarding'
            ? 1
            : 0;
      for (const [i, p] of g.passengers.entries()) {
        if (i < g.boarded || s.delivered.has(p.id)) continue;
        const n = this.people.get(p.id) ?? this.person(p.id, g.sequence + i);
        n.active = true;
        visible.add(p.id);
        const target = car ? { x: car.position.x + 0.9, z: car.position.z - 0.4 } : origin;
        const x = origin.x + (target.x - origin.x) * f,
          z = origin.z + (target.z - origin.z) * f;
        n.setPosition(
          x + ((i % 3) - 1) * 0.55 * (1 - f),
          g.state === 'walking' ? Math.sin(s.time * 13 + i) * 0.045 : 0,
          z + Math.floor(i / 3) * 0.55 * (1 - f),
        );
        n.setRotationFromEuler(0, Math.sin(s.time * 0.6 + g.sequence + i) * 8, 0);
      }
    }
    for (const [id, n] of this.people) if (!visible.has(id)) n.active = false;
  }
  dispose() {
    this.root.destroy();
    this.camera.node.destroy();
    for (const m of [...this.meshes, ...this.entityMeshes]) m.destroy();
    for (const m of this.materials.values()) m.destroy();
  }
}
