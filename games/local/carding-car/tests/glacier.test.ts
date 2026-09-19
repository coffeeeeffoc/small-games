import assert from 'node:assert/strict';
import test from 'node:test';
import {
  glacierArch,
  glacierArchDistances,
  glacierMountain,
  glacierRock,
} from '../assets/scripts/GlacierGeometry.ts';
import { createTrack, pointAt, projectOnTrack } from '../assets/scripts/TrackGenerator.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';

test('glacier meshes have unit normals and all three arches clear the curved road', () => {
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
  const track = createTrack(routes.find(r => r.id === 'glacier')!.track);
  for (const distance of glacierArchDistances(track.length)) {
    const p = pointAt(track, distance),
      c = Math.cos(p.heading),
      s = Math.sin(p.heading);
    for (let i = 0; i < arch.positions.length; i += 3) {
      const [x, y, z] = arch.positions.slice(i, i + 3);
      if (y > 11) continue;
      assert.ok(
        projectOnTrack(track, p.x + x * c + z * s, p.z + z * c - x * s).distance >
          track.width / 2 + 1,
        `arch at ${distance} must stay outside the rails`,
      );
    }
  }
});
