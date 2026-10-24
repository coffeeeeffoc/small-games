import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { METAL_LEVELS } from '../assets/scripts/core/metal-levels.ts';
import {
  WIRE_RADIUS,
  METAL_GAP,
  wirePaths,
  wireBasis,
  wireCollision,
  canPose,
  testExtraction,
  findMetalPose,
  findMetalHint,
  type WireRing,
  type Vec3,
} from '../assets/scripts/core/metal.ts';

function ring(
  id: string,
  x = 0,
  plane: 'xy' | 'xz' | 'yz' = 'xy',
  shape: WireRing['wire']['shape'] = 'circle',
): WireRing {
  return {
    id,
    x,
    y: 0,
    r: 64,
    gap: METAL_GAP,
    angle: 0,
    tilt: 0,
    wire: { shape, plane, z: 0, exit: { x: 1, y: 0, z: 0 } },
  };
}
function hopf(): WireRing[] {
  const a = ring('base');
  a.gap = 0;
  a.wire.fixed = true;
  return [a, ring('moving', 76.8, 'xz')];
}
const length = (p: Vec3) => Math.hypot(p.x, p.y, p.z);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('real small opening and 7-unit rod diameter leave physical clearance; closed loops close', () => {
  assert.equal(WIRE_RADIUS, 3.5);
  const r = ring('gap');
  const path = wirePaths(r)[0];
  const opening = distance(path[0], path.at(-1)!);
  assert.ok(Math.abs(opening - 2 * r.r * Math.sin(METAL_GAP / 2)) < 1e-8);
  assert.ok(opening > 4 * WIRE_RADIUS);
  r.gap = 0;
  const closed = wirePaths(r)[0];
  assert.ok(distance(closed[0], closed.at(-1)!) < 1e-8);
});

test('basis includes tilt but not angle; shape rotates in-plane before tilting', () => {
  const r = ring('basis');
  r.gap = 0;
  r.angle = Math.PI / 2;
  r.tilt = Math.PI / 2;
  const basis = wireBasis(r);
  assert.ok(Math.abs(basis.u.x - 1) < 1e-9);
  assert.ok(Math.abs(basis.v.z - 1) < 1e-9);
  assert.ok(Math.abs(basis.v.y) < 1e-9);
  const first = wirePaths(r, { x: 3, y: 5, z: 7 })[0][0];
  assert.ok(distance(first, { x: 3, y: 5, z: 71 }) < 1e-8);
  for (const plane of ['xy', 'xz', 'yz'] as const) {
    r.wire.plane = plane;
    assert.ok(Math.abs(length(wireBasis(r).u) - 1) < 1e-9);
    assert.ok(Math.abs(length(wireBasis(r).v) - 1) < 1e-9);
  }
});

test('Hopf pair is initially separated in 3D; backwards opening blocks and aligned opening extracts', () => {
  const rings = hopf();
  assert.equal(wireCollision(rings, 'moving'), null);
  const wrong = testExtraction(rings, 'moving');
  assert.equal(wrong.clear, false);
  assert.ok(wrong.blockedAt > 0 && wrong.blockedAt < wrong.distance);
  assert.ok(wrong.contact);
  assert.equal(canPose(rings, 'moving', { angle: Math.PI, tilt: 0 }), true);
  const correct = testExtraction(rings, 'moving', { angle: Math.PI });
  assert.equal(correct.clear, true);
  assert.deepEqual(correct.direction, { x: 1, y: 0, z: 0 });
  assert.equal(correct.blockedAt, correct.distance);
  assert.equal(
    wireCollision(rings, 'moving', { angle: Math.PI }, { x: correct.distance, y: 0, z: 0 }),
    null,
  );
  rings[1].gap = 0;
  assert.equal(testExtraction(rings, 'moving', { angle: Math.PI }).clear, false);
  assert.equal(findMetalPose(rings, 'moving'), null);
});

test('narrow openings and rounded tips cannot pass through an intact rod', () => {
  const rings = hopf();
  rings[1].gap = 0.08;
  assert.equal(testExtraction(rings, 'moving', { angle: Math.PI }).clear, false);
  rings[1].gap = METAL_GAP;
  rings[1].angle = Math.PI;
  assert.equal(testExtraction(rings, 'moving').clear, true);
  rings[1].angle += 0.22;
  assert.equal(testExtraction(rings, 'moving').clear, false);
});

test('an obstacle opening is real empty space, including for a closed moving loop', () => {
  const rings = hopf();
  rings[0].gap = METAL_GAP;
  rings[1].gap = 0;
  assert.equal(testExtraction(rings, 'moving').clear, true);
  rings[0].angle = Math.PI;
  assert.equal(testExtraction(rings, 'moving').clear, false);
});

