import {
  Camera,
  Color,
  DirectionalLight,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  Vec3,
  instantiate,
  primitives,
  resources,
  utils,
} from 'cc';
import { direction, terrainHeight } from './core/rules';
import type { State, Point } from './core/rules';
export const MODEL_PATHS = {
  player: 'models/player',
  enemy: 'models/drone',
  scenery: 'models/valley',
} as const;
const tint = (hex: string) => new Color().fromHEX(hex);
export class World {
  root: Node;
  camera: Camera;
  player: Node;
  models = new Map<string, Prefab>();
  materials = new Map<string, Material>();
  meshes: Mesh[] = [];
  objects = new Map<number, Node>();
  ground: Node;
  tiles: Node[] = [];
  disposed = false;
  private box: Mesh;
  private sphere: Mesh;
  private groundKey = '';
  constructor(
    parent: Node,
    private surface: Material,
  ) {
    this.root = this.node('FlightWorld', parent);
    this.box = utils.createMesh(primitives.box());
    this.sphere = utils.createMesh(primitives.sphere(0.5, { segments: 12 }));
    this.meshes.push(this.box, this.sphere);
    this.camera = this.node('FlightCamera', parent).addComponent(Camera);
    this.camera.visibility = 1 << 30;
    this.camera.priority = 0;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = tint('#86b6c9');
    this.camera.near = 1;
    this.camera.far = 2400;
    this.camera.fov = 58;
    const globals = parent.scene!.globals;
    globals.skybox.enabled = false;
    globals.ambient.skyLightingColor = tint('#c8dfed');
    globals.ambient.groundLightingColor = tint('#71897c');
    globals.ambient.skyIllum = 22000;
    globals.fog.enabled = true;
    globals.fog.type = 0;
    globals.fog.fogColor = tint('#86b6c9');
    globals.fog.fogStart = 550;
    globals.fog.fogEnd = 2100;
    const sun = this.node('Sun', this.root);
    sun.setRotationFromEuler(-45, -30, 0);
    const light = sun.addComponent(DirectionalLight);
    light.illuminance = 45000;
    light.color = tint('#ffe9bd');
    this.player = this.aircraft('player', this.root);
    this.ground = this.node('TerrainTiles', this.root);
    for (let z = -2; z <= 2; z++)
      for (let x = -2; x <= 2; x++) this.tiles.push(this.node(`Tile_${x}_${z}`, this.ground));
    // B2 imports GLB as Prefabs at these resource paths; zero rotation faces -Z, units are metres.
    for (const [kind, path] of Object.entries(MODEL_PATHS)) {
      // shortcut: B1 has no authored models; load only registered Prefabs until B2 supplies them.
      if (resources.getInfoWithPath(path, Prefab))
        resources.load(path, Prefab, (error, prefab) => {
          if (error || this.disposed) return;
          this.models.set(kind, prefab);
          if (kind === 'player') {
            const old = this.player;
            this.player = this.aircraft('player', this.root);
            old.destroy();
          }
          if (kind === 'scenery') {
            const n = instantiate(prefab);
            this.root.addChild(n);
          }
        });
    }
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = 1 << 30;
    parent.addChild(n);
    return n;
  }
  material(hex: string) {
    let m = this.materials.get(hex);
    if (!m) {
      m = new Material();
      m.initialize({ effectAsset: this.surface.effectAsset! });
      m.setProperty('mainColor', tint(hex));
      m.setProperty('roughness', 0.7);
      this.materials.set(hex, m);
    }
    return m;
  }
  shape(parent: Node, mesh: Mesh, hex: string, p: number[], scale: number[]) {
    const n = this.node('Geometry', parent),
      r = n.addComponent(MeshRenderer);
    r.mesh = mesh;
    r.setMaterial(this.material(hex), 0);
    n.setPosition(p[0], p[1], p[2]);
    n.setScale(scale[0], scale[1], scale[2]);
    return n;
  }
  aircraft(kind: 'player' | 'enemy', parent: Node) {
    const prefab = this.models.get(kind);
    if (prefab) {
      const n = instantiate(prefab);
      parent.addChild(n);
      return n;
    }
    const n = this.node(kind === 'player' ? 'B1Airframe' : 'B1Drone', parent),
      base = kind === 'player' ? '#eef3e5' : '#ca654c';
    this.shape(n, this.sphere, base, [0, 0, 0], [3, 2.2, 16]);
    this.shape(n, this.box, base, [0, -0.1, 1], [14, 0.6, 3.5]);
    this.shape(n, this.box, '#102538', [0, 1.8, 5], [0.6, 4, 3]);
    this.shape(n, this.box, base, [0, 0, 5], [6, 0.45, 2]);
    this.shape(n, this.sphere, '#102538', [0, 1.1, -3], [1.9, 1.5, 5]);
    for (const side of [-1, 1]) {
      this.shape(n, this.box, '#f6bb69', [side * 5, 0.25, 1], [1, 0.15, 3.5]);
      this.shape(n, this.sphere, '#5ed5ce', [side * 1.2, -0.3, 7], [0.8, 0.8, 3]);
    }
    return n;
  }
  terrain(p: Point) {
    const cx = Math.floor(p.x / 400),
      cz = Math.floor(p.z / 400),
      key = `${cx}:${cz}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    let i = 0;
    for (let z = cz - 2; z <= cz + 2; z++)
      for (let x = cx - 2; x <= cx + 2; x++) {
        const tile = this.tiles[i++];
        const old = tile.getComponent(MeshRenderer);
        if (old?.mesh) {
          const mesh = old.mesh;
          this.meshes.splice(this.meshes.indexOf(mesh), 1);
          mesh.destroy();
        }
        for (const child of [...tile.children]) child.destroy();
        const positions: number[] = [],
          normals: number[] = [],
          indices: number[] = [];
        const segments = 12,
          delta = 400 / segments;
        for (let iz = 0; iz <= segments; iz++)
          for (let ix = 0; ix <= segments; ix++) {
            const wx = x * 400 + ix * delta,
              wz = z * 400 + iz * delta;
            positions.push(wx, terrainHeight(wx, wz), wz);
            const n = new Vec3(
              terrainHeight(wx - 1, wz) - terrainHeight(wx + 1, wz),
              2,
              terrainHeight(wx, wz - 1) - terrainHeight(wx, wz + 1),
            ).normalize();
            normals.push(n.x, n.y, n.z);
            if (ix < segments && iz < segments) {
              const a = iz * (segments + 1) + ix,
                b = a + segments + 1;
              indices.push(a, b, a + 1, a + 1, b, b + 1);
            }
          }
        const mesh = utils.createMesh({ positions, normals, indices });
        this.meshes.push(mesh);
        const r = old || tile.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setMaterial(this.material('#52756d'), 0);
        // Distant mountain silhouettes are visual only; the sampled ground is authoritative.
        if (Math.abs(x - cx) === 2)
          this.shape(
            tile,
            this.sphere,
            '#526c7b',
            [x * 400 + 180, -60, z * 400 + 180],
            [320, 220, 340],
          );
      }
  }
  update(s: State, menu: boolean, reduced: boolean) {
    const p = s.player,
      d = direction(p.yaw, p.pitch);
    this.terrain(p);
    this.player.setPosition(p.x, p.y, p.z);
    this.player.setRotationFromEuler(
      (p.pitch * 180) / Math.PI,
      (-p.yaw * 180) / Math.PI,
      (p.roll * 180) / Math.PI,
    );
    const cam = this.camera.node;
    if (menu) {
      cam.setPosition(p.x + 31, p.y + 13, p.z + 33);
      cam.lookAt(new Vec3(p.x - 3, p.y, p.z - 2));
    } else {
      const bob = reduced ? 0 : Math.sin(s.tick * 0.13) * 0.15;
      cam.setPosition(p.x - d.x * 39, p.y + 13 - d.y * 25 + bob, p.z - d.z * 39);
      cam.lookAt(new Vec3(p.x + d.x * 145, p.y + d.y * 145 + 6, p.z + d.z * 145));
    }
    const ids = new Set<number>();
    for (const e of s.enemies) {
      ids.add(e.id);
      let n = this.objects.get(e.id);
      if (!n) {
        n = this.aircraft('enemy', this.root);
        this.objects.set(e.id, n);
      }
      n.setPosition(e.x, e.y, e.z);
      n.setRotationFromEuler(0, (-e.yaw * 180) / Math.PI, 0);
    }
    for (const b of s.shots) {
      ids.add(b.id);
      let n = this.objects.get(b.id);
      if (!n) {
        n = this.shape(
          this.root,
          this.sphere,
          b.owner === 'enemy' ? '#ff8055' : b.missile ? '#eef3e5' : '#f6bb69',
          [0, 0, 0],
          b.missile ? [1.5, 1.5, 5] : [1.3, 1.3, 7],
        );
        this.objects.set(b.id, n);
      }
      n.setPosition(b.x, b.y, b.z);
      n.lookAt(new Vec3(b.x + b.velocity.x, b.y + b.velocity.y, b.z + b.velocity.z));
    }
    for (const item of s.pickups) {
      ids.add(item.id);
      let n = this.objects.get(item.id);
      if (!n) {
        n = this.shape(this.root, this.box, '#5ed5ce', [0, 0, 0], [4, 4, 4]);
        this.objects.set(item.id, n);
      }
      n.setPosition(item.x, item.y, item.z);
      n.setRotationFromEuler(0, reduced ? 45 : s.tick, 45);
    }
    for (const [id, n] of this.objects)
      if (!ids.has(id)) {
        n.destroy();
        this.objects.delete(id);
      }
  }
  project(p: Point) {
    const result = new Vec3();
    this.camera.worldToScreen(result, new Vec3(p.x, p.y, p.z));
    return result;
  }
  dispose() {
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    this.meshes.forEach((m) => m.destroy());
    this.materials.forEach((m) => m.destroy());
  }
}
