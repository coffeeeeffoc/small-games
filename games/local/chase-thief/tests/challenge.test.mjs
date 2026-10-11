import test from 'node:test';
import assert from 'node:assert/strict';
import { readChallenge, challengeParams, compareChallenge } from '../challenge.mjs';
import { freshProgress, recordWin } from '../progress.mjs';
import { LEVELS } from '../levels.mjs';
const run = { phase: 'won', levelId: LEVELS[0].id, elapsed: 35.25, collisions: 1, boosts: 4 };
test('same-route links roundtrip bounded results and reject ambiguous or unknown targets', () => {
  const url = new URL('https://game.test/');
  url.search = new URLSearchParams(challengeParams(run));
  assert.deepEqual(readChallenge(url), { levelId: run.levelId, time: 35.3, mistakes: 1 });
  for (const suffix of ['&level=canal', '&time=20.0', '&mistakes=0'])
    assert.equal(readChallenge(url + suffix), null);
  url.searchParams.set('level', 'missing');
  assert.equal(readChallenge(url), null);
  url.searchParams.set('level', run.levelId);
  url.searchParams.set('time', '99.9');
  assert.equal(readChallenge(url), null);
});
test('challenge victories cannot unlock or replace personal best; developer runs cannot share', () => {
  const progress = freshProgress();
  assert.deepEqual(recordWin(progress, { ...run, challenge: { time: 40 } }), progress);
  assert.equal(challengeParams({ ...run, practice: true }), null);
  assert.equal(challengeParams({ ...run, phase: 'lost' }), null);
});
test('challenge compares rounded displayed time and collision limit together', () => {
  assert.match(compareChallenge(run, { time: 36, mistakes: 1 }), /成功/);
  assert.match(compareChallenge(run, { time: 36, mistakes: 0 }), /再追/);
  assert.match(compareChallenge(run, { time: 35.3, mistakes: 1 }), /追平/);
});
