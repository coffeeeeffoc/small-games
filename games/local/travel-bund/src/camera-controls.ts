export const DEFAULT_FOV = 68;
export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 2.5;

export function clampZoom(zoom: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

// Scale the visible image consistently for both wheel and pinch gestures.
export function zoomFov(zoom: number) {
  return (Math.atan(Math.tan((DEFAULT_FOV * Math.PI) / 360) / clampZoom(zoom)) * 360) / Math.PI;
}

export function wheelZoom(zoom: number, delta: number, mode: number, viewportHeight: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? viewportHeight : 1);
  return clampZoom(zoom * Math.exp(-Math.max(-300, Math.min(300, pixels)) * 0.002));
}
