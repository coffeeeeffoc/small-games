import * as THREE from 'three';

export const CLOUD_COUNT = 12;
export const CLOUD_ATLAS_SIZE = [512, 256] as const;
const tileWidth = CLOUD_ATLAS_SIZE[0] / 2, tileHeight = CLOUD_ATLAS_SIZE[1] / 2;
const smooth = (a: number, b: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function hash(a: number, b: number, seed: number) {
  let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(0, 1, x - ix), ty = smooth(0, 1, y - iy);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), tx),
    THREE.MathUtils.lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), tx), ty,
  );
}

/** Bake billowing silhouettes, wispy edges and soft sunlight once, rather than
 * evaluating volumetric noise or drawing a stack of spheres every frame. */
function cloudAtlas() {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = CLOUD_ATLAS_SIZE;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let variant = 0; variant < 4; variant++) {
    const seed = variant + 11;
    const puffs = [
      [0.24, 0.60, 0.15, 0.17], [0.37, 0.40, 0.15, 0.20],
      [0.52, 0.35, 0.16, 0.22], [0.66, 0.47, 0.17, 0.23],
      [0.77, 0.59, 0.13, 0.16], [0.42, 0.63, 0.23, 0.12],
      [0.62, 0.65, 0.20, 0.11],
      [0.49, 0.54, 0.28, 0.21],
    ].map(([x, y, rx, ry], i) => [
      x + (noise(i, 2, seed) - 0.5) * 0.05,
      y + (noise(i, 5, seed) - 0.5) * 0.11,
      rx * (0.90 + noise(i, 8, seed) * 0.22),
      ry * (0.84 + noise(i, 9, seed) * 0.30),
    ]);
    for (let py = 0; py < tileHeight; py++) for (let px = 0; px < tileWidth; px++) {
      const x = px / tileWidth, y = py / tileHeight;
      const grain = noise(x * 30, y * 23, seed) * 0.5 + noise(x * 61, y * 47, seed) * 0.22;
      const billow = noise(x * 12, y * 11, seed) * 0.28 + grain;
      const warp = (billow - 0.5) * 0.035;
      let density = 0, dx = 0, dy = 0;
      for (const [cx, cy, rx, ry] of puffs) {
        const u = (x + warp - cx) / rx, v = (y + warp - cy) / ry;
        const puff = Math.exp(-2.8 * (u * u + v * v));
        density += puff;
        dx += puff * -5.6 * u / rx;
        dy += puff * -5.6 * v / ry;
      }
      density *= 0.76 + billow * 0.48;
      const alpha = smooth(0.14, 0.48, density);
      const nx = -dx * 0.045, ny = -dy * 0.065;
      const light = THREE.MathUtils.clamp((nx * -0.30 + ny * -0.55 + 0.78) / Math.hypot(nx, ny, 1), 0, 1);
      const shade = THREE.MathUtils.clamp((1 - light) * 0.42 + smooth(0.42, 0.76, y) * 0.48 + (1 - billow) * 0.15, 0, 1);
      const index = ((py + Math.floor(variant / 2) * tileHeight) * canvas.width + px + (variant % 2) * tileWidth) * 4;
      image.data[index] = 255 - shade * 58;
      image.data[index + 1] = 255 - shade * 36;
      image.data[index + 2] = 252 - shade * 16;
      image.data[index + 3] = alpha * 248;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export function createClouds() {
  const texture = cloudAtlas(), geometry = new THREE.PlaneGeometry(1, 1);
  const offsets = new Float32Array(CLOUD_COUNT * 2);
  for (let i = 0; i < CLOUD_COUNT; i++) {
    offsets[i * 2] = (i % 2) * 0.5;
    offsets[i * 2 + 1] = Math.floor((i % 4) / 2) * 0.5;
  }
  geometry.setAttribute('cloudTile', new THREE.InstancedBufferAttribute(offsets, 2));
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false,
    toneMapped: false, alphaTest: 0.015,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 cloudTile;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * .5 + cloudTile;');
  };
  material.customProgramCacheKey = () => 'bund-cloud-atlas-v1';
  const mesh = new THREE.InstancedMesh(geometry, material, CLOUD_COUNT);
  mesh.name = 'soft-river-clouds';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return {
    mesh, texture, material,
    dispose() { mesh.dispose(); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