test('per-ring planning retains and verifies nonzero tilt; direction is normalized', () => {
  const rings = hopf();
  rings[1].tilt = Math.PI / 6;
  rings[1].wire.exit.x = 5;
  const pose = findMetalPose(rings, 'moving');
  assert.ok(pose);
  assert.equal(pose.tilt, Math.PI / 6);
  assert.ok(canPose(rings, 'moving', pose));
  assert.equal(testExtraction(rings, 'moving', pose).clear, true);
  assert.ok(Math.abs(length(pose.direction) - 1) < 1e-9);
  assert.equal(wireCollision(rings, 'moving', { angle: undefined, tilt: undefined }), null);
});

test('translation checks intermediate contacts even when start and finish are clear', () => {
  const rings = hopf();
  const result = testExtraction(rings, 'moving');
  assert.equal(wireCollision(rings, 'moving', {}, { x: result.distance, y: 0, z: 0 }), null);
  assert.equal(result.clear, false);
  const moved = rings.map((r) => ({ ...r, wire: { ...r.wire } }));
  moved[1].x += result.blockedAt;
  assert.equal(
    wireCollision(moved, 'moving'),
    null,
    'blockedAt stops short of actual rod penetration',
  );
  let contact = false;
  for (let x = result.blockedAt; x < result.blockedAt + 8; x += 0.25) {
    if (wireCollision(rings, 'moving', {}, { x, y: 0, z: 0 })) contact = true;
  }
  assert.equal(contact, true);
});

test('rotation and tilt cannot tunnel through rods despite a clear final pose', () => {
  const moving = ring('moving');
  moving.wire.shape = 'stem';
  moving.wire.length = 60;
  const obstacle = ring('obstacle', 0, 'yz');
  obstacle.y = 95;
  obstacle.r = 12;
  obstacle.gap = 0;
  obstacle.wire.fixed = true;
  const rings = [moving, obstacle];
  assert.equal(wireCollision(rings, 'moving'), null);
  assert.equal(wireCollision(rings, 'moving', { angle: Math.PI }), null);
  assert.equal(canPose(rings, 'moving', { angle: Math.PI }), false);
  assert.equal(testExtraction(rings, 'moving', { angle: Math.PI }).clear, false);
  const a = ring('a');
  a.gap = 0;
  const b = ring('b');
  b.r = 12;
  b.y = 45;
  b.wire.z = 45;
  b.gap = 0;
  b.wire.fixed = true;
  assert.equal(wireCollision([a, b], 'a'), null);
  assert.equal(wireCollision([a, b], 'a', { tilt: Math.PI / 2 }), null);
  assert.equal(canPose([a, b], 'a', { tilt: Math.PI / 2 }), false);
});

test('oval, U and stem have distinct actual outlines and rods, not circle skins', () => {
  const c = ring('circle'),
    o = ring('oval', 0, 'xy', 'oval'),
    u = ring('u', 0, 'xy', 'u'),
    s = ring('stem', 0, 'xy', 'stem');
  const paths = [c, o, u, s].map((r) => wirePaths(r));
  assert.ok(Math.max(...paths[1][0].map((p) => p.y)) > 90);
  assert.ok(Math.max(...paths[0][0].map((p) => p.y)) < 65);
  assert.equal(paths[2].length, 1);
  assert.ok(distance(paths[2][0][0], paths[2][0].at(-1)!) > 120);
  assert.equal(paths[3].length, 2);
  assert.ok(Math.min(...paths[3].flat().map((p) => p.x)) < -110);
  const mouthProbe = ring('mouth-probe', 64, 'yz');
  mouthProbe.r = 4;
  mouthProbe.gap = 0;
  assert.equal(
    wireCollision([u, mouthProbe], mouthProbe.id),
    null,
    'no imaginary circle across the U mouth',
  );
  assert.ok(wireCollision([{ ...c, gap: 0 }, mouthProbe], mouthProbe.id));
  const probe = ring('probe', -95, 'yz');
  probe.y = 12;
  probe.r = 12;
  probe.gap = 0;
  assert.equal(wireCollision([c, probe], 'probe'), null);
  assert.ok(
    wireCollision([s, probe], 'probe'),
    'welded rod blocks space outside the circular loop',
  );
  const pair = hopf();
  const wall = ring('welded-wall', 220, 'yz', 'stem');
  wall.y = 90;
  wall.gap = 0;
  wall.wire.length = 64;
  pair.push(wall);
  assert.equal(wireCollision(pair, 'moving'), null);
  assert.equal(
    testExtraction(pair, 'moving', { angle: Math.PI }).clear,
    false,
    'a real stem through the extraction corridor blocks it',
  );
});

