import * as T from 'three';
import type { Battle } from './rules.js';
import { moduleAimPoint, toScreen } from './scene-space.js';
/** Map visible module geometry back to rule coordinates without changing combat rules. */
export function pickModule(
  x: number,
  y: number,
  b: Battle,
  camera: T.PerspectiveCamera,
  models: ReadonlyMap<string, T.Group>,
) {
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(x / 480 - 1, 1 - y / 270), camera);
  for (const hit of ray.intersectObjects([...models.values()], true)) {
    for (const [id, model] of models) {
      let parent: T.Object3D | null = hit.object;
      while (parent && parent !== model) parent = parent.parent;
      const m = b.modules.find((n) => n.id === id);
      if (parent && m && m.hp > 0) return { x: m.x, y: m.y };
    }
  }
  const nearest = b.modules
    .filter((m) => m.hp > 0)
    .map((m) => ({ m, p: toScreen(moduleAimPoint(m, b), camera) }))
    .map((t) => ({ ...t, distance: Math.hypot(t.p.x - x, t.p.y - y) }))
    .sort((a, c) => a.distance - c.distance)[0];
  return nearest && nearest.distance < 38 ? { x: nearest.m.x, y: nearest.m.y } : null;
}
