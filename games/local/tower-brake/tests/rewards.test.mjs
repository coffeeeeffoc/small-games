import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as engine from '../engine.mjs';
import * as levels from '../levels.mjs';
import * as progress from '../progress.mjs';

const source = stripTypeScriptTypes((await readFile(new URL('../assets/scripts/TowerBrake.ts', import.meta.url), 'utf8'))
  .replace(/^import [\s\S]*?from '[^']+';\s*/gm, '')
  .replace(/^@ccclass[^\n]*\n/gm, '').replace(/@property\(Material\)\s*/g, ''))
  .replace('export class TowerBrake', 'class TowerBrake');
function harness(port) {
  let invalidated = 0;
  const environment = { SmallGamesRewardAds: port, document: { removeEventListener() {} }, __towerHost: {
    invalidate() { invalidated++; }, finish() {}, start() {},
  }};
  const bindings = { ...engine, ...levels, ...progress, globalThis: environment,
    Component: class {}, _decorator: {}, input: { off() {} }, Input: { EventType: {} },
    game: { off() {} }, Game: {}, view: { off() {} } };
  const Controller = new Function(...Object.keys(bindings), source + ';return TowerBrake;')(...Object.values(bindings));
  const c = new Controller();
  c.state = engine.createGame(levels.LEVELS[0]);
  c.state.paused = true;
  c.state.charge = 0;
  c.progress = progress.readProgress(null);
  c.screen = 'paused';
  c.ui = { dispose() {} };
  c.world = { dispose() {} };
  c.draw = () => {};
  c.windAudio = { stop() {} };
  return { c, environment, invalidated: () => invalidated };
}
function deferred() {
  let resolve, calls = 0, cancelled = 0;
  return { available: true, offer() { calls++; return new Promise(r => resolve = r); },
    cancel() { cancelled++; }, finish(status) { resolve({ status }); },
    get calls() { return calls; }, get cancelled() { return cancelled; } };
}
test('refill is once per paused empty run, keeps checkpoint and excludes both campaign record kinds', () => {
  const s = engine.createGame(levels.LEVELS[0]);
  assert.equal(engine.refillBrake(s), false);
  s.charge = 0;
  assert.equal(engine.refillBrake(s), false);
  s.paused = true;
  const checkpoint = structuredClone(s.lastCheckpoint);
  assert.equal(engine.refillBrake(s), true);
  assert.equal(s.charge, 1);
  assert.equal(s.paused, true);
  assert.deepEqual(s.lastCheckpoint, checkpoint);
  s.charge = 0;
  assert.equal(engine.refillBrake(s), false);
  for (const continued of [false, true]) {
    const p = progress.readProgress(null);
    progress.recordWin(p, 0, levels.LEVELS[0].id, { ...s, elapsed: 10, continued });
    assert.equal(p.unlocked, 2);
    assert.deepEqual(p.best, {});
    assert.deepEqual(p.continuedBest, {});
  }
  s.status = 'lost'; s.paused = false;
  assert.equal(engine.resumeCheckpoint(s), true);
  assert.equal(s.rewardRefillUsed, true);
});
test('completed refill stays paused, invalidates host and never records an assisted endless best', async () => {
  const port = deferred(), { c, invalidated } = harness(port);
  const pending = c.requestRefill();
  c.action('reward-refill');
  c.hide();
  assert.equal(port.calls, 1);
  assert.equal(port.cancelled, 0);
  port.finish('completed'); await pending;
  assert.equal(c.state.charge, 1);
  assert.equal(c.screen, 'paused');
  assert.equal(invalidated(), 1);
  c.state.charge = 0; await c.requestRefill();
  assert.equal(port.calls, 1);
  c.state.mode = 'endless'; c.state.totalFloors = 100;
  c.state.status = 'lost'; c.finish();
  assert.equal(c.progress.endlessBest, 0);
});
test('unavailable, dismissed, failed and thrown offers do not grant or consume refill', async () => {
  for (const port of [undefined, { available: false }, ...['dismissed','failed','unavailable'].map(status => ({ available: true, offer: async () => ({ status }) })),
    { available: true, offer: async () => { throw Error('offline'); } }]) {
    const { c } = harness(port); await c.requestRefill();
    assert.equal(c.state.charge, 0); assert.equal(c.state.rewardRefillUsed, false);
    assert.equal(c.rewardPending, false); assert.equal(c.screen, 'paused');
  }
});
test('cancel, navigation, restart, pagehide and destruction reject late completion', async () => {
  for (const exit of [c => c.action('reward-cancel'), c => c.action('home'), c => c.action('resume'),
    c => c.beginRun(0), c => c.pageHide(), c => c.onDestroy()]) {
    const port = deferred(), { c } = harness(port), old = c.state;
    const pending = c.requestRefill();
    await exit(c); port.finish('completed'); await pending;
    assert.equal(old.rewardRefillUsed, false);
    assert.equal(c.state.rewardRefillUsed, false);
    assert.equal(port.cancelled, 1);
  }
});
