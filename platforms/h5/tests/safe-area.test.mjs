import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../safe-area.js', import.meta.url), 'utf8');
function fixture(extra = {}) {
  const values = new Map(),
    events = new Map();
  const context = {
    innerWidth: 390,
    innerHeight: 844,
    navigator: { userAgent: 'Browser' },
    document: {
      documentElement: { style: { setProperty: (key, value) => values.set(key, value) } },
      addEventListener: (name, fn) => events.set(name, fn),
    },
    addEventListener: (name, fn) => events.set(name, fn),
    ...extra,
  };
  runInNewContext(source, context);
  return { values, events, context };
}
test('standalone builds carry the canonical safe-area adapter', () => {
  for (const path of [
    'games/local/cops-robbers/src/safe-area.js',
    'games/local/cops-robbers-realtime/src/safe-area.js',
    'games/submodules/xiangqi-five/safe-area.js',
  ])
    assert.equal(readFileSync(new URL('../../../' + path, import.meta.url), 'utf8'), source, path);
});
test('ordinary browsers keep CSS cutout insets without a host-sized blank band', () => {
  const f = fixture({ wx: { ready() {} } });
  assert.equal(f.values.get('--game-host-top'), '0px');
  assert.match(f.values.get('--game-safe-area-top'), /env\(safe-area-inset-top, 0px\)/);
});
test('different host window geometry is not projected into an embedded viewport', () => {
  const f = fixture({
    tap: {
      getWindowInfo: () => ({
        windowWidth: 390,
        windowHeight: 1200,
        safeArea: { top: 180, bottom: 1180 },
      }),
      getMenuButtonBoundingClientRect: () => ({ top: 160, bottom: 200 }),
    },
  });
  assert.equal(f.values.get('--game-host-top'), '92px');
  assert.equal(f.values.get('--game-host-bottom'), '0px');
});
test('invalid host safe rectangles cannot collapse the game viewport', () => {
  const f = fixture({
    tap: {
      getWindowInfo: () => ({
        windowWidth: 390,
        windowHeight: 844,
        safeArea: { top: 10000, left: 250, right: 1, bottom: -1 },
      }),
    },
  });
  assert.equal(f.values.get('--game-host-top'), '92px');
  for (const edge of ['left', 'right', 'bottom'])
    assert.equal(f.values.get('--game-host-' + edge), '0px');
});
test('SDK receiver, capsule, cutout and landscape sides survive viewport refresh', () => {
  let resize;
  const sdk = {
    getWindowInfo() {
      assert.equal(this, sdk);
      return { windowWidth: 390, safeArea: { top: 59, left: 6, right: 380, bottom: 810 } };
    },
    getMenuButtonBoundingClientRect() {
      assert.equal(this, sdk);
      return { top: 60, bottom: 108 };
    },
    onWindowResize(fn) {
      assert.equal(this, sdk);
      resize = fn;
    },
  };
  const f = fixture({ tap: sdk });
  assert.equal(f.values.get('--game-host-top'), '108px');
  assert.equal(f.values.get('--game-host-left'), '6px');
  assert.equal(f.values.get('--game-host-right'), '10px');
  assert.equal(f.values.get('--game-host-bottom'), '34px');
  f.context.innerWidth = 844;
  f.context.innerHeight = 390;
  sdk.getWindowInfo = () => ({
    windowWidth: 844,
    safeArea: { top: 0, left: 59, right: 810, bottom: 370 },
  });
  sdk.getMenuButtonBoundingClientRect = () => ({ top: 10, bottom: 42 });
  resize();
  assert.equal(f.values.get('--game-host-top'), '64px');
  assert.equal(f.values.get('--game-host-left'), '59px');
  assert.equal(f.values.get('--game-host-right'), '34px');
});
test('partial, failing or late SDKs and explicit host releases still reserve the overlay band', () => {
  for (const extra of [
    { tap: {} },
    {
      wx: {
        getWindowInfo() {
          throw Error('unavailable');
        },
        getSystemInfoSync: () => ({ safeArea: { top: 25 } }),
        getMenuButtonBoundingClientRect: () => ({ bottom: NaN }),
      },
    },
    { navigator: { userAgent: 'MicroMessenger' } },
    { SmallGamesPublishingConfig: { platform: 'taptap-h5' } },
  ])
    assert.equal(fixture(extra).values.get('--game-host-top'), '92px');
  const f = fixture();
  f.context.tap = {};
  f.events.get('focus')();
  assert.equal(f.values.get('--game-host-top'), '92px');
});
