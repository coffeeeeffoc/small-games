import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_HALF, FACE_IDS, FACE_DEFS, facePoint, projectFace } from '../faces.mjs';
import {
  BALL_RADIUS,
  dot,
  cross,
  subtract,
  getGateGeometry,
  getShaftGeometry,
} from '../geometry.mjs';
import {
  createState,
  validateLevel,
  moveShaft,
  toggleLatch,
  viewFace,
  revealFace,
  revealStructure,
  releaseBall,
  advanceBall,
  getGateStatus,
  getSnapshot,
} from '../engine.mjs';

const fixture = () => ({
  id: 'spatial-fixture',
  shafts: [
    {
      id: 'A',
      label: 'A轴',
      face: 'front',
      anchor: [-60, -100],
      slideAxis: [0, 1, 0],
      initial: 0,
      min: 0,
      max: 2,
    },
    {
      id: 'B',
      label: 'B轴',
      face: 'top',
      anchor: [80, -100],
      slideAxis: [0, 0, -1],
      initial: 0,
      min: 0,
      max: 2,
    },
  ],
  latches: [
    {
      id: 'lock-A',
      label: 'A锁扣',
      shaft: 'A',
      face: 'back',
      anchor: [0, -100],
      initial: true,
      releaseWhen: [{ shaft: 'B', positions: [1] }],
    },
  ],
  gates: [
    {
      id: 'entry',
      label: '入口板',
      shaft: 'A',
      pathIndex: 2,
      center: [-40, 0, 0],
      normal: [1, 0, 0],
      aperture: { offsets: [128], radius: 12 },
      travel: 64,
    },
    {
      id: 'exit',
      label: '出口板',
      shaft: 'A',
      pathIndex: 5,
      center: [40, 0, 0],
      normal: [1, 0, 0],
      aperture: { offsets: [0], radius: 12 },
      travel: 64,
    },
  ],
  path: [
    [-100, 0, 0],
    [-54, 0, 0],
    [-40, 0, 0],
    [-26, 0, 0],
    [26, 0, 0],
    [40, 0, 0],
    [54, 0, 0],
    [100, 0, 0],
  ],
  checkpoints: [
    { pathIndex: 2, gateIds: ['entry'] },
    { pathIndex: 5, gateIds: ['exit'] },
    { pathIndex: 7, gateIds: [] },
  ],
});
const newState = (level = fixture()) => createState(level, { initialFaces: ['front', 'back'] });
const clone = (value) => structuredClone(value);

function unlock(level, state) {
  revealFace(state, 'top');
  viewFace(state, 'top');
  assert.equal(moveShaft(level, state, 'B', 1).ok, true);
  viewFace(state, 'back');
  assert.equal(toggleLatch(level, state, 'lock-A').ok, true);
  viewFace(state, 'front');
}
function complete(level, state) {
  unlock(level, state);
  moveShaft(level, state, 'A', 2);
  releaseBall(level, state);
  advanceBall(level, state);
  moveShaft(level, state, 'A', 0);
  advanceBall(level, state);
  advanceBall(level, state);
}

test('six camera bases are right-handed, invertible and correctly mirrored', () => {
  for (const face of FACE_IDS) {
    const basis = FACE_DEFS[face];
    assert.deepEqual(
      cross(basis.u, basis.v).map((x) => x || 0),
      basis.normal,
    );
    assert.equal(dot(basis.u, basis.v), 0);
    const projected = projectFace(facePoint(face, 31, -72, 123), face).map((x) => x || 0);
    assert.deepEqual(projected, [31, -72, 123]);
    assert.equal(Math.max(...facePoint(face, 0, 0).map(Math.abs)), BOX_HALF);
  }
  assert.equal(projectFace([32, 10, 80], 'front')[0], 32);
  assert.equal(projectFace([32, 10, 80], 'back')[0], -32);
  assert.equal(projectFace([32, 10, 80], 'top')[1], -80);
  assert.equal(projectFace([32, 10, 80], 'bottom')[1], 80);
});

test('all 15 distinct face pairs are available through uniform deterministic bins', () => {
  const level = fixture();
  const pairs = new Set();
  for (let index = 0; index < 15; index += 1) {
    let call = 0;
    const state = createState(level, { random: () => (call++ ? 0 : (index + 0.5) / 15) });
    assert.equal(state.revealedFaces.length, 2);
    assert.equal(new Set(state.revealedFaces).size, 2);
    pairs.add([...state.revealedFaces].sort().join(','));
  }
  assert.equal(pairs.size, 15);
  assert.throws(() => createState(level, { random: () => 1 }), /随机源/);
  assert.throws(() => createState(level, { initialFaces: ['front', 'front'] }), /两个不同/);
  level.initialViews = { eligiblePairs: [['top', 'back']] };
  assert.deepEqual(createState(level, { random: () => 0 }).initialFaces, ['top', 'back']);
});

