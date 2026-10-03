import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  cycleControl,
  enumerateSolutions,
  simulate,
  validateLevel,
} from '../engine.mjs';
import { LEVELS } from '../levels.mjs';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test('eight progressive levels validate, start unsolved, and have independently discovered solutions', () => {
  assert.equal(LEVELS.length, 8);
  for (const level of LEVELS) {
    assert.deepEqual(validateLevel(level), [], level.id);
    assert.equal(simulate(level, createState(level)).won, false, `${level.id} starts unsolved`);
    assert.equal(simulate(level, level.solution).won, true, `${level.id} authored solution works`);
    const solutions = enumerateSolutions(level);
    assert.ok(solutions.length > 0, `${level.id} is solvable by enumeration`);
    for (const solution of solutions) {
      const result = simulate(level, solution);
      for (const echo of result.echoes) {
        assert.equal(
          echo.arrival,
          echo.target,
          'Every winning echo must match its own arrival beat',
        );
        assert.ok(echo.energy >= level.minEnergy, 'Every winning echo must remain audible');
      }
    }
  }
  assert.equal(
    enumerateSolutions(LEVELS[7]).length,
    1,
    'The final puzzle has one complete solution',
  );
});

test('tutorial levels expose only one editable reflector and teach later arrival through longer distance', () => {
  for (const level of LEVELS.slice(0, 2)) {
    const editable = level.routes
      .flatMap((route) => route.stages)
      .filter((stage) => stage.options.length > 1);
    assert.equal(editable.length, 1);
    assert.equal(editable[0].kind, 'reflector');
    const routeIndex = level.routes.findIndex((route) => route.stages.includes(editable[0]));
    const before = simulate(level, createState(level)).echoes[routeIndex];
    const after = simulate(level, level.solution).echoes[routeIndex];
    assert.equal(before.status, 'early');
    assert.ok(after.length > before.length);
    assert.equal(after.arrival - before.arrival, after.length - before.length);
  }
});

test('receiving three strong echoes is insufficient when their beats are wrong', () => {
  const level = LEVELS[2];
  const shortest = createState(level);
  for (const stage of level.routes.flatMap((route) => route.stages)) shortest.choices[stage.id] = 0;
  const result = simulate(level, shortest);
  assert.equal(result.won, false);
  assert.ok(result.echoes.every((echo) => echo.energy >= level.minEnergy));
  assert.ok(result.echoes.every((echo) => echo.status === 'early'));
  assert.ok(result.duration > level.targets[2], 'The visual clock includes missed targets');
});

test('delay chambers add simulation time and consume energy without adding distance', () => {
  const level = LEVELS[3];
  const state = createState(level);
  const before = simulate(level, state).echoes[2];
  const next = cycleControl(level, state, 'c-delay');
  const after = simulate(level, next).echoes[2];
  assert.equal(after.length, before.length);
  assert.equal(after.arrival - before.arrival, 3);
  assert.equal(before.energy - after.energy, 6);
  const segment = after.segments.at(-1);
  assert.equal(segment.kind, 'delay');
  assert.equal(segment.end - segment.start, segment.delay);
  assert.equal(after.status, 'on-time');
});

test('too many reflections can make an exactly timed route fail', () => {
  const level = LEVELS[4];
  const initial = simulate(level, createState(level));
  assert.ok(initial.echoes.every((echo) => echo.arrival === echo.target));
  assert.deepEqual(
    initial.echoes.map((echo) => echo.status),
    ['on-time', 'weak', 'weak'],
  );
  const solved = simulate(level, level.solution);
  assert.equal(solved.won, true);
  assert.equal(solved.echoes[1].arrival, initial.echoes[1].arrival);
  assert.equal(solved.echoes[1].energy - initial.echoes[1].energy, 8 * level.reflectionLoss);
});

