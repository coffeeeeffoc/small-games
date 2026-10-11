import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, switchRoute, tick } from '../src/core/index.mjs';
import { nextRoute } from '../render.mjs';

test('route preview predicts the following exit without issuing a command', () => {
  const state = createMatch({ levelId: 'crossroads', seed: 1 });
  const before = JSON.stringify(state);
  const preview = nextRoute(state, 'redgate-switch');
  assert.equal(preview.source.name, '赤关');
  assert.equal(preview.target.id, 'eastford');
  assert.equal(JSON.stringify(state), before);
  assert.equal(switchRoute(state, 0, preview.junction.id).ok, true);
  assert.equal(nextRoute(state, preview.junction.id).target.id, 'westford');
  tick(state, 0.3);
  assert.equal(switchRoute(state, 0, preview.junction.id).ok, true);
  assert.equal(nextRoute(state, preview.junction.id).target.id, 'eastford');
});

test('ownership changes and a finished match invalidate the pending preview', () => {
  const state = createMatch({ levelId: 'crossroads', seed: 1 });
  assert.equal(nextRoute(state, 'bluegate-switch'), null);
  assert.equal(nextRoute(state, 'unknown'), null);
  state.junctions.find((entry) => entry.id === 'redgate-switch').owner = 1;
  assert.equal(nextRoute(state, 'redgate-switch'), null);
  state.junctions.find((entry) => entry.id === 'redgate-switch').owner = 0;
  state.status = 'finished';
  assert.equal(nextRoute(state, 'redgate-switch'), null);
});
