import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MeshKit } from './scene-mesh.js';
import { sculpture } from './scene-sculpture.js';
import infantry from './models/soldier-rodin.json';
import loader from './models/loader-rodin.json';
export type PersonPose = 'march' | 'load' | 'aim';
/** One original infantry model reused for soldiers, guards and posed gun crew. */
export function createPerson(k: MeshKit, blue: boolean, pose: PersonPose) {
  if (pose !== 'aim') {
    const g = new T.Group(),
      key = `soldier:${blue ? 'blue' : 'red'}:${pose}`;
    const model = pose === 'march' ? infantry : loader;
    const maps = model[0]!.maps,
      source = k.pbrMaterial(maps);
    if (!k.materials.has(key)) {
      const material = source.clone(),
        tint = new T.Vector3(...(blue ? [1, 1, 1] : [4.5, 0.45, 0.13]));
      material.userData.tunicTint = tint;
      material.onBeforeCompile = (shader, renderer) => {
        source.onBeforeCompile(shader, renderer);
        shader.uniforms.tunicTint = { value: tint };
        shader.fragmentShader =
          'uniform vec3 tunicTint;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
          float blueCloth = smoothstep(0.015, 0.06, diffuseColor.b - max(diffuseColor.r, diffuseColor.g));
          diffuseColor.rgb *= mix(vec3(1.0), tunicTint, blueCloth);`,
          );
      };
      material.customProgramCacheKey = () => 'rodin-infantry-tunic-v1';
      k.materials.set(key, material);
      k.pbrMaps.set(key, maps);
    }
    sculpture(k, model, { base: g });
    g.traverse((o) => {
      if (o instanceof T.Mesh) o.material = k.materials.get(key)!;
    });
    k.compact(g);
    return g;
  }
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
    const arm = rounded(k, g, side * 0.35, 1.01, 0.3, 0.2, 0.52, 0.23, tunic);
    arm.rotation.x = -0.85;
    arm.rotation.z = side * 0.12;
    k.sphere(g, side * 0.39, 1.1, 0.53, 0.11, '#d9ac78');
  }
  {
    const rammer = k.cylinder(g, -0.38, 1.15, 0.5, 0.045, 0.045, 1.8, '#80623e');
    rammer.rotation.x = Math.PI / 2;
    k.sphere(g, -0.38, 1.15, 1.4, 0.11, '#bda984');
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
