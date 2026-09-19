import assert from 'node:assert/strict';
import test from 'node:test';
import { theme } from '../assets/scripts/themes/city.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import { sceneryFits } from '../assets/scripts/ThemeScenery.ts';

test('city shops, glass towers and green viaducts stay clear on every route, including shortcut and hills', () => {
  for (const route of routes) {
    const track = createTrack(route.track),
      original = JSON.stringify(track),
      scenery = theme.scenery(track);
    assert.equal(JSON.stringify(track), original, `${route.id}: immutable route`);
    assert.ok((scenery.shapes?.length ?? 0) > 500, `${route.id}: populated streets`);
    assert.ok((scenery.meshes?.length ?? 0) >= 5, `${route.id}: awnings and rounded skyline`);
    assert.equal(
      scenery.models?.some((p) => p.asset.includes('/scenes/')),
      undefined,
    );
    for (const shape of scenery.shapes ?? []) {
      if (
        (shape.color === '#d4bf9f' && shape.sx === 3.1) ||
        (shape.color === '#57686a' && shape.sx === 0.18) ||
        shape.color === '#586a69'
      )
        assert.ok(
          Math.abs(shape.y - shape.sy / 2 + 0.1) < 1e-8,
          `${route.id}: planter, lamp or bench must connect to ground`,
        );
      assert.ok(
        sceneryFits(
          track,
          shape.x,
          shape.y,
          shape.z,
          Math.hypot(shape.sx, shape.sz) / 2,
          shape.sy / 2,
        ),
        `${route.id}: ${JSON.stringify(shape)} would be clipped by shared renderer`,
      );
    }
    for (const { geometry } of scenery.meshes ?? []) {
      for (let i = 0; i < geometry.positions.length; i += 3) {
        const [x, y, z] = geometry.positions.slice(i, i + 3);
        assert.ok(
          sceneryFits(track, x, y, z, 0.1, 0.1),
          `${route.id}: mesh intersects driving envelope`,
        );
        assert.ok(Math.abs(Math.hypot(...geometry.normals.slice(i, i + 3)) - 1) < 1e-8);
      }
    }
    assert.ok(
      scenery.shapes?.some((s) => s.color === '#c3b9a4'),
      `${route.id}: green viaduct`,
    );
  }
  assert.equal(theme.roadTexture, 'expansion/textures/city/texture');
  assert.equal(theme.shoulderTexture, false);
});
