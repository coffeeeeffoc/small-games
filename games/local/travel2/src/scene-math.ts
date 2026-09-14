import { chapterAt, chapters } from './journey.ts';

export const sceneArt = {
  river: 'bund-panorama.webp',
  arcade: 'bund-arcade.webp',
  deck: 'bund-deck.webp',
  night: 'bund-night.webp',
} as const;

export function sceneFrame(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  progress: number,
  reducedMotion: boolean,
) {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const index = chapterAt(p);
  const current = chapters[index];
  const previous = chapters[Math.max(0, index - 1)];
  const local = Math.min(1, p * chapters.length - index);
  const t = Math.min(1, local / 0.32);
  const mix = reducedMotion ? 1 : t * t * (3 - 2 * t);
  const interpolate = (a: number, b: number) => a + (b - a) * mix;
  // Reduced motion keeps the distinct compositions, but removes continuous camera travel.
  const zoom = interpolate(previous.camera.zoom, current.camera.zoom);
  const scale = Math.max(width / imageWidth, height / imageHeight) * zoom;
  const weights = Object.fromEntries(
    Object.keys(sceneArt).map((art) => [
      art,
      (previous.art === art ? 1 - mix : 0) + (current.art === art ? mix : 0),
    ]),
  ) as Record<keyof typeof sceneArt, number>;
  return {
    scale,
    x: Math.max(
      width - imageWidth * scale,
      Math.min(
        0,
        width * 0.5 - imageWidth * scale * interpolate(previous.camera.x, current.camera.x),
      ),
    ),
    y: Math.max(
      height - imageHeight * scale,
      Math.min(
        0,
        height * 0.5 - imageHeight * scale * interpolate(previous.camera.y, current.camera.y),
      ),
    ),
    night: weights.night,
    weights,
  };
}
