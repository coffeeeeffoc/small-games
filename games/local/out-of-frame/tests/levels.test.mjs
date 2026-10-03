import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, LEVELS } from '../levels.mjs';
import { CONSTANTS } from '../engine.mjs';
import { SOLUTIONS, solveRoom } from './solutions.mjs';

test('100 distinct rooms form ten complete chapters and retain the original room IDs', () => {
  assert.equal(LEVELS.length, 100);
  assert.equal(CHAPTERS.length, 10);
  assert.equal(SOLUTIONS.length, 100);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, 100);
  for (const id of [
    'first-still',
    'borrow-a-step',
    'stay-with-it',
    'one-frame-two-jobs',
    'two-still-lives',
    'final-rehearsal',
  ])
    assert.ok(
      LEVELS.some((level) => level.id === id),
      `retain completed-room ID ${id}`,
    );
  const layouts = LEVELS.map(({ spawn, frame, solids, objects, switches, gates, exit }) =>
    JSON.stringify({ spawn, frame, solids, objects, switches, gates, exit }),
  );
  assert.equal(new Set(layouts).size, 100, 'each room changes actual geometry or machine routes');
  for (const [index, level] of LEVELS.entries()) {
    const chapter = CHAPTERS[Math.floor(index / 10)];
    assert.equal(level.number, index + 1);
    assert.equal(level.difficulty, index + 1);
    assert.equal(level.chapterNumber, chapter.number);
    assert.equal(level.chapterId, chapter.id);
    assert.equal(level.chapterLevel, (index % 10) + 1);
    assert.equal(chapter.start, chapter.startIndex + 1);
    assert.equal(chapter.end, chapter.endIndex + 1);
    assert.equal(chapter.end - chapter.start + 1, 10);
    assert.equal(level.hint.length, 3, `room ${level.number} has staged hints`);
    assert.ok(level.goal.trim().length > 0);
    assert.ok(level.hint.every((hint) => hint.trim().length > 0));
  }
});

test('all room geometry, route references and pressure-switch circuits are valid', () => {
  const rectInWorld = ({ x, y, w, h }, context) => {
    assert.ok([x, y, w, h].every(Number.isFinite), `${context} finite geometry`);
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0, `${context} positive geometry`);
    assert.ok(x + w <= CONSTANTS.width && y + h <= CONSTANTS.height, `${context} in world`);
  };
  for (const [index, level] of LEVELS.entries()) {
    const context = `room ${level.number}`;
    const ids = new Set(level.objects.map((object) => object.id));
    assert.equal(ids.size, level.objects.length, `${context} unique machine IDs`);
    assert.ok(level.objects.length > 0, `${context} exercises the observation rule`);
    rectInWorld({ ...level.spawn, w: CONSTANTS.playerWidth, h: CONSTANTS.playerHeight }, context);
    for (const item of [
      ...level.solids,
      ...level.objects,
      ...level.switches,
      ...level.gates,
      level.exit,
    ])
      rectInWorld(item, context);
    for (const object of level.objects) {
      assert.ok(object.speed > 0 && Number.isFinite(object.speed), `${context} machine speed`);
      assert.ok(object.path.length >= 2, `${context} moving route`);
      for (const point of object.path) rectInWorld({ ...point, w: object.w, h: object.h }, context);
    }
    const switchIds = new Set(level.switches.map((plate) => plate.id));
    assert.equal(switchIds.size, level.switches.length);
    for (const gate of level.gates) {
      assert.ok(gate.requires.length > 0, `${context} has a meaningful gate`);
      for (const id of gate.requires)
        assert.ok(switchIds.has(id), `${context} gate references ${id}`);
    }
    for (const action of SOLUTIONS[index]) {
      assert.ok(['frame', 'watch', 'walk', 'jump', 'wait', 'ride'].includes(action.kind));
      if (action.object)
        assert.ok(ids.has(action.object), `${context} route references ${action.object}`);
    }
  }
});

test('reference routes leave all switches held by frozen robots, independent of player weight', () => {
  for (const [index, level] of LEVELS.entries()) {
    const state = solveRoom(index, undefined, { reactionFrames: 6 });
    assert.equal(state.status, 'won', `room ${level.number}`);
    for (const plate of state.switches) {
      assert.ok(
        state.objects.some((object) => {
          const center = object.x + object.w / 2;
          return (
            object.kind === 'robot' &&
            !object.active &&
            center >= plate.x &&
            center <= plate.x + plate.w &&
            Math.abs(object.y + object.h - (plate.y + plate.h)) <= 2
          );
        }),
        `room ${level.number}: ${plate.id} stays pressed without the player`,
      );
    }
  }
});

test('transfer and precision crossings require moving every ferry, including from its frozen edge', () => {
  for (const [index, level] of LEVELS.entries()) {
    if (!['transfer', 'thin-margin', 'split-the-view'].includes(level.chapterId)) continue;
    const route = SOLUTIONS[index];
    for (const [actionIndex, ride] of route.entries()) {
      if (ride.kind !== 'ride') continue;
      const boat = level.objects.find((object) => object.id === ride.object);
      const replacements = [
        [],
        [{ kind: 'jump', frames: 48 }],
        [
          { kind: 'walk', x: boat.x + boat.w - 28 },
          { kind: 'jump', frames: 48 },
        ],
      ];
      for (const replacement of replacements) {
        const actions = [
          ...route.slice(0, actionIndex),
          ...replacement,
          ...route.slice(actionIndex + 1),
        ];
        for (const reactionFrames of [0, 6]) {
          assert.throws(
            () => solveRoom(index, undefined, { actions, reactionFrames }),
            /lost during solution|solution timed out/,
            `room ${level.number}: ${boat.id} cannot become a static shortcut`,
          );
        }
      }
    }
  }
});
