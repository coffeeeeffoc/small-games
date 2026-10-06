import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { verifyNativeArtifact } from './native-game-smoke.mjs';
import {
  createNativeSDKFixture,
  flushNative,
} from '../games/local/letters-words2/tests/native-sdk-fixture.mjs';
const output =
  process.env.NATIVE_OUTPUT_ROOT ||
  fileURLToPath(new URL('../apps/shell-minigame/dist/nine-games/', import.meta.url));
for (const platform of ['wechat', 'bilibili', 'douyin', 'kuaishou'])
  await verifyNativeArtifact({
    root: path.join(output, platform, 'wulong-city'),
    standalone: true,
    platform,
    game: 'wulong-city',
  });
const directory = path.join(output, 'alipay', 'wulong-city');
const fixture = createNativeSDKFixture({ width: 390, height: 844, pixelRatio: 1 });
const raw = {
  ...fixture.sdk,
  getStorageSync: ({ key }) => ({ data: fixture.sdk.getStorageSync(key) }),
  setStorageSync: ({ key, data }) => fixture.sdk.setStorageSync(key, data),
  removeStorageSync: ({ key }) => fixture.sdk.removeStorageSync(key),
};
const createImage = raw.createImage;
raw.createImage = () => {
  const image = createImage();
  return new Proxy(image, {
    set(target, key, value) {
      if (key === 'src') assert(existsSync(path.join(directory, value)), 'packaged image ' + value);
      return Reflect.set(target, key, value);
    },
  });
};
const restore = fixture.installGlobals();
const module = { exports: {} };
let mounted;
try {
  const context = vm.createContext({
    my: raw,
    module,
    exports: module.exports,
    console,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    document: undefined,
    window: undefined,
    fetch: undefined,
  });
  vm.runInContext(readFileSync(path.join(directory, 'game.js'), 'utf8'), context);
  await flushNative();
  mounted = await module.exports.ready;
  await flushNative();
  assert(fixture.findLabel('开始奇遇'));
  assert(!fixture.findLabel('全屏'));
  const tap = async (label) => {
    const position =
      fixture.findLabel(label) ??
      (label === '返回' ? { x: 43, y: 74, align: 'center' } : undefined);
    assert(position, 'Missing current native control ' + label);
    fixture.labels.length = 0;
    fixture.tap(position.x + (position.align === 'center' ? 0 : 3), position.y);
    await flushNative();
    await fixture.tick(50);
  };
  await tap('选择关卡');
  assert(fixture.findLabel('选择关卡'));
  await tap('下一章');
  assert(fixture.findLabel('第 2 章'));
  await tap('返回');
  await tap('开始奇遇');
  assert(fixture.findLabel('跳跃'));
  await tap('提示');
  assert(fixture.findLabel('提示 1 / 3'));
  await tap('再明确一点');
  assert(fixture.findLabel('提示 2 / 3'));
  await tap('回去试试');
  fixture.emit('Hide');
  await flushNative();
  assert(fixture.findLabel('继续探索'));
  const paused = JSON.stringify(fixture.labels);
  await fixture.tick(120000);
  assert.equal(JSON.stringify(fixture.labels), paused);
  fixture.emit('Show');
  await tap('继续探索');
  // The same touch-only shy-door solution used by the owner's four-platform test.
  const advance = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 34)
      await fixture.tick(Math.min(34, ms - elapsed));
  };
  fixture.touchStart(44, 770, 21);
  await advance(180);
  fixture.touchEnd(44, 770, 21);
  await advance(8000);
  fixture.touchStart(124, 770, 22);
  await advance(550);
  fixture.touchEnd(124, 770, 22);
  await advance(2200);
  await flushNative();
  assert(fixture.findLabel('乌龙解决啦！'));
  const saved = [...fixture.storage.entries()].find(([key]) => key.includes('wulong-city-v1'));
  assert(saved);
  const progress = JSON.parse(saved[1]).value;
  assert(progress.records['1']);
  assert(progress.unlockedLevels.includes(2));
  await mounted.dispose();
  mounted = null;
  assert.equal(
    [...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0),
    0,
  );
  assert.equal(fixture.timers.size, 0);
  assert.equal(fixture.requests.length, 0);
  assert(fixture.audio.every((sound) => !sound.playing));
  console.log(
    'alipay/wulong-city: actual CJS full home/levels/hints, touch-only real level clear, saved unlock, background pause and disposal passed.',
  );
} finally {
  await mounted?.dispose();
  restore();
}
