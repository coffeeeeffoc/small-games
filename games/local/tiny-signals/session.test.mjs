import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.mjs';
import { PlaySession, normalizeProgress, recordWin } from './session.mjs';

test('undo restores a completed session and allows a different future without mutating snapshots', () => {
  const session = new PlaySession(LEVELS[0]);
  const initial = session.state;
  for (const direction of session.level.solution) session.move(direction);
  assert.equal(session.state.status, 'won');
  assert.equal(session.move('left'), false);
  session.undo();
  assert.equal(session.state.status, 'playing');
  assert.equal(session.route.length, session.level.optimalMoves - 1);
  session.move('left');
  assert.equal(session.route.at(-1), 'left');
  session.restart();
  assert.deepEqual(session.state, initial);
  assert.deepEqual(session.route, []);
  assert.equal(session.undo(), false);
});

test('reference hints remain marked after restart and do not create an unaided record', () => {
  const session = new PlaySession(LEVELS[0]);
  session.assisted = true;
  session.move('right');
  session.restart();
  for (const direction of session.level.solution) session.move(direction);
  const progress = recordWin(normalizeProgress(null, LEVELS), session);
  assert.equal(progress.levels.garden.best, 8);
  assert.equal(progress.levels.garden.bestUnaided, null);
  const fresh = new PlaySession(LEVELS[0]);
  for (const direction of fresh.level.solution) fresh.move(direction);
  const improved = recordWin(progress, fresh);
  assert.equal(improved.levels.garden.bestUnaided, 8);
  assert.equal(progress.levels.garden.bestUnaided, null);
});

test('a failed or unfinished path never overwrites a completed level record', () => {
  const session = new PlaySession(LEVELS[5]);
  for (const direction of ['up', 'up', 'right']) session.move(direction);
  assert.equal(session.state.status, 'lost');
  const progress = normalizeProgress(
    { version: 1, levels: { garden: { best: 8, bestUnaided: 8 } } },
    LEVELS,
  );
  assert.strictEqual(recordWin(progress, session), progress);
  session.undo();
  assert.equal(session.state.status, 'playing');
  assert.equal(session.state.turn, 2);
});
