import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  createNativeSDKFixture,
  flushNative,
} from '../games/local/letters-words2/tests/native-sdk-fixture.mjs';

const output =
  process.env.NATIVE_OUTPUT_ROOT ||
  fileURLToPath(new URL('../apps/shell-minigame/dist/nine-games/', import.meta.url));
const channels = [
  ['wechat', 'wx'],
  ['bilibili', 'bl'],
  ['douyin', 'tt'],
  ['kuaishou', 'ks'],
  ['alipay', 'my'],
];
for (const game of [
  'cops-robbers',
  'cops-robbers-realtime',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
]) {
  for (const [platform, sdkName] of channels) {
    const directory = path.join(output, platform, game),
      source = readFileSync(path.join(directory, 'game.js'), 'utf8');
    const release = JSON.parse(readFileSync(path.join(directory, 'release.json'), 'utf8'));
    assert.equal(release.game, game);
    assert.equal(release.platform, platform);
    assert.equal(release.deviceVerified, false);
    assert.doesNotMatch(source, /document\.|window\.|createElement\(|iframe/);
    const fixture = createNativeSDKFixture({
      width: game === 'cops-robbers-realtime' ? 844 : 390,
      height: game === 'cops-robbers-realtime' ? 390 : 844,
    });
    const loadedPackages = new Set(),
      decodedImagePaths = new Set();
    if (game === 'vibeJam-myself-history-guess') {
      const configuration = JSON.parse(readFileSync(path.join(directory, 'game.json'), 'utf8'));
      const packages = configuration[platform === 'douyin' ? 'subPackages' : 'subpackages'];
      assert(packages?.length > 1, 'real image subpackage configuration');
      fixture.sdk.loadSubpackage = (options) => {
        const selected = packages.find((item) => item.name === options.name);
        assert(selected, 'configured native subpackage ' + options.name);
        const entry = path.join(directory, selected.root, 'game.js');
        assert(existsSync(entry), 'subpackage contains its real entry');
        vm.runInNewContext(readFileSync(entry, 'utf8'), {});
        loadedPackages.add(selected.name);
        options.success?.({});
        return { abort() {} };
      };
    }
    const image = fixture.sdk.createImage;
    fixture.sdk.createImage = () =>
      new Proxy(image(), {
        set(target, key, value) {
          if (key === 'src' && typeof value === 'string' && !value.startsWith('data:')) {
            if (game === 'vibeJam-myself-history-guess')
              assert(
                loadedPackages.has(value.split('/')[0]),
                'native subpackage finishes before image decode',
              );
            assert(
              existsSync(path.join(directory, value.replace(/^\.\//, ''))),
              `${platform}/${game} missing image ${value}`,
            );
          }
          if (key === 'src') decodedImagePaths.add(value);
          return Reflect.set(target, key, value);
        },
      });
    const sdk =
      platform === 'alipay'
        ? {
            ...fixture.sdk,
            getStorageSync: ({ key }) => ({ data: fixture.sdk.getStorageSync(key) }),
            setStorageSync: ({ key, data }) => fixture.sdk.setStorageSync(key, data),
            removeStorageSync: ({ key }) => fixture.sdk.removeStorageSync(key),
          }
        : fixture.sdk;
    const restore = fixture.installGlobals(),
      module = { exports: {} };
    const context = vm.createContext({
      [sdkName]: sdk,
      module,
      exports: module.exports,
      console,
      Date,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame,
      cancelAnimationFrame,
      queueMicrotask,
      document: undefined,
      window: undefined,
      fetch: undefined,
      URL: undefined,
      URLSearchParams: undefined,
      structuredClone: undefined,
      performance: undefined,
    });
    let instance;
    try {
      vm.runInContext(source, context, { filename: `${platform}/${game}/game.js` });
      instance = module.exports.instance;
      assert(instance?.canvas);
      await flushNative();
      const tapLabel = async (label) => {
        await fixture.tick(140);
        fixture.tapLabel(label);
        await flushNative();
      };
      if (game === 'cops-robbers') {
        assert.equal(instance.getState().page, 'home');
        await tapLabel('开始巡逻');
        assert.equal(instance.getState().page, 'play');
        const before = JSON.stringify(instance.getState().board);
        const node = instance.getState().hits.find((hit) => hit.id.startsWith('node'));
        fixture.touchStart(node.x + 22, node.y + 22);
        fixture.touchCancel(node.x + 22, node.y + 22);
        fixture.touchEnd(node.x + 22, node.y + 22);
        assert.equal(JSON.stringify(instance.getState().board), before);
        await tapLabel('暂停');
        assert.equal(instance.getState().page, 'pause');
        await tapLabel('继续');
      } else if (game === 'cops-robbers-realtime') {
        await tapLabel('开始游戏');
        await tapLabel('开始行动');
        assert(fixture.findLabel('首页'));
        await fixture.tick(250);
        await tapLabel('首页');
        assert(fixture.findLabel('街区追捕'));
      } else if (game === 'vibeJam-myself-history-guess') {
        await tapLabel('开始五幕旅途');
        assert(fixture.findLabel('暂停'));
        await tapLabel('暂停');
        assert(fixture.findLabel('继续观察'));
        await tapLabel('继续观察');
        const stored = [...fixture.storage.values()].find(
          (value) => value && typeof value === 'object' && value.journey,
        );
        assert.equal(stored.journey.deck.length, 5);
      } else {
        const tap = (label) => {
          const hit = instance.getLayout().hits.find((item) => item.label === label);
          assert(hit, label);
          fixture.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
        };
        tap('电脑对弈');
        tap('棋格0');
        await fixture.tick(101);
        assert.equal(
          instance.state.game.ply,
          2,
          'real pinned computer runs without browser cloning/clock globals',
        );
        tap('暂停');
        tap('返回首页');
        tap('同屏双人');
        for (const index of [0, 9, 1, 10, 2, 11, 3, 12, 4]) tap(`棋格${index}`);
        assert.equal(instance.state.game.result, 'red');
        assert.equal(instance.state.page, 'result');
      }
      if (game === 'vibeJam-myself-history-guess')
        assert(decodedImagePaths.size > 0, 'real packaged history imagery loaded');
      fixture.hide();
      await fixture.tick(60000);
      fixture.show();
      await flushNative();
      assert.equal(
        fixture.requests.length,
        0,
        'unconfigured preview never contacts a service or produces guest login',
      );
      (instance.stop || instance.dispose).call(instance);
      assert.equal(
        [...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0),
        0,
      );
      assert.equal(fixture.timers.size, 0);
      console.log(
        `${platform}/${game}: actual CJS native local flow, lifecycle, no DOM/network and disposal passed.`,
      );
    } finally {
      (instance?.stop || instance?.dispose)?.call(instance);
      restore();
    }
  }
}
