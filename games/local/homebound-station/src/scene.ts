import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAY_X, blocker, canSelect, entryPath, matchGroup, queueHead, queuePosition } from './simulation.ts';
import { idlePose } from './ambient.ts';
import { ARROWS } from './levels.ts';
import type { Simulation, Vehicle, Point } from './simulation.ts';

const palette = { asphalt: 0x41484b, cream: 0xd8cdb9, teal: 0x285754, taxi: 0xefb437, grass: 0x547a49 };
export class StationScene {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-14, 14, 18, -18, 0.1, 120);
  renderer: THREE.WebGLRenderer;
  world = new THREE.Group();
  vehicles = new Map<string, THREE.Group>();
  people = new Map<string, THREE.Group>();
  labels = new Map<string, HTMLButtonElement>();
  textures: THREE.CanvasTexture[] = [];
  materials = new Map<number, THREE.MeshStandardMaterial>();
  route: THREE.Line;
  routeKey = '';
  bayMeshes: THREE.Object3D[] = [];
  observer: ResizeObserver;
  overlay: HTMLDivElement;
  landmark = document.createElement('div');
  sceneryStatus = document.createElement('button');
  treeSlots: THREE.Group[] = [];
  asphalt = new THREE.MeshStandardMaterial({ color: palette.asphalt, roughness: 0.95 });
  sceneryPromise?: Promise<void>;
  treesLoaded = false;
  disposed = false;
  events = new AbortController();
  width = 1; height = 1;
  visualTime = 0;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  select: (kind: 'vehicle' | 'group' | 'bay', id: string) => void;
  constructor(private element: HTMLElement, select: StationScene['select']) {
    this.select = select;
    this.scene.background = new THREE.Color(0xbec9b8);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute('aria-label', '归途站三维调度场景：上方候车人群，中间上车点，下方车辆等待区');
    element.append(this.renderer.domElement);
    this.overlay = document.createElement('div'); this.overlay.className = 'scene-labels'; element.append(this.overlay);
    this.landmark.className = 'station-landmark'; this.landmark.innerHTML = '<b>归途站</b><span>出站口 · 出租车接驳</span>'; element.append(this.landmark);
    this.sceneryStatus.className = 'scenery-status'; this.sceneryStatus.hidden = true;
    this.sceneryStatus.onclick = () => { void this.loadScenery(); }; element.append(this.sceneryStatus);
    this.camera.position.set(0, 40, 32); this.camera.lookAt(0, 0, 4);
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight(0xe9f1ff, 0x716c50, 1.7));
    const sun = new THREE.DirectionalLight(0xffe7c4, 2.6); sun.position.set(-12, 25, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 65 }); sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.buildStation();
    this.compact(this.world);
    this.route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffe8a0, dashSize: 0.55, gapSize: 0.3, depthTest: false }));
    this.route.renderOrder = 10; this.scene.add(this.route);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(element); this.resize();
    let down: { x: number; y: number; pointerId: number; hit?: { kind: 'vehicle' | 'group' | 'bay'; id: string } } | undefined;
    const canvas = this.renderer.domElement;
    element.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      const label = (event.target as HTMLElement).closest<HTMLElement>('.world-label');
      if (!label && event.target !== canvas) return;
      let hit = label ? (['vehicle', 'group', 'bay'] as const).map(kind => ({ kind, id: label.dataset[kind]! })).find(h => h.id) : undefined;
      if (!label) {
        const bounds = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), this.camera);
        const targets = [...[...this.vehicles.values(), ...this.people.values()].filter(object => object.visible), ...this.bayMeshes];
        for (const intersection of ray.intersectObjects(targets, true)) {
          let object: THREE.Object3D | null = intersection.object;
          while (object && !object.userData.kind) object = object.parent;
          if (object) { hit = object.userData as typeof hit; break; }
        }
      }
      down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, hit };
      (event.target as Element).setPointerCapture(event.pointerId);
      if (hit?.kind === 'vehicle') this.label('vehicle', hit.id).classList.add('pressing');
    }, { signal: this.events.signal });
    element.addEventListener('pointercancel', () => { down = undefined; }, { signal: this.events.signal });
    element.addEventListener('pointerup', event => {
      const start = down; down = undefined;
      if (!start || start.pointerId !== event.pointerId || !start.hit) return;
      if (start.hit.kind !== 'vehicle' && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12) return;
      this.select(start.hit.kind, start.hit.id);
    }, { signal: this.events.signal });
  }
  material(color: number) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    return this.materials.get(color)!;
  }
  box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = h > 0.2; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  rounded(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number, radius = 0.08) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), this.material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  // Batch fixed parts by material; articulated limbs, doors and selectable bays stay separate.
  compact(parent: THREE.Object3D) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) if (child instanceof THREE.Mesh && !child.name && !child.userData.kind && !Array.isArray(child.material)) {
      const meshes = batches.get(child.material) ?? []; meshes.push(child); batches.set(child.material, meshes);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => { mesh.updateMatrix(); return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix); });
      const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
      if (!geometry) continue;
      meshes.forEach(mesh => { parent.remove(mesh); mesh.geometry.dispose(); });
      const combined = new THREE.Mesh(geometry, material); combined.castShadow = meshes.some(m => m.castShadow); combined.receiveShadow = true; parent.add(combined);
    }
  }
  cylinder(parent: THREE.Object3D, radius: number, height: number, x: number, y: number, z: number, color: number, top = radius) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 8), this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  sign(text: string, width: number, height: number, x: number, y: number, z: number, bg = '#294d4d', fg = '#fff6de', ground = false) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.round(768 * height / width);
    const c = canvas.getContext('2d')!; c.fillStyle = bg; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${Math.round(canvas.height * 0.61)}px "Microsoft YaHei", sans-serif`; c.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 30);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.textures.push(texture);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    plane.position.set(x, y, z); if (ground) plane.rotation.x = -Math.PI / 2; this.world.add(plane);
  }
  buildStation() {
    this.box(this.world, 29, 0.5, 38, 0, -0.6, 5, 0x9aa787);
    this.box(this.world, 25, 0.2, 15, 0, -0.14, -5.4, palette.cream);
    this.box(this.world, 27, 0.12, 24, 0, -0.15, 11.8, palette.asphalt).material = this.asphalt;
    // Stone facade, recessed glass doors, cornices and a copper-edged canopy.
    this.box(this.world, 24, 3.9, 2.8, 0, 1.85, -10.5, 0xc2b69f);
    this.box(this.world, 24.5, 0.18, 3, 0, 3.92, -10.5, 0xebe0ca);
    this.box(this.world, 24.7, 0.18, 2.4, 0, 4.12, -10.5, palette.teal);
    for (let x = -12; x <= 12; x += 1) this.box(this.world, 0.035, 0.03, 2.4, x, 4.23, -10.5, 0x476b62);
    this.box(this.world, 4.8, 2.2, 1.5, 0, 4.9, -10.8, 0xc2b69f);
    this.box(this.world, 5.1, 0.15, 1.7, 0, 6.05, -10.8, 0xe3d4b6);
    this.box(this.world, 5.25, 0.13, 1.85, 0, 6.19, -10.8, palette.teal);
    for (let y = 0.35; y < 3.8; y += 0.48) {
      this.box(this.world, 24, 0.02, 0.025, 0, y, -9.08, 0x9f9583);
      for (let x = -11.5 + (Math.round(y * 2) % 2) * 0.75; x < 12; x += 1.5) this.box(this.world, 0.02, 0.45, 0.025, x, y + 0.23, -9.08, 0xa99e88);
    }
    this.box(this.world, 7.8, 1.2, 0.22, 0, 3.42, -8.95, palette.teal);
    this.sign('归 途 站', 6.8, 0.9, 0, 3.42, -8.81);
    for (let x = -10; x <= 10; x += 2.5) {
      this.box(this.world, 1.95, 2.45, 0.12, x, 1.4, -8.96, 0x263d40);
      this.box(this.world, 1.78, 0.6, 0.04, x, 2.25, -8.87, 0x668781);
      for (const dx of [-1, 0, 1]) this.box(this.world, 0.055, 2.5, 0.12, x + dx, 1.4, -8.84, 0xafa887);
      this.box(this.world, 2.1, 0.12, 0.2, x, 2.65, -8.84, 0xe5d6b8);
      this.box(this.world, 1.95, 0.05, 0.1, x, 1.05, -8.83, 0xabae9e);
      this.box(this.world, 2.15, 0.08, 0.7, x, 0.025, -8.7, 0xe1d2b5);
    }
    this.sign('↓  出站口  ↓', 3.5, 0.65, 0, 2.02, -8.73, '#244b47', '#fff4d9');
    this.box(this.world, 24.6, 0.12, 1.45, 0, 2.85, -8.28, 0x426761);
    this.box(this.world, 24.7, 0.12, 0.12, 0, 2.8, -7.52, 0xb18a50);
    for (let x = -11.5; x <= 11.5; x += 2.3) this.box(this.world, 0.055, 0.045, 1.4, x, 2.93, -8.28, 0xabb4a1);
    for (const x of [-11.5, -5, 5, 11.5]) {
      this.cylinder(this.world, 0.07, 2.7, x, 1.35, -7.7, palette.teal);
      this.box(this.world, 0.12, 0.065, 0.75, x, 2.6, -8, 0xffe2a6);
    }
    // Small analog clock above the station name.
    const clock = this.cylinder(this.world, 0.5, 0.14, 0, 5.2, -9.96, 0xf6eedb); clock.rotation.x = Math.PI / 2;
    this.box(this.world, 0.035, 0.32, 0.025, 0, 5.32, -9.87, palette.teal);
    const hand = this.box(this.world, 0.24, 0.035, 0.025, 0.1, 5.13, -9.87, palette.teal); hand.rotation.z = -0.5;
    for (let i = 0; i < 12; i++) {
      const mark = this.box(this.world, 0.025, 0.055, 0.025, Math.sin(i * Math.PI / 6) * 0.4, 5.2 + Math.cos(i * Math.PI / 6) * 0.4, -9.87, palette.teal);
      mark.rotation.z = -i * Math.PI / 6;
    }
    // Tile joints make walking space clearly different from the road.
    for (let x = -12; x <= 12; x += 2) this.box(this.world, 0.025, 0.015, 7.5, x, 0.005, -4.6, 0xd1c7b0);
    for (let z = -8; z < -1; z += 1.5) this.box(this.world, 24, 0.015, 0.025, 0, 0.005, z, 0xd1c7b0);
    this.sign('出租车候车区', 5.5, 0.55, -6, 1.9, -7.6, '#a06c32');
    this.sign('下一程，好好团圆', 5.5, 0.55, 6, 1.9, -7.6, '#a06c32');
    for (const [id, x] of Object.entries(BAY_X)) {
      const color = palette.taxi;
      const floor = this.box(this.world, 4.5, 0.035, 2.4, x, -0.025, 0.4, 0x3d605b);
      floor.userData = { kind: 'bay', id }; this.bayMeshes.push(floor);
      for (const z of [-0.8, 1.6]) this.box(this.world, 4.5, 0.025, 0.065, x, 0.015, z, color);
      for (const side of [-2.2, 2.2]) this.box(this.world, 0.065, 0.025, 2.4, x + side, 0.015, 0.4, color);
      this.box(this.world, 3.5, 0.13, 0.24, x, 0.03, -1.2, 0xc9bfa6);
      this.sign(`${id}  →`, 2.4, 0.5, x, 0.03, 1.12, '#3d605b', '#f8d983', true);
      this.cylinder(this.world, 0.08, 1.1, x - 2, 0.55, -1.25, palette.teal);
      for (const side of [-1.65, 1.65]) {
        for (const z of [-2.3, -4.5, -6.7]) this.cylinder(this.world, 0.045, 0.8, x + side, 0.4, z, 0x8c9993);
        for (const y of [0.4, 0.78]) this.box(this.world, 0.04, 0.04, 4.4, x + side, y, -4.5, 0xa0aaa0);
      }
      for (let n = 0; n < 8; n++) this.box(this.world, 0.25, 0.018, 0.06, x - 1 + n * 0.28, 0.012, -0.95, 0x50574e);
    }
    // Shared curb road; the dense parking grid has four exits into the outer loop.
    for (let x = -10; x <= 10; x += 3.3) {
      this.sign('→', 1.2, 0.7, x, 0.015, 2.7, '#41484b', '#dfdccc', true);
      this.sign('←', 1.2, 0.7, x, 0.015, 22, '#41484b', '#dfdccc', true);
    }
    for (let row = 0; row < 4; row++) for (let column = 0; column < 5; column++) {
      const x = -8 + column * 4, z = 6 + row * 4;
      for (const side of [-1.8, 1.8]) {
        this.box(this.world, 0.05, 0.02, 0.7, x + side, 0.01, z + 1.4, 0xbac0b6);
        this.box(this.world, 0.6, 0.02, 0.05, x + side - Math.sign(side) * 0.28, 0.01, z + 1.75, 0xbac0b6);
      }
    }
    for (const z of [6, 10, 14, 18]) { this.sign('↑', 0.8, 1.1, -12, 0.02, z, '#41484b'); this.sign('↓', 0.8, 1.1, 12, 0.02, z, '#41484b'); }
    for (const [x, z] of [[-11.5, -4], [11.5, -4], [-11.5, -7], [11.5, -7]]) {
      this.box(this.world, 1.3, 0.4, 1.3, x!, 0.2, z!, 0xc0b49a);
      const tree = new THREE.Group(); tree.position.set(x!, 0.4, z!); this.treeSlots.push(tree); this.world.add(tree);
      this.cylinder(tree, 0.12, 1.65, 0, 0.82, 0, 0x736049, 0.055);
      for (let i = 0; i < 5; i++) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), this.material(i % 2 ? 0x53794b : 0x638650));
        crown.position.set(Math.sin(i * 2.4) * 0.46, 1.8 + (i % 3) * 0.3, Math.cos(i * 2.4) * 0.4); crown.castShadow = true; tree.add(crown);
      }
    }
    for (const x of [-10.3, 10.3]) {
      for (let slat = 0; slat < 4; slat++) this.box(this.world, 0.14, 0.08, 1.8, x - 0.25 + slat * 0.17, 0.5, -5.8, 0x927145);
      for (const z of [-6.45, -5.15]) this.box(this.world, 0.65, 0.4, 0.06, x, 0.24, z, palette.teal);
      for (const y of [0.76, 0.95]) this.box(this.world, 0.06, 0.12, 1.8, x + (x < 0 ? -0.4 : 0.4), y, -5.8, 0x927145);
    }
  }
  async loadScenery() {
    if (this.disposed || (this.treesLoaded && this.asphalt.map)) return;
    if (this.sceneryPromise) return this.sceneryPromise;
    this.element.dataset.scenery = 'loading'; this.sceneryStatus.hidden = false;
    this.sceneryStatus.textContent = '正在补充场景细节…'; this.sceneryStatus.disabled = true;
    this.sceneryPromise = (async () => {
      await Promise.allSettled([
        this.asphalt.map ? Promise.resolve() : new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}art/asphalt.jpg`).then(texture => {
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(9, 8);
          texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          this.asphalt.color.set(0xffffff); this.asphalt.map = texture; this.asphalt.needsUpdate = true;
        }),
        this.treesLoaded ? Promise.resolve() : import('three/addons/loaders/GLTFLoader.js').then(async ({ GLTFLoader }) => {
          const { scene: tree } = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}art/broadleaf.glb`);
          if (this.disposed) { this.release(tree); return; }
          tree.scale.set(0.37, 0.46, 0.37);
          tree.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
          this.treeSlots.forEach((slot, i) => {
            slot.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); slot.clear();
            const copy = tree.clone(true); copy.rotation.y = i * 1.7; slot.add(copy);
          });
          this.treesLoaded = true;
        }),
      ]);
      if (this.disposed) return;
      const complete = this.treesLoaded && !!this.asphalt.map;
      this.element.dataset.scenery = complete ? 'ready' : 'fallback'; this.sceneryStatus.hidden = complete;
      this.sceneryStatus.disabled = false; this.sceneryStatus.textContent = '轻量场景 · 重试细节';
    })().finally(() => { this.sceneryPromise = undefined; });
    return this.sceneryPromise;
  }
  car(v: Vehicle) {
    const car = new THREE.Group(), van = v.passengerCapacity === 6, color = van ? 0xe9dfb9 : [palette.taxi, 0xe5a82d, 0xf3c453][v.sequence % 3]!;
    const paint = this.material(color); paint.roughness = 0.32; paint.metalness = 0.18;
    const glass = this.material(0x203b40); glass.roughness = 0.2; glass.metalness = 0.4;
    car.userData = { kind: 'vehicle', id: v.id };
    this.rounded(car, 1.18, 0.49, van ? 2.65 : 2.45, 0, 0.56, 0, color, 0.15);
    this.rounded(car, 1.03, van ? 0.62 : 0.48, van ? 1.9 : 1.5, 0, van ? 1.02 : 0.96, -0.12, 0x203b40, 0.2);
    this.rounded(car, 0.94, 0.13, van ? 1.55 : 1.02, 0, van ? 1.35 : 1.21, -0.2, color, 0.06);
    this.rounded(car, 1.08, 0.11, van ? 0.45 : 0.62, 0, 0.81, van ? 1.02 : 0.87, color, 0.045);
    for (const x of [-0.59, 0.59]) {
      for (const z of [-0.8, 0.8]) {
        const wheel = this.cylinder(car, 0.25, 0.13, x, 0.32, z, 0x243334); wheel.rotation.z = Math.PI / 2;
        const cap = this.cylinder(car, 0.11, 0.14, x, 0.32, z, 0xa4b1ab); cap.rotation.z = Math.PI / 2;
      }
      this.box(car, 0.035, 0.15, van ? 2.15 : 1.92, x * 0.99, 0.53, 0, palette.teal);
      this.box(car, 0.035, 0.045, 0.2, x, 0.78, 0.15, 0xe4e3d4);
      this.box(car, 0.04, 0.37, 0.07, x * 0.86, 1, -0.14, color);
      this.rounded(car, 0.18, 0.12, 0.2, x * 1.04, 0.9, 0.5, color, 0.04);
    }
    for (const x of [-0.39, 0.39]) {
      this.rounded(car, 0.27, 0.13, 0.07, x, 0.68, van ? 1.3 : 1.21, 0xfff2c9, 0.025);
      this.box(car, 0.23, 0.14, 0.035, x, 0.65, van ? -1.33 : -1.24, 0xcb7053);
    }
    this.box(car, 0.45, 0.12, 0.06, 0, 0.53, van ? 1.33 : 1.24, 0x2e3f3f);
    this.box(car, 0.23, 0.085, 0.07, 0, 0.43, van ? 1.34 : 1.25, 0x99bec8);
    this.rounded(car, 1.02, 0.08, 0.1, 0, 0.37, van ? 1.3 : 1.23, 0xb5b7a8, 0.035);
    this.box(car, 0.52, 0.23, 0.3, 0, van ? 1.56 : 1.41, -0.08, 0xfef4ce);
    const door = new THREE.Group(); door.name = 'door'; door.position.set(0.57, 0.78, 0.48);
    this.box(door, 0.035, 0.45, 0.65, 0, 0, -0.32, color); car.add(door);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.51, 40), new THREE.MeshBasicMaterial({ color: 0xffedac, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.name = 'selection'; ring.visible = false; ring.renderOrder = 5; car.add(ring);
    this.compact(car); car.scale.setScalar(1.1); this.scene.add(car); this.vehicles.set(v.id, car); return car;
  }
  person(id: string, index: number) {
    const person = new THREE.Group();
    const clothes = [0xca7950, 0x487e83, 0xe2c088, 0x586777, 0xa77470, 0x769368];
    const shirt = clothes[index % clothes.length]!;
    this.rounded(person, 0.38, 0.47, 0.25, 0, 0.59, 0, shirt, 0.09);
    const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.97; person.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), this.material([0xe4bc91, 0xc9936d, 0xf1cba5][index % 3]!)); face.scale.set(0.92, 1.08, 0.9); face.castShadow = true; head.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.184, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56), this.material(index % 4 ? 0x332e28 : 0x817568)); hair.position.y = 0.035; head.add(hair);
    for (const x of [-0.06, 0.06]) this.box(head, 0.025, 0.025, 0.025, x, 0.01, 0.153, 0x33362f);
    for (const x of [-0.095, 0.095]) {
      const leg = new THREE.Group(); leg.name = x < 0 ? 'leftLeg' : 'rightLeg'; leg.position.set(x, 0.38, 0); person.add(leg);
      this.rounded(leg, 0.13, 0.3, 0.14, 0, -0.13, 0, 0x344b4d, 0.04);
      this.rounded(leg, 0.15, 0.07, 0.23, 0, -0.32, 0.035, 0x353931, 0.025);
      const arm = new THREE.Group(); arm.name = x < 0 ? 'leftArm' : 'rightArm'; arm.position.set(x * 2.5, 0.76, 0); person.add(arm);
      this.rounded(arm, 0.12, 0.3, 0.13, 0, -0.12, 0, shirt, 0.05);
      this.rounded(arm, 0.095, 0.105, 0.1, 0, -0.29, 0, 0xe4bc91, 0.04);
    }
    // Decorative bags only; baggage capacity is deliberately not a rule in the first three levels.
    if (index % 3 === 0) { this.rounded(person, 0.22, 0.33, 0.19, 0.34, 0.22, -0.16, 0xa98250, 0.045); this.box(person, 0.025, 0.22, 0.025, 0.34, 0.5, -0.16, palette.teal); }
    this.compact(person); person.scale.setScalar(1.2); this.people.set(id, person); this.scene.add(person); return person;
  }
  label(kind: 'vehicle' | 'group' | 'bay', id: string) {
    const key = `${kind}:${id}`;
    if (!this.labels.has(key)) {
      const button = document.createElement('button'); button.className = `world-label ${kind}-label`; button.dataset[kind] = id;
      button.append(document.createElement('b'), document.createElement('small'));
      button.addEventListener('click', event => { if (event.detail === 0) this.select(kind, id); }); this.overlay.append(button); this.labels.set(key, button);
    }
    return this.labels.get(key)!;
  }
  labelText(button: HTMLButtonElement, title: string, detail: string) {
    // Keep the pressed DOM node alive between pointerdown and pointerup, including text updates.
    const heading = button.firstElementChild!, subtitle = button.lastElementChild!;
    if (heading.textContent !== title) heading.textContent = title;
    if (subtitle.textContent !== detail) subtitle.textContent = detail;
  }
  place(label: HTMLElement, x: number, y: number, z: number) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    label.style.left = `${(p.x + 1) / 2 * this.width}px`; label.style.top = `${(1 - p.y) / 2 * this.height}px`;
  }
  resize() {
    this.width = this.element.clientWidth; this.height = this.element.clientHeight;
    if (!this.width || !this.height) return;
    const aspect = this.width / this.height, halfHeight = Math.max(18, 14.4 / aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect; this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(this.width, this.height);
  }
  render(s: Simulation, selectedVehicle?: string, selectedGroup?: string) {
    const dt = Math.max(0, s.time - this.visualTime); this.visualTime = s.time;
    this.place(this.landmark, 0, 2.2, -8.8);
    for (const b of this.labels.values()) b.hidden = true;
    for (const p of this.people.values()) p.visible = false;
    for (const c of this.vehicles.values()) c.visible = false;
    for (const b of s.bays) {
      const el = this.label('bay', b.id); el.hidden = false;
      el.className = `world-label bay-label ${b.state === 'free' ? 'available' : ''}`;
      const group = s.groups.find(g => g.id === b.groupId), head = queueHead(s, b.id);
      const state = b.state === 'free' ? head ? `${head.passengers.length}人候车` : '无人候车' : b.state === 'reserved' ? '已预留' : b.state === 'occupied' ? `${group?.boarded ?? 0}/${group?.passengers.length ?? 0}人` : '驶离中';
      el.dataset.bayState = b.state;
      this.labelText(el, b.id, state); el.setAttribute('aria-label', `${b.id} ${state}`);
      this.place(el, BAY_X[b.id]!, 0, -1.2);
    }
    for (const v of s.vehicles) {
      if (v.state === 'removed') continue;
      const car = this.vehicles.get(v.id) ?? this.car(v); car.visible = true; car.position.set(v.position.x, 0, v.position.z); car.rotation.y = v.angle;
      car.getObjectByName('selection')!.visible = v.id === selectedVehicle;
      const job = s.services.find(j => j.vehicleId === v.id);
      car.getObjectByName('door')!.rotation.y = job && ['walking', 'boarding', 'closing'].includes(job.phase) ? -0.9 * (job.phase === 'closing' ? Math.max(0, 1 - job.elapsed / 0.8) : 1) : 0;
      const el = this.label('vehicle', v.id); el.hidden = false;
      const selectable = !canSelect(s, v);
      const obstructs = selectedVehicle && blocker(s, s.vehicles.find(c => c.id === selectedVehicle)!)?.id === v.id;
      el.className = `world-label vehicle-label ${v.id === selectedVehicle ? 'selected' : ''} ${obstructs ? 'blocking' : ''} ${selectable ? 'selectable' : 'busy'} ${v.state === 'holding' ? 'parked' : 'moving'}`;
      const g = s.groups.find(g => g.id === v.groupId);
      this.labelText(el, v.state === 'holding' ? ARROWS[v.direction] : v.state === 'boarding' ? `${g?.boarded ?? 0}/${g?.passengers.length ?? 0}` : v.state === 'reserved' ? '待发' : v.state === 'departing' ? (job?.clearedAt === undefined ? '驶离' : '已离位') : '出库', v.state === 'holding' ? String(v.passengerCapacity) : '');
      el.setAttribute('aria-label', `${v.id} ${ARROWS[v.direction]} 可载${v.passengerCapacity}人 ${canSelect(s, v) ?? '可以出库'}`);
      this.place(el, v.position.x, 1.5, v.position.z);
    }
    for (const g of s.groups) {
      if (g.state === 'split' || g.state === 'departed' || (g.passengers.every(p => s.delivered.has(p.id)))) continue;
      const job = s.services.find(j => j.groupId === g.id), origin = job?.walkFrom ?? queuePosition(s, g), v = s.vehicles.find(v => v.id === g.vehicleId);
      const active = g.state === 'walking' || g.state === 'boarding';
      const progress = g.state === 'walking' && job ? Math.min(1, job.elapsed / job.duration) : g.state === 'boarding' ? 1 : 0;
      const groupPoint = active && v ? this.walkPoint(origin, { x: v.position.x, z: -0.6 }, progress) : origin;
      g.passengers.forEach((p, i) => {
        if (i < g.boarded || s.delivered.has(p.id)) return;
        const fresh = !this.people.has(p.id);
        const human = this.people.get(p.id) ?? this.person(p.id, g.sequence + i); human.visible = true;
        human.userData = { kind: 'group', id: g.parentGroupId ?? g.id };
        const member = Number(p.id.split('/p')[1]) - 1;
        const offset = active ? i : member;
        const idle = idlePose(p.id, this.reducedMotion.matches ? 0 : s.time);
        const target = new THREE.Vector3(groupPoint.x + (offset % 3 - 1) * 0.55, 0, groupPoint.z + Math.floor(offset / 3) * 0.55 + (active ? 0 : idle.z));
        const advancing = !fresh && !active && human.position.distanceTo(target) > 0.3;
        if (fresh || active) human.position.copy(target); else human.position.lerp(target, Math.min(1, dt * 5));
        human.rotation.y = active ? 0 : idle.turn;
        const walking = g.state === 'walking' || advancing;
        const stride = walking ? Math.sin(s.time * 11 + i) * 0.5 : active ? 0 : idle.stride;
        human.getObjectByName('leftLeg')!.rotation.x = stride;
        human.getObjectByName('rightLeg')!.rotation.x = -stride;
        human.getObjectByName('leftArm')!.rotation.x = -stride * 0.6;
        human.getObjectByName('rightArm')!.rotation.x = active ? stride * 0.6 : -idle.arm;
        human.getObjectByName('head')!.rotation.x = active ? 0 : idle.nod;
      });
      const waitingSiblings = g.parentGroupId ? s.groups.filter(p => p.parentGroupId === g.parentGroupId && ['ready', 'reserved'].includes(p.state)) : [];
      if (g.passengers.length > 4 && g.state === 'ready' && origin.z > -4) {
        const el = this.label('group', g.parentGroupId && !active ? g.parentGroupId : g.id); el.hidden = false;
        el.className = `world-label group-label ${g.id === selectedGroup ? 'selected' : ''}`;
        const size = g.parentGroupId && !active ? waitingSiblings.reduce((n, p) => n + p.passengers.length, 0) : g.passengers.length;
        this.labelText(el, `${size}人`, g.parentGroupId && waitingSiblings.length > 1 && !active ? `分车${waitingSiblings.map(p => p.passengers.length).join('+')}` : g.passengers.length > 4 ? '可分乘' : '');
        this.place(el, groupPoint.x, 1.8, groupPoint.z - 0.3);
      }
    }
    const selected = s.vehicles.find(v => v.id === selectedVehicle && v.state === 'holding');
    const bay = selected && matchGroup(s, selected).bay;
    const front = selected && blocker(s, selected);
    const key = `${selected?.id ?? ''}:${bay?.id ?? ''}:${front?.id ?? ''}`;
    if (this.routeKey !== key) {
      this.routeKey = key; this.route.geometry.dispose();
      this.route.geometry = new THREE.BufferGeometry().setFromPoints(selected ? (front ? [selected.position, front.position] : entryPath(selected, bay?.id)).map(p => new THREE.Vector3(p.x, 0.15, p.z)) : []);
      (this.route.material as THREE.LineDashedMaterial).color.set(front ? 0xff6748 : 0xffe8a0);
      this.route.computeLineDistances();
    }
    this.route.visible = !!selected;
    this.renderer.render(this.scene, this.camera);
  }
  walkPoint(origin: Point, end: Point, fraction: number): Point {
    const path = [origin, { x: origin.x, z: -2.3 }, { x: end.x, z: -2.3 }, end];
    const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.z - path[i]!.z));
    let remaining = lengths.reduce((a, b) => a + b, 0) * fraction;
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i]!;
      if (remaining <= length && length > 0) return { x: path[i]!.x + (path[i + 1]!.x - path[i]!.x) * remaining / length, z: path[i]!.z + (path[i + 1]!.z - path[i]!.z) * remaining / length };
      remaining -= length;
    }
    return end;
  }
  reset() {
    for (const object of [...this.vehicles.values(), ...this.people.values()]) {
      this.scene.remove(object); object.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); if (child.name === 'selection') (child.material as THREE.Material).dispose(); } });
    }
    this.vehicles.clear(); this.people.clear(); this.overlay.replaceChildren(); this.labels.clear(); this.routeKey = ''; this.route.visible = false; this.visualTime = 0;
  }
  setQuality(low: boolean) { this.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.7)); this.renderer.shadowMap.enabled = !low; this.resize(); }
  inspect() {
    return { scenery: this.element.dataset.scenery, calls: this.renderer.info.render.calls,
      people: [...this.people].filter(([, p]) => p.visible).map(([id, p]) => ({ id, position: p.position.toArray(), turn: p.rotation.y, arm: p.getObjectByName('rightArm')!.rotation.x })) };
  }
  release(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(material); Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  }
  dispose() {
    this.disposed = true; this.events.abort(); this.observer.disconnect(); this.release(this.scene);
    this.route.geometry.dispose(); (this.route.material as THREE.Material).dispose(); this.renderer.dispose();
    this.renderer.domElement.remove(); this.overlay.remove(); this.landmark.remove(); this.sceneryStatus.remove();
  }
}