test('fixed/removed/missing pieces and invalid geometry do not grant extraction or hints', () => {
  const rings = hopf();
  assert.equal(testExtraction(rings, 'base').clear, false);
  assert.equal(canPose(rings, 'base', { angle: 1 }), false);
  assert.equal(findMetalPose(rings, 'base'), null);
  rings[1].removed = true;
  assert.equal(testExtraction(rings, 'moving').clear, false);
  assert.equal(findMetalHint(rings), null);
  assert.equal(testExtraction(rings, 'missing').clear, false);
  assert.throws(() => wirePaths({ ...rings[0], r: NaN }), RangeError);
  assert.equal(canPose(hopf(), 'moving', { tilt: Infinity }), false);
  const zero = hopf();
  zero[1].wire.exit = { x: 0, y: 0, z: 0 };
  assert.equal(testExtraction(zero, 'moving').clear, false);
});

test('12 stable levels have no initial collisions, real shape progression, and replayable hint paths', () => {
  assert.equal(METAL_LEVELS.length, 12);
  const started = performance.now();
  let moves = 0;
  for (const [i, level] of METAL_LEVELS.entries()) {
    assert.equal(level.id, `metal-${String(i + 1).padStart(2, '0')}`);
    assert.equal(level.campaign, 'metal');
    assert.equal(level.goalRingIds.length, 1);
    if (i < 6) assert.ok(level.rings.every((r) => r.wire.shape === 'circle'));
    else assert.ok(level.rings.some((r) => r.wire.shape !== 'circle'));
    const rings = structuredClone(level.rings);
    for (const r of rings)
      assert.equal(wireCollision(rings, r.id), null, `${level.id}/${r.id} starts clear`);
    let levelMoves = 0;
    for (let step = 0; !rings.find((r) => r.id === level.goalRingIds[0])!.removed; step++) {
      assert.ok(step < 4, `${level.id} needs a finite solution`);
      const hint = findMetalHint(rings, level.goalRingIds);
      assert.ok(hint, `${level.id} step ${step} has a physical hint`);
      assert.ok(canPose(rings, hint.ringId, hint));
      assert.ok(testExtraction(rings, hint.ringId, hint).clear);
      const selected = rings.find((r) => r.id === hint.ringId)!;
      selected.angle = hint.angle;
      selected.tilt = hint.tilt;
      const replay = testExtraction(rings, selected.id);
      assert.equal(replay.clear, true);
      for (let t = 0; t <= 1; t += 0.05) {
        const translation = {
          x: replay.direction.x * replay.distance * t,
          y: replay.direction.y * replay.distance * t,
          z: replay.direction.z * replay.distance * t,
        };
        assert.equal(
          wireCollision(rings, selected.id, {}, translation),
          null,
          `${level.id} hint animation remains clear`,
        );
      }
      selected.removed = true;
      moves++;
      levelMoves++;
    }
    assert.equal(levelMoves, level.parMoves, `${level.id} preserves its geometric removal order`);
    assert.ok(rings.some((r) => r.wire.fixed && !r.removed));
  }
  console.log(
    `metal: ${METAL_LEVELS.length} levels, ${moves} verified removals, ${Math.round(performance.now() - started)}ms`,
  );
});

test('closed welded ring can leave a real U after its outer blocker is removed', () => {
  const rings = structuredClone(METAL_LEVELS[9].rings);
  const target = rings.find((r) => r.id === 'goal')!;
  assert.equal(target.wire.shape, 'stem');
  assert.equal(target.gap, 0);
  assert.equal(rings[0].wire.shape, 'u');
  assert.equal(findMetalPose(rings, target.id), null);
  const outer = findMetalHint(rings, ['goal']);
  assert.ok(outer && outer.ringId !== 'goal');
  rings.find((r) => r.id === outer.ringId)!.removed = true;
  const pose = findMetalPose(rings, 'goal');
  assert.ok(pose);
  assert.deepEqual(pose.direction, { x: 0, y: 1, z: 0 });
  assert.ok(testExtraction(rings, 'goal', pose).clear);
});

test('goal preference, geometric outer-first ordering and arbitrary IDs do not fabricate solutions', () => {
  const rings = structuredClone(METAL_LEVELS[4].rings);
  assert.equal(findMetalPose(rings, 'goal'), null, 'inner target is physically blocked');
  const hint = findMetalHint(rings, ['goal']);
  assert.ok(hint);
  assert.equal(hint.ringId, rings.at(-1)!.id);
  const pair = hopf();
  pair[0].id = 'random-anchor';
  pair[1].id = 'random-piece';
  assert.equal(findMetalHint(pair, ['random-piece'])?.ringId, 'random-piece');
  const snapshot = JSON.stringify(pair);
  findMetalPose(pair, 'random-piece');
  assert.equal(JSON.stringify(pair), snapshot, 'planning is pure');
});
