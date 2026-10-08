import * as T from 'three';
import type { CanvasGameTarget, CanvasRenderSurface } from '@coffeeeeffoc/canvas-game-adapter';
import { MeshKit } from './scene-mesh.js';
import { loadSceneMaterials } from './scene-assets.js';
import { siegeLight } from './scene-lighting.js';
import { SceneFrame } from './scene-frame.js';
import { disposeVariantGeometry } from './scene-compact.js';
import { duelWorld } from './duel-world.js';
import { activeGun, gunDirection } from './duel-actions.js';
import { direction } from './duel-types.js';
import type { DuelView } from './duel-session.js';
export class DuelScene {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(52, 16 / 9, 0.2, 550);
  readonly kit = new MeshKit();
  readonly renderer: T.WebGLRenderer;
  private frame: SceneFrame;
  private world: ReturnType<typeof duelWorld> | null = null;
  private environment: () => void;
  private projectiles = new Map<number, T.Mesh>();
  private blasts = new Map<number, T.Mesh>();
  private trails = [0, 1].map(
    () =>
      new T.Line(
        new T.BufferGeometry(),
        new T.LineBasicMaterial({ color: '#efbf6d', transparent: true, opacity: 0.45 }),
      ),
  );
  private match = '';
  private rendered = 0;
  private lowPower = false;
  constructor(
    private surface: CanvasRenderSurface,
    context: WebGL2RenderingContext,
  ) {
    this.frame = new SceneFrame(context);
    this.renderer = new T.WebGLRenderer({
      canvas: surface.canvas as HTMLCanvasElement,
      context,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(768, 432, false);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.environment = siegeLight(this.scene, this.renderer);
    this.scene.fog = new T.Fog('#c1d0dc', 160, 470);
    this.scene.add(...this.trails);
  }
  async loadMaterials(load: NonNullable<CanvasGameTarget['loadImage']>) {
    await loadSceneMaterials(this.kit, load);
  }
  render(v: DuelView) {
    if (!this.frame.ready()) return this.surface.image;
    if (this.lowPower !== v.p.lowPower) {
      this.lowPower = v.p.lowPower;
      this.renderer.setSize(this.lowPower ? 384 : 768, this.lowPower ? 216 : 432, false);
    }
    if (!this.world) this.world = duelWorld(this.kit, this.scene, v.duel);
    const d = direction(v.side),
      me = v.duel.fighters[v.side],
      gun = activeGun(me) ?? me.guns[0]!;
    if (this.match !== v.matchId) {
      this.match = v.matchId;
      for (const mesh of this.blasts.values()) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
      }
      this.blasts.clear();
    }
    for (const s of v.duel.structures) {
      const cell = this.world.cells.get(s.id)!;
      cell.intact.visible = s.hp > 0;
      cell.debris.visible = s.hp <= 0;
      cell.cracks.visible = s.hp > 0 && s.hp < s.maxHp * 0.7;
    }
    for (const item of this.world.guns) {
      const p = v.duel.fighters[item.side],
        g = p.guns.find((g) => g.id === item.id)!;
      item.base.visible = g.bunker === p.destroyed;
      item.base.rotation.z = g.hp > 0 ? 0 : 0.16;
      const vector = gunDirection(item.side, g);
      item.base.rotation.y = Math.atan2(-vector.x, -vector.z);
      item.barrel.rotation.x = (g.pitch * Math.PI) / 180;
      item.barrel.position.z = Math.max(0, 0.2 - (v.duel.time - g.firedAt)) * 2;
    }
    for (const p of v.duel.fighters) {
      const figure = this.world.people[p.side]!,
        g = activeGun(p);
      const loading = !!g && (g.reload < 1 || g.repair !== null) && !p.crouched && !p.route.length;
      figure.march.visible = !loading;
      figure.load.visible = loading;
      figure.group.position.set(p.position.x, p.position.y, p.position.z);
      figure.group.rotation.y = (Math.PI / 2) * direction(p.side);
      figure.group.rotation.z = p.hp <= 0 ? -Math.PI / 2 : p.crouched ? -1.1 : 0;
      figure.group.scale.y = p.crouched ? 0.45 : 1;
      if (p.route.length && v.p.motion)
        figure.group.position.y += Math.abs(Math.sin(v.duel.time * 11)) * 0.09;
    }
    this.kit.applySkin(v.p.skin);
    const live = new Set(v.duel.shells.map((s) => s.id));
    for (const [id, mesh] of this.projectiles)
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.projectiles.delete(id);
      }
    for (const s of v.duel.shells) {
      let mesh = this.projectiles.get(s.id);
      if (!mesh) {
        mesh = this.kit.sphere(this.scene, 0, 0, 0, 0.27, '#373332', 0.6);
        this.projectiles.set(s.id, mesh);
      }
      mesh.position.set(s.position.x, s.position.y, s.position.z);
    }
    for (const p of v.duel.fighters) {
      const points = p.lastShot?.trail ?? [];
      const trail = this.trails[p.side]!;
      trail.visible = points.length > 1;
      if (points.length) {
        trail.geometry.dispose();
        trail.geometry = new T.BufferGeometry().setFromPoints(
          points.map((p) => new T.Vector3(p.x, p.y, p.z)),
        );
      }
    }
    const explosions = new Set(v.duel.impacts.map((i) => i.id));
    for (const [id, mesh] of this.blasts)
      if (!explosions.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
        this.blasts.delete(id);
      }
    for (const i of v.duel.impacts) {
      let mesh = this.blasts.get(i.id);
      if (!mesh) {
        mesh = new T.Mesh(
          new T.SphereGeometry(1, 12, 8),
          new T.MeshBasicMaterial({
            color: '#f4aa55',
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
          }),
        );
        mesh.position.set(i.position.x, i.position.y + 0.3, i.position.z);
        this.scene.add(mesh);
        this.blasts.set(i.id, mesh);
      }
      const age = v.duel.time - i.at;
      mesh.scale.setScalar(0.5 + age * 3);
      (mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, 0.65 - age * 0.7);
      (mesh.material as T.MeshBasicMaterial).color.set(age > 0.4 ? '#5b5045' : '#ffc776');
    }
    const main = ['home', 'maps', 'matching', 'skins'].includes(v.screen);
    if (main) {
      this.camera.fov = 48;
      this.camera.position.set(-85 * d, 15, 32 * d);
      this.camera.lookAt(-61 * d, 4.5, 2 * d);
    } else if (v.scope) {
      this.camera.fov = 15;
      this.camera.position.set(gun.position.x - 3 * d, gun.position.y + 7, gun.position.z + 2 * d);
      this.camera.lookAt(62 * d, 3.5 + v.scopeY, -v.scopeX * d);
    } else if (me.node === 'shelter' && !me.route.length) {
      this.camera.fov = 49;
      this.camera.position.set(-66 * d, 3.5, 6 * d);
      this.camera.lookAt(-69 * d, 1.2, 0);
    } else {
      this.camera.fov = 52;
      this.camera.position.set(
        gun.position.x - 5 * d,
        gun.position.y + 4.5,
        gun.position.z + 2 * d,
      );
      this.camera.lookAt(gun.position.x + 32 * d, gun.position.y + 1.5, gun.position.z - d);
    }
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.renderer.shadowMap.enabled = !v.p.lowPower;
    this.renderer.render(this.scene, this.camera);
    this.frame.submitted();
    this.rendered++;
    return this.surface.image;
  }
  metrics() {
    return {
      renderer: 'three-duel',
      frames: this.rendered,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
  dispose() {
    this.frame.dispose();
    this.environment();
    for (const line of this.trails) {
      line.geometry.dispose();
      (line.material as T.Material).dispose();
    }
    for (const cell of this.world?.cells.values() ?? []) {
      cell.cracks.geometry.dispose();
      (cell.cracks.material as T.Material).dispose();
    }
    for (const mesh of this.blasts.values()) {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
    }
    this.kit.dispose();
    this.scene.traverse(disposeVariantGeometry);
    this.renderer.dispose();
    this.surface.dispose();
  }
}
export function createDuelScene(factory: CanvasGameTarget['createRenderSurface']) {
  if (!factory) return null;
  let surface: CanvasRenderSurface | null = null;
  try {
    surface = factory(1280, 720);
    const gl = surface?.canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (surface && gl) return new DuelScene(surface, gl);
  } catch {
    /* Render surface may be unavailable in a native host. */
  }
  surface?.dispose();
  return null;
}
