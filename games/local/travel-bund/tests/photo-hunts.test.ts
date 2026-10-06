import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createGround } from '../src/physics.ts';
import { onRiver, type V3, type WorldData } from '../src/world.ts';
import {
  PHOTO_HUNT_SAVE_KEY,
  cameraAim,
  emptyPhotoHuntSave,
  isPhotoHuntUnlocked,
  isSafePhotoPosition,
  loadPhotoHuntSave,
  persistPhotoHuntSave,
  photoHuntProgress,
  photoHuntTarget,
  photoHunts,
  readPhotoHuntSave,
  settlePhotoHunt,
  validatePhotoHunt,
  validatePhotoHunts,
  type PhotoHunt,
  type PhotoPose,
} from '../src/photo-hunts.ts';

const data: WorldData = JSON.parse(
  readFileSync(
    new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url),
    'utf8',
  ),
);
const require = createRequire(import.meta.url);
const rapier = createRequire(require.resolve('@react-three/rapier'))('@dimforge/rapier3d-compat');
await rapier.init();
const poseFor = (hunt: PhotoHunt, position = hunt.station.position): PhotoPose => ({
  position,
  ...cameraAim(position, photoHuntTarget(hunt, data)!),
  grounded: true,
});

test('the photo catalog references real landmarks and has a valid sequential unlock chain', () => {
  assert.equal(photoHunts.length, 4);
  assert.deepEqual(validatePhotoHunts(data), []);
  assert.deepEqual(
    photoHunts.map((hunt) => hunt.landmark),
    ['customs-house', 'hsbc-building', 'peace-hotel', 'oriental-pearl'],
  );
  for (const hunt of photoHunts) {
    assert.equal(validatePhotoHunt(hunt, poseFor(hunt), data).ok, true);
    assert.equal(
      validatePhotoHunt(hunt, poseFor(hunt, hunt.start.position), data).code,
      'wrong-position',
    );
  }
});

test('actual Rapier supports every start and shot station, with continuous promenade ground and no earlier building blocking the landmark', () => {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({ world, rapier }, data);
    world.step();
    for (const hunt of photoHunts) {
      for (let step = 0; step <= 10; step++) {
        const fraction = step / 10;
        const position: V3 = hunt.start.position.map(
          (value, axis) => value * (1 - fraction) + hunt.station.position[axis] * fraction,
        ) as V3;
        const [x, y, z] = position;
        assert.equal(onRiver(x, z, data), false, `${hunt.id}: path enters river`);
        // Query below tree canopies. Ignore fixture volumes: their tops are not
        // walking surfaces, and the player can walk around the visible props.
        const hit = world.castRay(
          new rapier.Ray({ x, y: 3, z }, { x: 0, y: -1, z: 0 }),
          4,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          (collider) => {
            const half = collider.shape.halfExtents;
            return !half || collider.translation().y + half.y < 1.1;
          },
        );
        assert(hit, `${hunt.id}: missing ground`);
        const ground = 3 - hit.timeOfImpact;
        assert(
          Math.abs(ground - 0.92) < 0.025,
          `${hunt.id}: approach leaves the continuous raised promenade`,
        );
        if (step === 0 || step === 10) {
          assert(
            Math.abs(y - ground - 0.855) < 0.025,
            `${hunt.id}: start and station must use the real grounded capsule height`,
          );
          assert(
            isSafePhotoPosition(position, data),
            `${hunt.id}: start or station meets a static fixture`,
          );
          let blocked = false;
          world.intersectionsWithShape(
            { x, y: ground + 0.88, z },
            { x: 0, y: 0, z: 0, w: 1 },
            new rapier.Capsule(0.5, 0.29),
            () => {
              blocked = true;
              return false;
            },
          );
          assert.equal(
            blocked,
            false,
            `${hunt.id}: start or station lacks physical player clearance`,
          );
        }
      }
      const position = hunt.station.position,
        target = photoHuntTarget(hunt, data)!;
      const delta = [
        target[0] - position[0],
        target[1] - position[1] - 0.82,
        target[2] - position[2],
      ];
      const length = Math.hypot(...delta);
      const hit = world.castRay(
        new rapier.Ray(
          { x: position[0], y: position[1] + 0.82, z: position[2] },
          { x: delta[0] / length, y: delta[1] / length, z: delta[2] / length },
        ),
        length,
        true,
      );
      assert(hit, `${hunt.id}: target needs actual physical geometry`);
      const blocker = hit.collider.translation();
      assert(
        Math.hypot(blocker.x - target[0], blocker.z - target[2]) < 3,
        `${hunt.id}: another structure blocks the reference view`,
      );
    }
  } finally {
    world.free();
  }
});

