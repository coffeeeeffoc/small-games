import {
  Asset,
  Camera,
  Color,
  DirectionalLight,
  EffectAsset,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Prefab,
  Texture2D,
  Vec3,
  director,
  instantiate,
  primitives,
  resources,
  utils,
} from 'cc';
import { cameraView } from './core/flight-geometry';
import type { State, Point } from './core/rules';
import { TILE_SIZE, terrainGeometry, sceneryAt, terrainHeight } from './core/terrain';
export const MODEL_NAMES = [
  'falcon',
  'interceptor',
  'recon-drone',
  'beacon',
  'pine-1',
  'pine-2',
  'pine-3',
  'forest-1',
  'forest-2',
  'rock-1',
  'rock-2',
  'rock-3',
  'ridge-1',
  'ridge-2',
  'cloud-1',
  'cloud-2',
  'moon',
] as const;
const tint = (hex: string) => new Color().fromHEX(hex);
const layer = 1 << 30;
type Tile = { node: Node; mesh?: Mesh; key: string };
type Grove = { node: Node; near: Node; far: Node; key: string; model: string };
export class World {
  root: Node;
  camera: Camera;
  player: Node;
  ready = false;
  errors: string[] = [];
  models = new Map<string, Prefab>();
  materials = new Map<string, Material>();
  meshes: Mesh[] = [];
  objects = new Map<number, Node>();
  tiles: Tile[] = [];
  groves: Grove[] = [];
  background: Node;
  clouds: Node[] = [];
  disposed = false;
  private sphere: Mesh;
  private groundKey = '';
  private groveKey = '';
  private terrainMaterial!: Material;
  private engines: Node[] = [];
  private loadedTextures = 0;
  private spawned = 0;
  constructor(
    parent: Node,
    private surface: Material,
  ) {
    this.root = this.node('FlightWorld', parent);
    this.background = this.node('DistantSkyOnly', this.root);
    this.player = this.node('Player', this.root);
    this.sphere = utils.createMesh(primitives.sphere(0.5, { segments: 12 }));
    this.meshes.push(this.sphere);
    this.camera = this.node('FlightCamera', parent).addComponent(Camera);
    this.camera.visibility = layer;
    this.camera.priority = 0;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = tint('#91b7cb');
    this.camera.near = 0.8;
    this.camera.far = 9000;
    this.camera.fov = 54;
    const globals = parent.scene!.globals;
    globals.skybox.enabled = false;
    globals.ambient.skyLightingColor = tint('#bfdaed');
    globals.ambient.groundLightingColor = tint('#66796e');
    globals.ambient.skyIllum = 19000;
    globals.fog.enabled = true;
    globals.fog.type = 0;
    globals.fog.fogColor = tint('#86a6b9');
    globals.fog.fogStart = 850;
    globals.fog.fogEnd = 3600;
    const sun = this.node('Sun', this.root);
    sun.setRotationFromEuler(-34, -42, 0);
    const light = sun.addComponent(DirectionalLight);
    light.illuminance = 47000;
    light.color = tint('#fff0d6');
    void this.load();
  }
  async load() {
    try {
      const [skyEffect, terrainEffect, ...textures] = await Promise.all([
        this.resource('sky-no-fog', EffectAsset),
        this.resource('alpine-terrain', EffectAsset),
        ...['alpine-panorama', 'ground-albedo', 'slate-albedo', 'moon-albedo', 'detail-normal'].map(
          (name) => this.resource(`textures/${name}/texture`, Texture2D),
        ),
        ...MODEL_NAMES.map(async (name) => {
          const prefab = await this.resource(`models/${name}/${name}`, Prefab);
          this.models.set(name, prefab);
          return null;
        }),
      ]);
      if (this.disposed) return;
      this.loadedTextures = 5;
      const [panorama, ground, slate, moon, normal] = textures as Texture2D[];
      this.terrainMaterial = new Material();
      this.terrainMaterial.initialize({
        effectAsset: terrainEffect as EffectAsset,
        defines: { USE_ALBEDO_MAP: true },
      });
      this.terrainMaterial.setProperty('mainTexture', ground);
      this.terrainMaterial.setProperty('slateTexture', slate);
      this.terrainMaterial.setProperty('roughness', 0.92);
      this.terrainMaterial.setProperty('albedoScale', new Vec3(0.62, 0.7, 0.72));
      this.materials.set('terrain', this.terrainMaterial);
      // Imported GLBs keep their standard PBR materials. Only surfaces with authored UVs get shared detail maps.
      for (const name of MODEL_NAMES) {
        const prefab = this.models.get(name)!;
        for (const r of prefab.data.getComponentsInChildren(MeshRenderer) as MeshRenderer[]) {
          for (let i = 0; i < r.sharedMaterials.length; i++) {
            const original = r.sharedMaterials[i];
            if (!original) continue;
            const key = original.name;
            let m = this.materials.get(key);
            if (!m) {
              const stone = /slate|ledges/i.test(key),
                lunar = /Lunar/.test(key);
              m = new Material();
              m.copy(original, {
                defines: {
                  USE_INSTANCING: true,
                  USE_ALBEDO_MAP: stone || lunar,
                  USE_NORMAL_MAP: stone || lunar,
                },
              });
              if (stone || lunar) {
                m.setProperty('mainTexture', lunar ? moon : slate);
                m.setProperty('normalMap', normal);
                m.setProperty('normalStrength', 0.3);
              }
              this.materials.set(key, m);
            }
          }
        }
      }
      this.model('falcon', this.player);
      for (const x of [-1.18, 1.18]) {
        const n = this.shape(this.player, '#65e5ed', [x, -0.16, 11], [0.85, 0.85, 6]);
        this.engines.push(n);
      }
      const sky = new Material();
      sky.initialize({ effectAsset: skyEffect as EffectAsset });
      sky.setProperty('mainTexture', panorama);
      this.materials.set('sky', sky);
      const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        for (const y of [-1800, 3600]) {
          positions.push(Math.sin(a) * 6500, y, -Math.cos(a) * 6500);
          uvs.push((i / 96) * 2, y < 0 ? 1 : 0);
        }
        if (i < 96) {
          const j = i * 2;
          indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
        }
      }
      const mesh = utils.createMesh({ positions, uvs, indices });
      this.meshes.push(mesh);
      const r = this.node('Panorama', this.background).addComponent(MeshRenderer);
      r.mesh = mesh;
      r.setSharedMaterial(sky, 0);
      const lunar = this.model('moon', this.background);
      lunar.setPosition(720, 590, -2050);
      lunar.setScale(20, 20, 20);
      // Background ridges follow the viewer beyond the streamed/collidable terrain; they can never enter the flight region.
      for (let i = 0; i < 10; i++) {
        const n = this.model(`ridge-${(i % 2) + 1}`, this.background),
          a = (i / 10) * Math.PI * 2;
        n.setPosition(Math.sin(a) * 1850, -70, Math.cos(a) * 1850);
        n.setScale(5, 3.8, 4);
      }
      for (let i = 0; i < 8; i++) {
        const cloud = this.model(`cloud-${(i % 2) + 1}`, this.root);
        cloud.setScale(5 + (i % 3), 4, 5);
        this.clouds.push(cloud);
      }
      for (let i = 0; i < 49; i++)
        this.tiles.push({ node: this.node('Terrain', this.root), key: '' });
      this.ready = true;
    } catch (error) {
      if (this.disposed) return;
      this.errors.push(String(error));
      console.error('Null Range world:', error);
    }
  }
  resource<T extends Asset>(path: string, type: { new (): T }): Promise<T> {
    return new Promise((resolve, reject) =>
      resources.load(path, type, (e, a) =>
        e ? reject(new Error(`${path}: ${e.message}`)) : resolve(a),
      ),
    );
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = layer;
    parent.addChild(n);
    return n;
  }
  model(name: string, parent: Node) {
    const n = instantiate(this.models.get(name)!);
    parent.addChild(n);
    const visit = (node: Node) => {
      node.layer = layer;
      node.children.forEach(visit);
    };
    visit(n);
    for (const r of n.getComponentsInChildren(MeshRenderer))
      for (let i = 0; i < r.sharedMaterials.length; i++) {
        const original = r.sharedMaterials[i];
        if (original) r.setSharedMaterial(this.materials.get(original.name)!, i);
      }
    this.spawned++;
    return n;
  }
  material(hex: string) {
    let m = this.materials.get(hex);
    if (!m) {
      m = new Material();
      m.initialize({ effectAsset: this.surface.effectAsset! });
      m.setProperty('mainColor', tint(hex));
      m.setProperty('emissive', tint(hex));
      m.setProperty('roughness', 0.65);
      this.materials.set(hex, m);
    }
    return m;
  }
  shape(parent: Node, hex: string, p: number[], scale: number[]) {
    const n = this.node('FlightFX', parent),
      r = n.addComponent(MeshRenderer);
    r.mesh = this.sphere;
    r.setSharedMaterial(this.material(hex), 0);
    n.setPosition(p[0], p[1], p[2]);
    n.setScale(scale[0], scale[1], scale[2]);
    return n;
  }
  terrain(p: Point) {
    const cx = Math.floor(p.x / TILE_SIZE),
      cz = Math.floor(p.z / TILE_SIZE),
      key = `${cx}:${cz}`;
    if (key !== this.groundKey) {
      this.groundKey = key;
      const desired = new Set<string>();
      for (let z = cz - 3; z <= cz + 3; z++)
        for (let x = cx - 3; x <= cx + 3; x++) desired.add(`${x}:${z}`);
      const free = this.tiles.filter((t) => !desired.has(t.key));
      for (let z = cz - 3; z <= cz + 3; z++)
        for (let x = cx - 3; x <= cx + 3; x++) {
          const k = `${x}:${z}`;
          if (this.tiles.some((t) => t.key === k)) continue;
          const tile = free.pop()!;
          tile.mesh?.destroy();
          tile.mesh = utils.createMesh(terrainGeometry(x, z));
          tile.key = k;
          const r = tile.node.getComponent(MeshRenderer) || tile.node.addComponent(MeshRenderer);
          r.mesh = tile.mesh;
          r.setSharedMaterial(this.terrainMaterial, 0);
        }
    }
    const gx = Math.floor(p.x / 120),
      gz = Math.floor(p.z / 120),
      gkey = `${gx}:${gz}`;
    if (gkey !== this.groveKey) {
      this.groveKey = gkey;
      const desired = new Map<string, ReturnType<typeof sceneryAt>>();
      for (let z = gz - 6; z <= gz + 6; z++)
        for (let x = gx - 6; x <= gx + 6; x++) {
          const o = sceneryAt(x, z);
          if (Math.hypot(o.x - p.x, o.z - p.z) < 700) desired.set(`${x}:${z}`, o);
        }
      for (const grove of this.groves)
        if (!desired.has(grove.key)) {
          grove.key = '';
          grove.node.active = false;
        }
      for (const [key, o] of desired) {
        if (this.groves.some((g) => g.key === key)) continue;
        let g = this.groves.find((g) => !g.key && g.model === o.model);
        if (!g) {
          const node = this.node('SceneryCell', this.root),
            near = this.model(o.model, node);
          const far = o.model.startsWith('forest')
            ? this.model(`pine-${(Math.abs(Math.round(o.x)) % 3) + 1}`, node)
            : near;
          if (far !== near) far.setScale(1.8, 1, 1.8);
          g = { node, near, far, key: '', model: o.model };
          this.groves.push(g);
        }
        g.key = key;
        g.node.active = true;
        g.node.setPosition(o.x, o.y, o.z);
        g.node.setScale(o.scale, o.scale, o.scale);
        g.node.setRotationFromEuler(0, o.rotation, 0);
      }
      for (let i = 0; i < this.clouds.length; i++) {
        const x = p.x + (((((i % 4) * 490 - p.x + 10000) % 1960) + 1960) % 1960) - 980,
          z = p.z + ((((Math.floor(i / 4) * 980 - p.z + 10000) % 1960) + 1960) % 1960) - 980;
        this.clouds[i].setPosition(x, 160 + (i % 3) * 35, z);
      }
    }
    for (const g of this.groves) {
      if (!g.key) continue;
      const d = Math.hypot(g.node.position.x - p.x, g.node.position.z - p.z);
      g.node.active = d < 700;
      if (g.near !== g.far) {
        g.near.active = d < 420;
        g.far.active = d >= 420;
      }
    }
  }
  update(s: State, menu: boolean, reduced: boolean) {
    const p = s.player,
      cam = this.camera.node;
    this.player.setPosition(p.x, p.y + (menu ? 12 : 0), p.z);
    this.player.setRotationFromEuler(
      (p.pitch * 180) / Math.PI + (menu ? 8 : 0),
      (-p.yaw * 180) / Math.PI,
      (p.roll * 180) / Math.PI + (menu ? -8 : 0),
    );
    const view = cameraView(p, menu, reduced ? 0 : s.tick);
    cam.setPosition(view.position.x, view.position.y, view.position.z);
    cam.lookAt(new Vec3(view.target.x, view.target.y, view.target.z));
    if (!this.ready) return;
    this.background.setPosition(p.x, 0, p.z);
    this.terrain(p);
    for (const n of this.engines) n.setScale(0.85, 0.85, s.boosting ? 10 : 6);
    const ids = new Set<number>();
    for (const e of s.enemies) {
      ids.add(e.id);
      let n = this.objects.get(e.id);
      if (!n) {
        n = this.model(e.id % 2 ? 'interceptor' : 'recon-drone', this.root);
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
          b.owner === 'enemy' ? '#ff8055' : b.missile ? '#eef3e5' : '#f6bb69',
          [0, 0, 0],
          b.missile ? [1.5, 1.5, 5] : [1.1, 1.1, 7],
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
        n = this.model('beacon', this.root);
        n.setScale(0.65, 0.65, 0.65);
        this.objects.set(item.id, n);
      }
      n.setPosition(item.x, item.y - 4, item.z);
      n.setRotationFromEuler(0, reduced ? 45 : s.tick, 0);
    }
    for (const [id, n] of this.objects)
      if (!ids.has(id)) {
        n.destroy();
        this.objects.delete(id);
      }
  }
  snapshot() {
    const renderers = this.root.getComponentsInChildren(MeshRenderer),
      device = director.root?.device;
    return {
      ready: this.ready,
      modelsLoaded: this.models.size,
      texturesLoaded: this.loadedTextures,
      errors: [...this.errors],
      terrainTiles: this.tiles.length,
      terrainMeshes: this.tiles.filter((t) => t.mesh).length,
      sceneryPool: this.groves.length,
      activeScenery: this.groves.filter((g) => g.node.active).length,
      modelInstancesCreated: this.spawned,
      meshes: new Set(renderers.map((r) => r.mesh)).size,
      materials: this.materials.size,
      renderers: renderers.length,
      activeRenderers: renderers.filter((r) => r.enabledInHierarchy).length,
      instancedPasses: renderers.reduce(
        (sum, r) =>
          sum + r.sharedMaterials.filter((m) => m?.passes[0]?.batchingScheme === 1).length,
        0,
      ),
      drawCalls: device?.numDrawCalls ?? null,
      triangles: device?.numTris ?? null,
      aircraft: 'Original Blender falcon; Hyper3D not downloaded',
      terrainHeight: terrainHeight(this.player.position.x, this.player.position.z),
    };
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
    this.tiles.forEach((t) => t.mesh?.destroy());
    this.meshes.forEach((m) => m.destroy());
    this.materials.forEach((m) => m.destroy());
  }
}
