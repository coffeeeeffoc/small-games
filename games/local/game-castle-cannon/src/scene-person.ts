import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MeshKit } from './scene-mesh.js';
export type PersonPose = 'march' | 'load' | 'aim';
/** One original infantry model reused for soldiers, guards and posed gun crew. */
export function createPerson(k: MeshKit, blue: boolean, pose: PersonPose) {
  const g = new T.Group(),
    tunic = blue ? '#226b9f' : '#8d3627',
    helmet = blue ? '#367db0' : '#8d493b';
  rounded(k, g, 0, 0.8, 0, 0.62, 0.72, 0.46, tunic);
  k.box(g, 0, 0.57, 0.02, 0.62, 0.08, 0.45, '#725034', 0.04);
  for (const side of [-1, 1]) {
    rounded(k, g, side * 0.17, 0.26, 0, 0.24, 0.5, 0.28, '#473d32');
    rounded(k, g, side * 0.17, 0.065, 0.08, 0.27, 0.16, 0.4, '#473d32');
  }
  k.sphere(g, 0, 1.35, 0, 0.31, '#d9ac78');
  for (const side of [-1, 1]) {
    k.sphere(g, side * 0.1, 1.36, 0.288, 0.063, '#fff0ce');
    k.sphere(g, side * 0.1, 1.36, 0.343, 0.034, '#473d32');
  }
  k.sphere(g, 0, 1.27, 0.313, 0.064, '#d9ac78');
  for (const side of [-1, 1]) {
    const beard = k.sphere(g, side * 0.085, 1.22, 0.31, 0.078, '#5b4030');
    beard.scale.set(1.35, 0.45, 0.65);
    k.sphere(g, side * 0.3, 1.31, 0.025, 0.064, '#d9ac78');
    const cheekGuard = rounded(k, g, side * 0.27, 1.27, 0.035, 0.075, 0.3, 0.23, helmet);
    (cheekGuard.material as T.MeshStandardMaterial).metalness = 0.35;
  }
  k.box(g, 0, 1.11, 0.1, 0.44, 0.12, 0.42, '#ece0b7', 0.04);
  const cap = k.mesh(
    g,
    new T.SphereGeometry(0.36, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    helmet,
    0,
    1.43,
    0,
    0.45,
  );
  cap.scale.y = 0.9;
  k.cylinder(g, 0, 1.43, 0, 0.38, 0.38, 0.065, '#314e60', 0.4);
  k.box(g, 0, 1.77, 0, 0.08, 0.13, 0.28, helmet, 0.04);
  for (const side of [-1, 1]) {
    const arm = rounded(
      k,
      g,
      side * 0.35,
      pose === 'march' ? 0.86 : 1.01,
      pose === 'march' ? 0.03 : 0.3,
      0.2,
      0.52,
      0.23,
      tunic,
    );
    arm.rotation.x = pose === 'march' ? 0 : -0.85;
    arm.rotation.z = pose === 'load' ? side * 0.55 : side * 0.12;
    k.sphere(
      g,
      side * (pose === 'load' ? 0.19 : 0.39),
      pose === 'march' ? 0.6 : 1.1,
      pose === 'march' ? 0.04 : 0.53,
      0.11,
      '#d9ac78',
    );
  }
  if (pose === 'load') k.sphere(g, 0, 1.15, 0.64, 0.23, '#3c4240', 0.65);
  else if (pose === 'aim') {
    const rammer = k.cylinder(g, -0.38, 1.15, 0.5, 0.045, 0.045, 1.8, '#80623e');
    rammer.rotation.x = Math.PI / 2;
    k.sphere(g, -0.38, 1.15, 1.4, 0.11, '#bda984');
  } else {
    k.cylinder(g, 0.44, 1.1, 0, 0.025, 0.025, 1.9, '#a99876');
    k.cylinder(g, 0.44, 2.13, 0, 0, 0.07, 0.2, '#c6c3ac', 0.45);
  }
  k.compact(g);
  return g;
}

function rounded(
  k: MeshKit,
  parent: T.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
) {
  const key = `cloth:${w}:${h}:${d}`;
  if (!k.geometries.has(key))
    k.geometries.set(key, new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.27));
  return k.mesh(parent, k.geometries.get(key)!, color, x, y, z);
}
