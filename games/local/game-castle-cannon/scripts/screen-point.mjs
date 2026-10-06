/** Real projected target locations published by the scene, including rotation tests. */
export async function logicalPoint(canvas, x, y) {
  const raw = await canvas.getAttribute('data-targets');
  if (raw) {
    const target = JSON.parse(raw).find((p) => p.ruleX === x && p.ruleY === y);
    return target ?? { x: 270, y: 325 };
  }
  return { x: 35 + x * 0.9 + (y - 200) * 0.2, y: 137 - x * 0.17 + y * 0.73 };
}
