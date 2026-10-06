import * as T from 'three';
import { loadSceneMaterials } from './scene-assets.js';
import { siegeLight } from './scene-lighting.js';
import { SceneFrame } from './scene-frame.js';
import { SceneQuality } from './scene-quality.js';
import { WorldCache } from './scene-world-cache.js';
import { SceneShadows } from './scene-shadows.js';
import { updateTrails } from './scene-trails.js';
import { TroopBatch } from './scene-troop-batch.js';
import { disposeVariantGeometry } from './scene-compact.js';
import { pickModule } from './scene-picking.js';
import { MeshKit } from './scene-mesh.js';
import { terrain } from './scene-terrain.js';
import { foreground } from './scene-foreground.js';
import { castleShell, moduleModel } from './scene-castle.js';
import { towerRubble } from './scene-damage.js';
import { cannonModel } from './scene-cannon.js';
import { orientCannon } from './scene-gun.js';
import { animateTroops } from './scene-units.js';
import { brokenGateLeaves } from './scene-gatehouse.js';
import { SiegeEffects } from './scene-effects.js';
import {
  siegeCamera,
  modulePosition,
  moduleAimPoint,
  toScreen,
  type TargetPoint,
} from './scene-space.js';
import type { View } from './view.js';
import type { Battle } from './rules.js';
import type { CanvasRenderSurface, CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
export type { TargetPoint } from './scene-space.js';
export class SiegeScene {
  readonly scene = new T.Scene();
  readonly camera = siegeCamera();
  readonly kit = new MeshKit();
  readonly renderer: T.WebGLRenderer;
  private modules = new Map<string, T.Group>();
  private rubble = new Map<string, T.Group>();
  private troops: T.Group[] = [];
  private troopBatch: TroopBatch | null = null;
  private battle: Battle | null = null;
  private world: WorldCache;
  private shadows = new SceneShadows();
  private renderMs = 0;
  private submittedFrames = 0;
  private frame: SceneFrame;
  private quality = new SceneQuality();
  private frameBattleTime = 0;
  private lowPower = false;
  private lastFrame = Date.now();
  private frameIntervals: number[] = [];
  private contactMaterial = new T.MeshBasicMaterial({
    color: '#343323',
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  private environment: () => void;
  private cannon;
  private effects;
  private aim = new T.Line(
    new T.BufferGeometry(),
    new T.LineDashedMaterial({
      color: '#ffc45c',
      dashSize: 0.35,
      gapSize: 0.25,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private reticle = new T.Mesh(
    new T.RingGeometry(0.58, 0.72, 24),
    new T.MeshBasicMaterial({ color: '#ffce68', depthTest: false, depthWrite: false }),
  );
  private arrow = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ color: '#ffc875' }));
  constructor(
    private surface: CanvasRenderSurface,
    context: WebGL2RenderingContext,
    cacheWorld = true,
  ) {
    this.frame = new SceneFrame(context);
    this.renderer = new T.WebGLRenderer({
      canvas: surface.canvas as HTMLCanvasElement,
      context,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(768, 432, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.environment = siegeLight(this.scene, this.renderer);
    const roots = [terrain(this.kit), castleShell(this.kit), foreground(this.kit)];
    this.scene.add(...roots);
    this.world = new WorldCache(this.renderer, roots, cacheWorld);
    this.cannon = cannonModel(this.kit);
    this.scene.add(this.cannon.base);
    this.effects = new SiegeEffects(this.kit);
    this.aim.renderOrder = 5;
    this.reticle.renderOrder = 6;
    this.scene.add(this.effects.group, this.aim, this.reticle, this.arrow);
    this.world.registerDynamic(this.cannon.base);
    this.world.registerDynamic(this.effects.group);
    for (const object of [this.aim, this.reticle, this.arrow]) this.world.registerDynamic(object);
  }
  private reset(b: Battle) {
    this.quality.apply(this.scene, false);
    if (this.troopBatch) {
      this.scene.remove(this.troopBatch.root);
      this.troopBatch.dispose();
    }
    this.cannon.base.rotation.y = -1.15;
    this.cannon.barrel.rotation.x = 0.3;
    this.shadows.reset(this.renderer);
    for (const object of [...this.modules.values(), ...this.rubble.values(), ...this.troops]) {
      this.scene.remove(object);
      object.traverse(disposeVariantGeometry);
    }
    this.modules.clear();
    this.rubble.clear();
    this.troops = [];
    for (const m of b.modules) {
      const model = moduleModel(this.kit, m, b);
      this.modules.set(m.id, model);
      this.scene.add(model);
      this.world.registerDynamic(model);
      const debris = new T.Group(),
        p = modulePosition(m, b);
      if (m.kind === 'tower') towerRubble(this.kit, debris, p.x, p.z);
      for (let i = 0; m.kind !== 'tower' && i < 14; i++) {
        const x = p.x + Math.sin(i * 2.7) * (m.kind === 'gate' ? 4 : 3),
          z = p.z + (m.kind === 'gate' ? 2.5 : i % 2 ? 6.5 : 0) + Math.cos(i * 3) * 2;
        if (m.kind === 'gate') {
          const board = this.kit.box(debris, x, 0.25, z, 0.5, 0.35, 2.5, '#a07944');
          board.rotation.y = i * 2;
        } else this.kit.rock(debris, x, 0.3, z, 0.45 + (i % 3) * 0.22, '#c9b58e');
      }
      if (m.kind === 'gate') brokenGateLeaves(this.kit, debris, p.x, p.z);
      this.kit.compact(debris);
      this.rubble.set(m.id, debris);
      this.scene.add(debris);
      this.world.registerDynamic(debris);
    }
    this.troopBatch = new TroopBatch(this.kit, b.units.length, this.contactMaterial);
    this.troops = this.troopBatch.poses;
    this.scene.add(this.troopBatch.root);
    this.world.registerDynamic(this.troopBatch.root);
    this.battle = b;
    this.renderer.shadowMap.needsUpdate = true;
  }
  targets(b: Battle): TargetPoint[] {
    return b.modules.map((m) => ({
      ruleX: m.x,
      ruleY: m.y,
      hp: m.hp,
      ...toScreen(moduleAimPoint(m, b), this.camera),
    }));
  }
  pick(x: number, y: number, b: Battle) {
    return pickModule(x, y, b, this.camera, this.modules) ?? { x: 230, y: 100 };
  }
  needsFrame() {
    return this.frame.pending;
  }
  get image() {
    return this.surface.image;
  }
  render(v: View) {
    if (this.battle !== v.b) {
      this.reset(v.b);
      this.quality.apply(this.scene, v.p.lowPower);
    }
    if (!this.frame.ready()) return this.surface.image;
    if (this.lowPower !== v.p.lowPower) {
      this.lowPower = v.p.lowPower;
      this.renderer.setSize(this.lowPower ? 384 : 768, this.lowPower ? 216 : 432, false);
      this.renderer.shadowMap.enabled = !this.lowPower;
      this.renderer.shadowMap.needsUpdate = true;
      this.quality.apply(this.scene, this.lowPower);
    }
    const began = Date.now();
    this.frameIntervals.push(began - this.lastFrame);
    this.frameIntervals = this.frameIntervals.slice(-30);
    this.lastFrame = began;
    const b = v.b;
    this.kit.applySkin(v.p.skin);
    this.quality.sync();
    for (const m of b.modules) {
      const model = this.modules.get(m.id)!,
        debris = this.rubble.get(m.id)!;
      const age = m.destroyedAt === null ? 0 : b.time - m.destroyedAt;
      debris.visible = m.hp <= 0;
      model.visible = m.hp > 0 || m.kind === 'tower';
      const facing = model.userData.facing as T.Group | undefined;
      if (facing) facing.visible = m.hp === m.maxHp;
      const sections = model.userData.sections as T.Group[] | undefined;
      const stump = model.userData.stump as T.Group | undefined;
      if (stump) stump.visible = m.hp <= 0;
      if (sections && m.hp <= 0)
        for (let i = 1; i < sections.length; i++) {
          const section = sections[i]!,
            t = Math.max(0, age - (2 - i) * 0.12);
          section.visible = i === 1 || (v.p.motion && t < 1.15);
          section.rotation.z = i === 1 ? Math.min(1, t) * 0.04 : Math.min(1, t) * (-0.3 + i * 0.08);
          section.position.y =
            Number(section.userData.base) - (i === 1 ? Math.min(1, t) * 0.4 : t * t * (7 + i * 2));
        }
      if (m.hp <= 0 && m.kind === 'tower')
        for (const child of model.children) {
          if (child !== stump && !sections?.includes(child as T.Group)) child.visible = false;
        }
    }
    animateTroops(this.troops, b, v);
    this.troopBatch?.sync();
    this.shadows.update(b, orientCannon(this.cannon, b, v), this.renderer);
    this.cannon.base.updateMatrixWorld(true);
    const origin = this.cannon.barrel.localToWorld(new T.Vector3(0, 0, -3.1));
    this.effects.update(b, v.p.motion, origin);
    updateTrails(v, origin, this.camera, this.aim, this.reticle, this.arrow);
    this.world.draw(
      this.scene,
      this.camera,
      `${v.p.lowPower}:${v.p.skin}:${b.level.id}:${b.modules.map((m) => m.hp).join(',')}`,
    );
    this.frame.submitted();
    this.submittedFrames++;
    this.frameBattleTime = b.time;
    this.renderMs = Date.now() - began;
    return this.surface.image;
  }
  metrics() {
    return {
      renderer: 'three-webgl2',
      submittedFrames: this.submittedFrames,
      frameBattleTime: this.frameBattleTime,
      lowPower: this.lowPower,
      triangles: this.renderer.info.render.triangles,
      calls: this.renderer.info.render.calls,
      cachedWorldTriangles: this.world.worldTriangles,
      cachedWorldCalls: this.world.worldCalls,
      renderMs: this.renderMs,
      meanFrameIntervalMs: Math.round(
        this.frameIntervals.reduce((a, n) => a + n, 0) / this.frameIntervals.length,
      ),
    };
  }
  dispose() {
    this.quality.apply(this.scene, false);
    this.troopBatch?.dispose();
    this.contactMaterial.dispose();
    const materials = new Set<T.Material>();
    this.scene.traverse((o) => {
      disposeVariantGeometry(o);
      if (o instanceof T.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    for (const m of materials) m.dispose();
    this.kit.dispose();
    this.frame.dispose();
    this.quality.dispose();
    this.world.dispose();
    this.environment();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove?.();
    this.surface.dispose();
  }
  loadMaterials(loadImage: NonNullable<CanvasGameTarget['loadImage']>) {
    return loadSceneMaterials(this.kit, loadImage);
  }
}
