import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, createGame, fire, step, applyUpgrade } from '../core.mjs';
import { checkpoint, restoreCheckpoint } from '../checkpoint.mjs';
import { createStorage, STORAGE_KEY } from '../storage.mjs';
import { readChallenge, challengeParams, compareChallenge } from '../challenge.mjs';

function volley(game, x = 130, y = 492) {
  assert(fire(game, x - game.launch.x, y - game.launch.y));
  for (let n = 0; game.phase === 'flight' && n < 1000; n += 1) step(game, 1 / 30);
  assert.notEqual(game.phase, 'flight');
}
function memory() {
  const entries = new Map();
  return { entries, getItem: (key) => entries.get(key), setItem: (key, value) => entries.set(key, value) };
}

test('settled checkpoints preserve physical state and continue to the same real result', () => {
  const original = createGame(LEVELS[0].id);
  volley(original);
  const restored = restoreCheckpoint(JSON.parse(JSON.stringify(checkpoint(original))));
  assert(restored);
  assert.deepEqual(checkpoint(restored), checkpoint(original));
  for (const game of [original, restored]) {
    volley(game, 68, 214);
    assert.equal(game.phase, 'upgrade');
    assert(applyUpgrade(game, 'power'));
    volley(game, 68, 214);
    assert.equal(game.phase, 'won');
  }
  assert.equal(restored.score, original.score);
  assert.equal(restored.completedTurns, original.completedTurns);
});

test('pending upgrades restore once, and flight, finished and practice states never replace a checkpoint', () => {
  const game = createGame(LEVELS[0].id);
  volley(game);
  volley(game, 68, 214);
  const restored = restoreCheckpoint(checkpoint(game));
  assert.equal(restored.phase, 'upgrade');
  assert.equal(restored.upgrades.length, 0);
  assert(applyUpgrade(restored, 'power'));
  assert.equal(applyUpgrade(restored, 'power'), false);
  assert.equal(restoreCheckpoint(checkpoint(restored)).damage, 2);
  assert.equal(checkpoint(createGame(LEVELS[0].id, { practice: true })), null);
  const stored = createStorage(LEVELS, memory());
  stored.saveRun(restored);
  const before = stored.load().run;
  fire(restored, 0, 1);
  assert.equal(checkpoint(restored), null);
  stored.saveRun(restored);
  assert.deepEqual(stored.load().run, before);
});

test('corrupt checkpoint fields are discarded without losing completed progress', () => {
  const game = createGame(LEVELS[0].id);
  const valid = checkpoint(game);
  const damaged = [
    { ...valid, version: 99 }, { ...valid, contentKey: 'old-content' },
    { ...valid, score: Infinity }, { ...valid, ballCount: 999 },
    { ...valid, phase: 'upgrade' }, { ...valid, upgrades: ['power'] },
    { ...valid, targets: [valid.targets[0], valid.targets[0]] },
    { ...valid, targets: [{ id: 'unknown', hp: 1 }] },
    { ...valid, targets: [{ ...valid.targets[0], hp: 999 }] },
  ];
  for (const saved of damaged) assert.equal(restoreCheckpoint(saved), null);
  const persistence = memory();
  persistence.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, sound: false,
    completed: { [LEVELS[0].id]: { score: 500, turns: 3 } }, run: damaged[0] }));
  const restored = createStorage(LEVELS, persistence).load();
  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.sound, false);
  assert.equal(restored.completed[LEVELS[0].id].turns, 3);
  assert.equal(restored.run, null);
});

test('normal and invited checkpoints remain separate, survive settings and storage failure', () => {
  const persistence = memory(), store = createStorage(LEVELS, persistence);
  const normal = createGame(LEVELS[0].id);
  volley(normal);
  store.saveRun(normal);
  const invite = { version: 1, levelId: LEVELS[2].id, turns: 4 };
  store.saveRun(createGame(invite.levelId), invite);
  store.settings({ sound: false });
  const resumed = createStorage(LEVELS, persistence).load();
  assert.equal(resumed.run.completedTurns, 1);
  assert.equal(resumed.challengeRun.checkpoint.levelId, LEVELS[2].id);
  assert.deepEqual(resumed.unlocked, [LEVELS[0].id]);
  const copy = store.load(); copy.run.targets[0].hp = -20;
  assert(store.load().run.targets[0].hp > 0);
  store.clearRun(true);
  assert.equal(store.load().challengeRun, null);
  assert.deepEqual(store.load().run, resumed.run);
  const blocked = createStorage(LEVELS, { getItem() { throw Error(); }, setItem() { throw Error(); } });
  blocked.saveRun(normal);
  assert.equal(blocked.load().run.completedTurns, 1);
  assert.equal(blocked.isPersistent, false);
});

test('invitation parser rejects ambiguous or incompatible rules and keeps only public challenge data', () => {
  const invitation = { version: 1, levelId: LEVELS[0].id, turns: 3 };
  const query = new URLSearchParams(challengeParams(invitation));
  const url = `https://example.com/ember/?${query}`;
  assert.deepEqual(readChallenge(`${url}&dev=1&token=secret`), invitation);
  for (const suffix of ['&turns=2', '&level=side-glow', '&emberChallenge=1'])
    assert.equal(readChallenge(url + suffix), null);
  for (const value of ['0', '-1', '1.5', 'Infinity', '0003', '1001'])
    assert.equal(readChallenge(url.replace('turns=3', `turns=${value}`)), null);
  assert.equal(readChallenge(url.replace('emberChallenge=1', 'emberChallenge=2')), null);
  assert.equal(readChallenge(url.replace(LEVELS[0].id, 'unknown')), null);
  assert.equal(challengeParams({ ...invitation, turns: 0 }), null);
  assert.match(compareChallenge(2, 3), /少用 1 轮/);
  assert.match(compareChallenge(3, 3), /追平/);
  assert.match(compareChallenge(4, 3), /多用了 1 轮/);
});
