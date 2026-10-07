import * as T from 'three';
import type { Battle } from './rules.js';
import type { View } from './view.js';
import type { cannonModel } from './scene-cannon.js';
import { moduleAimPoint } from './scene-space.js';
/** The real carriage and elevation pivot follow the same target as the aiming arc. */
export function orientCannon(cannon: ReturnType<typeof cannonModel>, b: Battle, v: View) {
  const aim = v.aim ?? b.shots.at(-1);
  if (!aim) return false;
  const module = b.modules.find((m) => Math.hypot(m.x - aim.x, m.y - aim.y) < 2),
    target = module ? moduleAimPoint(module, b) : new T.Vector3(8, 0.5, 10),
    pivot = cannon.base.position.clone().add(new T.Vector3(0, 3.1 * cannon.base.scale.y, 0)),
    delta = target.sub(pivot),
    yaw = T.MathUtils.clamp(Math.atan2(-delta.x, -delta.z), -1.7, -0.4),
    pitch = T.MathUtils.clamp(Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) + 0.1, 0.05, 0.8),
    changed =
      Math.abs(cannon.base.rotation.y - yaw) + Math.abs(cannon.barrel.rotation.x - pitch) > 0.02,
    blend = v.p.motion ? 0.45 : 1;
  cannon.base.rotation.y = T.MathUtils.lerp(cannon.base.rotation.y, yaw, blend);
  cannon.barrel.rotation.x = T.MathUtils.lerp(cannon.barrel.rotation.x, pitch, blend);
  return changed;
}
