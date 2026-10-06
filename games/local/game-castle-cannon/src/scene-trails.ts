import * as T from 'three';
import type { View } from './view.js';
import { moduleAimPoint, modulePosition, soldierPosition } from './scene-space.js';
import { arrowVictim } from './scene-units.js';
export function updateTrails(
  v: View,
  origin: T.Vector3,
  camera: T.Camera,
  aim: T.Line,
  reticle: T.Mesh,
  arrow: T.Line,
) {
  const b = v.b;
  aim.visible = reticle.visible = !!v.aim && v.screen === 'playing';
  if (v.aim) {
    const module = b.modules.find((m) => Math.hypot(m.x - v.aim!.x, m.y - v.aim!.y) < 2),
      point = module ? moduleAimPoint(module, b) : new T.Vector3(8, 0.5, 10);
    reticle.position.copy(point);
    reticle.quaternion.copy(camera.quaternion);
    const points = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20,
        q = origin.clone().lerp(point, t);
      q.y += Math.sin(t * Math.PI) * 3;
      return q;
    });
    aim.geometry.dispose();
    aim.geometry = new T.BufferGeometry().setFromPoints(points);
    aim.computeLineDistances();
  }
  const victim = arrowVictim(b),
    tower = b.modules.find((m) => m.kind === 'tower' && m.hp > 0);
  arrow.visible = !!victim && !!tower && b.time - b.lastArrow < 0.45;
  if (victim && tower && arrow.visible) {
    const point = modulePosition(tower, b).lerp(
      soldierPosition(victim.x, victim.id),
      (b.time - b.lastArrow) / 0.45,
    );
    arrow.geometry.dispose();
    arrow.geometry = new T.BufferGeometry().setFromPoints([
      point,
      point.clone().add(new T.Vector3(-0.5, 0.3, 0.5)),
    ]);
  }
}
