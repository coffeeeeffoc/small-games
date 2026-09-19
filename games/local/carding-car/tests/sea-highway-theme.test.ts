import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { sceneryFits } from '../assets/scripts/ThemeScenery.ts';
import { seaBridge } from '../assets/scripts/SeaHighwayGeometry.ts';
import { theme } from '../assets/scripts/themes/sea-highway.ts';

test('sea bridges follow all routes, heights and shortcut vertices without entering the driving envelope', () => {
  const highland = routes.find((r) => r.id === 'highland')!;
  for (const route of [
    ...routes,
    { id: 'sloping-shortcut', track: { ...highland.track, shortcut: [6, 13] as [number, number] } },
  ]) {
    const track = createTrack(route.track),
      before = JSON.stringify(track),
      bridge = seaBridge(track);
    assert.equal(JSON.stringify(track), before);
    assert.equal(
      bridge.water,
      Math.min(...track.main.map((p) => p.y), ...track.shortcut.map((p) => p.y)) - 6,
    );
    assert.equal(
      bridge.decks.indices.length / 3,
      (track.main.length - 1 + Math.max(0, track.shortcut.length - 1)) * 8,
    );
    assert.ok(bridge.towers.indices.length >= 36 * 3, route.id + ': visible white pylons');
    assert.ok(bridge.cables.indices.length >= 36 * 12, route.id + ': visible cable fans');
    assert.ok(bridge.piers.indices.length > 36 * 8, route.id + ': supports present');

    const branches = [
      [track.main, track.width],
      [track.shortcut, track.shortcutWidth],
    ] as const;
    for (const [part, g] of Object.entries(bridge)) {
      if (typeof g === 'number') continue;
      assert.ok([...g.positions, ...g.normals].every(Number.isFinite));
      assert.ok(g.indices.every((i) => i >= 0 && i < g.positions.length / 3));
      // Independent surface sampling includes triangle interiors, edges and all vertices.
      for (let i = 0; i < g.indices.length; i += 3) {
        const corners = g.indices.slice(i, i + 3).map((k) => g.positions.slice(k * 3, k * 3 + 3));
        for (const weights of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0.5, 0.5, 0],
          [0, 0.5, 0.5],
          [0.5, 0, 0.5],
          [1 / 3, 1 / 3, 1 / 3],
        ]) {
          const [x, y, z] = [0, 1, 2].map((axis) =>
            corners.reduce((sum, p, j) => sum + p[axis] * weights[j], 0),
          );
          for (const [points, width] of branches) {
            let nearest = Infinity,
              roadY = 0;
            for (let j = 1; j < points.length; j++) {
              const a = points[j - 1],
                b = points[j],
                dx = b.x - a.x,
                dz = b.z - a.z;
              const t = Math.max(
                0,
                Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
              );
              const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
              if (distance < nearest) {
                nearest = distance;
                roadY = a.y + (b.y - a.y) * t;
              }
            }
            if (nearest > width / 2 + 0.35) continue;
            assert.ok(
              y < roadY - 0.055 || y > roadY + 6,
              `${route.id}/${part}: geometry in road at ${[x, y, z]} roadY=${roadY}`,
            );
          }
        }
      }
    }
    const top = Math.max(...bridge.decks.positions.filter((_, i) => i % 3 === 1));
    assert.ok(
      Math.abs(
        top - Math.max(...track.main.map((p) => p.y), ...track.shortcut.map((p) => p.y)) + 0.18,
      ) < 1e-8,
    );
  }
});

test('sea theme reuses safe lighthouse islands, closes water shoulders and keeps water below each route', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../../../../assets/carding-car/runtime/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  assert.equal(theme.shoulderTexture, false);
  assert.equal(theme.groundDepth, 6);
  for (const route of routes) {
    const track = createTrack(route.track),
      scenery = theme.scenery(track);
    assert.ok(
      scenery.models!.some((m) => m.asset === 'lighthouse/lighthouse'),
      route.id,
    );
    assert.ok(scenery.models!.length <= 65, 'reuse a bounded number of island props');
    for (const p of scenery.models!) {
      const [lo, hi] = manifest.models.find(
        (m) => p.asset === m.file.replace('.glb', '') + '/' + m.file.replace('.glb', ''),
      ).bounds;
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
        route.id + '/' + p.asset,
      );
    }
  }
});
