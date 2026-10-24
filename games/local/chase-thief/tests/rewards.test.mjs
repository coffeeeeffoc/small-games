import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as simulation from '../assets/scripts/core/simulation.ts';
import * as progress from '../assets/scripts/core/progress.ts';
import * as route from '../assets/scripts/core/route.ts';
const compile = async (file, name, bindings) => {
  const source = stripTypeScriptTypes((await readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/^import [\s\S]*?from '[^']+';\s*/gm, '')).replace(/^export /gm, '');
  return new Function(...Object.keys(bindings), source + `;return ${name};`)(...Object.values(bindings));
};
async function harness(port) {
  const events = new Map(), listeners = new Map(), viewEvents = new Map();
  const environment = { SmallGamesRewardAds: port,
    addEventListener: (key, fn) => events.set(key, fn), removeEventListener() {},
    document: { hidden: false, body: { dataset: {} },
      addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener() {} } };
  const cc = { input: { on() {}, off() {} }, Input: { EventType: {} },
    view: { on: (key, fn) => viewEvents.set(key, fn), off: key => viewEvents.delete(key) },
    game: { on() {}, off() {} }, Game: {} };
  const Controller = await compile('../assets/scripts/ChaseGame.ts', 'ChaseGame',
    { ...simulation, ...progress, ...route, globalThis: environment, cc });
  const c = Object.create(Controller.prototype);
  Object.assign(c, { run: simulation.createRun(), progress: progress.freshProgress(),
    screen: 'paused', disposed: false, rewardToken: 0, rewardPending: false, rewardPort: null,
    removers: [], hud: { key: '', destroy() {} }, world: { reset() {}, destroy() {} },
    sound: { stop() {}, node: { destroy() {} } }, play() {}, persist() {} });
  simulation.pauseRun(c.run); c.installInput();
  return { c, events, listeners, viewEvents, cc, environment };
}
test('resize updates render-buffer cameras as well as CSS-sized HUD geometry', async () => {
  const { c, cc, environment } = await harness();
  const calls = [];
  environment.document.getElementById = () => ({ width: 640, height: 1136, clientWidth: 320, clientHeight: 568 });
  cc.ResolutionPolicy = { SHOW_ALL: 2 };
  cc.view.setDesignResolutionSize = (...args) => calls.push(['design', ...args]);
  cc.director = { root: { resize: (...args) => calls.push(['buffer', ...args]) } };
  c.hud.resize = (...args) => calls.push(['hud', ...args]);
  c.resize();
  assert.deepEqual(calls, [['design', 390, 692.25, 2], ['buffer', 640, 1136], ['hud', 390, 692.25]]);
});
test('engine viewport resize reapplies HUD geometry and is removed on disposal', async () => {
  const { c, viewEvents } = await harness();
  let resized = 0;
  c.resize = () => resized++;
  viewEvents.get('canvas-resize')();
  assert.equal(resized, 1);
  c.destroy();
  assert.equal(viewEvents.has('canvas-resize'), false);
});
function deferred() {
  let resolve, calls = 0, cancelled = 0;
  return { available: true, offer() { calls++; return new Promise(r => resolve = r); },
    cancel() { cancelled++; }, finish(status) { resolve({ status }); },
    get calls() { return calls; }, get cancelled() { return cancelled; } };
}
const obstacle = type => ({ id: type, at: 2, lane: 1, type, resolved: false, offset: 0, wave: 0 });
test('five seconds of ordinary protection freeze while paused, expire in play, and never protect gaps', () => {
  for (const type of ['crate', 'gap']) {
    const r = simulation.createRun(); r.obstacles = [obstacle(type)];
    assert.equal(simulation.rewardProtection(r), false);
    simulation.pauseRun(r); assert.equal(simulation.rewardProtection(r), true);
    assert.equal(simulation.rewardProtection(r), false);
    simulation.updateRun(r, 100); assert.equal(r.protection, 5);
    simulation.resumeRun(r); simulation.updateRun(r, 0.4);
    if (type === 'gap') { assert.equal(r.phase, 'lost'); assert.equal(r.health, 0); }
    else {
      assert.equal(r.health, 3); assert.ok(r.protection < 5);
      r.obstacles = []; r.nextWave = 1000;
      simulation.updateRun(r, 5); assert.equal(r.protection, 0);
      r.obstacles = [{ ...obstacle('crate'), at: r.s + 1 }];
      simulation.updateRun(r, 0.4); assert.equal(r.health, 2);
    }
    r.phase = 'lost'; r.s = 1000;
    const p = progress.freshProgress();
    assert.deepEqual(progress.recordRun(p, r), p);
  }
});
test('completed protection stays paused through blur/visibility and suppresses new-record UI', async () => {
  const port = deferred(), { c, events, listeners } = await harness(port);
  const pending = c.requestProtection(); c.command('reward-protection');
  events.get('blur')(); listeners.get('visibilitychange')();
  assert.equal(port.calls, 1); assert.equal(port.cancelled, 0);
  port.finish('completed'); await pending;
  assert.equal(c.run.protection, 5); assert.equal(c.screen, 'paused');
  assert.equal(c.run.phase, 'paused'); assert.equal(c.run.rewardProtectionUsed, true);
  c.command('resume'); c.run.phase = 'lost'; c.run.s = 1000; c.afterStep();
  assert.equal(c.resultNewRecord, false); assert.deepEqual(c.progress.best, {});
});
test('failed, dismissed, unavailable and thrown offers keep normal resume available', async () => {
  for (const port of [undefined, { available: false }, ...['dismissed','failed','unavailable'].map(status => ({ available: true, offer: async () => ({ status }) })),
    { available: true, offer: async () => { throw Error('offline'); } }]) {
    const { c } = await harness(port); await c.requestProtection();
    assert.equal(c.run.rewardProtectionUsed, false); assert.equal(c.run.protection, 0);
    assert.equal(c.rewardPending, false); c.command('resume'); assert.equal(c.run.phase, 'running');
  }
});
test('cancel, navigation, restart, pagehide and disposal reject late protection', async () => {
  for (const exit of [(c) => c.command('reward-cancel'), (c) => c.command('home'),
    (c) => c.command('resume'), (c) => c.start(), (c, events) => events.get('pagehide')(), (c) => c.destroy()]) {
    const port = deferred(), { c, events } = await harness(port), old = c.run;
    const pending = c.requestProtection(); exit(c, events); port.finish('completed'); await pending;
    assert.equal(old.rewardProtectionUsed, false); assert.equal(c.run.rewardProtectionUsed, false);
    assert.equal(port.cancelled, 1);
  }
});
test('paused HUD cache updates pending, cancel and success feedback with touch-sized controls', async () => {
  const Hud = await compile('../assets/scripts/Hud.ts', 'Hud', { ...route, cc: {} });
  const h = Object.create(Hud.prototype), texts = new Map();
  Object.assign(h, { width: 390, height: 660, key: '', labels: new Map(),
    g: { clear() {} }, live: { clear() {} }, panel() {}, text(id, text) { texts.set(id, text); },
    button(id, label, x, y, w, height) { this.controls.push({ id, label, x, y, w, h: height }); } });
  const state = { screen: 'paused', progress: progress.freshProgress(), run: simulation.createRun() };
  h.draw(state); assert.ok(h.controls.some(b => b.id === 'reward-protection' && b.h >= 44));
  state.rewardPending = true; h.draw(state);
  assert.ok(h.controls.some(b => b.id === 'reward-cancel'));
  state.rewardPending = false; state.run.rewardProtectionUsed = true; state.rewardMessage = '保护已就绪';
  h.draw(state); assert.equal(texts.get('pause-note'), '保护已就绪');
  assert.ok(!h.controls.some(b => b.id === 'reward-protection'));
  assert.ok(h.controls.every(b => b.y + b.h <= h.height));
});
