import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, MECHANICS } from './levels.mjs';
import { createState, step, solve, validateLevel } from './rules.mjs';

function replay(level, solution = level.solution) {
  const states = [createState(level)];
  for (const direction of solution) states.push(step(level, states.at(-1), direction));
  return states;
}

function without(level, mechanic) {
  return { ...level, boards: level.boards.map((board) => ({ ...board, [mechanic]: undefined })) };
}

test('six distinct teaching levels contain 24 distinct, legal islands', () => {
  assert.equal(LEVELS.length, 6);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, 6);
  assert.equal(
    new Set(LEVELS.flatMap((level) => level.boards.map((board) => JSON.stringify(board)))).size,
    24,
  );
  for (const level of LEVELS) {
    assert.deepEqual(validateLevel(level), [], level.name);
    assert.ok(MECHANICS.some((mechanic) => mechanic.id === level.mechanic));
    assert.ok(level.boards.every((board) => [5, 6].includes(board.size)));
  }
});

for (const level of LEVELS) {
  test(`${level.name}: published route wins and freezes arrived messengers`, () => {
    const states = replay(level);
    assert.equal(states.at(-1).status, 'won');
    assert.equal(states.at(-1).turn, level.optimalMoves);
    assert.equal(level.solution.length, level.optimalMoves);
    assert.ok(states.slice(0, -1).every((state) => state.status === 'playing'));
    for (let turn = 1; turn < states.length; turn += 1) {
      const previous = states[turn - 1];
      previous.boards.forEach((board, index) => {
        if (board.done) assert.deepEqual(states[turn].boards[index], board);
      });
    }
  });

  test(`${level.name}: joint breadth-first search proves the displayed minimum`, () => {
    const result = solve(level);
    assert.equal(result.exhausted, false);
    assert.equal(result.optimal, true);
    assert.equal(result.solution?.length, level.optimalMoves);
    assert.equal(replay(level, result.solution).at(-1).status, 'won');
  });
}

test('the opening input demonstrates simultaneous movement and wall waits', () => {
  const level = LEVELS[0];
  const state = createState(level);
  const next = step(level, state, level.solution[0]);
  const moved = next.boards.filter((board, index) => board.pos !== state.boards[index].pos).length;
  assert.ok(moved >= 2 && moved < 4);
  assert.equal(next.turn, 1);
});

test('one-way doors change the outcome of the opening puzzle', () => {
  const level = LEVELS[0];
  assert.notEqual(replay(without(level, 'oneWays')).at(-1).status, 'won');
});

test('all four compasses charge on the teaching route and affect its outcome', () => {
  const level = LEVELS[1];
  const states = replay(level);
  for (let index = 0; index < 4; index += 1)
    assert.ok(states.some((state) => state.boards[index].charged));
  assert.notEqual(replay(without(level, 'compasses')).at(-1).status, 'won');
});

test('every bridge is crossed and folds; the changed topology enables synchronization', () => {
  const level = LEVELS[2];
  const final = replay(level).at(-1);
  final.boards.forEach((board, index) =>
    assert.deepEqual(board.collapsed, level.boards[index].bridges),
  );
  assert.notEqual(replay(without(level, 'bridges')).at(-1).status, 'won');
});

test('each wind wheel changes a messenger position on the published route', () => {
  const level = LEVELS[3];
  const calm = without(level, 'winds');
  const states = replay(level);
  const affected = [false, false, false, false];
  level.solution.forEach((direction, turn) => {
    const alternative = step(calm, states[turn], direction);
    alternative.boards.forEach((board, index) => {
      if (board.pos !== states[turn + 1].boards[index].pos) affected[index] = true;
    });
  });
  assert.deepEqual(affected, [true, true, true, true]);
});

test('all four counterweights must be pushed onto their gate plates', () => {
  const level = LEVELS[4];
  const states = replay(level);
  states.at(-1).boards.forEach((board, index) => {
    const config = level.boards[index];
    assert.ok(board.boxes.includes(config.shutters[0].plate));
    assert.notDeepEqual(board.boxes, config.boxes);
    assert.equal(board.gateOpen[0], true);
    assert.ok(states.some((state) => state.boards[index].pos === config.shutters[0].cell));
  });
});

test('echoes begin at a readable distance and require a safer route', () => {
  const level = LEVELS[5];
  for (const board of level.boards) {
    const distance =
      Math.abs((board.start % board.size) - (board.echo.start % board.size)) +
      Math.abs(Math.floor(board.start / board.size) - Math.floor(board.echo.start / board.size));
    assert.ok(distance >= 3);
    assert.ok(board.compasses?.length || board.oneWays?.length);
  }
  const result = solve(without(level, 'echo'));
  assert.ok(result.solution.length < level.optimalMoves);
  assert.equal(replay(level, result.solution).at(-1).status, 'lost');
});
