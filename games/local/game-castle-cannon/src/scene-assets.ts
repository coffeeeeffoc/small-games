import * as T from 'three';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { MeshKit } from './scene-mesh.js';
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
}
