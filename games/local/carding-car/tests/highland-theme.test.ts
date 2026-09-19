import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { theme } from '../assets/scripts/themes/highland.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { roadClearance, sceneryFits } from '../assets/scripts/ThemeScenery.ts';

const assets = JSON.parse(
  readFileSync(
    new URL('../../../../assets/carding-car/theme-kits/highland/manifest.json', import.meta.url),
    'utf8',
  ),
).models;

test('highland supports all route widths, elevations and shortcuts without covering the driving envelope', () => {
  const mountain = routes.find((route) => route.id === 'highland')!;
  const combinations = [
    ...routes,
    {
      id: 'wide-elevated-shortcut',
      track: {
        ...mountain.track,
        width: 34,
        shortcutWidth: 12,
        shortcut: [2, 12] as [number, number],
      },
    },
  ];
  for (const route of combinations) {
    const track = createTrack(route.track),
      before = JSON.stringify(track),
      scenery = theme.scenery(track);
    assert.equal(JSON.stringify(track), before, `${route.id}: changed road or collision`);
    assert.equal(
      scenery.models!.filter((model) => model.asset.endsWith('highland-lodge')).length,
      3,
      `${route.id}: lost lodges`,
    );
    assert.equal(
      scenery.models!.filter((model) => model.asset.endsWith('highland-snow-ridge')).length,
      8,
      `${route.id}: lost snowy skyline`,
    );
    for (const model of scenery.models!) {
      const row = assets.find((row: { id: string }) => model.asset.endsWith('/' + row.id));
      assert.ok(row, model.asset);
      const [lo, hi] = row.bounds;
      const radius =
        Math.hypot(
          Math.max(Math.abs(lo[0]), Math.abs(hi[0])),
          Math.max(Math.abs(lo[2]), Math.abs(hi[2])),
        ) * model.scale;
      assert.ok(
        sceneryFits(
          track,
          model.x,
          model.y + ((lo[1] + hi[1]) * model.scale) / 2,
          model.z,
          radius,
          ((hi[1] - lo[1]) * model.scale) / 2,
        ),
        `${route.id}: model would be culled ${model.asset}`,
      );
      if (!model.asset.endsWith('lodge'))
        assert.equal(model.y, -1, 'mountain base must be grounded');
    }
    for (const shape of scenery.shapes!)
      assert.ok(
        sceneryFits(
          track,
          shape.x,
          shape.y,
          shape.z,
          Math.hypot(shape.sx, shape.sz) / 2,
          shape.sy / 2,
        ),
        `${route.id}: lost lodge foundation`,
      );
    const seen = new Set<string>();
    const clear = (x: number, z: number) => {
      const key = `${x.toFixed(5)},${z.toFixed(5)}`;
      if (seen.has(key)) return;
      seen.add(key);
      assert.ok(
        roadClearance(track, x, z) >= 0.29,
        `${route.id}: raw roadbed intrudes at ${x}, ${z}`,
      );
    };
    for (const { geometry: g } of scenery.meshes!) {
      assert.equal(g.positions.length, g.normals.length);
      assert.equal(g.positions.length % 3, 0);
      assert.ok(g.positions.every(Number.isFinite) && g.normals.every(Number.isFinite));
      assert.ok(
        g.indices.every((i) => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3),
      );
      for (let i = 0; i < g.positions.length; i += 3) clear(g.positions[i], g.positions[i + 2]);
      for (let i = 0; i < g.indices.length; i += 3) {
        const [a, b, c] = g.indices.slice(i, i + 3).map((i) => i * 3);
        clear(
          (g.positions[a] + g.positions[b] + g.positions[c]) / 3,
          (g.positions[a + 2] + g.positions[b + 2] + g.positions[c + 2]) / 3,
        );
      }
    }
    const ledge = scenery.meshes![0].geometry;
    const segmentCount = track.main.length - 1 + Math.max(0, track.shortcut.length - 1);
    assert.ok(
      ledge.indices.length / 12 >= segmentCount * 2 * 0.88,
      `${route.id}: foundation has unexplained holes`,
    );
    if (!track.shortcut.length)
      assert.equal(
        ledge.indices.length / 12,
        segmentCount * 2,
        `${route.id}: continuous outer foundations`,
      );
    for (let i = 1; i < ledge.positions.length; i += 3)
      assert.ok(
        ledge.positions[i] <= Math.max(...track.main.map((p) => p.y)) - 0.129,
        'ledge must stay below asphalt',
      );
  }
});
