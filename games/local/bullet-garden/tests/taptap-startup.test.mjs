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
