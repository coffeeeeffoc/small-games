import {
  Color,
  instantiate,
  isValid,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  resources,
  Texture2D,
} from 'cc';
import { material, MeshBatch, palette as P } from './SceneArt';
import type { KartState } from './KartPhysics';

export class KartView {
  root: Node;
  body: Node;
  sparks: Node;
  flame: Node;
  modelLoaded = false;
  constructor(parent: Node, color: string) {
    this.root = new Node('Kart');
    parent.addChild(this.root);
    const b = new MeshBatch();
    b.box(color, 0, 0.56, 0, 1.35, 0.42, 2.35);
    b.ball(color, 0, 0.6, 0.9, 1.45, 0.55, 1.1);
    b.box(P.white, 0, 0.82, 0.65, 0.27, 0.08, 1.3);
    b.box(P.navy, 0, 0.85, -0.45, 0.85, 0.6, 0.65);
    b.box(P.navy, 0, 0.35, 1.35, 1.8, 0.2, 0.25);
    b.box(P.navy, 0, 0.35, -1.25, 1.7, 0.2, 0.25);
    b.ball(P.yellow, 0, 1.26, -0.25, 0.75, 0.85, 0.65);
    b.ball(color, 0, 1.8, -0.25, 1, 0.92, 0.9);
    b.ball(P.navy, 0, 1.85, 0.12, 0.82, 0.28, 0.15);
    b.ball(P.white, -0.24, 2, -0.06, 0.18, 0.18, 0.1);
    this.body = b.build(this.root, 'Body');
    const wheels = new MeshBatch();
    for (const x of [-0.85, 0.85])
      for (const z of [-0.8, 0.78]) {
        wheels.ball(P.navy, x, 0.42, z, 0.5, 0.82, 0.82);
        wheels.ball(P.white, x * 1.22, 0.42, z, 0.08, 0.4, 0.4);
      }
    const tires = wheels.build(this.root, 'Tires');
    resources.load('models/kart/kart', Prefab, (error, prefab) => {
      if (error) {
        console.warn('[carding-car] using procedural kart fallback');
        return;
      }
      if (!isValid(this.root)) return;
      const model = instantiate(prefab);
      this.root.addChild(model);
      model.setScale(1.4, 1.4, 1.4);
      model.setPosition(0, 0.843, 0);
      for (const renderer of model.getComponentsInChildren(MeshRenderer)) {
        const original = renderer.sharedMaterials[0],
          texture = original?.getProperty('emissiveMap') || original?.getProperty('mainTexture');
        const unlit = new Material();
        unlit.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
        unlit.setProperty('mainColor', Color.WHITE);
        if (texture instanceof Texture2D) unlit.setProperty('mainTexture', texture);
        renderer.setMaterial(unlit, 0);
      }
      this.body.active = false;
      tires.active = false;
      this.body = model;
      this.modelLoaded = true;
      const number = new MeshBatch();
      number.ball(color, 0, 2.35, -0.1, 0.3, 0.3, 0.3);
      number.build(this.root, 'DriverColor');
    });
    const spark = new MeshBatch();
    for (const x of [-0.95, 0.95])
      for (let i = 0; i < 3; i++)
        spark.box(P.yellow, x + i * 0.06, 0.35, -0.95 - i * 0.3, 0.12, 0.15, 0.32);
    this.sparks = spark.build(this.root, 'DriftSparks');
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
    this.body.setRotationFromEuler(k.airborne ? -6 : 0, 0, k.drifting ? k.driftSide * 5 : 0);
    this.sparks.active = k.charge > 0.2;
    for (const renderer of this.sparks.getComponentsInChildren(MeshRenderer))
      renderer.setMaterial(material(k.tier === 2 ? P.yellow : P.mint), 0);
    this.sparks.setScale(k.tier === 2 ? 1.4 : 1, 1, 0.8 + Math.sin(time * 45) * 0.2);
    this.flame.active = k.boost > 0;
    this.flame.setScale(1, 1, 1 + Math.sin(time * 50) * 0.2);
  }
}
