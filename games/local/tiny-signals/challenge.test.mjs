import test from 'node:test';
import assert from 'node:assert/strict';
import { readChallenge, challengeOutcome } from './challenge.mjs';
import { LEVELS } from './levels.mjs';
const url = 'https://example.test/game/?challenge=1&level=garden&targetMoves=10';
test('a validated standalone or Shell invitation preserves the same level and bounded self-reported score', () => {
  const expected = { levelIndex: 0, levelId: 'garden', targetMoves: 10 };
  assert.deepEqual(readChallenge(url, LEVELS), expected);
  assert.deepEqual(readChallenge('https://example.test/?dev=1#/games/tiny-signals?challenge=1&level=garden&targetMoves=10', LEVELS), expected);
});
test('reject malformed, duplicated, unknown, infeasible and unbounded invitation parameters', () => {
  for (const raw of ['0', '-1', '7', '01', '1.5', '1e2', 'Infinity', '100001', '<img>']) {
    assert.equal(readChallenge(url.replace('targetMoves=10', `targetMoves=${raw}`), LEVELS), null, raw);
  }
  for (const altered of [url + '&targetMoves=8', url + '&level=garden', url.replace('garden', 'missing'), url.replace('challenge=1', 'challenge=2'), 'not a url']) {
    assert.equal(readChallenge(altered, LEVELS), null, altered);
  }
});
test('compare fewer, equal and more moves honestly and exclude assisted rounds', () => {
  assert.match(challengeOutcome(8, 10), /少 2 步/);
  assert.match(challengeOutcome(8, 8), /追平/);
  assert.match(challengeOutcome(10, 8), /多 2 步/);
  assert.match(challengeOutcome(8, 10, true), /不参与/);
});
