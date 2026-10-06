type RendererContext = {
  getExtension(name: string): { UNMASKED_RENDERER_WEBGL: number } | null;
  getParameter(parameter: number): unknown;
};

// Only an explicitly reported software renderer warrants limiting scene quality.
// Missing or restricted GPU information preserves the player's preference.
export function isSoftwareRenderer(context: RendererContext): boolean {
  try {
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    if (!extension) return false;
    const renderer = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    return (
      typeof renderer === 'string' &&
      /swiftshader|llvmpipe|lavapipe|software rasterizer/i.test(renderer)
    );
  } catch {
    return false;
  }
}

export function effectiveRendererQuality(preferred: number, software: boolean): number {
  return software ? 0 : preferred;
}

export const SOFTWARE_RENDERER_PIXEL_BUDGET = 250_000;

export function softwareRendererDpr(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0.85;
  return Math.min(
    0.85,
    Math.sqrt(SOFTWARE_RENDERER_PIXEL_BUDGET) / Math.sqrt(width) / Math.sqrt(height),
  );
}