test('zoom and viewport shape cannot credit a landmark outside the actual photograph frame', () => {
  const hunt = photoHunts[1],
    pose = poseFor(hunt);
  const wide = { ...pose, verticalFov: (68 * Math.PI) / 180, aspect: 1 };
  assert.equal(validatePhotoHunt(hunt, wide, data).ok, true);
  const shifted = { ...wide, yaw: wide.yaw + 0.3 };
  assert.equal(validatePhotoHunt(hunt, shifted, data).ok, true);
  const narrow = { ...shifted, verticalFov: (30 * Math.PI) / 180 };
  assert.equal(validatePhotoHunt(hunt, narrow, data).code, 'outside-frame');
  assert.equal(
    validatePhotoHunt(
      hunt,
      { ...pose, pitch: pose.pitch + 0.3, verticalFov: (30 * Math.PI) / 180, aspect: 2 },
      data,
    ).code,
    'outside-frame',
  );
  assert.equal(validatePhotoHunt(hunt, { ...shifted, aspect: 0.4 }, data).code, 'outside-frame');
  assert.equal(
    validatePhotoHunt(hunt, { ...pose, verticalFov: (30 * Math.PI) / 180, aspect: 0.4 }, data).ok,
    true,
  );
  assert.equal(
    validatePhotoHunt(hunt, { ...pose, verticalFov: NaN, aspect: 1 }, data).code,
    'invalid-pose',
  );
  assert.equal(
    validatePhotoHunt(hunt, { ...pose, verticalFov: 0.5, aspect: 0 }, data).code,
    'invalid-pose',
  );
});

test('a correct pose cannot complete a photograph until its landmark model is rendered', () => {
  const hunt = photoHunts[0],
    pose = poseFor(hunt);
  const notLoaded = { ...pose, landmarkLoaded: false };
  assert.equal(validatePhotoHunt(hunt, notLoaded, data).code, 'landmark-loading');
  const result = settlePhotoHunt(emptyPhotoHuntSave(), hunt.id, notLoaded, data);
  assert.equal(result.ok, false);
  assert.equal(result.newlyCompleted, false);
  assert.deepEqual(result.save.completed, []);
  assert.equal(validatePhotoHunt(hunt, { ...pose, landmarkLoaded: true }, data).ok, true);
  assert.equal(
    validatePhotoHunt(hunt, pose, data).ok,
    true,
    'Isolated Scene adapters may omit model streaming state',
  );
});

test('a photograph needs the right safe position, target distance and both camera angles', () => {
  const hunt = photoHunts[0],
    pose = poseFor(hunt);
  const errors: [PhotoPose, string][] = [
    [{ ...pose, position: hunt.start.position }, 'wrong-position'],
    [
      { ...pose, position: [pose.position[0], pose.position[1] + 0.7, pose.position[2]] },
      'wrong-position',
    ],
    [{ ...pose, grounded: false }, 'not-grounded'],
    [{ ...pose, yaw: pose.yaw + Math.PI }, 'wrong-direction'],
    [{ ...pose, pitch: pose.pitch - hunt.angleTolerance - 0.01 }, 'wrong-angle'],
    [{ ...pose, pitch: pose.pitch + hunt.angleTolerance + 0.01 }, 'wrong-angle'],
    [{ ...pose, yaw: NaN }, 'invalid-pose'],
    [{ ...pose, position: [NaN, pose.position[1], pose.position[2]] }, 'invalid-pose'],
    [{ ...pose, position: [0, pose.position[1], 0] }, 'unsafe-position'],
    [
      { ...pose, position: [...data.colliders.find((box) => box.half[1] > 10)!.position] },
      'unsafe-position',
    ],
  ];
  for (const [candidate, code] of errors) {
    const result = validatePhotoHunt(hunt, candidate, data);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.match(
      result.reason,
      /[\u4e00-\u9fff]/,
      'Wrong photographs need a visible Chinese reason',
    );
  }
  assert.equal(
    validatePhotoHunt({ ...hunt, distance: [100, 200] }, pose, data).code,
    'wrong-distance',
  );
  assert.equal(
    validatePhotoHunt({ ...hunt, distance: [1, 50] }, pose, data).code,
    'wrong-distance',
  );
  assert.equal(
    validatePhotoHunt({ ...hunt, landmark: 'missing' }, pose, data).code,
    'missing-landmark',
  );
  // Camera yaw has no artificial discontinuity when the player turns beyond +/- pi.
  assert.equal(validatePhotoHunt(hunt, { ...pose, yaw: pose.yaw + 8 * Math.PI }, data).ok, true);
  assert.equal(
    validatePhotoHunt(
      hunt,
      {
        ...pose,
        yaw: pose.yaw + hunt.angleTolerance - 0.01,
        pitch: pose.pitch - hunt.angleTolerance + 0.01,
      },
      data,
    ).ok,
    true,
  );
});