test('hints reveal one face for free, cannot bypass the final structure hint, and preserve physical state', () => {
  const level = fixture();
  const state = newState(level);
  const original = clone(state);
  assert.equal(viewFace(state, 'left').ok, false);
  assert.equal(revealStructure(state).ok, false);
  assert.deepEqual(state, original);
  assert.equal(revealFace(state, 'left').changed, true);
  assert.equal(revealFace(state, 'left').changed, false);
  viewFace(state, 'left');
  for (const face of FACE_IDS) revealFace(state, face);
  assert.equal(revealStructure(state).ok, true);
  assert.equal(state.structureViewed, true);
  assert.equal(state.moves, 0);
  assert.deepEqual(state.shafts, original.shafts);
  assert.deepEqual(state.latches, original.latches);
  assert.equal(state.checkpoint, original.checkpoint);
  assert.deepEqual(state.initialFaces, ['front', 'back']);
});

test('only the currently revealed control face allows manipulation; conditional locks cannot be bypassed', () => {
  const level = fixture();
  const state = newState(level);
  const original = clone(state);
  assert.equal(moveShaft(level, state, 'A', 2).ok, false);
  assert.equal(moveShaft(level, state, 'B', 1).ok, false);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, false);
  assert.deepEqual(state, original);
  viewFace(state, 'back');
  const locked = clone(state);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, false);
  assert.deepEqual(state, locked);
  unlock(level, state);
  assert.equal(moveShaft(level, state, 'A', 2).ok, true);
  viewFace(state, 'back');
  assert.equal(toggleLatch(level, state, 'lock-A').ok, true);
  viewFace(state, 'front');
  assert.equal(moveShaft(level, state, 'A', 0).ok, false);
});

test('one physical shaft drives both holes and their plate corners by the same displacement', () => {
  const level = fixture();
  const state = newState(level);
  const before = getGateGeometry(level, state, 'entry');
  const handleBefore = getShaftGeometry(level, state, 'A').handle;
  state.shafts.A = 2;
  const after = getGateGeometry(level, state, 'entry');
  assert.equal(before.open, false);
  assert.equal(after.open, true);
  assert.equal(getGateStatus(level, state, 'exit').open, false);
  for (let index = 0; index < 4; index += 1)
    assert.deepEqual(subtract(after.corners[index], before.corners[index]), [0, 128, 0]);
  assert.deepEqual(subtract(after.apertures[0].center, before.apertures[0].center), [0, 128, 0]);
  assert.deepEqual(subtract(getShaftGeometry(level, state, 'A').handle, handleBefore), [0, 128, 0]);
  assert.equal(after.clearance, 12 - BALL_RADIUS);
});

test('hole clearance is geometric, including the ball radius and off-detent bore centers', () => {
  const level = fixture();
  const state = newState(level);
  state.shafts.A = 1;
  level.gates[0].aperture.offsets = [68];
  assert.equal(
    getGateStatus(level, state, 'entry').open,
    true,
    'A 4-unit gap is exactly traversable with r=8 in r=12.',
  );
  level.gates[0].aperture.offsets = [68.01];
  assert.equal(getGateStatus(level, state, 'entry').open, false);
  level.gates[0].aperture.offsets = [0, 128];
  assert.equal(getGateStatus(level, state, 'entry').open, false);
  state.shafts.A = 0;
  assert.equal(getGateStatus(level, state, 'entry').open, true);
  state.shafts.A = 2;
  assert.equal(getGateStatus(level, state, 'entry').open, true);
});

test('the solid plate covers the route at every detent, so closed holes cannot be bypassed around its edge', () => {
  const level = fixture();
  const state = newState(level);
  for (let position = 0; position <= 2; position += 1) {
    state.shafts.A = position;
    for (const gate of level.gates) {
      const shape = getGateGeometry(level, state, gate);
      const along = dot(subtract(gate.center, shape.center), shape.slideAxis);
      const across = dot(subtract(gate.center, shape.center), shape.transverse);
      assert.ok(Math.abs(along) + BALL_RADIUS <= shape.halfLength);
      assert.ok(Math.abs(across) + BALL_RADIUS <= shape.halfWidth);
      assert.ok(shape.corners.flat().every((value) => Math.abs(value) <= BOX_HALF));
    }
  }
});

