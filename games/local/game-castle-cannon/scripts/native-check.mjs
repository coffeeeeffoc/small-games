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
const point = (x, y) => ({ clientX: 32 + x * 0.8125, clientY: y * 0.8125, identifier: 1 });
const tap = (x, y) => {
  emit('TouchStart', { changedTouches: [point(x, y)] });
  emit('TouchEnd', { changedTouches: [point(x, y)] });
};
const shoot = (x, y) => {
  emit('TouchStart', { changedTouches: [point(200, 350)] });
  emit('TouchMove', { changedTouches: [point(x, y)] });
  emit('TouchEnd', { changedTouches: [point(x, y)] });
  advance(0.5);
};
assert(labels.includes('一炮拆城'));
tap(465, 301);
assert(labels.includes('兵力 12/12'));
emit('TouchStart', { changedTouches: [point(590, 280)] });
emit('TouchCancel', { changedTouches: [] });
advance(0.5);
assert(!labels.some((s) => s.includes('城门破了')));
shoot(590, 280);
assert(labels.some((s) => s.includes('城门破了')));
emit('Hide');
const hidden = labels.join('|');
advance(8);
assert.equal(labels.join('|'), hidden);
emit('Show');
advance(2.5);
shoot(680, 160);
assert(labels.some((s) => s.includes('箭塔倒下')));
tap(905, 45);
assert(labels.includes('暂歇，等你开炮'));
advance(5);
tap(480, 170);
advance(20);
assert(labels.includes('城堡占领！'));
await new Promise((resolve) => setTimeout(resolve, 0));
assert([...records.values()].some((s) => s.includes('grass-v1')));
assert(labels.some((s) => s.includes('广告奖励预留')));
assert.equal(adCalls, 0);
await game.dispose();
assert.equal(timers.size, 0);
for (const set of handlers.values()) assert.equal(set.size, 0);
const evidence = {
  environment: 'Node VM with mocked wx SDK; not WeChat developer tools or real device',
  orientation: 'landscape',
  nativeBundleLoaded: true,
  dragCancel: true,
  gateAndTower: true,
  hideShow: true,
  pauseResume: true,
  victory: true,
  storage: true,
  advertisingConfigured: false,
  cleanup: true,
};
await writeFile(
  new URL('../docs/design/native-evidence.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(JSON.stringify(evidence, null, 2));
