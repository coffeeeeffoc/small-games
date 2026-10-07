import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeveloperAPI, withTrialParameters, DEV_PERMISSIONS } from '../src/developer.mjs';
import { createLevel } from '../src/engine.mjs';

test('trial parameters validate before mutation and create deterministic additional stock', () => {
  const state = createLevel(12);
  const original = structuredClone(state);
  const next = withTrialParameters(state, { groupLimit: 20, undoRemaining: 12, discardBudget: 30, goalLines: 12 });
  assert.deepEqual(state, original);
  assert.equal(next.config.maxGroups, 20);
  assert.equal(next.undoRemaining, 12);
  assert.equal(next.config.goal.lines, 12);
  assert.equal(next.config.discardBudget, 30);
  assert.ok(next.config.candidates.length >= 22);
  assert.throws(() => withTrialParameters(state, { groupLimit: 0 }), RangeError);
  assert.throws(() => withTrialParameters(state, { ranked: true }), RangeError);
});

test('extensions and state writes recheck unified authorization; online trials cannot be mutated', () => {
  let enabled = true, state = createLevel(12), isolated = 0;
  const registered = [];
  const api = createDeveloperAPI({ isEnabled: () => enabled, getState: () => state,
    getSnapshot: () => ({ state }), isolate: () => isolated++, update: next => { state = next; },
    beginLevel: id => { state = createLevel(id); }, restart: () => { state = createLevel(state.levelId); },
    openLevels() {}, openSolution() {}, registerActions: actions => { registered.push(...actions); return () => {}; },
  });
  assert.deepEqual(api.permissions, DEV_PERMISSIONS);
  api.registerActions([{ id: 'extra', label: '扩展', run: safe => safe.refillUndo(12) }]);
  registered.at(-1).run();
  assert.equal(state.undoRemaining, 12);
  assert.equal(isolated, 1);
  const snapshot = api.snapshot(); snapshot.state.undoRemaining = 1;
  assert.equal(state.undoRemaining, 12);
  enabled = false;
  assert.throws(() => registered.at(-1).run(), /开发模式/);
  assert.throws(() => api.clearBoard(), /开发模式/);
  enabled = true; state = { mode: 'endless', ranked: true };
  assert.throws(() => api.refillUndo(), /在线对局不能调试/);
  assert.equal(isolated, 1);
});

test('adding trial stock after group exhaustion opens the next deterministic group', () => {
  const failed = createLevel(1);
  failed.status='lost'; failed.reason='groups-exhausted';
  failed.group=failed.config.maxGroups; failed.completedGroups=failed.group;
  failed.placedInGroup=2; failed.used=[0,1];
  failed.board.fill(0);
  const next = withTrialParameters(failed, { groupLimit: 20 });
  assert.equal(failed.status, 'lost');
  assert.equal(next.status, 'playing');
  assert.equal(next.reason, null);
  assert.equal(next.group, failed.group+1);
  assert.deepEqual(next.used, []);
  assert.equal(next.placedInGroup, 0);
  assert.deepEqual(next.candidates, next.config.candidates[next.group-1]);
});