test('a ball can launch on any revealed face, wait at a closed gate, and recover by changing detents', () => {
  const level = fixture();
  const state = newState(level);
  unlock(level, state);
  moveShaft(level, state, 'A', 2);
  viewFace(state, 'back');
  assert.equal(releaseBall(level, state).ok, true);
  assert.equal(advanceBall(level, state).ok, true);
  const blocked = clone(state);
  assert.equal(advanceBall(level, state).ok, false);
  assert.deepEqual(state, blocked);
  viewFace(state, 'front');
  moveShaft(level, state, 'A', 0);
  assert.equal(advanceBall(level, state).ok, true);
  assert.equal(state.completed, false, 'Passing the last hole is not arriving at the exit.');
  assert.equal(advanceBall(level, state).completed, true);
  assert.equal(getSnapshot(level, state).ballPathIndex, level.path.length - 1);
  assert.equal(state.moves, 5);
  assert.equal(state.structureViewed, false);
  assert.equal(
    revealStructure(state).ok,
    true,
    'Completion permits the automatic full-structure review without six hints.',
  );
});

test('invalid and post-completion actions do not change physical state', () => {
  const level = fixture();
  const state = newState(level);
  const original = clone(state);
  for (const value of [-1, 3, 0.5, NaN])
    assert.equal(moveShaft(level, state, 'A', value).ok, false);
  assert.equal(moveShaft(level, state, 'missing', 0).ok, false);
  assert.equal(toggleLatch(level, state, 'missing').ok, false);
  assert.equal(advanceBall(level, state).ok, false);
  assert.deepEqual(state, original);
  complete(level, state);
  const completed = clone(state);
  assert.equal(moveShaft(level, state, 'A', 1).ok, false);
  assert.equal(toggleLatch(level, state, 'lock-A').ok, false);
  assert.equal(releaseBall(level, state).ok, false);
  assert.equal(advanceBall(level, state).ok, false);
  assert.deepEqual(state, completed);
});

test('validation rejects broken 3D geometry, references, exits and camera assignments before play', () => {
  assert.deepEqual(validateLevel(fixture()), { valid: true, errors: [] });
  const corruptions = [
    (level) => {
      level.path[0] = [1, 2];
    },
    (level) => {
      level.path[0][0] = Infinity;
    },
    (level) => {
      level.path[1][1] = 5;
    },
    (level) => {
      level.path[1][0] = -46;
    },
    (level) => {
      level.gates[0].center[1] = 1;
    },
    (level) => {
      level.gates[0].normal = [0, 1, 0];
    },
    (level) => {
      level.gates[0].aperture.radius = 7;
    },
    (level) => {
      level.gates[0].aperture.offsets = [60, 68];
    },
    (level) => {
      level.gates[0].travel = 32;
    },
    (level) => {
      level.gates[0].aperture.offsets = [500];
    },
    (level) => {
      level.shafts[0].anchor[1] = 240;
    },
    (level) => {
      level.shafts[0].slideAxis = [0, 0, 1];
    },
    (level) => {
      level.latches[0].shaft = 'missing';
    },
    (level) => {
      level.latches[0].releaseWhen[0].positions = [4];
    },
    (level) => {
      level.latches[0].face = 'up';
    },
    (level) => {
      level.checkpoints.pop();
    },
    (level) => {
      level.checkpoints[0].gateIds = ['exit'];
    },
    (level) => {
      level.initialViews = { eligiblePairs: [['front', 'front']] };
    },
  ];
  for (const corrupt of corruptions) {
    const level = fixture();
    corrupt(level);
    assert.equal(validateLevel(level).valid, false, String(corrupt));
    assert.throws(() => createState(level), /无效关卡/);
  }
});

test('simultaneous revealed faces operate shared mechanisms without switching the camera', () => {
  const level = fixture();
  const state = createState(level, { initialFaces: ['front', 'top'] });
  const initial = structuredClone(state);
  assert.equal(toggleLatch(level, state, 'lock-A', 'back').ok, false);
  assert.deepEqual(state, initial, 'An explicit hidden face cannot bypass observation access');
  assert.equal(moveShaft(level, state, 'B', 1, 'front').ok, false);
  assert.deepEqual(state, initial, 'A face cannot operate another face’s handle');
  assert.equal(moveShaft(level, state, 'B', 1, 'top').ok, true);
  assert.equal(state.side, 'front');
  assert.equal(revealFace(state, 'back').ok, true);
  assert.equal(toggleLatch(level, state, 'lock-A', 'back').ok, true);
  assert.equal(moveShaft(level, state, 'A', 2, 'front').ok, true);
  assert.equal(getGateStatus(level, state, 'entry').open, true);
  assert.equal(state.side, 'front');
  assert.equal(state.flips, 0);
  assert.equal(state.moves, 3);
});
