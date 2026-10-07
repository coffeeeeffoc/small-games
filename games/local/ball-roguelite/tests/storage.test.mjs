import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, checkpoint, restoreGame, fire, recall } from '../core.mjs';
import { createStorage, STORAGE_KEY } from '../storage.mjs';

function memory(value) {
  const values = new Map(value ? [[STORAGE_KEY, JSON.stringify(value)]] : []);
  return { getItem: (key) => values.get(key), setItem: (key, next) => values.set(key, next) };
}
function upgradeRun(id) {
  const game = createGame(id, { seed: 20261006 });
  for (let turn = 0; turn < 3; turn++) { fire(game, 0, -400); recall(game); }
  assert.equal(game.phase, 'upgrade');
  return game;
}

test('legacy campaign checkpoint migrates to its own slot without changing progress or settings', () => {
  const legacy = checkpoint(upgradeRun('stardust')), saved = checkpoint(restoreGame(legacy));
  for (const schemaVersion of [0, 1]) {
    const raw = memory({ schemaVersion, lastLevel: 'stardust', resume: legacy, bestEndless: 41, sound: false, haptics: false,
      completed: { stardust: { score: 20, turns: 5, stars: 1 } } });
    const storage = createStorage(raw), data = storage.read();
    assert.equal(data.schemaVersion, 2);
    assert.equal(data.lastMode, 'campaign');
    assert.equal(data.lastLevel, 'stardust');
    assert.deepEqual(storage.getResume('campaign'), saved);
    assert.equal(storage.getResume('endless'), null);
    assert.deepEqual(data.resume, saved);
    assert.equal(data.bestEndless, 41);
    assert.equal(data.sound, false); assert.equal(data.haptics, false);
    assert.equal(data.completed.stardust.score, 20); assert.equal(storage.isUnlocked('prism'), true);
    storage.setting('sound', true);
    assert.equal(JSON.parse(raw.getItem(STORAGE_KEY)).schemaVersion, 2);
    assert.deepEqual(createStorage(raw).getResume('campaign'), saved);
  }
});

test('legacy endless checkpoint recovers campaign destination from validated unlock progress', () => {
  const legacy = checkpoint(upgradeRun('endless')), saved = checkpoint(restoreGame(legacy));
  const storage = createStorage(memory({ schemaVersion: 1, lastLevel: 'endless', resume: legacy, bestEndless: 8,
    completed: { stardust: { score: 18, turns: 6 }, orbit: { score: 999, turns: 1 } } }));
  assert.equal(storage.read().lastMode, 'endless');
  assert.equal(storage.read().lastLevel, 'prism');
  assert.deepEqual(storage.getResume('endless'), saved);
  assert.equal(storage.getResume('campaign'), null);
  assert.equal(storage.isUnlocked('prism'), true);
  assert.equal(storage.isUnlocked('orbit'), false);
});

test('switching modes and reloading preserves separate upgrade decisions and round state', () => {
  const raw = memory(), storage = createStorage(raw);
  const campaign = upgradeRun('stardust'), endless = upgradeRun('endless');
  storage.saveRun(campaign);
  const campaignSaved = storage.getResume('campaign');
  storage.saveRun(endless);
  const endlessSaved = storage.getResume('endless'), reopened = createStorage(raw);
  assert.equal(reopened.read().lastMode, 'endless');
  assert.equal(reopened.read().lastLevel, 'stardust');
  assert.deepEqual(reopened.getResume('campaign'), campaignSaved);
  assert.deepEqual(reopened.getResume('endless'), endlessSaved);
  assert.deepEqual(reopened.read().resume, endlessSaved);
  reopened.saveRun(campaign);
  assert.equal(reopened.read().lastMode, 'campaign');
  assert.deepEqual(reopened.read().resume, campaignSaved);
  assert.deepEqual(createStorage(raw).getResume('endless'), endlessSaved);
  const exposed = reopened.getResume('endless'); exposed.cards.length = 0;
  assert.equal(reopened.getResume('endless').cards.length, 3);
});

test('leaving a flight preserves that mode pre-shot checkpoint and the other mode checkpoint', () => {
  const raw = memory(), storage = createStorage(raw);
  const campaign = createGame('stardust'), endless = createGame('endless');
  storage.saveRun(campaign); storage.saveRun(endless);
  const before = storage.read();
  fire(endless, 40, -400); storage.saveRun(endless);
  assert.deepEqual(createStorage(raw).read(), before);
});

test('endless settlement updates only its record and slot; campaign settlement only unlocks campaign', () => {
  const raw = memory(), storage = createStorage(raw);
  const campaign = createGame('stardust'), endless = createGame('endless');
  storage.saveRun(campaign); storage.saveRun(endless);
  const campaignSaved = storage.getResume('campaign');
  endless.phase = 'lost'; endless.score = 29; endless.turn = 8;
  assert.equal(storage.finish(endless), true);
  assert.equal(storage.getResume('endless'), null);
  assert.deepEqual(storage.getResume('campaign'), campaignSaved);
  assert.deepEqual(storage.read().completed, {});
  assert.equal(storage.isUnlocked('prism'), false);
  assert.equal(storage.read().bestEndless, 29);
  const newEndless = createGame('endless'); storage.saveRun(newEndless);
  const endlessSaved = storage.getResume('endless');
  campaign.phase = 'won'; campaign.score = 20; campaign.turn = 6;
  assert.equal(storage.finish(campaign), true);
  assert.equal(storage.getResume('campaign'), null);
  assert.deepEqual(storage.getResume('endless'), endlessSaved);
  assert.equal(storage.isUnlocked('prism'), true);
  assert.equal(storage.read().bestEndless, 29);
  newEndless.phase = 'lost'; newEndless.score = 4; newEndless.turn = 5;
  storage.finish(newEndless);
  assert.equal(createStorage(raw).read().bestEndless, 29);
  assert.equal(createStorage(raw).read().completed.stardust.score, 20);
});

test('invalid, mismatched or locked mode checkpoints cannot replace a valid independent slot', () => {
  const campaign = checkpoint(createGame('stardust')), endless = checkpoint(createGame('endless'));
  for (const invalid of [endless, checkpoint(createGame('orbit')), { ...campaign, count: -1 }]) {
    const storage = createStorage(memory({ schemaVersion: 2, lastMode: 'endless', runs: { campaign: invalid, endless } }));
    assert.equal(storage.getResume('campaign'), null);
    assert.deepEqual(storage.getResume('endless'), endless);
    assert.equal(storage.read().lastLevel, 'stardust');
  }
  const storage = createStorage(memory({ schemaVersion: 2, lastMode: 'missing', runs: { campaign, endless: campaign } }));
  assert.equal(storage.read().lastMode, 'campaign');
  assert.deepEqual(storage.getResume('campaign'), campaign);
  assert.equal(storage.getResume('endless'), null);
});

test('clearing one mode and playing developer practice leave the other mode and records untouched', () => {
  const raw = memory(), storage = createStorage(raw);
  storage.saveRun(createGame('stardust')); storage.saveRun(createGame('endless'));
  const beforePractice = storage.read(), practice = createGame('orbit', { practice: true });
  storage.saveRun(practice); practice.phase = 'won'; practice.score = 900; storage.finish(practice);
  assert.deepEqual(storage.read(), beforePractice);
  storage.clearResume('endless');
  assert.equal(storage.getResume('endless'), null);
  assert.deepEqual(createStorage(raw).getResume('campaign'), beforePractice.runs.campaign);
  assert.deepEqual(storage.read().completed, beforePractice.completed);
  assert.equal(storage.read().bestEndless, beforePractice.bestEndless);
});
