import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSeasideScenery, seasideTurnDirection } from '../assets/scripts/SeasideGeometry.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack, projectOnTrack } from '../assets/scripts/TrackGenerator.ts';
import { clearOfRoad, roadClearance, sceneryFits } from '../assets/scripts/ThemeScenery.ts';

const assets = JSON.parse(
  readFileSync(new URL('../assets/resources/seaside/manifest.json', import.meta.url), 'utf8'),
).models;

test('seaside chevrons match left/right bends in the chase camera and omit straight directions', () => {
  const highway = createTrack(routes.find((route) => route.id === 'sea-highway')!.track);
  assert.equal(seasideTurnDirection(highway, 40), 0, 'straight road has no direction arrow');
  for (const direction of [-1, 1] as const) {
    // Clockwise X/Z circle bends right; mirroring X reverses both curve and visible chevron.
    const controls = [
      [0, -100],
      [70, -70],
      [100, 0],
      [70, 70],
      [0, 100],
      [-70, 70],
      [-100, 0],
      [-70, -70],
    ].map(([x, z]) => [-direction * x, z] as [number, number]);
    const track = createTrack({ controls, shortcut: false });
    for (const fraction of [0.02, 0.28, 0.52, 0.78, 0.99])
      assert.equal(
        seasideTurnDirection(track, track.length * fraction),
        direction,
        direction > 0 ? 'left bend, including angle wrap' : 'right bend, including angle wrap',
      );
    const coast = createSeasideScenery(track);
    const signs = coast.sites.filter((site) => site.kind === 'turn-sign');
    const g = coast.meshes.find((mesh) => mesh.color === '#293b3b')!.geometry;
    assert.ok(signs.length > 0);
    for (const sign of signs) {
      const middle: number[] = [];
      for (let i = 0; i < g.positions.length; i += 3) {
        const dx = g.positions[i] - sign.x,
          dz = g.positions[i + 2] - sign.z;
        if (Math.hypot(dx, dz) < 1.5 && Math.abs(g.positions[i + 1] - sign.y - 3.45) < 1e-6)
          middle.push(dx * Math.cos(sign.heading) - dz * Math.sin(sign.heading));
      }
      assert.ok(middle.length > 0);
      // In the actual rendered triangles, the chevron tip extends farther than its notch.
      assert.equal(
        Math.sign(Math.min(...middle) + Math.max(...middle)),
        direction,
        'rendered arrow must face the selected bend',
      );
    }
  }
});

test('seaside keeps complete landmarks and marine terrain clear of all eight routes and elevated shortcuts', () => {
  const hill = routes.find((route) => route.id === 'highland')!;
  for (const route of [
    ...routes,
    {
      id: 'wide-elevated-shortcut',
      track: { ...hill.track, width: 32, shortcutWidth: 12, shortcut: [2, 12] as [number, number] },
    },
  ]) {
    const track = createTrack(route.track),
      before = JSON.stringify(track);
    const coast = createSeasideScenery(track);
    assert.equal(JSON.stringify(track), before, `${route.id}: changed authoritative road`);
    assert.ok(coast.seaY < Math.min(...track.main.map((p) => p.y)) - 2);
    for (const kind of [
      'lighthouse',
      'grandstand',
      'dock',
      'pavilion',
      'sailboat',
      'vegetation',
      'rocks',
      'turn-sign',
    ])
      assert.ok(
        coast.sites.some((site) => site.kind === kind),
        `${route.id}: lost complete ${kind}`,
      );
    for (const site of coast.sites) {
      assert.ok([site.x, site.y, site.z, site.radius, site.heading].every(Number.isFinite));
      assert.ok(
        clearOfRoad(track, site.x, site.z, site.radius),
        `${route.id}: ${site.kind} footprint intrudes`,
      );
    }
    for (const model of coast.models) {
      const asset = assets.find(
        (entry: { file: string }) => entry.file === model.asset.split('/')[0] + '.glb',
      );
      assert.ok(asset, model.asset);
      const [lo, hi] = asset.bounds;
      const radius =
        Math.hypot(
          Math.max(Math.abs(lo[0]), Math.abs(hi[0])),
          Math.max(Math.abs(lo[2]), Math.abs(hi[2])),
        ) * model.scale;
      assert.ok(
        clearOfRoad(track, model.x, model.z, radius),
        `${route.id}: ${model.asset} touches road`,
      );
      assert.ok([model.x, model.y, model.z, model.scale, model.yaw].every(Number.isFinite));
    }
    for (const shape of coast.shapes) {
      assert.ok([shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz].every(Number.isFinite));
      assert.ok(shape.sx > 0 && shape.sy > 0 && shape.sz > 0);
      assert.ok(
        sceneryFits(
          track,
          shape.x,
          shape.y,
          shape.z,
          Math.hypot(shape.sx, shape.sz) / 2,
          shape.sy / 2,
        ),
        `${route.id}: ${shape.color} prop obstructs road`,
      );
    }
    for (const { geometry: g } of [...coast.terrainMeshes, ...coast.meshes]) {
      assert.equal(g.positions.length, g.normals.length);
      assert.ok(g.positions.every(Number.isFinite) && g.normals.every(Number.isFinite));
      assert.ok(
        g.indices.every((i) => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3),
      );
    }
    for (const { geometry: g } of coast.meshes)
      for (let i = 0; i < g.positions.length; i += 9) {
        for (const weights of [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [1 / 3, 1 / 3, 1 / 3],
        ]) {
          const x = weights.reduce((sum, w, index) => sum + w * g.positions[i + index * 3], 0);
          const z = weights.reduce((sum, w, index) => sum + w * g.positions[i + index * 3 + 2], 0);
          assert.ok(
            roadClearance(track, x, z) >= 0.09,
            `${route.id}: coastal wall or prop reaches driving surface`,
          );
        }
      }
    // Cell centres catch slopes crossing the driving surface, not merely safe mesh vertices.
    for (const { geometry: g } of coast.terrainMeshes)
      for (let i = 0; i < g.positions.length; i += 9) {
        const x = (g.positions[i] + g.positions[i + 3] + g.positions[i + 6]) / 3;
        const y = (g.positions[i + 1] + g.positions[i + 4] + g.positions[i + 7]) / 3;
        const z = (g.positions[i + 2] + g.positions[i + 5] + g.positions[i + 8]) / 3;
        const p = projectOnTrack(track, x, z);
        if (p.distance <= p.width / 2 + 0.1)
          assert.ok(y < p.y - 0.1, `${route.id}: terrain covers road at ${x}, ${z}`);
      }
  }
});
