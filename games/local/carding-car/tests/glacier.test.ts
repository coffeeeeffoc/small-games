import assert from 'node:assert/strict';
import test from 'node:test';
import {
  glacierArch,
  glacierArches,
  glacierMountain,
  glacierRock,
} from '../assets/scripts/GlacierGeometry.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';

test('glacier meshes keep unit normals and route-sized arches clear every road branch and elevation', () => {
  for (const geometry of [
    glacierArch(),
    glacierArch(true),
    glacierRock(3, 8, 20),
    glacierMountain(5, false),
    glacierMountain(5, true),
  ]) {
    assert.ok([...geometry.positions, ...geometry.normals, ...geometry.uvs].every(Number.isFinite));
    assert.equal(geometry.normals.length, geometry.positions.length);
    assert.equal(geometry.uvs.length, (geometry.positions.length / 3) * 2);
    for (let i = 0; i < geometry.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...geometry.normals.slice(i, i + 3)) - 1) < 1e-6);
    assert.ok(
      geometry.indices.every((index) => index >= 0 && index < geometry.positions.length / 3),
    );
  }
  const arch = glacierArch();
  for (let i = 0; i < arch.positions.length; i += 3)
    if (Math.abs(arch.positions[i]) < 10)
      assert.ok(arch.positions[i + 1] > 11, 'ice roof must clear both rails and airborne karts');
  // Front face normals must point out of the portal; inverted normals make sunlit ice dark.
  assert.ok(arch.normals[2] < -0.99);
  const variations = [...routes, {
    id: 'wide-elevated-shortcut', track: { width: 34, shortcutWidth: 12,
      controls: [[0, -180, 20], [160, -180, 28], [210, 0, 38], [130, 160, 23],
        [-70, 180, 10], [-200, 30, 20], [-160, -160, 20]] as [number, number, number][],
      shortcut: [2, 4] as [number, number] },
  }];
  for (const route of variations) {
    const track = createTrack(route.track), arches = glacierArches(track);
    assert.equal(arches.length, 3, `${route.id} must retain its three glacier landmarks`);
    for (const p of arches) {
      assert.ok(p.opening >= track.width / 2 + 5);
      const c = Math.cos(p.heading), s = Math.sin(p.heading);
      for (const snow of [false, true]) {
        const geometry = glacierArch(snow, p.opening);
        // Independently sample faces, including their centres, against every road segment.
        for (let i = 0; i < geometry.indices.length; i += 3) {
          const vertices = geometry.indices.slice(i, i + 3).map(index =>
            geometry.positions.slice(index * 3, index * 3 + 3));
          const samples = [...vertices, [0, 1, 2].map(axis => vertices.reduce((sum, v) => sum + v[axis], 0) / 3)];
          for (const [lx, ly, lz] of samples) {
            const x = p.x + lx * c + lz * s, z = p.z + lz * c - lx * s, y = p.y + ly;
            for (const [points, width] of [[track.main, track.width], [track.shortcut, track.shortcutWidth]] as const) {
              for (let j = 1; j < points.length; j++) {
                const a = points[j - 1], b = points[j], dx = b.x - a.x, dz = b.z - a.z,
                  t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
                assert.ok(y > Math.max(a.y, b.y) + 6 ||
                  Math.hypot(x - a.x - dx * t, z - a.z - dz * t) > width / 2 + 1,
                  `${route.id}: portal at ${p.distance} blocks a route branch`);
              }
            }
          }
        }
      }
    }
  }
});
