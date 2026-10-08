import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const out = new URL('../../../../apps/shell-minigame/dist/wechat/castle-cannon/', import.meta.url);
const config = JSON.parse(await readFile(new URL('game.json', out)));
assert.equal(config.deviceOrientation, 'landscape');
const release = JSON.parse(await readFile(new URL('release.json', out)));
assert.equal(release.mode, 'preview');
assert.equal(release.advertisingConfigured, false);
let clock = 100000,
  labels = [];
const handlers = new Map(),
  timers = new Map(),
  records = new Map();
let timer = 0,
  adCalls = 0;
const draw = new Proxy(
  {},
  {
    get(_target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient')
        return () => ({ addColorStop() {} });
      if (key === 'fillText') return (s) => labels.push(String(s));
      if (key === 'fillRect')
        return (x, y, w, h) => {
          if (x === 0 && y === 0 && w > 800 && h > 300) labels = [];
        };
      if (key === 'measureText') return (s) => ({ width: s.length * 20 });
      return () => {};
    },
    set() {
      return true;
    },
  },
);
const sdk = {
  createCanvas: () => ({ width: 844, height: 390, getContext: () => draw }),
  getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390 }),
  getStorageSync: (k) => records.get(k),
  setStorageSync: (k, v) => records.set(k, v),
  removeStorageSync: (k) => records.delete(k),
  getLogManager: () => ({ info() {} }),
  exitMiniProgram: (o) => o.success(),
  createRewardedVideoAd() {
    adCalls++;
    throw new Error('no credential');
  },
};
for (const event of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show']) {
  handlers.set(event, new Set());
  sdk['on' + event] = (fn) => handlers.get(event).add(fn);
  sdk['off' + event] = (fn) => handlers.get(event).delete(fn);
}
const exports = {};
vm.runInNewContext(
  await readFile(new URL('game.js', out), 'utf8'),
  {
    exports,
    module: { exports },
    wx: sdk,
    console,
    Date: class extends Date {
      static now() {
        return clock;
      }
    },
    setInterval(fn) {
      timers.set(++timer, fn);
      return timer;
    },
    clearInterval: (id) => timers.delete(id),
    setTimeout,
    clearTimeout,
    URL,
    AbortController,
  },
  { filename: 'wechat-preview-game.js' },
);
const game = await exports.ready;
const advance = (seconds) => {
  for (let i = 0; i < seconds * 20; i++) {
    clock += 50;
    for (const fn of timers.values()) fn();
  }
};
const emit = (event, data) => {
  for (const fn of handlers.get(event)) fn(data);
};
const point = (x, y) => ({
  clientX: (844 - 960 * (390 / 540)) / 2 + x * (390 / 540),
  clientY: y * (390 / 540),
  identifier: 1,
});
const tap = (x, y) => {
  emit('TouchStart', { changedTouches: [point(x, y)] });
  emit('TouchEnd', { changedTouches: [point(x, y)] });
};
assert(labels.includes('一炮拆城'));
tap(209, 461);
tap(480, 292);
advance(0.1);
assert(labels.includes('本地练习'));
emit('TouchStart', { changedTouches: [point(850, 460)] });
advance(0.5);
assert(labels.some((s) => s.startsWith('松手发射')));
emit('TouchCancel', { changedTouches: [] });
advance(0.1);
assert(!labels.some((s) => s.startsWith('上一炮')));
emit('TouchStart', { changedTouches: [point(850, 460)] });
advance(0.6);
emit('TouchEnd', { changedTouches: [point(850, 460)] });
advance(0.1);
assert(labels.some((s) => s.startsWith('上一炮')));
tap(912, 45);
advance(0.1);
assert(labels.includes('练习已暂停'));
const frozen = labels.join('|');
advance(5);
assert.equal(labels.join('|'), frozen);
tap(480, 298);
advance(0.1);
assert(labels.includes('本地练习'));
emit('Hide');
const hidden = labels.join('|');
advance(8);
assert.equal(labels.join('|'), hidden);
emit('Show');
advance(0.1);
assert.equal(adCalls, 0);
await game.dispose();
assert.equal(timers.size, 0);
for (const set of handlers.values()) assert.equal(set.size, 0);
const evidence = {
  environment: 'Node VM with mocked wx SDK; not WeChat tools or a device',
  rendererUnderTest: 'Canvas fallback',
  chargeCancel: true,
  holdRelease: true,
  pauseResume: true,
  hideShow: true,
  cleanup: true,
};
await writeFile(
  new URL('../docs/design/artillery-duel-2026-10-09/actual/native-evidence.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(evidence);
