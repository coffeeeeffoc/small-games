import { PerspectiveCamera, Vector3 } from 'three';
import type { Battle, Module } from './rules.js';
export interface TargetPoint {
  ruleX: number;
  ruleY: number;
  x: number;
  y: number;
  hp: number;
}
export function siegeCamera() {
  const camera = new PerspectiveCamera(44, 16 / 9, 0.5, 380);
  camera.position.set(-25, 16, 47);
  camera.lookAt(0, 7, 1);
  camera.updateMatrixWorld();
  return camera;
}
export function modulePosition(m: Module, b: Battle) {
  if (m.kind === 'gate') return new Vector3(11.5, 5.7, 14);
  if (m.kind === 'obstacle') return new Vector3(20, 1.2, 5.5);
  const towers = b.modules.filter((n) => n.kind === 'tower');
  const i = towers.findIndex((n) => n.id === m.id);
  const first = towers[0]!;
  return i === 0
    ? new Vector3(-2, 23, 8)
    : new Vector3(-2 + (m.x - first.x) * 0.1, 28, 8 - (m.y - first.y) * 0.02);
}
export function soldierPosition(x: number, id: number) {
  const progress = (x - 590) * 0.075 - Math.floor(id / 3) * 2.5;
  // Each row passes through the gap before turning along the visible inner approach.
  return new Vector3(
    11.5 + Math.min(8.5, Math.max(0, progress)) + ((id % 3) - 1) * 1.15,
    0,
    14 - progress,
  );
}
export function moduleAimPoint(m: Module, b: Battle) {
  const p = modulePosition(m, b);
  if (m.kind === 'tower') {
    p.y -= 4;
    p.z += 2.8;
    p.x -= 0.8;
  } else p.z += 0.4;
  return p;
}
export function toScreen(point: Vector3, camera: PerspectiveCamera) {
  const p = point.clone().project(camera);
  return { x: (p.x + 1) * 480, y: (1 - p.y) * 270 };
}
