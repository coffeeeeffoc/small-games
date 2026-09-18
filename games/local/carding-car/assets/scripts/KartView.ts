import { isValid, JsonAsset, MeshRenderer, Node, Prefab } from 'cc';
import { groundShadow, loadArt, material, MeshBatch, palette as P, placeModel } from './SceneArt';
import type { Selection } from './Selection';
import type { KartState } from './KartPhysics';

export class KartView {
  root: Node;
  body: Node;
  sparks: Node;
  sparkRenderers: MeshRenderer[];
  sparkTier = -1;
  flame: Node;
  shadow: Node;
  modelLoaded = false;
  ready: Promise<void>;
  driver?: Node;
  protection: Node;
  constructor(parent: Node, color: string, selection: Selection) {
    this.root = new Node('Kart');
    parent.addChild(this.root);
    this.shadow = groundShadow(this.root, 2.05, 2.8);
    this.body = new Node('LoadingKart');
    this.root.addChild(this.body);
    this.ready = Promise.all([
      loadArt(`expansion/vehicles/${selection.vehicle}`, Prefab),
      loadArt(`expansion/drivers/${selection.driver}`, Prefab),
      loadArt('expansion/manifest', JsonAsset),
    ]).then(([vehicle, driver, manifest]) => {
      if (!isValid(this.root)) return;
      this.body.destroy();
      this.body = new Node('SelectedKart');
      this.root.addChild(this.body);
      placeModel(vehicle, this.body, selection.vehicle);
      this.driver = placeModel(driver, this.body, selection.driver);
      const config = (
        manifest.json as {
          models: {
            category: string;
            id: string;
            driverMount?: { x: number; y: number; z: number; scale: number };
          }[];
        }
      ).models.find((m) => m.category === 'vehicles' && m.id === selection.vehicle);
      const mount = config?.driverMount ?? { x: 0, y: 0.3, z: -0.25, scale: 1 };
      this.driver.setPosition(mount.x, mount.y, mount.z);
      this.driver.setScale(mount.scale, mount.scale, mount.scale);
      this.modelLoaded = true;
      const number = new MeshBatch();
      number.ball(color, 0, 2.05, -0.1, 0.23, 0.23, 0.23);
      number.build(this.root, 'DriverColor');
    });
    const protection = new MeshBatch();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      protection.ball(P.mint, Math.sin(a) * 1.6, 0.6, Math.cos(a) * 1.8, 0.14);
    }
    this.protection = protection.build(this.root, 'Shield');
    this.protection.active = false;
    const spark = new MeshBatch();
    for (const x of [-0.95, 0.95])
      for (let i = 0; i < 3; i++)
        spark.box(P.yellow, x + i * 0.06, 0.35, -0.95 - i * 0.3, 0.12, 0.15, 0.32);
    this.sparks = spark.build(this.root, 'DriftSparks');
    this.sparkRenderers = this.sparks.getComponentsInChildren(MeshRenderer);
    this.sparks.active = false;
    const flame = new MeshBatch();
    flame.ball(P.mint, 0, 0.5, -1.65, 0.65, 0.5, 1.3);
    flame.ball(P.white, 0, 0.5, -1.35, 0.3, 0.25, 0.6);
    this.flame = flame.build(this.root, 'Boost');
    this.flame.active = false;
  }
  update(k: KartState, time: number) {
    this.root.setPosition(k.x, k.y + Math.sin(time * 18) * Math.min(0.025, k.speed * 0.001), k.z);
    this.root.setRotationFromEuler(0, (k.heading * 180) / Math.PI, 0);
    this.shadow.active = !k.airborne;
    this.body.setRotationFromEuler(
      k.airborne ? -6 : 0,
      (k.spinAngle * 180) / Math.PI,
      k.drifting ? k.driftSide * 5 : k.slip > 0 ? Math.sin(time * 12) * 8 : 0,
    );
    this.driver?.setRotationFromEuler(
      0,
      0,
      k.drifting ? -k.driftSide * 9 : Math.sin(time * 10) * Math.min(2, k.speed * 0.08),
    );
    this.protection.active = k.shield > 0 || k.magnet > 0;
    this.protection.setRotationFromEuler(0, time * 100, 0);
    this.sparks.active = k.charge > 0.2;
    if (this.sparkTier !== k.tier) {
      this.sparkTier = k.tier;
      for (const renderer of this.sparkRenderers)
        renderer.setMaterial(material(k.tier === 2 ? P.yellow : P.mint), 0);
    }
    this.sparks.setScale(k.tier === 2 ? 1.4 : 1, 1, 0.8 + Math.sin(time * 45) * 0.2);
    this.flame.active = k.boost > 0;
    this.flame.setScale(1, 1, 1 + Math.sin(time * 50) * 0.2);
  }
}
