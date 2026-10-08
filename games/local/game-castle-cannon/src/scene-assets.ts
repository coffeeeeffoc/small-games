import * as T from 'three';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { MeshKit } from './scene-mesh.js';
import cannon from './models/cannon-rodin.json';
import gate from './models/gate-rodin.json';
import stone from './models/stone-rodin.json';
import soldier from './models/soldier-rodin.json';
import spruce from './models/spruce-rodin.json';
import massif from './models/massif-rodin.json';
import loader from './models/loader-rodin.json';
import cliff from './models/cliff-rodin.json';
import lookout from './models/lookout-rodin.json';
import bunker from './models/bunker-rodin.json';
export async function loadSceneMaterials(
  kit: MeshKit,
  loadImage: NonNullable<CanvasGameTarget['loadImage']>,
) {
  const images = await Promise.allSettled(
    ['castle-cannon-art/limestone.jpg', 'castle-cannon-art/oak.jpg'].map(loadImage),
  );
  const textures = images.map((r) => (r.status === 'fulfilled' ? new T.Texture(r.value) : null));
  for (const texture of textures)
    if (texture) {
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.needsUpdate = true;
    }
  kit.applyTextures(textures[0]!, textures[1]!);
  for (const batch of [
    ...cannon,
    ...gate,
    ...stone,
    ...soldier,
    ...spruce,
    ...massif,
    ...loader,
    ...cliff,
    ...lookout,
    ...bunker,
  ])
    kit.pbrMaterial(batch.maps);
  const paths = [...new Set([...kit.pbrMaps.values()].flatMap((m) => Object.values(m)))];
  const imagesByPath = new Map<string, T.Texture>();
  await Promise.all(
    paths.map(async (path) => {
      try {
        const texture = new T.Texture(await loadImage(path));
        texture.flipY = false;
        if ([...kit.pbrMaps.values()].some((m) => m.color === path))
          texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        imagesByPath.set(path, texture);
      } catch {
        /* Optional art load failure retains a playable material. */
      }
    }),
  );
  kit.applyPbrTextures(imagesByPath);
}
export function surfaceTexture(wood: boolean, color = false) {
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const n = hash - Math.floor(hash),
        i = (y * 64 + x) * 4;
      const shade = color
        ? 202 + 25 * Math.sin(x * 0.56 + Math.sin(y * 0.12)) + n * 12
        : wood
          ? 110 + 35 * Math.sin(x * 0.75 + Math.sin(y * 0.12)) + n * 15
          : 110 + n * 50;
      data[i] = data[i + 1] = data[i + 2] = shade;
      data[i + 3] = 255;
    }
  const texture = new T.DataTexture(data, 64, 64);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
