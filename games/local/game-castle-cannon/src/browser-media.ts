import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';

/** Browser host owns DOM surfaces and resolves package resources. */
export function browserMedia(
  target: HTMLElement,
): Pick<CanvasGameTarget, 'createRenderSurface' | 'loadImage'> {
  return {
    createRenderSurface(width, height) {
      const surface = document.createElement('canvas');
      surface.width = width;
      surface.height = height;
      return {
        canvas: surface,
        image: surface,
        dispose() {
          surface.remove();
        },
      };
    },
    loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Image unavailable: ${src}`));
        image.src = new URL(
          src,
          new URL(
            document.baseURI.includes('/games/castle-cannon/')
              ? './'
              : target.closest('.game-page')
                ? './games/castle-cannon/'
                : './',
            document.baseURI,
          ),
        ).href;
      });
    },
  };
}
