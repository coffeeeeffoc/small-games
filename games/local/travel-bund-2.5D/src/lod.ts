import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { needsDetail } from './flight';

export type TileInfo = {
  id: string;
  min: number[];
  max: number[];
  triangles: number;
  lowTriangles: number;
  bytes: number;
};
export type LodManifest = { source_sha256: string; overviewBytes: number; tiles: TileInfo[] };
type Layer = { group: THREE.Group; fade: { value: number } };

// Complementary screen-door fades keep both depth buffers valid and avoid
// translucent buildings or the ordering artifacts of alpha-blended city blocks.
function batch(root: THREE.Object3D, detailed: boolean): Layer {
  root.updateWorldMatrix(true, true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) throw new Error('Unexpected GLTF material array');
    const parts = buckets.get(object.material) ?? [];
    parts.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    buckets.set(object.material, parts);
  });
  const group = new THREE.Group(),
    fade = { value: 0 };
  for (const [original, parts] of buckets) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error('Incompatible city geometry');
    const material = original.clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.lodFade = fade;
      shader.fragmentShader = 'uniform float lodFade;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `
        #include <alphatest_fragment>
        float grain = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715))));
        if (${detailed ? 'grain >= lodFade' : 'grain < lodFade'}) discard;
      `,
      );
    };
    material.customProgramCacheKey = () => (detailed ? 'city-detail' : 'city-silhouette');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !detailed;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, fade };
}
function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        material.dispose();
    }
  });
}

export async function loadCity(
  scene: THREE.Scene,
  onLoad: (n: number) => void,
  signal: AbortSignal,
) {
  const base = `${import.meta.env.BASE_URL}lod/`;
  const response = await fetch(base + 'manifest.json', { signal });
  if (!response.ok) throw new Error('Missing LOD manifest');
  const manifest: LodManifest = await response.json();
  if (
    !Array.isArray(manifest.tiles) ||
    manifest.tiles.some(
      (t) =>
        !/^(terrain|-?\d+_-?\d+)$/.test(t.id) ||
        t.min.length !== 3 ||
        t.max.length !== 3 ||
        !t.min.every(Number.isFinite) ||
        !t.max.every(Number.isFinite),
    )
  )
    throw new Error('Invalid LOD manifest');
  const loader = new GLTFLoader();
  const overview = await loader.loadAsync(base + 'overview.glb', (e) => {
    if (!signal.aborted) onLoad(e.total ? e.loaded / e.total : 0);
  });
  if (signal.aborted) {
    dispose(overview.scene);
    throw new DOMException('Aborted', 'AbortError');
  }
  const tiles = manifest.tiles.map((info) => {
    const root = overview.scene.getObjectByName('tile_' + info.id);
    if (!root) throw new Error('Missing silhouette: ' + info.id);
    const low = batch(root, false);
    scene.add(low.group);
    return {
      info,
      bounds: new THREE.Box3(new THREE.Vector3(...info.min), new THREE.Vector3(...info.max)),
      low,
      high: undefined as Layer | undefined,
      pending: false,
      attempted: false,
      failed: false,
      detailed: false,
      mix: 0,
    };
  });
  dispose(overview.scene);
  let pending = 0;
  async function request(tile: (typeof tiles)[number]) {
    tile.pending = true;
    tile.attempted = true;
    pending++;
    try {
      const gltf = await loader.loadAsync(base + tile.info.id + '.glb');
      if (signal.aborted) {
        dispose(gltf.scene);
        return;
      }
      tile.high = batch(gltf.scene, true);
      dispose(gltf.scene);
      tile.high.group.visible = false;
      scene.add(tile.high.group);
    } catch {
      // Keep the complete silhouette usable when an individual detail request fails.
      if (!signal.aborted) tile.failed = true;
    } finally {
      tile.pending = false;
      pending--;
    }
  }
  return {
    manifest,
    update(camera: THREE.PerspectiveCamera, ahead: THREE.Vector3, delta: number) {
      const candidates = tiles
        .filter((t) => t.info.id !== 'terrain' && !t.attempted)
        .map((t) => ({
          tile: t,
          distance: Math.min(
            t.bounds.distanceToPoint(camera.position),
            t.bounds.distanceToPoint(ahead),
          ),
        }))
        .filter((t) => t.distance < 1900)
        .sort((a, b) => a.distance - b.distance);
      for (const candidate of candidates) {
        if (pending >= 2) break;
        void request(candidate.tile);
      }
      let detailed = 0,
        fading = 0;
      for (const tile of tiles) {
        tile.detailed =
          !!tile.high && needsDetail(tile.bounds.distanceToPoint(camera.position), tile.detailed);
        const wanted = Number(tile.detailed);
        tile.mix = THREE.MathUtils.damp(tile.mix, wanted, 4, delta);
        if (Math.abs(tile.mix - wanted) < 0.005) tile.mix = wanted;
        tile.low.fade.value = tile.mix;
        tile.low.group.visible = tile.mix < 0.999;
        if (tile.high) {
          tile.high.fade.value = tile.mix;
          tile.high.group.visible = tile.mix > 0.001;
          if (tile.mix > 0.05) detailed++;
          if (tile.mix > 0.01 && tile.mix < 0.99) fading++;
          if (
            tile.mix < 0.001 &&
            tile.bounds.distanceToPoint(camera.position) > 2800 &&
            tile.bounds.distanceToPoint(ahead) > 2800
          ) {
            scene.remove(tile.high.group);
            dispose(tile.high.group);
            tile.high = undefined;
            tile.attempted = false;
          }
        }
      }
      return {
        detailed,
        fading,
        pending,
        loaded: tiles.filter((t) => t.high).length,
        failed: tiles.some((t) => t.failed),
      };
    },
    retry() {
      for (const tile of tiles) {
        if (tile.failed) {
          tile.failed = false;
          tile.attempted = false;
        }
      }
    },
    dispose() {
      for (const tile of tiles) {
        scene.remove(tile.low.group);
        dispose(tile.low.group);
        if (tile.high) {
          scene.remove(tile.high.group);
          dispose(tile.high.group);
        }
      }
    },
  };
}
