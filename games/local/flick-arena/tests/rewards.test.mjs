import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.mjs';
import { shoot } from '../src/core.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const original = globalThis.SmallGamesRewardAds;
afterEach(() => { globalThis.SmallGamesRewardAds = original; });
function harness(port) {
  globalThis.SmallGamesRewardAds = port;
  const texts = [];
  const context = new Proxy({
    fillText(text) { texts.push(text); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  }, { get(o, k) { return k in o ? o[k] : () => {}; } });
  const game = createGame({ canvas: { width: 390, height: 780, getContext: () => context }, onPointer: () => () => {} });
  game.debugStart(0); game.action('pause');
  return { game, texts };
}
function deferred() {
  let resolve, calls = 0, cancelled = 0;
  return { available: true, offer() { calls++; return new Promise(r => resolve = r); },
    cancel() { cancelled++; }, finish(status) { resolve({ status }); },
    get calls() { return calls; }, get cancelled() { return cancelled; } };
}
test('completed practice hint shows existing trajectory without shooting or changing the match', async () => {
  const port = deferred(), { game, texts } = harness(port);
  const before = structuredClone(game.app.state);
  const button = game.app.buttons.find(b => b.id === 'reward-hint');
  assert.ok(button.h >= 44 && button.w >= 44);
  game.action('reward-hint'); game.action('reward-hint');
  assert.ok(game.app.buttons.some(b => b.id === 'reward-cancel'));
  game.pause(); game.resume();
  assert.equal(port.calls, 1); assert.equal(port.cancelled, 0);
  port.finish('completed'); await flush();
  assert.deepEqual(game.app.state, before); assert.equal(game.app.screen, 'paused');
  assert.equal(game.app.rewardHintUsed, true); assert.ok(game.app.aimHint);
  game.action('reward-hint'); assert.equal(port.calls, 1);
  game.action('resume'); assert.equal(game.app.screen, 'playing');
  assert.ok(texts.some(t => String(t).includes('提示方向')));
  const hint = game.app.aimHint;
  shoot(game.app.state, -hint.dx, -hint.dy, Math.hypot(hint.dx, hint.dy) / 115);
  game.render(); assert.equal(game.app.aimHint, null);
  assert.equal(game.app.state.shots, 1); game.dispose();
});
test('no provider and noncompleted offers leave the turn and hint quota unchanged', async () => {
  for (const port of [undefined, { available: false }, ...['dismissed','failed','unavailable'].map(status => ({ available: true, offer: async () => ({ status }) })),
    { available: true, offer: async () => { throw Error('offline'); } }]) {
    const { game } = harness(port), before = structuredClone(game.app.state);
    game.action('reward-hint'); await flush();
    assert.deepEqual(game.app.state, before); assert.equal(game.app.rewardHintUsed, false);
    assert.equal(game.app.rewardPending, false); assert.equal(game.app.screen, 'paused');
    game.action('resume'); assert.equal(game.app.canAim, true); game.dispose();
  }
});
test('cancel, home, explicit continue, restart, pagehide cancel and disposal reject late hints', async () => {
  for (const exit of [g => g.action('reward-cancel'), g => g.action('home'), g => g.action('resume'),
    g => g.debugStart(), g => g.cancelReward(), g => g.dispose()]) {
    const port = deferred(), { game } = harness(port);
    game.action('reward-hint'); exit(game); port.finish('completed'); await flush();
    assert.equal(game.app.rewardHintUsed, false); assert.equal(game.app.aimHint, null);
    assert.equal(port.cancelled, 1); game.dispose();
  }
});
test('campaign, friend modes, invitations, ranked targets and other players never offer hints', async () => {
  for (const alter of [g => g.app.mode = 'campaign', g => g.app.mode = 'local', g => g.app.mode = 'online',
    g => g.app.invited = { seed: 1 }, g => g.app.targetShots = 3,
    g => g.app.room = {}, g => g.app.state.active = 1]) {
    const port = deferred(), { game } = harness(port); alter(game); game.render();
    assert.ok(!game.app.buttons.some(b => b.id === 'reward-hint'));
    game.action('reward-hint'); await flush(); assert.equal(port.calls, 0); game.dispose();
  }
});

test('offline friends keep same-device play without unavailable network controls', () => {
  const { game } = harness();
  game.action('home'); game.action('friends');
  assert.ok(game.app.buttons.some(b => b.id === 'local2'));
  assert.ok(!game.app.buttons.some(b => ['online-create','online-join'].includes(b.id)));
  game.dispose();
});
