import * as T from 'three';
import type { Aim, Battle } from './rules.js';
import { moduleAimPoint, toScreen } from './scene-space.js';
/** Map visible module geometry back to rule coordinates without changing combat rules. */
export function pickModule(
  x: number,
  y: number,
  b: Battle,
  camera: T.PerspectiveCamera,
  models: ReadonlyMap<string, T.Group>,
): Aim | null {
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(x / 480 - 1, 1 - y / 270), camera);
  for (const hit of ray.intersectObjects([...models.values()], true)) {
    for (const [id, model] of models) {
      let parent: T.Object3D | null = hit.object;
      while (parent && parent !== model) parent = parent.parent;
      const m = b.modules.find((n) => n.id === id);
      if (parent && m && m.hp > 0)
        return {
          x: m.x,
          y: m.y,
          sceneHit: { point: hit.point.clone(), targetId: m.id },
        };
    }
  }
  const nearest = b.modules
    .filter((m) => m.hp > 0)
    .map((m) => ({ m, p: toScreen(moduleAimPoint(m, b), camera) }))
    .map((t) => ({ ...t, distance: Math.hypot(t.p.x - x, t.p.y - y) }))
    .sort((a, c) => a.distance - c.distance)[0];
  return nearest && nearest.distance < 38
    ? {
        x: nearest.m.x,
        y: nearest.m.y,
        sceneHit: { point: moduleAimPoint(nearest.m, b), targetId: nearest.m.id },
      }
    : null;
}

/** Free aiming follows the visible surface, even after its former target was destroyed. */
export function pickSurface(
  x: number,
  y: number,
  camera: T.PerspectiveCamera,
  surfaces: T.Object3D[] = [],
): Aim {
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(x / 480 - 1, 1 - y / 270), camera);
  const point = ray.intersectObjects(surfaces, true)[0]?.point ?? ray.ray.at(80, new T.Vector3());
  return {
    x: T.MathUtils.clamp(220 + (x * 660) / 960, 220, 880),
    y: T.MathUtils.clamp(95 + (y * 265) / 540, 95, 360),
    sceneHit: { point, targetId: null },
  };
}
