import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../startup/taptap.cjs', import.meta.url), 'utf8');
test('converted Creator and rewarded ads share the actual TapTap SDK without replacing host compatibility', () => {
  const tap = { createCanvas() {}, createRewardedVideoAd() { return this; } };
  for (const wx of [undefined, { compatibility: true }]) {
    const host = { tap, wx, GameGlobal: {} };
    vm.runInNewContext(source, host);
    assert.equal(host.tap, tap);
    assert.equal(host.wx, wx ?? tap);
    assert.equal(host.GameGlobal.tap, tap);
    assert.equal(host.GameGlobal.wx, wx ?? tap);
    assert.equal(host.tap.createRewardedVideoAd(), tap);
  }
  assert.throws(() => vm.runInNewContext(source, {}), /TapTap runtime/);
});

test('Web startup preserves cancellation delivery and guards only noncancelable canvas events', () => {
  const listeners = new Map();
  vm.runInNewContext(readFileSync(new URL('../startup/loading.js', import.meta.url), 'utf8'), {
    window: { addEventListener: (type, callback) => listeners.set(type, callback) },
    document: { getElementById: () => ({}) },
    setTimeout: () => 1,
  });
  for (const [id, cancelable] of [['GameCanvas', false], ['GameCanvas', true], ['other', false]]) {
    const original = () => {};
    const event = { target: { id }, cancelable, preventDefault: original };
    listeners.get('touchcancel')(event);
    assert.equal(event.preventDefault === original, id !== 'GameCanvas' || cancelable);
    assert.equal(event.stopPropagation, undefined);
  }
});
