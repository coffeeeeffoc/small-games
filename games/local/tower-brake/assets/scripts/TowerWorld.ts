import {
  Camera,
  Color,
  DirectionalLight,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  Vec3,
  Rect,
  primitives,
  utils,
  view,
  gfx,
} from 'cc';
import { layerRotationAt, normalizeAngle, ORBIT_RADIUS, TAU } from './core/engine.js';
import { color } from './TowerUI';
import { geometry, quad, arc, ringGeometry } from './core/geometry.js';
type Geo = { positions: number[]; normals: number[]; indices: number[] };
export const SIGHTINGS = [
  [
    '行星',
    '月亮',
    '星系',
    '国际空间站',
    '中国空间站',
    '星链',
    '卫星',
    '飞船',
    '火箭',
    '陨石',
    '彗星',
  ],
  ['太阳', '卫星', '国际空间站', '中国空间站', '火箭', '飞船', '彗星'],
  ['客机', '战斗机', '大雁', '鹰', '白鹭'],
  ['客机', '白鹭', '鸽子', '麻雀', '大雁', '鹰'],
];
type Decoration = {
  cycle?: number;
  node: Node;
  name: string;
  biome: number;
  slot: number;
  wings?: Node[];
  meshes: Mesh[];
};
export class TowerWorld {
  root: Node;
  tower: Node;
  camera: Camera;
  ball: Node;
  halo: Node;
  pulse: Node;
  trails: Node[] = [];
  rings = new Map<number, { node: Node; meshes: Mesh[]; pickup?: Node }>();
  meshes: Mesh[] = [];
  materials = new Map<string, Material>();
  decorations: Decoration[] = [];
  clouds: Node[] = [];
  weather: Node[] = [];
  visibleNames: string[] = [];
  level: any = null;
  feedback = 0;
  oldRadius = 12;
  time = 0;
  reference = 120;
  get distance() {
    return Math.max(0, (this.reference - 120) / 115);
  }
  impact = 0;
  impactKind = '';
  private sphere: Mesh;
  private box: Mesh;
  private cylinder: Mesh;
  constructor(
    parent: Node,
    private surface: Material,
  ) {
    this.root = this.node('Atmosphere3D', parent);
    this.tower = this.node('JadeTower', this.root);
    this.sphere = utils.createMesh(primitives.sphere(0.5, { segments: 16 }));
    this.box = utils.createMesh(primitives.box());
    this.cylinder = utils.createMesh(primitives.cylinder(0.5, 0.5, 1, { radialSegments: 32 }));
    this.meshes.push(this.sphere, this.box, this.cylinder);
    const cn = this.node('PerspectiveCamera', parent);
    this.camera = cn.addComponent(Camera);
    this.camera.priority = 1;
    this.camera.visibility = 1 << 30;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.near = 0.1;
    this.camera.far = 180;
    this.camera.fov = 43;
    cn.setPosition(0, 10.4, 14.4);
    cn.lookAt(new Vec3(0, -2.8, 0));
    const globals = parent.scene!.globals;
    globals.skybox.enabled = false;
    globals.ambient.skyLightingColor = new Color(204, 224, 245);
    globals.ambient.groundLightingColor = new Color(111, 143, 163);
    globals.ambient.skyIllum = 23000;
    globals.fog.type = 0;
    globals.fog.fogStart = 27;
    globals.fog.fogEnd = 95;
    globals.fog.enabled = true;
    const sun = this.node('WarmSun', this.root);
    sun.setRotationFromEuler(-48, -30, 0);
    const light = sun.addComponent(DirectionalLight);
    light.color = new Color(255, 239, 208);
    light.illuminance = 46000;
    this.shape('IvoryShaft', this.tower, this.cylinder, 'ivory', [0, -12, 0], [0.42, 28, 0.42]);
    this.shape('GoldCrown', this.tower, this.sphere, 'gold', [0, 2, 0], [0.52, 0.18, 0.52]);
    this.ball = this.shape(
      'WarmStar',
      this.root,
      this.sphere,
      'star',
      [0, 0.3, 2.2],
      [0.6, 0.6, 0.6],
    );
    this.halo = this.ringObject('ShieldHalo', this.root, 0.43, 0.46, 'cyan');
    this.pulse = this.ringObject('SizeWave', this.root, 0.45, 0.48, 'star');
    for (let i = 0; i < 8; i++)
      this.trails.push(
        this.shape(
          'StarlightTrail' + i,
          this.root,
          this.sphere,
          'star',
          [0, 0, 0],
          [0.1, 0.1, 0.1],
        ),
      );
    for (let biome = 0; biome < 4; biome++)
      for (let slot = 0; slot < 3; slot++) {
        const name = SIGHTINGS[biome][slot];
        this.decorations.push(this.decoration(name, biome, slot));
      }
    for (let i = 0; i < 14; i++) {
      const cloud = this.node('CloudDepth' + i, this.root);
      for (let j = 0; j < 4; j++)
        this.shape(
          'Vapor',
          cloud,
          this.sphere,
          'cloud',
          [(j - 1.5) * 1.2, Math.sin(j * 3 + i) * 0.3, Math.cos(j * 2) * 0.5],
          [2.2, 1.1, 1.8],
        );
      this.clouds.push(cloud);
    }
    for (let i = 0; i < 28; i++)
      this.weather.push(
        this.shape('Weather' + i, this.root, this.sphere, 'mist', [0, 0, 0], [0.04, 0.04, 0.04]),
      );
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = 1 << 30;
    parent.addChild(n);
    return n;
  }
  material(name: string) {
    let m = this.materials.get(name);
    if (m) return m;
    const colors: Record<string, string> = {
      jade: '#63bfb1',
      jadeDark: '#347e7b',
      gold: '#d9ad5d',
      ivory: '#eee2c8',
      coral: '#ed6861',
      stripe: '#ffe6a4',
      star: '#fff6d5',
      cyan: '#7be9ee',
      cloud: '#dcebf4',
      mist: '#cce4ef',
      panel: '#214974',
      steel: '#ced6df',
      dark: '#29465d',
      planet: '#b088b4',
      moon: '#d5d5e2',
      sun: '#fff0b4',
      bird: '#f2ead6',
    };
    m = new Material();
    m.initialize({
      effectAsset: this.surface.effectAsset!,
      states: { rasterizerState: { cullMode: gfx.CullMode.NONE } },
    });
    m.setProperty('mainColor', color(colors[name] || name));
    m.setProperty('roughness', name === 'gold' ? 0.24 : 0.48);
    m.setProperty('metallic', name === 'gold' ? 0.55 : 0.08);
    if (['star', 'cyan', 'sun'].includes(name))
      m.setProperty(
        'emissive',
        color(name === 'star' ? '#65552c' : name === 'cyan' ? '#245a65' : '#9c894e'),
      );
    this.materials.set(name, m);
    return m;
  }
  shape(name: string, parent: Node, mesh: Mesh, mat: string, pos: number[], scale: number[]) {
    const n = this.node(name, parent);
    const r = n.addComponent(MeshRenderer);
    r.mesh = mesh;
    r.setMaterial(this.material(mat), 0);
    n.setPosition(pos[0], pos[1], pos[2]);
    n.setScale(scale[0], scale[1], scale[2]);
    return n;
  }
  meshObject(name: string, parent: Node, g: Geo, mat: string, list = this.meshes) {
    const mesh = utils.createMesh(g);
    list.push(mesh);
    return this.shape(name, parent, mesh, mat, [0, 0, 0], [1, 1, 1]);
  }
  ringObject(name: string, parent: Node, inner: number, outer: number, mat: string) {
    const g = geometry();
    arc(g, 0, TAU, inner, outer, 0.025, -0.025);
    return this.meshObject(name, parent, g, mat);
  }
  ring(layer: any) {
    const root = this.node('Ring' + layer.index, this.tower),
      meshes: Mesh[] = [];
    const batches = ringGeometry(layer);
    for (const [name, g] of Object.entries(batches))
      if (g.positions.length) this.meshObject(name, root, g, name, meshes);
    let pickup: Node | undefined;
    if (layer.pickup && layer.gap) {
      const a = layer.gap.start + normalizeAngle(layer.gap.end - layer.gap.start) / 2;
      pickup = this.shape(
        layer.pickup,
        root,
        this.box,
        layer.pickup === 'shield' ? 'cyan' : 'gold',
        [Math.cos(a) * 2.2, 0.32, Math.sin(a) * 2.2],
        [0.22, 0.34, 0.22],
      );
      pickup.setRotationFromEuler(0, 45, 35);
    }
    return { node: root, meshes, pickup };
  }
  decoration(name: string, biome: number, slot: number): Decoration {
    const firstMesh = this.meshes.length;
    const root = this.node(name, this.root);
    let wings: Node[] | undefined;
    const box = (mat: string, p: number[], s: number[]) =>
      this.shape(mat, root, this.box, mat, p, s);
    const sphere = (mat: string, p: number[], s: number[]) =>
      this.shape(mat, root, this.sphere, mat, p, s);
    if (['行星', '月亮', '太阳', '星系', '陨石', '彗星'].includes(name)) {
      sphere(
        name === '太阳' ? 'sun' : name === '月亮' ? 'moon' : 'planet',
        [0, 0, 0],
        name === '陨石' ? [1, 0.7, 0.9] : [2.7, 2.7, 2.7],
      );
      if (name === '行星' || name === '星系') {
        const ring = this.ringObject('PlanetRings', root, 1.7, 2.5, 'gold');
        ring.setRotationFromEuler(14, 0, -20);
      }
      if (name === '彗星')
        for (let i = 1; i < 8; i++)
          sphere('star', [i * 0.5, i * 0.2, 0], [0.5 - i * 0.045, 0.3, 0.25]);
      if (name === '月亮' || name === '陨石')
        for (let i = 0; i < 6; i++)
          sphere('dark', [Math.cos(i * 2) * 0.9, Math.sin(i * 2) * 0.9, 0.9], [0.25, 0.25, 0.1]);
    } else if (['国际空间站', '中国空间站', '卫星', '星链', '飞船', '火箭'].includes(name)) {
      if (name === '星链')
        for (let i = 0; i < 7; i++) {
          box('steel', [(i - 3) * 0.65, 0, 0], [0.18, 0.15, 0.15]);
          box('panel', [(i - 3) * 0.65, 0, 0.25], [0.4, 0.025, 0.3]);
        }
      else if (name === '火箭') {
        this.shape('RocketBody', root, this.cylinder, 'ivory', [0, 0, 0], [0.42, 2.8, 0.42]);
        sphere('coral', [0, 1.45, 0], [0.4, 0.7, 0.4]);
        box('coral', [0, -1.1, 0], [1.1, 0.5, 0.15]);
        sphere('sun', [0, -1.8, 0], [0.3, 0.8, 0.3]);
      } else {
        box('steel', [0, 0, 0], name === '国际空间站' ? [3, 0.12, 0.12] : [0.4, 0.4, 1.3]);
        box('ivory', [0, 0, 0], [0.45, 0.4, name === '中国空间站' ? 2.2 : 1.1]);
        const panels = name === '国际空间站' ? 4 : name === '中国空间站' ? 2 : 1;
        for (let i = 0; i < panels; i++)
          for (const side of [-1, 1]) {
            const x = (i - (panels - 1) / 2) * 0.85;
            box('gold', [x, 0, side * 0.6], [0.08, 0.08, 1.25]);
            box('panel', [x, 0, side * 1.1], [0.65, 0.06, 1.05]);
            for (let k = 0; k < 3; k++)
              box('steel', [x - 0.24 + k * 0.24, 0.04, side * 1.1], [0.015, 0.01, 1.05]);
          }
        if (name === '中国空间站') {
          box('ivory', [0, 0, 0.6], [1.5, 0.35, 0.4]);
          box('coral', [0, 0.23, 0.65], [0.18, 0.04, 0.18]);
        }
        if (name === '飞船') {
          sphere('ivory', [0, 0.2, 0.2], [0.7, 0.6, 1]);
          box('cyan', [0, 0.5, 0.4], [0.3, 0.1, 0.3]);
        }
      }
    } else if (name === '客机' || name === '战斗机') {
      sphere(name === '客机' ? 'ivory' : 'dark', [0, 0, 0], [0.45, 0.38, 2.8]);
      const g = geometry();
      quad(
        g,
        [
          [-2, 0, 0.7],
          [0, 0, -0.6],
          [2, 0, 0.7],
          [0, 0, 0.35],
        ],
        [0, 1, 0],
      );
      this.meshObject('SweptWings', root, g, name === '客机' ? 'steel' : 'dark');
      box('coral', [0, 0.38, 1], [0.06, 0.75, 0.7]);
      box('steel', [0, 0, 1], [1.2, 0.08, 0.4]);
      for (const side of [-1, 1]) sphere('dark', [side * 0.65, -0.18, 0.1], [0.23, 0.24, 0.65]);
      root.setRotationFromEuler(0, -65, 0);
    } else {
      const mat = ['白鹭', '鸽子'].includes(name) ? 'bird' : 'dark';
      sphere(mat, [0, 0, 0], [0.23, 0.25, 0.8]);
      sphere(mat, [0, 0.13, -0.4], [0.2, 0.2, 0.25]);
      box('gold', [0, 0.11, -0.6], [0.06, 0.06, 0.25]);
      if (name === '白鹭') box('bird', [0, 0.1, -0.25], [0.08, 0.12, 0.65]);
      wings = [];
      for (const side of [-1, 1]) {
        const hinge = this.node('Wing', root),
          g = geometry();
        quad(
          g,
          [
            [0, 0, -0.1],
            [side * 1.05, 0.05, 0.18],
            [side * 0.72, 0, 0.45],
            [0, 0, 0.25],
          ],
          [0, 1, 0],
        );
        this.meshObject('Feathers', hinge, g, mat);
        wings.push(hinge);
      }
      if (name === '大雁')
        for (let i = 0; i < 3; i++)
          sphere('dark', [(i - 1) * 0.5, -0.2, 0.6 + Math.abs(i - 1) * 0.3], [0.16, 0.14, 0.4]);
    }
    return { node: root, name, biome, slot, wings, meshes: this.meshes.splice(firstMesh) };
  }
  setTheme(stage: number) {
    for (let i = 0; i < this.decorations.length; i++) {
      const old = this.decorations[i],
        list = SIGHTINGS[old.biome],
        name = list[(stage - 1 + old.slot * 3) % list.length];
      if (old.name === name) continue;
      old.node.destroy();
      old.meshes.forEach((m) => m.destroy());
      this.decorations[i] = this.decoration(name, old.biome, old.slot);
    }
  }
  bump(kind: string) {
    this.impact = 0.18;
    this.impactKind = kind;
  }
  update(state: any, dt: number, reduced: boolean, skin: string, menu = false) {
    if (this.level !== state.level) {
      for (const ring of this.rings.values()) {
        ring.node.destroy();
        ring.meshes.forEach((m) => m.destroy());
      }
      this.rings.clear();
      this.level = state.level;
      this.setTheme(state.level.order || 1);
      this.oldRadius = state.ballRadius;
      this.reference = state.y + state.ballRadius;
    }
    this.time += dt * (reduced ? 0.18 : 1);
    this.feedback = Math.max(0, this.feedback - dt);
    this.impact = Math.max(0, this.impact - dt);
    this.reference +=
      (Math.max(this.reference, state.y + state.ballRadius) - this.reference) *
      (1 - Math.exp(-dt * 5));
    const e = state.environment,
      t = this.time,
      reference = this.reference;
    const visible = state.level.layers.slice(Math.max(0, state.nextLayer - 1), state.nextLayer + 5);
    const ids = new Set(visible.map((l: any) => l.index));
    for (const [id, r] of this.rings)
      if (!ids.has(id)) {
        r.node.destroy();
        r.meshes.forEach((m) => m.destroy());
        this.rings.delete(id);
      }
    for (const layer of visible) {
      let r = this.rings.get(layer.index);
      if (!r) {
        r = this.ring(layer);
        this.rings.set(layer.index, r);
      }
      r.node.setPosition(0, -(layer.y - reference) * 0.025, 0);
      // Cocos positive yaw rotates X toward -Z; rule angles rotate toward +Z.
      r.node.setRotationFromEuler(
        0,
        (-(state.rotation + layerRotationAt(layer, state.elapsed)) * 180) / Math.PI,
        0,
      );
      if (r.pickup) {
        r.pickup.active = layer.index > state.rewardedThrough;
        r.pickup.setScale(0.22 * (1 + Math.sin(t * 3) * 0.12), 0.34, 0.22);
      }
    }
    const ballY = (reference - state.y) * 0.025,
      diameter = state.ballRadius * 0.05;
    const squash = !reduced && this.impactKind === 'bounce' ? this.impact : 0;
    this.ball.setPosition(0, ballY, ORBIT_RADIUS * 0.025);
    this.ball.setScale(diameter * (1 + squash), diameter * (1 - squash), diameter * (1 + squash));
    this.camera.node.setPosition(
      !reduced && this.impactKind === 'lost' ? Math.sin(t * 70) * this.impact * 0.15 : 0,
      10.4,
      14.4,
    );
    this.ball
      .getComponent(MeshRenderer)!
      .setMaterial(this.material(skin === 'ice' ? 'cyan' : skin === 'amber' ? 'gold' : 'star'), 0);
    this.halo.active = state.shield;
    this.halo.setPosition(0, ballY, 2.2);
    this.halo.setRotationFromEuler(55, t * 30, 0);
    if (Math.abs(state.ballRadius - this.oldRadius) > 0.03) {
      this.feedback = 0.6;
      this.oldRadius = state.ballRadius;
    }
    this.pulse.active = this.feedback > 0 && !reduced;
    this.pulse.setPosition(0, ballY, 2.2);
    this.pulse.setScale(1 + (1 - this.feedback) * 2, 1, 1 + (1 - this.feedback) * 2);
    this.trails.forEach((n, i) => {
      n.active = !reduced && state.v > 30 && !state.paused;
      const s = diameter * (1 - i / 9) * 0.26;
      n.setScale(s, s, s);
      n.setPosition(0, ballY + (i + 1) * 0.16, 2.2);
    });
    this.visibleNames = [];
    for (let i = 0; i < this.decorations.length; i++) {
      let d = this.decorations[i];
      const journey = this.distance * 0.028 + t * 0.008 + d.slot / 3;
      const cycle = Math.floor(journey),
        progress = journey - cycle;
      if (d.cycle !== cycle) {
        const names = SIGHTINGS[d.biome];
        const name = names[(cycle * 3 + (state.level.order || 1) - 1 + d.slot * 3) % names.length];
        if (d.name !== name) {
          d.node.destroy();
          d.meshes.forEach((m) => m.destroy());
          d = this.decorations[i] = this.decoration(name, d.biome, d.slot);
        }
        d.cycle = cycle;
      }
      const weight = d.biome === e.from ? 1 - e.blend : d.biome === e.to ? e.blend : 0;
      d.node.active = weight > 0.005;
      if (!d.node.active) continue;
      const side = d.slot % 2 ? -1 : 1,
        z = -29 + progress * 16 - d.slot * 5;
      const x =
        d.wings || ['客机', '战斗机'].includes(d.name)
          ? side * (12 - progress * 20)
          : side * (5 + d.slot * 0.8) + Math.sin(t * 0.06 + d.slot) * 0.65;
      const vertical = -20 + progress * 34 - d.slot * 4;
      d.node.setPosition(x, vertical, z);
      const s =
        (state.mode === 'endless' ? 0.6 : 0.85) *
        (['行星', '月亮', '太阳', '星系'].includes(d.name) ? 0.5 : 1) *
        Math.min(1, progress / 0.12, (1 - progress) / 0.12) *
        Math.min(1, weight * 2);
      d.node.setScale(s, s, s);
      if (d.wings)
        d.wings.forEach((wing, i) =>
          wing.setRotationFromEuler(
            0,
            0,
            Math.sin(t * (d.name === '鹰' ? 0.5 : 2.5)) * (i ? -1 : 1) * 25,
          ),
        );
      else if (!['客机', '战斗机'].includes(d.name))
        d.node.setRotationFromEuler(10, Math.sin(t * 0.022) * 15, 12);
      this.visibleNames.push(d.name);
    }
    const density = Math.min(1, (e.from + (e.to - e.from) * e.blend) / 2);
    this.clouds.forEach((n, i) => {
      n.active = density > 0.05;
      if (!n.active) return;
      const near = i < 4,
        z = near ? 3 + i * 0.7 : -12 - (i % 5) * 7;
      // Foreground banks stay outside the collision lane; far banks pass behind the tower.
      const x = (i % 2 ? -1 : 1) * (near ? 5.8 : 8) + Math.sin(t * 0.045 + i) * 1.1;
      const position = (this.distance * (near ? 0.42 : 0.11) + i * 3 + t * 0.11) % 28;
      const y = -14 + position;
      n.setPosition(x, y, z);
      const s = (near ? 0.9 : 1.8) * density * Math.min(1, position / 2, (28 - position) / 2);
      n.setScale(s, s * 0.55, s);
    });
    this.weather.forEach((n, i) => {
      const active = e.weather === 'rain' || e.weather === 'snow' || Math.abs(state.wind) > 0.003;
      n.active = active && !reduced;
      const snow = e.weather === 'snow',
        rain = e.weather === 'rain';
      n.setScale(snow ? 0.065 : rain ? 0.018 : 0.5, snow ? 0.065 : rain ? 0.46 : 0.018, 0.018);
      const side = i % 2 ? -1 : 1;
      n.setPosition(
        side * (3.4 + (i % 4) * 0.35) + Math.sin(t * 0.35 + i) * 0.15,
        7 - ((t * (rain ? 4 : snow ? 0.4 : 0.6) + i * 0.78) % 17),
        1 + (i % 3),
      );
      n.setRotationFromEuler(0, 0, rain ? -12 : 0);
    });
    const fog = this.root.scene!.globals.fog;
    fog.fogColor = new Color(100 + density * 90, 139 + density * 66, 182 + density * 45);
    const haze = !!state.level.layers[state.nextLayer]?.fog;
    fog.fogStart += ((haze ? 18 : 27) - fog.fogStart) * (1 - Math.exp(-dt));
    fog.fogEnd += ((haze ? 72 : 100) - density * 25 - fog.fogEnd) * (1 - Math.exp(-dt));
    // Keep the perspective stage in the same centered portrait viewport as the Cocos UI.
    const f = view.getFrameSize(),
      h = Math.max(640, Math.min(960, (360 * f.height) / f.width)),
      scale = Math.min(f.width / 360, f.height / h);
    const width = (360 * scale) / f.width,
      height = (h * scale) / f.height;
    this.camera.rect = new Rect((1 - width) / 2, (1 - height) / 2, width, height);
  }
  dispose() {
    for (const r of this.rings.values()) r.meshes.forEach((m) => m.destroy());
    this.decorations.forEach((d) => d.meshes.forEach((m) => m.destroy()));
    this.meshes.forEach((m) => m.destroy());
    this.materials.forEach((m) => m.destroy());
    this.root.destroy();
    this.camera.node.destroy();
  }
}
