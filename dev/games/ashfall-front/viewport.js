(() => {
  function resize() {
    const w = innerWidth, h = innerHeight, rotated = h > w;
    const width = rotated ? h : w, height = rotated ? w : h;
    // Creator's landscape ScreenAdapter rotates the entire frame and maps native touches.
    globalThis.AshfallViewport = { width, height, rotated, physicalWidth: w, physicalHeight: h };
  }
  addEventListener('DOMContentLoaded', resize); addEventListener('resize', resize);
})();
