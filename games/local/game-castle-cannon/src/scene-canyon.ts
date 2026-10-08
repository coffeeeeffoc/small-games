import * as T from 'three';
import type { MeshKit } from './scene-mesh.js';
import { landNoise, riverCenter, riverSurface } from './scene-valley.js';
import { sculpture } from './scene-sculpture.js';
import cliff from './models/cliff-rodin.json';

/** Unified mineral material on actual rock faces, using our original limestone source triplanarly. */
export function canyonMaterial(k: MeshKit) {
  const key = '#9a9480:0:0.85:canyon';
  if (k.materials.has(key)) return k.materials.get(key)!;
  const material = k.material('#9a9480').clone();
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vCliffP; varying vec3 vCliffN;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvCliffP=(modelMatrix*vec4(transformed,1.0)).xyz;vCliffN=normalize(mat3(modelMatrix)*normal);',
    );
    shader.fragmentShader = 'varying vec3 vCliffP; varying vec3 vCliffN;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
      vec3 axisWeight=pow(abs(normalize(vCliffN)),vec3(4.0));
      axisWeight/=max(0.001,axisWeight.x+axisWeight.y+axisWeight.z);
      vec3 mineral=texture2D(map,vCliffP.yz*0.22).rgb*axisWeight.x
        +texture2D(map,vCliffP.xz*0.22).rgb*axisWeight.y
        +texture2D(map,vCliffP.xy*0.22).rgb*axisWeight.z;
      float mineralLuma=dot(mineral,vec3(0.2126,0.7152,0.0722));
      diffuseColor.rgb*=mix(mineral,vec3(mineralLuma),0.80)*1.12;
      #endif
      float sediment=sin(vCliffP.y*1.15+sin(vCliffP.z*0.28)*0.65+sin(vCliffP.x*0.37));
      diffuseColor.rgb*=0.90+sediment*0.055;
    `,
    );
  };
  material.customProgramCacheKey = () => 'original-triplanar-canyon-v1';
  k.materials.set(key, material);
  return material;
}
export function canyonGround(
  k: MeshKit,
  parent: T.Group,
  height: (x: number, z: number) => number,
) {
  const geometry = new T.PlaneGeometry(300, 370, 150, 185);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(-20, 0, -85);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++)
    vertices.setY(i, height(vertices.getX(i), vertices.getZ(i)));
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal'),
    colors: number[] = [];
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i),
      slope = Math.abs(normals.getY(i)),
      cover = Math.max(0, Math.min(1, (slope - 0.53) / 0.28)),
      color = new T.Color('#9c9a88').lerp(new T.Color('#92a15a'), cover),
      fleck = landNoise(x * 0.23, z * 0.19);
    color.multiplyScalar(0.83 + fleck * 0.24);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const ground = new T.Mesh(geometry, canyonMaterial(k));
  ground.castShadow = ground.receiveShadow = true;
  parent.add(ground);
  for (const side of [-1, 1]) {
    canyonFace(k, parent, side, height);
    for (const z of [-13, -37, -72, -105, -140]) {
      const ledge = new T.Group(),
        x = riverCenter(z) + side * 9.5;
      sculpture(k, cliff, { base: ledge });
      ledge.scale.set(7, 8, 5);
      ledge.rotation.y = (-side * Math.PI) / 2 + Math.sin(z) * 0.12;
      ledge.position.set(x, height(riverCenter(z) + side * 15, z) - 7.6, z);
      parent.add(ledge);
    }
  }
}
/** Continuous three-dimensional faces undercut the turf cap, with eroded strata and fissures. */
function canyonFace(
  k: MeshKit,
  parent: T.Group,
  side: number,
  height: (x: number, z: number) => number,
) {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const rows = 150,
    layers = 14;
  for (let row = 0; row <= rows; row++) {
    const z = 48 - row * 1.4,
      center = riverCenter(z),
      capX = center + side * 12.8,
      top = height(capX, z),
      bottom = riverSurface(z) - 3;
    for (let layer = 0; layer <= layers; layer++) {
      const t = layer / layers,
        y = bottom + (top - bottom) * t,
        cut = landNoise(z * 0.19, y * 0.21),
        crack = landNoise(z * 0.59, y * 0.47),
        x =
          center +
          side *
            (9.1 +
              t * 3.7 +
              (cut - 0.5) * 2.3 +
              (crack - 0.5) * 0.75 +
              Math.sin(y * 2.3 + z * 0.18) * 0.27),
        color = new T.Color('#a4a08c').lerp(new T.Color('#79815a'), Math.max(0, t - 0.8) * 2.5);
      color.multiplyScalar(0.78 + cut * 0.27);
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      if (row < rows && layer < layers) {
        const a = row * (layers + 1) + layer;
        if (side < 0) indices.push(a, a + layers + 1, a + 1, a + 1, a + layers + 1, a + layers + 2);
        else indices.push(a, a + 1, a + layers + 1, a + 1, a + layers + 2, a + layers + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    'uv',
    new T.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cliff = new T.Mesh(geometry, canyonMaterial(k));
  cliff.castShadow = cliff.receiveShadow = true;
  parent.add(cliff);
}
