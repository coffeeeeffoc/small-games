import test from 'node:test';
import assert from 'node:assert/strict';
import { readChallenge, challengeParams, compareChallenge, volleyBeat } from '../src/challenge.mjs';
import { createBattle } from '../src/simulation.mjs';
import { emptyProgress, recordVictory } from '../src/progress.mjs';
import { LEVELS } from '../src/levels.mjs';
test('same-level challenge validates bounded, unambiguous campaign results', () => {
  const battle = createBattle();
  battle.status = 'won';
  battle.time = 53.2;
  const url = new URL('https://game.test/');
  url.search = new URLSearchParams(challengeParams(battle));
  assert.deepEqual(readChallenge(url), { levelId: LEVELS[0].id, time: 54, survivors: 6 });
  assert.equal(readChallenge(url + '&time=60'), null);
  url.searchParams.set('survivors', '7');
  assert.equal(readChallenge(url), null);
  assert.equal(challengeParams(battle, true), null);
  battle.mode = 'friend';
  assert.equal(challengeParams(battle), null);
});
test('challenge victories never grant campaign medals; compare both survivors and time', () => {
  const progress = emptyProgress(),
    battle = createBattle();
  Object.assign(battle, { status: 'won', time: 53, challenge: { time: 60, survivors: 6 } });
  assert.equal(recordVictory(progress, battle), false);
  assert.deepEqual(progress.medals, {});
  assert.match(compareChallenge(battle, battle.challenge), /成功/);
  battle.units[0].hp = 0;
  assert.match(compareChallenge(battle, battle.challenge), /目标/);
});
test('beat meter signals counterattack only after all arrows, with bounded fractions', () => {
  const battle = createBattle(LEVELS[2]);
  battle.volley = { phase: 'gap', timer: 0.5, serial: 1, remaining: 1 };
  assert.equal(volleyBeat(battle).counterattack, false);
  battle.volley.phase = 'reload';
  battle.volley.timer = battle.level.reload;
  assert.deepEqual(volleyBeat(battle), { counterattack: true, fraction: 1 });
  battle.volley.timer = battle.level.reload - 3;
  assert.equal(volleyBeat(battle).counterattack, false);
  battle.volley.timer = -1;
  assert.equal(volleyBeat(battle).fraction, 0);
});
