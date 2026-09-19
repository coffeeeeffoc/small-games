import assert from 'node:assert/strict';
import test from 'node:test';
import { theme } from '../assets/scripts/themes/tibetan-grassland.ts';
import { routes, type TrackOptions } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { sceneryFits } from '../assets/scripts/ThemeScenery.ts';

test('grassland keeps complete camps, herds, creek and hills clear of every route and shortcut', () => {
  const extra: TrackOptions = {
    width: 32,
    shortcutWidth: 12,
    shortcut: [2, 5],
    controls: [
      [500, 300, 4],
      [610, 300, 4],
      [685, 370, 17],
      [690, 485, 22],
      [590, 560, 18],
      [470, 525, 6],
      [430, 405, 4],
    ],
  };
  for (const route of [...routes, { id: 'wide-offset-hills', track: extra }]) {
    const track = createTrack(route.track),
      before = JSON.stringify(track),
      scenery = theme.scenery(track);
    assert.equal(JSON.stringify(track), before, `${route.id}: road and collision unchanged`);
    assert.equal(
      scenery.meshes!.filter((m) => m.color === '#fff6da').length,
      8,
      `${route.id}: eight complete tent roofs`,
    );
    assert.equal(
      scenery.shapes!.filter((s) => s.color === '#574937').length,
      8,
      `${route.id}: eight doors`,
    );
    assert.equal(
      scenery.shapes!.filter((s) => s.color === '#44382e').length,
      30,
      `${route.id}: complete herd`,
    );
    assert.equal(
      scenery.shapes!.filter((s) => s.color === '#4889bd').length,
      16,
      `${route.id}: camp prayer flags`,
    );
    assert.ok(
      scenery.meshes!.filter((m) => m.color === '#3eabae').length >= track.length / 50,
      `${route.id}: visible creek reaches`,
    );
    assert.ok(scenery.models!.length >= 20, `${route.id}: low rolling hills`);
    for (const shape of scenery.shapes!) {
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
        `${route.id}: whole shape ${shape.color}`,
      );
    }
    for (const model of scenery.models!) {
      assert.equal(model.asset, 'expansion/props/grass-hill', 'no baked road dioramas');
      assert.equal(model.y, 0, 'reusable hills rest on the common ground');
      assert.ok(
        sceneryFits(
          track,
          model.x,
          model.y + 2 * model.scale,
          model.z,
          Math.hypot(7, 5) * model.scale,
          2 * model.scale,
        ),
        `${route.id}: hill safe before renderer filtering`,
      );
    }
    let triangles = 0;
    for (const { geometry: g } of scenery.meshes!) {
      assert.equal(g.positions.length, g.normals.length);
      assert.ok([...g.positions, ...g.normals].every(Number.isFinite));
      assert.ok(
        g.indices.every((i) => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3),
      );
      for (let i = 0; i < g.indices.length; i += 3) {
        const points = g.indices
          .slice(i, i + 3)
          .map((index) => g.positions.slice(index * 3, index * 3 + 3));
        const x = points.reduce((n, p) => n + p[0], 0) / 3,
          z = points.reduce((n, p) => n + p[2], 0) / 3,
          lo = Math.min(...points.map((p) => p[1])),
          hi = Math.max(...points.map((p) => p[1])),
          radius = Math.max(...points.map((p) => Math.hypot(p[0] - x, p[2] - z)));
        assert.ok(
          sceneryFits(track, x, (lo + hi) / 2, z, radius, (hi - lo) / 2),
          `${route.id}: full mesh triangle at ${x}, ${z}`,
        );
        triangles++;
      }
    }
    assert.ok(triangles < 35000, `${route.id}: bounded procedural geometry`);
    if (route.id === 'highland') {
      for (const p of [...track.main, ...track.shortcut]) p.y += 9;
      const lifted = theme.scenery(track);
      const roofs = scenery.meshes!.filter((m) => m.color === '#fff6da'),
        raisedRoofs = lifted.meshes!.filter((m) => m.color === '#fff6da');
      roofs.forEach((roof, i) =>
        assert.ok(
          Math.abs(raisedRoofs[i].geometry.positions[1] - roof.geometry.positions[1] - 9) < 1e-8,
        ),
      );
      for (const bank of lifted.meshes!.filter((m) => m.color === '#8cab4c')) {
        const ys = bank.geometry.positions.filter((_, i) => i % 3 === 1);
        assert.equal(Math.min(...ys), -0.1, 'elevated camps/creeks have ground-reaching banks');
      }
    }
  }
});
