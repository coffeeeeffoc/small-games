import * as T from 'three';
import type { Battle } from './rules.js';
import type { View } from './view.js';
import type { cannonModel } from './scene-cannon.js';
import { worldAimPoint } from './scene-space.js';
/** The real carriage and elevation pivot follow the same target as the aiming arc. */
export function orientCannon(cannon: ReturnType<typeof cannonModel>, b: Battle, v: View) {
  const aim = v.aim ?? b.shots.at(-1);
  if (!aim) return false;
  const target = worldAimPoint(aim, b),
    pivot = cannon.base.position.clone().add(new T.Vector3(0, 3.1 * cannon.base.scale.y, 0)),
    delta = target.sub(pivot),
    yaw = Math.atan2(-delta.x, -delta.z),
    turn = Math.atan2(
      Math.sin(yaw - cannon.base.rotation.y),
      Math.cos(yaw - cannon.base.rotation.y),
    ),
    pitch = T.MathUtils.clamp(Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) + 0.1, -0.5, 1.25),
    changed = Math.abs(turn) + Math.abs(cannon.barrel.rotation.x - pitch) > 0.02,
    blend = v.p.motion ? 0.45 : 1;
  cannon.base.rotation.y += turn * blend;
  cannon.barrel.rotation.x = T.MathUtils.lerp(cannon.barrel.rotation.x, pitch, blend);
  return changed;
}
