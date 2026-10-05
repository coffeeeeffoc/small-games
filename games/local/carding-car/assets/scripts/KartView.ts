import { isValid, JsonAsset, MeshRenderer, Node, Prefab, primitives } from 'cc';
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
  pet?: Node;
  private petHeight = 2.3;
  protection: Node;
  constructor(
    parent: Node,
    color: string,
    selection: Selection,
    equipment?: { decoration: string; pet: string },
  ) {
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
            bounds?: [number[], number[]];
            driverMount?: { x: number; y: number; z: number; scale: number };
          }[];
        }
      ).models.find((m) => m.category === 'vehicles' && m.id === selection.vehicle);
      const mount = config?.driverMount ?? { x: 0, y: 0.3, z: -0.25, scale: 1 };
      this.driver.setPosition(mount.x, mount.y, mount.z);
      this.driver.setScale(mount.scale, mount.scale, mount.scale);
      this.addEquipment(equipment, config?.bounds?.[1]?.[1] ?? 1.2);
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
  private addEquipment(equipment: { decoration: string; pet: string } | undefined, height: number) {
    if (!equipment) return;
    // Rear mounts clear the cockpit and inherit the body's drift, spin and jump pose.
    if (['racing-stripes', 'halo', 'comet'].includes(equipment.decoration)) {
      const decoration = new MeshBatch();
      for (const x of [-0.55, 0.55])
        decoration.box(P.navy, x, (height + 0.53) / 2, -1.1, 0.07, height - 0.17, 0.1);
      if (equipment.decoration === 'racing-stripes') {
        decoration.box(P.blue, 0, height + 0.18, -1.1, 1.4, 0.12, 0.5);
        for (const x of [-0.23, 0.23]) {
          decoration.box(P.white, x, height + 0.25, -1.1, 0.18, 0.025, 0.52);
          decoration.box(P.white, x, height + 0.18, -1.36, 0.18, 0.14, 0.025);
        }
      } else if (equipment.decoration === 'halo') {
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8;
          decoration.box(
            P.yellow,
            Math.sin(a) * 0.6,
            height + 0.18,
            -1.1 + Math.cos(a) * 0.6,
            0.14,
            0.1,
            0.25,
            a + Math.PI / 2,
          );
        }
      } else {
        decoration.box(P.navy, 0, height + 0.18, -1.1, 1.4, 0.12, 0.16);
        decoration.ball(P.red, -0.35, height + 0.43, -1.1, 0.5);
        for (let i = 0; i < 3; i++)
          decoration.ball(
            P.yellow,
            i * 0.27,
            height + 0.48 + i * 0.08,
            -1.1,
            0.5 - i * 0.12,
            0.3 - i * 0.08,
            0.28 - i * 0.07,
          );
      }
      decoration.build(this.body, `Decoration:${equipment.decoration}`);
    }
    if (!['cloud-cat', 'star-bot', 'mini-dragon'].includes(equipment.pet)) return;
    const pet = new MeshBatch();
    if (equipment.pet === 'cloud-cat') {
      for (const x of [-0.3, 0, 0.3]) pet.ball(P.white, x, -0.2, 0.05, 0.5, 0.28, 0.5);
      pet.ball(P.white, 0, 0.13, 0, 0.65, 0.55, 0.5);
      for (const x of [-0.22, 0.22]) {
        pet.add(
          P.white,
          primitives.cone(0.5, 1, { radialSegments: 4 }),
          x,
          0.43,
          0,
          0.22,
          0.3,
          0.22,
        );
        pet.ball(P.red, x, 0.42, -0.06, 0.1, 0.15, 0.08);
      }
      for (const x of [-0.13, 0.13]) pet.ball(P.navy, x, 0.18, -0.23, 0.09);
      pet.ball(P.red, 0, 0.06, -0.26, 0.08);
      pet.ball(P.white, 0.42, 0.1, 0.1, 0.2, 0.5, 0.2);
    } else if (equipment.pet === 'star-bot') {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        pet.box(P.yellow, Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3, 0.2, 0.18, 0.48, a);
      }
      pet.box(P.navy, 0, 0.12, 0, 0.42, 0.35, 0.42);
      pet.box(P.mint, 0, 0.14, -0.22, 0.34, 0.22, 0.03);
      for (const x of [-0.09, 0.09]) pet.box(P.white, x, 0.16, -0.24, 0.06, 0.07, 0.025);
      pet.box(P.navy, 0, 0.4, 0, 0.05, 0.22, 0.05);
      pet.ball(P.yellow, 0, 0.53, 0, 0.18);
    } else {
      pet.ball(P.mint, 0, 0, 0.1, 0.42, 0.42, 0.75);
      pet.ball(P.mint, 0, 0.25, -0.27, 0.48);
      pet.ball(P.yellow, 0, -0.02, -0.18, 0.28, 0.25, 0.32);
      for (const x of [-0.14, 0.14]) {
        pet.add(
          P.yellow,
          primitives.cone(0.5, 1, { radialSegments: 4 }),
          x,
          0.52,
          -0.25,
          0.14,
          0.25,
          0.14,
        );
        pet.ball(P.navy, x, 0.3, -0.48, 0.08);
      }
      for (const x of [-0.45, 0.45]) pet.ball(P.red, x, 0.08, 0.12, 0.65, 0.1, 0.5);
      pet.ball(P.mint, 0, -0.05, 0.58, 0.16, 0.15, 0.6);
    }
    this.pet = pet.build(this.root, `Pet:${equipment.pet}`);
    this.petHeight = Math.max(2.3, height + 0.9);
    this.pet.setPosition(0.9, this.petHeight, -2.1);
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
    if (this.pet) {
      this.pet.setPosition(
        0.9 + Math.sin(time * 2.5) * 0.08,
        this.petHeight + Math.sin(time * 3) * 0.13,
        -2.1 + Math.cos(time * 2) * 0.1,
      );
      this.pet.setRotationFromEuler(0, Math.sin(time * 2) * 12, Math.sin(time * 3) * 6);
    }
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
