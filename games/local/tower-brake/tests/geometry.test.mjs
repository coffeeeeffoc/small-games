import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, arc, ringGeometry } from '../geometry.mjs';
import { LEVELS } from '../levels.mjs';
const TAU = Math.PI * 2;
const angleDifference = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);
function triangles(mesh) {
  const result = [];
  for (let i = 0; i < mesh.indices.length; i += 3)
    result.push(
      mesh.indices.slice(i, i + 3).map((index) => mesh.positions.slice(index * 3, index * 3 + 3)),
    );
  return result;
}
function area([a, b, c]) {
  const u = b.map((v, i) => v - a[i]),
    v = c.map((n, i) => n - a[i]);
  return (
    Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
  );
}
const radial = (triangle) =>
  triangle.every(
    (p) =>
      angleDifference(Math.atan2(p[2], p[0]), Math.atan2(triangle[0][2], triangle[0][0])) < 1e-7,
  );
test('closed hoops have no seam caps and authored rings have no degenerate or duplicate faces', () => {
  const closed = geometry();
  arc(closed, 0, TAU, 1, 2, 0, -0.25);
  assert.equal(triangles(closed).filter(radial).length, 0);
  for (const layer of LEVELS.flatMap((l) => l.layers)) {
    const seen = new Set();
    for (const mesh of Object.values(ringGeometry(layer)))
      for (const triangle of triangles(mesh)) {
        assert.ok(area(triangle) > 1e-10);
        const key = triangle
          .map((p) => p.map((n) => n.toFixed(6)).join(','))
          .sort()
          .join('|');
        assert.ok(!seen.has(key), 'coincident geometry causes depth fighting');
        seen.add(key);
        if (radial(triangle))
          assert.ok(
            layer.gap &&
              [layer.gap.start, layer.gap.end].some(
                (a) => angleDifference(a, Math.atan2(triangle[0][2], triangle[0][0])) < 1e-7,
              ),
            'only actual gap ends are capped',
          );
      }
  }
});
test('each exposed side has exactly one beveled body cap and separate non-overlapping trim', () => {
  const layer = { gap: { start: 0.4, end: 1.6 }, danger: [{ start: 2, end: 3 }] };
  const caps = Object.values(ringGeometry(layer)).flatMap(triangles).filter(radial);
  const trimBevel = 0.029 / 3;
  const expected =
    2 * 0.25 - 0.045 ** 2 + 2 * (0.08 * 0.029 - trimBevel ** 2) + (0.07 * 0.029 - trimBevel ** 2);
  for (const boundary of [0.4, 1.6]) {
    const total = caps
      .filter((t) => angleDifference(boundary, Math.atan2(t[0][2], t[0][0])) < 1e-7)
      .reduce((sum, t) => sum + area(t), 0);
    assert.ok(Math.abs(total - expected) < 1e-7, `unexpected overlapping cap area ${total}`);
  }
});
