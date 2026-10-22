const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
export const geometry = () => ({ positions: [], normals: [], indices: [] });
export const point = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
function polygon(g, points, normal) {
  const base = g.positions.length / 3;
  for (const p of points) {
    g.positions.push(...p);
    g.normals.push(...normal);
  }
  for (let i = 1; i < points.length - 1; i++) g.indices.push(base, base + i, base + i + 1);
}
export const quad = polygon;

/** Only exposed ends have caps; each cap follows the bevel's six-point profile. */
export function arc(g, start, end, inner, outer, top, bottom, caps = [true, true], capTarget = g) {
  if (end - start < 1e-8) return;
  const count = Math.max(1, Math.ceil((end - start) / 0.07));
  const bevel = Math.min(0.045, (outer - inner) / 3, (top - bottom) / 3);
  for (let i = 0; i < count; i++) {
    const a = start + ((end - start) * i) / count,
      b = start + ((end - start) * (i + 1)) / count,
      m = (a + b) / 2;
    quad(
      g,
      [
        point(inner + bevel, a, top),
        point(inner + bevel, b, top),
        point(outer - bevel, b, top),
        point(outer - bevel, a, top),
      ],
      [0, 1, 0],
    );
    quad(
      g,
      [
        point(outer - bevel, a, top),
        point(outer - bevel, b, top),
        point(outer, b, top - bevel),
        point(outer, a, top - bevel),
      ],
      [Math.cos(m) * Math.SQRT1_2, Math.SQRT1_2, Math.sin(m) * Math.SQRT1_2],
    );
    quad(
      g,
      [
        point(inner, a, top - bevel),
        point(inner, b, top - bevel),
        point(inner + bevel, b, top),
        point(inner + bevel, a, top),
      ],
      [-Math.cos(m) * Math.SQRT1_2, Math.SQRT1_2, -Math.sin(m) * Math.SQRT1_2],
    );
    quad(
      g,
      [
        point(inner, a, bottom),
        point(outer, a, bottom),
        point(outer, b, bottom),
        point(inner, b, bottom),
      ],
      [0, -1, 0],
    );
    quad(
      g,
      [
        point(outer, a, top - bevel),
        point(outer, b, top - bevel),
        point(outer, b, bottom),
        point(outer, a, bottom),
      ],
      [Math.cos(m), 0, Math.sin(m)],
    );
    quad(
      g,
      [
        point(inner, a, bottom),
        point(inner, b, bottom),
        point(inner, b, top - bevel),
        point(inner, a, top - bevel),
      ],
      [-Math.cos(m), 0, -Math.sin(m)],
    );
  }
  if (end - start >= TAU - 1e-8) return;
  for (const [i, a, sign] of [
    [0, start, -1],
    [1, end, 1],
  ]) {
    if (!caps[i]) continue;
    const points = [
      point(inner, a, top - bevel),
      point(inner + bevel, a, top),
      point(outer - bevel, a, top),
      point(outer, a, top - bevel),
      point(outer, a, bottom),
      point(inner, a, bottom),
    ];
    polygon(capTarget, sign < 0 ? points : points.reverse(), [
      -Math.sin(a) * sign,
      0,
      Math.cos(a) * sign,
    ]);
  }
}

export function ringGeometry(layer) {
  const batches = { jade: geometry(), gold: geometry(), coral: geometry(), stripe: geometry() };
  const cuts = Array.from(
    new Set([
      0,
      TAU,
      ...(layer.gap ? [layer.gap.start, layer.gap.end] : []),
      ...layer.danger.flatMap((a) => [a.start, a.end]),
    ]),
  ).sort((a, b) => a - b);
  const inside = (a, r) => r && norm(a - r.start) < norm(r.end - r.start);
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i],
      end = cuts[i + 1],
      middle = (start + end) / 2;
    if (end - start < 1e-8 || inside(middle, layer.gap)) continue;
    const caps = [!!inside(start - 1e-7, layer.gap), !!inside(end + 1e-7, layer.gap)];
    const danger = layer.danger.some((a) => inside(middle, a));
    arc(batches[danger ? 'coral' : 'jade'], start, end, 0.72, 2.72, 0, -0.25, caps, batches.gold);
    // Trim sits above/below the body; it never duplicates the exposed side wall.
    arc(batches.gold, start, end, 2.68, 2.76, 0.035, 0.006, caps);
    arc(batches.gold, start, end, 0.69, 0.76, 0.035, 0.006, caps);
    arc(batches.gold, start, end, 2.68, 2.76, -0.256, -0.285, caps);
    if (danger)
      for (let a = start + 0.04; a < end - 0.03; a += 0.15) {
        const b = Math.min(end, a + 0.05),
          offset = Math.min(0.1, end - b);
        quad(
          batches.stripe,
          [
            point(0.78, a, 0.012),
            point(0.78, b, 0.012),
            point(2.66, b + offset, 0.012),
            point(2.66, a + offset, 0.012),
          ],
          [0, 1, 0],
        );
      }
  }
  arc(batches.gold, 0, TAU, 0.28, 0.43, 0.06, -0.15);
  return batches;
}