test('redistributing one pulse conserves energy and can rescue the longest route', () => {
  const level = LEVELS[5];
  const state = structuredClone(level.solution);
  state.splitter = 0;
  const balanced = simulate(level, state);
  assert.equal(balanced.echoes[2].status, 'weak');
  const favored = simulate(level, level.solution);
  assert.equal(favored.won, true);
  assert.deepEqual(
    balanced.echoes.map((echo) => echo.arrival),
    favored.echoes.map((echo) => echo.arrival),
  );
  for (const splitter of [0, 1, 2]) {
    const result = simulate(level, { ...state, splitter });
    assert.equal(
      result.echoes.reduce((sum, echo) => sum + echo.sourceEnergy, 0),
      300,
    );
    assert.ok(result.echoes.every((echo) => echo.energy <= echo.sourceEnergy && echo.energy >= 0));
    assert.ok(
      result.echoes.every((echo) =>
        echo.segments.every((segment) => segment.energyAfter <= segment.energyBefore),
      ),
    );
  }
});

test('an absorber cannot trigger a receiver, even with an exact arrival', () => {
  const level = LEVELS[6];
  const result = simulate(level, createState(level));
  const absorbed = result.echoes[2];
  assert.equal(absorbed.arrival, absorbed.target);
  assert.equal(absorbed.energy, 0);
  assert.equal(absorbed.status, 'blocked');
  assert.equal(result.won, false);
});

test('exactly the receiver threshold is audible; one less is weak', () => {
  const level = structuredClone(LEVELS[0]);
  const echo = simulate(level, level.solution).echoes[2];
  level.minEnergy = echo.energy;
  assert.equal(simulate(level, level.solution).won, true);
  level.minEnergy += 1;
  assert.equal(simulate(level, level.solution).echoes[2].status, 'weak');
});

test('simulation and cycling never mutate inputs or depend on audio, wall-clock time, or frame rate', () => {
  const level = deepFreeze(structuredClone(LEVELS[7]));
  const state = deepFreeze(createState(level));
  const before = JSON.stringify({ level, state });
  const first = simulate(level, state);
  const second = simulate(level, state);
  assert.deepEqual(first, second);
  const next = cycleControl(level, state, 'a-mirror');
  assert.notEqual(next, state);
  assert.notEqual(next.choices, state.choices);
  assert.equal(JSON.stringify({ level, state }), before);
  assert.equal(next.choices['a-mirror'], 0, 'Control wraps from its last option to its first');
  assert.equal(cycleControl(level, state, 'splitter').splitter, 1);
});

test('base travel, delay-first segments, and custom future target rhythms use one deterministic clock', () => {
  const level = structuredClone(LEVELS[0]);
  level.targets = [6, 10, 14];
  for (const route of level.routes) {
    route.baseLength = 1;
    route.baseLoss = 2;
    route.stages.push({
      id: `${route.id}-hold`,
      kind: 'delay',
      initial: 0,
      options: [{ label: 'Hold', length: 0, reflections: 0, loss: 1, delay: 1 }],
    });
  }
  const state = createState(level);
  state.choices['b-mirror'] = 1;
  const result = simulate(level, state);
  assert.equal(result.won, true);
  for (const echo of result.echoes) {
    assert.equal(echo.segments[0].kind, 'travel');
    assert.equal(echo.segments[0].start, 0);
    assert.equal(echo.segments[0].end, 1);
    for (let i = 1; i < echo.segments.length; i++) {
      assert.equal(echo.segments[i].start, echo.segments[i - 1].end);
    }
    assert.equal(echo.segments.at(-1).end, echo.arrival);
  }
});

test('invalid authoring data and invalid control states fail clearly', () => {
  const level = structuredClone(LEVELS[0]);
  level.splitter.modes[0].energy = [100, 100, 101];
  assert.match(validateLevel(level).join(' '), /conserve/);
  assert.throws(() => createState(level), /Invalid Echo Weaver level/);
  const valid = LEVELS[0];
  const state = createState(valid);
  assert.throws(() => cycleControl(valid, state, 'missing'), /Unknown control/);
  assert.throws(() => simulate(valid, { ...state, splitter: 99 }), /Invalid splitter/);
  state.choices['b-mirror'] = -1;
  assert.throws(() => simulate(valid, state), /Invalid option/);
});
