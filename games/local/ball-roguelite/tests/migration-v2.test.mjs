import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, checkpoint, restoreGame, canReward, LIMITS } from '../core.mjs';
import { LEVELS, levelById } from '../levels.mjs';
import { createStorage, STORAGE_KEY } from '../storage.mjs';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/ba3f3966-checkpoints.json', import.meta.url)),
);
const copy = (value) => structuredClone(value);
const oldLengths = [4, 5, 6, 6, 7, 8];
const newLengths = [5, 6, 7, 8, 9, 10];

test('all six authentic schema-2 final-wave checkpoints keep the current board and canonical future waves', () => {
  assert.equal(fixture.source, 'ba3f3966');
  assert.equal(fixture.runs.length, 6);
  for (const [i, saved] of fixture.runs.entries()) {
    const game = restoreGame(saved);
    assert.ok(game, saved.levelId);
    assert.equal(saved.level.waves.length, oldLengths[i]);
    assert.equal(saved.waveIndex, oldLengths[i]);
    assert.equal(game.waveIndex, saved.waveIndex);
    assert.equal(game.level.waves.length, newLengths[i]);
    assert.deepEqual(game.level, levelById(saved.levelId));
    assert.deepEqual(game.bricks, saved.bricks, saved.levelId);
    for (const key of ['seed', 'turn', 'score', 'shots', 'nextId', 'bestCombo'])
      assert.equal(game[key], saved[key], `${saved.levelId}:${key}`);
    assert.deepEqual(game.rewards, { resonance: 1, rescue: 1 });
    assert.equal(canReward(game, 'resonance'), false);
    assert.equal(canReward(game, 'rescue'), false);
    const forgedLevel = copy(saved);
    forgedLevel.level = { id: 'endless', endless: true, waves: [] };
    assert.deepEqual(restoreGame(forgedLevel).level, levelById(saved.levelId));
  }
});

test('old 36-ball saves scale current health once when capped to 22 and keep consumed rewards', () => {
  const saved = copy(fixture.runs[0]);
  saved.count = 36;
  saved.damage = 4;
  saved.upgrades.power = 3;
  saved.bricks = [
    { id: 1, c: 0, r: 4, kind: 'brick', hp: 75, maxHp: 100 },
    { id: 2, c: 1, r: 4, kind: 'pickup', hp: 1, maxHp: 1 },
  ];
  const game = restoreGame(saved);
  assert.ok(game);
  assert.equal(game.count, LIMITS.balls);
  assert.deepEqual(game.bricks, [
    { id: 1, c: 0, r: 4, kind: 'brick', hp: 46, maxHp: 62 },
    saved.bricks[1],
  ]);
  const normalized = checkpoint(game);
  assert.equal(normalized.schemaVersion, 4);
  assert.deepEqual(restoreGame(normalized).bricks, game.bricks);
  assert.deepEqual(restoreGame(normalized).rewards, saved.rewards);
});

test('schema-2 bounds cannot be widened into legacy damage or upgrades during migration', () => {
  for (const damage of [5, 1000000]) {
    const saved = copy(fixture.runs[0]);
    saved.damage = damage;
    assert.equal(restoreGame(saved), null);
  }
  for (const [id, count] of [
    ['power', 4],
    ['pierce', 3],
    ['critical', 4],
  ]) {
    const saved = copy(fixture.runs[0]);
    saved.upgrades[id] = count;
    assert.equal(restoreGame(saved), null);
  }
  const schema1 = copy(fixture.runs[0]);
  schema1.schemaVersion = 1;
  schema1.count = 90;
  schema1.damage = 80;
  schema1.upgrades.power = 79;
  delete schema1.rewards;
  const migrated = restoreGame(schema1);
  assert.ok(migrated, 'genuinely uncapped schema-1 saves remain supported');
  assert.equal(migrated.count, 22);
  assert.equal(migrated.damage, 4);
  assert.equal(migrated.upgrades.power, 3);
  assert.deepEqual(migrated.rewards, { resonance: 0, rescue: 0 });
});

test('legacy source catalog cannot contain newer waves, expert levels, or absorbers', () => {
  for (const saved of fixture.runs.map(copy)) {
    saved.waveIndex++;
    assert.equal(restoreGame(saved), null, saved.levelId);
  }
  for (const id of ['lattice', 'eclipse']) {
    const saved = checkpoint(createGame(id));
    saved.schemaVersion = 2;
    assert.equal(restoreGame(saved), null);
  }
  const saved = copy(fixture.runs[0]);
  saved.bricks[0].kind = 'absorber';
  assert.equal(restoreGame(saved), null);
  saved.schemaVersion = 3;
  const restored = restoreGame(saved);
  assert.ok(restored);
  assert.equal(restored.bricks[0].kind, 'absorber');
  assert.deepEqual(restored.rewards, { resonance: 1, rescue: 1 });
});

test('schema-2 and schema-3 reward counters cannot disappear or become malformed on reload', () => {
  for (const schemaVersion of [2, 3, 4]) {
    for (const rewards of [
      undefined,
      null,
      [],
      {},
      { resonance: 2, rescue: 1 },
      { resonance: 1, rescue: -1 },
    ]) {
      const saved = copy(fixture.runs[0]);
      saved.schemaVersion = schemaVersion;
      if (rewards === undefined) delete saved.rewards;
      else saved.rewards = rewards;
      assert.equal(restoreGame(saved), null);
    }
    const saved = copy(fixture.runs[0]);
    saved.schemaVersion = schemaVersion;
    saved.upgrades = [];
    assert.equal(restoreGame(saved), null);
  }
});

test('outer storage preserves both mode slots and progress when accepting each authentic old checkpoint', () => {
  for (const [i, saved] of fixture.runs.entries()) {
    const endless = checkpoint(createGame('endless'));
    const completed = Object.fromEntries(
      LEVELS.slice(0, i).map(({ id }) => [id, { score: 99, turns: 8 }]),
    );
    const raw = {
      schemaVersion: 2,
      completed,
      lastLevel: saved.levelId,
      lastMode: 'campaign',
      runs: { campaign: saved, endless },
    };
    const memory = {
      getItem(key) {
        assert.equal(key, STORAGE_KEY);
        return JSON.stringify(raw);
      },
      setItem() {},
    };
    const storage = createStorage(memory);
    const resumed = storage.getResume('campaign');
    assert.ok(resumed, saved.levelId);
    assert.equal(resumed.levelId, saved.levelId);
    assert.equal(resumed.waveIndex, saved.waveIndex);
    assert.deepEqual(resumed.bricks, saved.bricks);
    assert.deepEqual(resumed.rewards, saved.rewards);
    assert.equal(storage.getResume('endless').levelId, 'endless');
    assert.equal(storage.read().lastMode, 'campaign');
    assert.deepEqual(Object.keys(storage.read().completed), Object.keys(completed));
  }
});
