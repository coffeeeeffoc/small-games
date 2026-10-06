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
