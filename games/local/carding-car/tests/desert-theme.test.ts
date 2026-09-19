import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { theme } from '../assets/scripts/themes/desert.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { sceneryFits } from '../assets/scripts/ThemeScenery.ts';

const expansion = JSON.parse(
  readFileSync(
    new URL('../../../../assets/carding-car/runtime-expansion/manifest.json', import.meta.url),
    'utf8',
  ),
);
const seaside = JSON.parse(
  readFileSync(
    new URL('../../../../assets/carding-car/runtime/manifest.json', import.meta.url),
    'utf8',
  ),
);
const bounds = new Map([
  ...expansion.models.map((entry) => [
    'expansion/' + entry.file.replace(/\.glb$/, ''),
    entry.bounds,
  ]),
  ...seaside.models.map((entry) => [
    entry.file.replace(/\.glb$/, '') + '/' + entry.file.replace(/\.glb$/, ''),
    entry.bounds,
  ]),
]);

test('desert landmarks follow all routes and leave main road, shortcut and elevated bends clear', () => {
  for (const route of [
    ...routes,
    {
      id: 'wide-offset-hills',
      track: {
        width: 28,
        shortcutWidth: 12,
        controls: [
          [500, 300, 4],
          [610, 300, 4],
          [685, 370, 17],
          [690, 485, 22],
          [590, 560, 18],
          [470, 525, 6],
          [430, 405, 4],
        ],
        shortcut: [2, 5],
      },
    },
  ]) {
    const track = createTrack(route.track),
      before = JSON.stringify(track),
      scenery = theme.scenery(track);
    assert.equal(JSON.stringify(track), before);
    assert.ok(
      scenery.shapes.filter((s) => s.color === '#315965').length >= 6,
      route.id + ': both stations have windows',
    );
    assert.equal(
      scenery.shapes.filter((s) => s.color === '#259fae').length,
      2,
      route.id + ': two complete oases',
    );
    assert.ok(scenery.models.filter((m) => m.asset === 'palm/palm').length >= 20);
    assert.ok(
      scenery.models.every((m) => !m.asset.includes('/scenes/')),
      'whole dioramas are not runtime landmarks',
    );
    for (const shape of scenery.shapes) {
      assert.ok([shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz].every(Number.isFinite));
      assert.ok(
        sceneryFits(
          track,
          shape.x,
          shape.y,
          shape.z,
          Math.hypot(shape.sx, shape.sz) / 2,
          shape.sy / 2,
        ),
        route.id + ': shape ' + shape.color,
      );
    }
    for (const p of scenery.models) {
      const [lo, hi] = bounds.get(p.asset);
      const radius =
        Math.hypot(
          Math.max(Math.abs(lo[0]), Math.abs(hi[0])),
          Math.max(Math.abs(lo[2]), Math.abs(hi[2])),
        ) * p.scale;
      assert.ok(
        sceneryFits(
          track,
          p.x,
          p.y + ((lo[1] + hi[1]) * p.scale) / 2,
          p.z,
          radius,
          ((hi[1] - lo[1]) * p.scale) / 2,
        ),
        route.id + ': ' + p.asset,
      );
    }
    let triangles = 0;
    for (const { geometry: g } of scenery.meshes) {
      assert.ok([...g.positions, ...g.normals].every(Number.isFinite));
      assert.equal(g.positions.length, g.normals.length);
      for (let i = 0; i < g.indices.length; i += 3) {
        const vertices = g.indices
          .slice(i, i + 3)
          .map((index) => g.positions.slice(index * 3, index * 3 + 3));
        const x = vertices.reduce((sum, p) => sum + p[0], 0) / 3,
          z = vertices.reduce((sum, p) => sum + p[2], 0) / 3;
        const lo = Math.min(...vertices.map((p) => p[1])),
          hi = Math.max(...vertices.map((p) => p[1]));
        const radius = Math.max(...vertices.map((p) => Math.hypot(p[0] - x, p[2] - z)));
        assert.ok(
          sceneryFits(track, x, (lo + hi) / 2, z, radius, (hi - lo) / 2),
          route.id + ': mesh triangle',
        );
        triangles++;
      }
    }
    assert.ok(triangles < 12000, route.id + ': mobile mesh budget');
    if (route.id === 'highland') {
      const raised = createTrack(route.track);
      for (const point of [...raised.main, ...raised.shortcut]) point.y += 11;
      const elevated = theme.scenery(raised).shapes.filter((s) => s.color === '#259fae');
      scenery.shapes
        .filter((s) => s.color === '#259fae')
        .forEach((s, i) =>
          assert.ok(
            Math.abs(elevated[i].y - s.y - 11) < 1e-9,
            'oasis elevation follows the selected hill route',
          ),
        );
    }
  }
});
