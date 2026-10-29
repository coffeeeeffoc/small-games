import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRun, step, interceptPoint, distance } from '../assets/scripts/core/rules.ts';
import { CRAFTS, MISSILE_RANGE, PULSE_RANGE, RADAR_RANGE } from '../assets/scripts/core/content.ts';
import {
  CRUISE_ALTITUDE,
  FLIGHT_CEILING,
  TILE_SIZE,
  terrainHeight,
  terrainVertex,
  horizonGeometry,
} from '../assets/scripts/core/terrain.ts';

test('fighter altitude, engagement range and formation separation use the expanded airspace', () => {
  const s = createRun();
  assert.equal(s.player.y, CRUISE_ALTITUDE);
  assert.ok(s.player.y > 1000 && FLIGHT_CEILING >= 5000);
  assert.ok(TILE_SIZE * 7 > 10000);
  assert.ok(CRAFTS.every((c) => c.speed >= 200));
  assert.ok(PULSE_RANGE < MISSILE_RANGE && MISSILE_RANGE < RADAR_RANGE);
  assert.ok(s.enemies.every((e) => distance(e, s.player) >= 700));
  assert.ok(distance(s.enemies[0], s.enemies[1]) >= 500);
  const heights = Array.from({ length: 30 }, (_, i) => Math.round(terrainHeight(2100, i * -1500)));
  assert.ok(new Set(heights).size > 20, 'successive ranges do not wrap to a repeated small map');
});

test('every aircraft follows a deliberate dive until its first fatal contact', () => {
  for (const craft of CRAFTS) {
    const s = createRun(undefined, craft);
    let previous = s.player.y;
    while (s.status === 'running') {
      step(s, { y: -1, boost: true });
      assert.ok(s.player.y <= previous, `${craft.id} must not be lifted`);
      assert.ok(s.player.pitch <= 0, `${craft.id} must not auto-pull-up`);
      previous = s.player.y;
    }
    assert.equal(s.status, 'lost');
    assert.match(s.reason, /撞击地形/);
    assert.equal(s.player.hull, 0);
    assert.equal(s.impacts.filter((e) => e.kind === 'crash').length, 1);
  }
});

test('distant ring extends fixed world terrain and leaves the detailed collision region unobscured', () => {
  const cx = -2,
    cz = 3,
    mesh = horizonGeometry(cx, cz);
  const vertexCount = mesh.positions.length / 3;
  assert.ok(mesh.positions.every(Number.isFinite) && mesh.normals.every(Number.isFinite));
  assert.ok(mesh.indices.every((i) => i >= 0 && i < vertexCount));
  assert.ok(mesh.indices.length / 3 < 16000);
  assert.equal(mesh.positions[0], (cx - 7) * TILE_SIZE);
  assert.equal(mesh.positions[90 * 3], (cx + 8) * TILE_SIZE);
  const used = new Set(mesh.indices);
  const boundary = new Set();
  for (const i of used) {
    const [x, y, z] = mesh.positions.slice(i * 3, i * 3 + 3);
    assert.equal(y, terrainVertex(x, z));
    boundary.add(`${x}:${z}`);
  }
  for (let n = 0; n <= 7 * TILE_SIZE; n += 64) {
    assert.ok(boundary.has(`${(cx - 3) * TILE_SIZE + n}:${(cz - 3) * TILE_SIZE}`));
    assert.ok(boundary.has(`${(cx - 3) * TILE_SIZE + n}:${(cz + 4) * TILE_SIZE}`));
    assert.ok(boundary.has(`${(cx - 3) * TILE_SIZE}:${(cz - 3) * TILE_SIZE + n}`));
    assert.ok(boundary.has(`${(cx + 4) * TILE_SIZE}:${(cz - 3) * TILE_SIZE + n}`));
  }
  const seamEdges = new Map();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = mesh.indices.slice(i, i + 3);
    const [a, b, c] = triangle.map((v) => [mesh.positions[v * 3], mesh.positions[v * 3 + 2]]);
    assert.ok((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const onSeam =
        p[0] === q[0]
          ? [cx - 3, cx + 4].some((n) => p[0] === n * TILE_SIZE) &&
            Math.min(p[1], q[1]) >= (cz - 3) * TILE_SIZE &&
            Math.max(p[1], q[1]) <= (cz + 4) * TILE_SIZE
          : p[1] === q[1] &&
            [cz - 3, cz + 4].some((n) => p[1] === n * TILE_SIZE) &&
            Math.min(p[0], q[0]) >= (cx - 3) * TILE_SIZE &&
            Math.max(p[0], q[0]) <= (cx + 4) * TILE_SIZE;
      if (onSeam) {
        assert.equal(Math.hypot(p[0] - q[0], p[1] - q[1]), 64);
        const key = [p.join(':'), q.join(':')].sort().join('/');
        seamEdges.set(key, (seamEdges.get(key) || 0) + 1);
      }
    }
    const x = triangle.reduce((n, v) => n + mesh.positions[v * 3], 0) / 3;
    const z = triangle.reduce((n, v) => n + mesh.positions[v * 3 + 2], 0) / 3;
    assert.ok(
      !(
        x > (cx - 3) * TILE_SIZE &&
        x < (cx + 4) * TILE_SIZE &&
        z > (cz - 3) * TILE_SIZE &&
        z < (cz + 4) * TILE_SIZE
      ),
    );
  }
  assert.equal(seamEdges.size, (4 * 7 * TILE_SIZE) / 64);
  assert.ok([...seamEdges.values()].every((n) => n === 1));
});

test('projectile lead reaches a crossing or receding aircraft at the same flight time', () => {
  const from = { x: 0, y: 1600, z: 0 },
    target = { x: 400, y: 1700, z: -1200 };
  for (const velocity of [
    { x: 240, y: 20, z: 0 },
    { x: 0, y: 0, z: -225 },
    { x: 0, y: 0, z: 0 },
  ]) {
    const point = interceptPoint(from, target, velocity, 1100);
    const time = distance(from, point) / 1100;
    for (const axis of ['x', 'y', 'z'])
      assert.ok(Math.abs(point[axis] - (target[axis] + velocity[axis] * time)) < 1e-7);
  }
  assert.ok(
    Object.values(interceptPoint(from, from, { x: 1100, y: 0, z: 0 }, 1100)).every(Number.isFinite),
  );
});
