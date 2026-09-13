export function sceneFrame(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  progress: number,
  reducedMotion: boolean,
) {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const scale =
    Math.max(width / imageWidth, height / imageHeight) *
    (reducedMotion ? 1.035 : 1.035 + p * 0.105);
  const dusk = Math.min(1, Math.max(0, (p - 0.55) / 0.35));
  return {
    scale,
    x: -(imageWidth * scale - width) * (reducedMotion ? 0.5 : 0.12 + p * 0.76),
    y: -(imageHeight * scale - height) * (reducedMotion ? 0.5 : 0.48 - p * 0.08),
    night: dusk * dusk * (3 - 2 * dusk),
  };
}
