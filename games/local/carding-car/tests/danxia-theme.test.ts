import assert from 'node:assert/strict';
import test from 'node:test';
import { theme } from '../assets/scripts/themes/danxia.ts';
import { danxiaRidge, danxiaStrata } from '../assets/scripts/DanxiaGeometry.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { sceneryFits, roadClearance } from '../assets/scripts/ThemeScenery.ts';

test('Danxia strata form closed, finite ridges with outward normals and natural colour bands', () => {
  const ridge = danxiaRidge(0, 0, 0, 70, 32, 43, 0, 0.7);
  assert.deepEqual(
    ridge.map((part) => part.color),
    danxiaStrata,
  );
  for (const { geometry: g } of ridge) {
    assert.equal(g.positions.length, g.normals.length);
    assert.ok(g.positions.every(Number.isFinite));
    assert.ok(g.normals.every(Number.isFinite));
    assert.ok(g.indices.every((n) => Number.isInteger(n) && n >= 0 && n < g.positions.length / 3));
    for (let i = 0; i < g.positions.length; i += 3) {
      assert.ok(Math.hypot(g.positions[i], g.positions[i + 2]) <= Math.hypot(35, 16));
      assert.ok(Math.abs(Math.hypot(...g.normals.slice(i, i + 3)) - 1) < 1e-7);
      assert.ok(g.positions[i + 1] >= 0 && g.positions[i + 1] <= 43);
    }
  }
  // The coloured faces point outwards; inward faces disappear with Cocos back-face culling.
  for (const { geometry: g } of ridge.slice(1))
    for (let i = 0; i < g.positions.length; i += 3) {
      assert.ok(g.normals[i + 1] > -0.01);
      assert.ok(
        g.positions[i + 1] > 0.1,
        'upper strata must wrap around the hill, not collapse to ground-level knife tips',
      );
    }
});

test('Danxia scenery adapts to all routes, wide elevated roads and shortcuts without blocking any branch', () => {
  const shifted = {
    ...routes[6],
    id: 'offset-below-sea-level',
    track: {
      ...routes[6].track,
      controls: routes[6].track.controls!.map(
        ([x, z, y]) => [x + 450, z - 600, (y ?? 0) - 80] as [number, number, number],
      ),
    },
  };
  const cases = [
    ...routes,
    shifted,
    {
      id: 'wide-sloping-shortcut',
      track: {
        width: 30,
        shortcutWidth: 12,
        shortcut: [1, 5] as [number, number],
        controls: [
          [0, -140, 3],
          [130, -140, 12],
          [180, -30, 26],
          [130, 120, 33],
          [0, 170, 20],
          [-130, 120, 10],
          [-180, -30, 2],
          [-130, -140, 3],
        ] as [number, number, number][],
      },
    },
  ];
  for (const route of cases) {
    const track = createTrack(route.track),
      before = JSON.stringify(track);
    const scenery = theme.scenery(track);
    assert.equal(JSON.stringify(track), before, route.id + ': theme must not mutate the route');
    assert.equal(scenery.models?.length ?? 0, 0, 'fixed terrain dioramas were removed');
    assert.ok((scenery.meshes?.length ?? 0) >= 8 * 8, route.id + ': keep a visible ridge chain');
    assert.ok(
      scenery.shapes?.some((s) => s.color === '#718697'),
      route.id + ': complete kiosk exists',
    );
    for (const shape of scenery.shapes ?? []) {
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
        route.id + ': entire prop fits',
      );
    }
    let triangles = 0;
    for (const { geometry: g } of scenery.meshes ?? []) {
      assert.ok(g.positions.every(Number.isFinite));
      triangles += g.indices.length / 3;
      // Sample every triangle centre; placement's full circular footprint also bounds every face.
      for (let i = 0; i < g.indices.length; i += 3) {
        const ids = g.indices.slice(i, i + 3).map((n) => n * 3);
        const x = ids.reduce((n, id) => n + g.positions[id], 0) / 3;
        const z = ids.reduce((n, id) => n + g.positions[id + 2], 0) / 3;
        assert.ok(roadClearance(track, x, z) >= 2, route.id + ': cliff touches driving corridor');
      }
    }
    assert.ok(triangles < 40000, route.id + ': bounded mobile terrain budget');
  }
});
