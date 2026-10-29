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
  Vec4,
  director,
  instantiate,
  primitives,
  resources,
  utils,
} from 'cc';
import { cameraView } from './core/flight-geometry';
import type { State, Point } from './core/rules';
import {
  TILE_SIZE,
  WATER_LEVEL,
  terrainGeometry,
  horizonGeometry,
  sceneryAt,
  terrainHeight,
} from './core/terrain';
export const MODEL_NAMES = [
  'falcon',
  'kestrel',
  'warden',
  'interceptor',
  'recon-drone',
  'beacon',
  'pine-1',
  'pine-2',
  'pine-3',
  'forest-1',
  'forest-2',
  'forest-lod-1',
  'forest-lod-2',
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
  disposed = false;
  private sphere: Mesh;
  private craftNodes = new Map<string, Node>();
  private currentCraft = '';
  private objectKinds = new Map<number, string>();
  private objectPools = new Map<string, Node[]>();
  private fx: Node[] = [];
  private ally?: Node;
  private groundKey = '';
  private groveKey = '';
  private terrainMaterial!: Material;
  private engines: Node[] = [];
  private lake?: Node;
  private horizon?: { renderer: MeshRenderer; mesh?: Mesh };
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
    this.camera.far = 24000;
    this.camera.fov = 54;
    const globals = parent.scene!.globals;
    globals.skybox.enabled = false;
    globals.ambient.skyLightingColor = tint('#a6bfd2');
    globals.ambient.groundLightingColor = tint('#354844');
    globals.ambient.skyIllum = 12500;
    globals.fog.enabled = true;
    globals.fog.type = 0;
    globals.fog.fogColor = tint('#9bb7c6');
    globals.fog.fogStart = 4500;
    globals.fog.fogEnd = 10000;
    const sun = this.node('Sun', this.root);
    sun.setRotationFromEuler(-28, -58, 0);
    const light = sun.addComponent(DirectionalLight);
    light.illuminance = 57000;
    light.color = tint('#fff0d6');
    void this.load();
  }
  async load() {
    try {
      const [skyEffect, terrainEffect, exhaustEffect, lakeEffect, ridgeEffect, ...textures] =
        await Promise.all([
          this.resource('sky-no-fog', EffectAsset),
          this.resource('alpine-terrain', EffectAsset),
          this.resource('exhaust', EffectAsset),
          this.resource('lake', EffectAsset),
          this.resource('ridge', EffectAsset),
          ...[
            'alpine-panorama',
            'ground-albedo',
            'granite-albedo',
            'lunar-lroc',
            'detail-normal',
          ].map((name) => this.resource(`textures/${name}/texture`, Texture2D)),
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
      this.materials.set('terrain', this.terrainMaterial);
      const lakeMaterial = new Material();
      lakeMaterial.initialize({ effectAsset: lakeEffect as EffectAsset });
      lakeMaterial.setProperty('skyTexture', panorama);
      this.materials.set('lake', lakeMaterial);
      const lakeMesh = utils.createMesh(
        primitives.plane({ width: 24000, length: 24000, widthSegments: 1, lengthSegments: 1 }),
      );
      this.meshes.push(lakeMesh);
      this.lake = this.node('ShallowValleyWater', this.root);
      const waterRenderer = this.lake.addComponent(MeshRenderer);
      waterRenderer.mesh = lakeMesh;
      waterRenderer.setSharedMaterial(lakeMaterial, 0);
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
                  ...(stone || lunar ? { USE_ALBEDO_MAP: true, USE_NORMAL_MAP: true } : {}),
                },
              });
              if (stone || lunar) {
                m.setProperty('mainTexture', lunar ? moon : slate);
                m.setProperty('normalMap', normal);
                m.setProperty('normalStrength', 0.3);
              }
              if (/B3 masked pine/.test(key)) m.setProperty('emissive', new Color(35, 48, 28));
              if (lunar) {
                m.destroy();
                m = new Material();
                m.initialize({ effectAsset: skyEffect as EffectAsset });
                m.setProperty('mainTexture', moon);
                m.setProperty('tint', new Vec4(0.85, 0.92, 1, 1));
              }
              if (/B3 slate|B3 alpine snow|B3 moss/.test(key)) {
                m.destroy();
                m = new Material();
                m.initialize({
                  effectAsset: ridgeEffect as EffectAsset,
                  defines: { USE_INSTANCING: true },
                });
                m.setProperty('mainTexture', slate);
              }
              this.materials.set(key, m);
            }
          }
        }
      }
      this.craftNodes.set('falcon', this.model('falcon', this.player));
      const plume = new Material();
      plume.initialize({
        effectAsset: exhaustEffect as EffectAsset,
        defines: { USE_INSTANCING: true },
      });
      this.materials.set('exhaust', plume);
      const plumeMesh = utils.createMesh({
        positions: [
          -0.75, 0, 0, 0.75, 0, 0, 1.5, 0, 12, -1.5, 0, 12, 0, -0.75, 0, 0, 0.75, 0, 0, 1.5, 12, 0,
          -1.5, 12,
        ],
        uvs: [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
        indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
      });
      this.meshes.push(plumeMesh);
      for (const x of [-1.18, 1.18]) {
        const n = this.node('IonPlume', this.player),
          r = n.addComponent(MeshRenderer);
        r.mesh = plumeMesh;
        r.setSharedMaterial(plume, 0);
        n.setPosition(x, -0.16, 8.8);
        this.engines.push(n);
      }
      const sky = new Material();
      sky.initialize({ effectAsset: skyEffect as EffectAsset, defines: { USE_ATMOSPHERE: true } });
      sky.setProperty('mainTexture', panorama);
      this.materials.set('sky', sky);
      const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      for (let j = 0; j <= 24; j++)
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2,
            polar = (j / 24) * Math.PI;
          positions.push(
            Math.sin(a) * Math.sin(polar) * 18000,
            Math.cos(polar) * 18000,
            -Math.cos(a) * Math.sin(polar) * 18000,
          );
          // Only the sky half of the source image; every mountain is real terrain.
          uvs.push((i / 96) * 2 + 0.5, (j / 24) * 0.96);
          if (i < 96 && j < 24) {
            const k = j * 97 + i;
            indices.push(k, k + 97, k + 1, k + 1, k + 97, k + 98);
          }
        }
      const mesh = utils.createMesh({ positions, uvs, indices });
      this.meshes.push(mesh);
      const r = this.node('Panorama', this.background).addComponent(MeshRenderer);
      r.mesh = mesh;
      r.setSharedMaterial(sky, 0);
      const lunar = this.model('moon', this.background);
      lunar.setPosition(5000, 8000, -13000);
      lunar.setScale(34, 34, 34);
      for (let i = 0; i < 49; i++)
        this.tiles.push({ node: this.node('Terrain', this.root), key: '' });
      const horizonRenderer = this.node('DistantTerrain', this.root).addComponent(MeshRenderer);
      horizonRenderer.setSharedMaterial(this.terrainMaterial, 0);
      this.horizon = { renderer: horizonRenderer };
      for (let i = 0; i < 32; i++) {
        const n = this.shape(this.root, i < 16 ? '#f6bb69' : '#5ed5ce', [0, 0, 0], [1, 1, 1]);
        n.active = false;
        this.fx.push(n);
      }
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
      if (this.horizon) {
        this.horizon.mesh?.destroy();
        this.horizon.mesh = utils.createMesh(horizonGeometry(cx, cz));
        this.horizon.renderer.mesh = this.horizon.mesh;
      }
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
      for (let z = gz - 9; z <= gz + 9; z++)
        for (let x = gx - 9; x <= gx + 9; x++) {
          const o = sceneryAt(x, z);
          if (o.y < WATER_LEVEL + 2) continue;
          if (Math.hypot(o.x - p.x, o.z - p.z) < 1000) desired.set(`${x}:${z}`, o);
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
            ? this.model(o.model.replace('forest-', 'forest-lod-'), node)
            : near;
          g = { node, near, far, key: '', model: o.model };
          this.groves.push(g);
        }
        g.key = key;
        g.node.active = true;
        g.node.setPosition(o.x, o.y, o.z);
        g.node.setScale(o.scale, o.scale, o.scale);
        g.node.setRotationFromEuler(0, o.rotation, 0);
      }
    }
    for (const g of this.groves) {
      if (!g.key) continue;
      const d = Math.hypot(g.node.position.x - p.x, g.node.position.z - p.z);
      g.node.active = d < 1000;
      if (g.near !== g.far) {
        g.near.active = d < 230;
        g.far.active = d >= 230;
      }
    }
  }
  update(s: State, menu: boolean, reduced: boolean, screen = 'home', crashTime = 0) {
    // Display poses never mutate the flight state or its collision/camera contract.
    const p = menu ? { ...s.player, x: 0, y: 1600, z: 0, yaw: 0, pitch: 0, roll: 0 } : s.player,
      cam = this.camera.node;
    this.player.setPosition(p.x, p.y + (menu ? 18 : 0), p.z);
    this.player.setScale(menu ? 1.55 : 1, menu ? 1.55 : 1, menu ? 1.55 : 1);
    this.player.setRotationFromEuler(
      (p.pitch * 180) / Math.PI + (menu ? 8 : 0),
      (-p.yaw * 180) / Math.PI,
      (p.roll * 180) / Math.PI + (menu ? 28 : 0),
    );
    const crashed = s.impacts.some((e) => e.kind === 'crash');
    const visualTick = s.tick + (crashed ? crashTime * 60 : 0);
    const view = cameraView(p, menu, reduced ? 0 : s.tick);
    if (crashed && !menu) {
      view.position.y += 12;
      view.target.x = p.x;
      view.target.y = p.y;
      view.target.z = p.z;
    }
    if (menu) {
      const left = screen === 'result' || screen === 'prepare';
      view.target.x = p.x + (left ? 33 : -8);
      view.target.y = p.y + 14;
      view.target.z = p.z - 10;
    }
    const latest = s.impacts
      .filter(
        (e) =>
          e.kind === 'kill' || e.kind === 'damage' || e.kind === 'shield' || e.kind === 'crash',
      )
      .at(-1);
    const recoil =
      !reduced && !menu && latest
        ? Math.max(0, 1 - (visualTick - latest.tick) / 24) * (latest.kind === 'crash' ? 2.2 : 0.55)
        : 0;
    this.camera.fov += ((reduced || menu ? 54 : s.boosting ? 59 : 54) - this.camera.fov) * 0.12;
    cam.setPosition(
      view.position.x + Math.sin(visualTick * 0.7) * recoil,
      view.position.y + Math.sin(visualTick * 0.9) * recoil,
      view.position.z,
    );
    cam.lookAt(new Vec3(view.target.x, view.target.y, view.target.z));
    if (!this.ready) return;
    if (this.currentCraft !== s.craft.id) {
      let selected = this.craftNodes.get(s.craft.id);
      if (!selected) {
        selected = this.model(s.craft.id, this.player);
        this.craftNodes.set(s.craft.id, selected);
      }
      for (const [id, n] of this.craftNodes) n.active = id === s.craft.id;
      s.craft.nozzles.forEach((p, i) => this.engines[i].setPosition(p[0], p[1], p[2]));
      this.currentCraft = s.craft.id;
    }
    this.player.active = screen !== 'missions' && (menu || !crashed);
    this.background.setPosition(p.x, p.y, p.z);
    this.terrain(p);
    this.lake?.setPosition(p.x, WATER_LEVEL, p.z);
    this.materials.get('lake')?.setProperty('flow', new Vec4(reduced ? 0 : s.tick / 60, 0, 0, 0));
    for (const n of this.engines)
      n.setScale(
        1,
        1,
        menu ? 0.45 : s.boosting ? 1.6 : reduced ? 0.85 : 0.85 + Math.sin(s.tick * 1.7) * 0.035,
      );
    const ids = new Set<number>();
    const object = (id: number, kind: string, make: () => Node) => {
      ids.add(id);
      let n = this.objects.get(id);
      if (n && this.objectKinds.get(id) !== kind) {
        n.active = false;
        const oldKind = this.objectKinds.get(id)!;
        if (!this.objectPools.has(oldKind)) this.objectPools.set(oldKind, []);
        this.objectPools.get(oldKind)!.push(n);
        this.objects.delete(id);
        n = undefined;
      }
      if (!n) {
        n = this.objectPools.get(kind)?.pop() || make();
        this.objects.set(id, n);
        this.objectKinds.set(id, kind);
      }
      return n;
    };
    for (const e of s.enemies) {
      const n = object(e.id, e.kind, () =>
        this.model(e.kind === 'skirmisher' ? 'recon-drone' : 'interceptor', this.root),
      );
      n.setPosition(e.x, e.y, e.z);
      n.setRotationFromEuler((e.pitch * 180) / Math.PI, (-e.yaw * 180) / Math.PI, 0);
      const size = e.kind === 'elite' ? 2.1 : e.kind === 'heavy' ? 1.45 : 1;
      n.setScale(size, size, size);
    }
    for (const b of s.shots) {
      const kind = b.owner === 'enemy' ? 'enemy-shot' : b.missile ? 'missile' : 'pulse';
      const n = object(b.id, kind, () =>
        this.shape(
          this.root,
          b.owner === 'enemy' ? '#ff8055' : b.missile ? '#eef3e5' : '#f6bb69',
          [0, 0, 0],
          b.missile ? [1.5, 1.5, 5] : [1.1, 1.1, 7],
        ),
      );
      n.setPosition(b.x, b.y, b.z);
      n.lookAt(new Vec3(b.x + b.velocity.x, b.y + b.velocity.y, b.z + b.velocity.z));
    }
    for (const item of s.pickups) {
      const n = object(item.id, 'beacon', () => this.model('beacon', this.root));
      n.setScale(0.65, 0.65, 0.65);
      n.setPosition(item.x, item.y - 4, item.z);
      n.setRotationFromEuler(0, reduced ? 45 : s.tick, 0);
    }
    for (const [id, n] of this.objects)
      if (!ids.has(id)) {
        const kind = this.objectKinds.get(id)!;
        let pool = this.objectPools.get(kind);
        if (!pool) {
          pool = [];
          this.objectPools.set(kind, pool);
        }
        n.active = false;
        pool.push(n);
        this.objects.delete(id);
        this.objectKinds.delete(id);
      }
    for (const n of this.objects.values()) n.active = !menu;
    if (s.transport && !this.ally) {
      this.ally = this.model('warden', this.root);
      this.ally.setScale(1.45, 1.45, 1.45);
    }
    if (this.ally) {
      this.ally.active = !!s.transport && !menu;
      if (s.transport) {
        this.ally.setPosition(s.transport.x, s.transport.y, s.transport.z);
        this.ally.setRotationFromEuler(0, (-s.transport.yaw * 180) / Math.PI, 0);
      }
    }
    for (const n of this.fx) n.active = false;
    let warm = 0,
      cool = 16;
    if (!menu)
      for (const e of s.impacts) {
        if (reduced && e.kind !== 'kill' && e.kind !== 'pickup' && e.kind !== 'crash') continue;
        const age = (visualTick - e.tick) / 60,
          life = e.kind === 'crash' ? 1.4 : e.kind === 'kill' ? 0.75 : 0.28;
        if (age > life) continue;
        const blue = e.kind === 'shield' || e.kind === 'pickup',
          count = reduced ? 1 : e.kind === 'crash' ? 14 : e.kind === 'kill' ? 5 : 1;
        for (let j = 0; j < count; j++) {
          const index = blue ? cool++ : warm++;
          if (index >= (blue ? 32 : 16)) break;
          const n = this.fx[index],
            spread = reduced ? 0 : age * (e.kind === 'crash' ? 80 : e.kind === 'kill' ? 34 : 8),
            angle = j * 2.4 + e.id;
          n.active = true;
          n.setPosition(
            e.x + Math.cos(angle) * spread,
            e.y + Math.sin(angle * 2) * spread * 0.5,
            e.z + Math.sin(angle) * spread,
          );
          const size =
            (e.kind === 'crash' ? 24 : e.kind === 'kill' ? 9 : e.kind === 'shield' ? 7 : 3) *
            (1 - age / life) *
            (reduced ? 0.45 : 1);
          if (e.kind === 'crash') {
            const ember = j < 2;
            const fragment = (ember ? 10 : 2.2) * Math.max(0, 1 - age / life);
            n.setScale(fragment, fragment * (ember ? 0.7 : 0.35), fragment * (ember ? 1 : 2.5));
            n.setRotationFromEuler(j * 47 + age * 200, j * 31 + age * 120, j * 73);
          } else n.setScale(size, size, size);
        }
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
      foliage: Array.from(this.materials.entries())
        .filter(([name]) => /B3 masked pine/.test(name))
        .map(([name, material]) => ({
          name,
          albedo: !!material.passes[0].defines.USE_ALBEDO_MAP,
          alphaTest: !!material.passes[0].defines.USE_ALPHA_TEST,
          textured: !!material.getProperty('mainTexture'),
        })),
      drawCalls: device?.numDrawCalls ?? null,
      triangles: device?.numTris ?? null,
      aircraft: this.currentCraft,
      craftInstances: this.craftNodes.size,
      nozzles: this.engines.map((n) => ({ x: n.position.x, y: n.position.y, z: n.position.z })),
      pooledObjects: Array.from(this.objectPools.values()).reduce((n, p) => n + p.length, 0),
      fxBudget: this.fx.length,
      activeFx: this.fx.filter((n) => n.active).length,
      playerVisible: this.player.active,
      terrainSpan: TILE_SIZE * 7,
      terrainKeys: this.tiles.map((t) => t.key),
      camera: {
        x: this.camera.node.position.x,
        y: this.camera.node.position.y,
        z: this.camera.node.position.z,
      },
      terrainHeight: terrainHeight(this.player.position.x, this.player.position.z),
    };
  }
  project(p: Point) {
    const result = new Vec3();
    this.camera.worldToScreen(new Vec3(p.x, p.y, p.z), result);
    const cam = this.camera.node,
      delta = new Vec3(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z);
    const x = result.x / this.camera.camera.width,
      y = 1 - result.y / this.camera.camera.height;
    return { x, y, visible: Vec3.dot(delta, cam.forward) > 0 && x > 0 && x < 1 && y > 0 && y < 1 };
  }
  dispose() {
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    this.tiles.forEach((t) => t.mesh?.destroy());
    this.horizon?.mesh?.destroy();
    this.meshes.forEach((m) => m.destroy());
    this.materials.forEach((m) => m.destroy());
  }
}
