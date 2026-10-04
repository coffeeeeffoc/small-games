import test from 'node:test';
import assert from 'node:assert/strict';
import { axisIndex, isCollisionFree, sweepMove } from './collision.ts';
import { routePiece } from './routing.ts';
import { IDENTITY_ORIENTATION, quarterTurnOrientation } from './rotation.ts';
import { createSearchSweep } from './search-sweep.ts';
import type { Box, Level, Offsets, Orientations, PieceDefinition, Vec3 } from './types.ts';

const block = (id: string, min: Vec3, max: Vec3): PieceDefinition => ({
  id,
  name: id,
  color: '#fff',
  axis: 'x',
  range: [-6, 6],
  removedAt: 6,
  boxes: [{ min, max }],
});
const createLevel = (...obstacles: Box[]): Level => ({
  id: 'route',
  title: 'route',
  subtitle: '',
  description: '',
  difficulty: '',
  estimatedMinutes: '',
  pieces: [
    block('moving', [0, 0, 0], [1, 1, 1]),
    ...obstacles.map((box, i) => block(`obstacle-${i}`, box.min, box.max)),
  ],
});
const offsetsFor = (level: Level, start: Vec3 = [0, 0, 0]): Offsets =>
  Object.fromEntries(
    level.pieces.map((piece) => [piece.id, piece.id === 'moving' ? start : [0, 0, 0]]),
  );

function assertRoute(level: Level, offsets: Offsets, target: Vec3, orientations?: Orientations) {
  const before = structuredClone(offsets);
  const route = routePiece(level, offsets, 'moving', target, orientations);
  assert.ok(route, `route exists from ${offsets.moving} to ${target}`);
  const current = { ...offsets };
  for (const [index, step] of route.entries()) {
    if (index > 0) assert.notEqual(step.axis, route[index - 1]!.axis, 'adjacent steps are merged');
    const result = sweepMove(level, current, 'moving', step.targetOffset, step.axis, orientations);
    assert.ok(Math.abs(result.actualOffset - step.targetOffset) <= 1e-6);
    const dimension = axisIndex(step.axis);
    current.moving = current.moving!.map((value, i) =>
      i === dimension ? result.actualOffset : value,
    ) as unknown as Vec3;
    assert.ok(isCollisionFree(level, current, orientations));
  }
  assert.deepEqual(current.moving, target);
  assert.deepEqual(offsets, before, 'routing does not mutate the game pose');
  return route;
}

test('a rectilinear route goes around a blocker instead of crossing its endpoint-free sweep', () => {
  const level = createLevel({ min: [3, -1, -1], max: [4, 2, 2] });
  const offsets = offsetsFor(level);
  assert.equal(sweepMove(level, offsets, 'moving', 6, 'x').blocked, true);
  const route = assertRoute(level, offsets, [6, 0, 0]);
  assert.ok(route.some((step) => step.axis !== 'x'));
  assert.ok(route.length >= 3);
  assert.ok(
    route.every((step) => step.targetOffset * 2 === Math.round(step.targetOffset * 2)),
    'clearance detours remain reachable by half-unit nudges and drag snapping',
  );
});

test('routes and cached sweeps account for the current orientation at unchanged offsets', () => {
  const level = createLevel({ min: [5, 1.5, 0], max: [6, 2.5, 1] });
  level.pieces = [block('moving', [0, 0, 0], [4, 1, 1]), ...level.pieces.slice(1)];
  const offsets = offsetsFor(level);
  const orientations = {
    moving: quarterTurnOrientation('z', 1),
    'obstacle-0': IDENTITY_ORIENTATION,
  };
  const sweep = createSearchSweep(level);
  assert.equal(sweep(offsets, 'moving', 8, 'x'), 8, 'the unrotated piece passes below the blocker');
  const expected = sweepMove(level, offsets, 'moving', 8, 'x', orientations);
  assert.equal(expected.blocked, true);
  assert.equal(
    sweep(offsets, 'moving', 8, 'x', orientations),
    expected.actualOffset,
    'rotation invalidates pair intervals even when offsets are unchanged',
  );
  const route = assertRoute(level, offsets, [8, 0, 0], orientations);
  assert.ok(
    route.some((step) => step.axis !== 'x'),
    'the taller rotated piece needs a detour',
  );
});

test('routes use all three coordinates and remain valid for far arbitrary poses', () => {
  const level = createLevel(
    { min: [3, -1, -1], max: [4, 2, 2] },
    { min: [-2, 4, -1], max: [3, 5, 3] },
    { min: [-3, -3, 5], max: [3, 3, 6] },
    { min: [-6, -3, -3], max: [-5, 3, 3] },
  );
  for (const [start, target] of [
    [
      [-10000, 999, -230],
      [12345, -781, 414],
    ],
    [
      [21, -45, 32],
      [0, 0, 0],
    ],
    [
      [0, 0, 0],
      [-5000, 425, -532],
    ],
  ] as const)
    assertRoute(level, offsetsFor(level, start), target);
});

test('zero-padding fallback handles legal starts and targets inside the optional margin', () => {
  const level = createLevel({ min: [1.05, 0, 0], max: [2, 1, 1] });
  assertRoute(level, offsetsFor(level), [-5, 0, 0]);
  assertRoute(level, offsetsFor(level, [-5, 0, 0]), [0, 0, 0]);
});

test('a legal unchanged pose needs no routing steps', () => {
  const level = createLevel({ min: [3, -1, -1], max: [4, 2, 2] });
  assert.deepEqual(routePiece(level, offsetsFor(level), 'moving', [0, 0, 0]), []);
});

test('colliding starts and destinations are rejected', () => {
  const level = createLevel({ min: [3, -1, -1], max: [4, 2, 2] });
  assert.equal(routePiece(level, offsetsFor(level), 'moving', [3.25, 0, 0]), null);
  assert.equal(routePiece(level, offsetsFor(level, [3.25, 0, 0]), 'moving', [6, 0, 0]), null);
});

test('routing rejects missing pieces, malformed coordinates and overflowing segments', () => {
  const level = createLevel();
  const offsets = offsetsFor(level);
  assert.equal(routePiece(level, offsets, 'unknown', [3, 0, 0]), null);
  assert.equal(routePiece(level, {}, 'moving', [3, 0, 0]), null);
  assert.equal(routePiece(level, offsets, 'moving', [NaN, 0, 0]), null);
  assert.equal(routePiece(level, { moving: [0, Infinity, 0] }, 'moving', [3, 0, 0]), null);
  assert.equal(
    routePiece(level, { moving: [-Number.MAX_VALUE, 0, 0] }, 'moving', [Number.MAX_VALUE, 0, 0]),
    null,
  );
});

test('conservative routing does not squeeze through a fork bounding box', () => {
  const level = createLevel();
  level.pieces = [
    ...level.pieces,
    {
      ...block('fork', [2, -2, -2], [3, -1, 2]),
      boxes: [
        { min: [2, -2, -2], max: [3, -1, 2] },
        { min: [2, 2, -2], max: [3, 3, 2] },
      ],
    },
  ];
  const offsets = offsetsFor(level);
  assert.equal(sweepMove(level, offsets, 'moving', 5, 'x').blocked, false);
  const route = assertRoute(level, offsets, [5, 0, 0]);
  assert.ok(route.some((step) => step.axis !== 'x'));
});
