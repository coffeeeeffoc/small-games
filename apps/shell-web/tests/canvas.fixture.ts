/** Drawing is checked in a real browser; this fixture isolates lifecycle and input rules. */
export function canvasContext(this: HTMLCanvasElement) {
  const noop = () => {};
  return {
    canvas: this,
    save: noop,
    restore: noop,
    scale: noop,
    setLineDash: noop,
    translate: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    rect: noop,
    arc: noop,
    ellipse: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    stroke: noop,
    fill: noop,
    clip: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: (text: string) => ({ width: text.length * 14 }),
  } as unknown as CanvasRenderingContext2D;
}