test('only successful photos unlock the next level and repeated shutters settle once', () => {
  let save = emptyPhotoHuntSave();
  assert.equal(photoHuntProgress(save).next?.id, photoHunts[0].id);
  assert.equal(
    settlePhotoHunt(save, photoHunts[1].id, poseFor(photoHunts[1]), data).code,
    'locked',
  );
  assert.equal(
    settlePhotoHunt(save, 'unknown', poseFor(photoHunts[0]), data).code,
    'unknown-level',
  );
  const failed = settlePhotoHunt(
    save,
    photoHunts[0].id,
    { ...poseFor(photoHunts[0]), yaw: 0 },
    data,
  );
  assert.equal(failed.save, save);
  assert.equal(failed.newlyCompleted, false);
  for (const hunt of photoHunts) {
    assert.equal(isPhotoHuntUnlocked(save, hunt.id), true);
    const previous = save;
    const result = settlePhotoHunt(save, hunt.id, poseFor(hunt), data);
    assert.equal(result.ok, true);
    assert.equal(result.newlyCompleted, true);
    save = result.save;
    assert.notEqual(save, previous, 'Settlements must not mutate the caller snapshot');
    const repeat = settlePhotoHunt(save, hunt.id, poseFor(hunt), data);
    assert.equal(repeat.ok, true);
    assert.equal(repeat.code, 'already-completed');
    assert.equal(repeat.newlyCompleted, false);
    assert.equal(repeat.save, save);
    assert.equal(save.completed.filter((id) => id === hunt.id).length, 1);
  }
  assert.deepEqual(photoHuntProgress(save), { completed: 4, total: 4, next: null });
});

test('photo saves migrate legacy progress and reject corruption, gaps and unrelated walking visits', () => {
  const ids = photoHunts.map((hunt) => hunt.id);
  for (const value of [
    null,
    '',
    '{broken',
    'true',
    '{}',
    JSON.stringify(['customs-house']),
    JSON.stringify([ids[1]]),
    JSON.stringify({ version: 99, completed: ids }),
  ])
    assert.deepEqual(readPhotoHuntSave(value), emptyPhotoHuntSave());
  for (const value of [
    JSON.stringify(ids),
    JSON.stringify({ version: 0, passed: [...ids, ids[0], 'unknown'] }),
    JSON.stringify({ completed: [...ids].reverse() }),
    JSON.stringify({ version: 1, completed: [1, ...ids, ids[0]] }),
  ])
    assert.deepEqual(readPhotoHuntSave(value), { version: 1, completed: ids });
  assert.deepEqual(readPhotoHuntSave(JSON.stringify({ version: 1, completed: [ids[0], ids[2]] })), {
    version: 1,
    completed: [ids[0]],
  });
  const historical = readPhotoHuntSave(
    '{"version":1,"completed":["clock-tower","stone-dome","green-roof"]}',
  );
  assert.deepEqual(historical.completed, ['clock-tower', 'stone-dome', 'green-roof']);
  assert.equal(
    photoHuntProgress(historical).next?.id,
    'pearl-skyline',
    'Changing reference views and display titles must preserve existing unlocks',
  );
});

test('unavailable storage never blocks in-memory photography or the next unlock', () => {
  const denied = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  const save = loadPhotoHuntSave(denied);
  const completed = settlePhotoHunt(save, photoHunts[0].id, poseFor(photoHunts[0]), data).save;
  assert.equal(persistPhotoHuntSave(denied, completed), false);
  assert.equal(persistPhotoHuntSave(null, completed), false);
  assert.equal(isPhotoHuntUnlocked(completed, photoHunts[1].id), true);
  const stored = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return stored.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      stored.set(key, value);
    },
  };
  assert.equal(persistPhotoHuntSave(storage, completed), true);
  assert(stored.has(PHOTO_HUNT_SAVE_KEY));
  assert.deepEqual(loadPhotoHuntSave(storage), completed);
});

test('content validation detects invalid parameters, broken references and unreachable unlocks', () => {
  const malformed: PhotoHunt[] = photoHunts.map((hunt) => ({
    ...hunt,
    station: { ...hunt.station },
    start: { ...hunt.start },
  }));
  malformed[0] = {
    ...malformed[0],
    requires: malformed[1].id,
    station: { position: [0, 1.775, 0], radius: 0 },
    angleTolerance: NaN,
    distance: [10, 5],
  };
  malformed[1] = {
    ...malformed[1],
    landmark: 'missing',
    referenceImage: 'incorrect.webp',
    start: { position: [0, 1.775, 0], yaw: NaN, pitch: 0 },
  };
  malformed[2] = { ...malformed[2], id: malformed[3].id, requires: 'missing', destination: 5 };
  const issues = validatePhotoHunts(data, malformed).join('\n');
  for (const fragment of [
    '关卡 ID',
    '地标不存在',
    '照片路径',
    '站位范围',
    '取景角度',
    '目标距离',
    '出发视角',
    '落脚点',
    '前置关卡',
    '解锁依赖存在循环',
    '目录顺序',
  ])
    assert(issues.includes(fragment), fragment);
});
