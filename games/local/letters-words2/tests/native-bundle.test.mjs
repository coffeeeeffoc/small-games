import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createNativeSDKFixture, flushNative } from './native-sdk-fixture.mjs';
import { snapshotNative, tapNativeTarget, finishNativeIsland, finishNativeWord } from './native-test-actions.mjs';
import { practiceBatches } from '../library.js';

const outputRoot = process.env.NATIVE_OUTPUT_ROOT || fileURLToPath(new URL('../../../../apps/shell-minigame/dist/', import.meta.url));
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const channels = [['wechat', 'wx'], ['bilibili', 'bl'], ['douyin', 'tt'], ['kuaishou', 'ks'], ...(process.env.NATIVE_OUTPUT_ROOT ? [['alipay', 'my']] : [])];
const selectedPlatforms = process.env.NATIVE_PLATFORMS?.split(',');
if (selectedPlatforms) {
  assert(selectedPlatforms.length > 0 && new Set(selectedPlatforms).size === selectedPlatforms.length);
  assert(selectedPlatforms.every((platform) => channels.some(([id]) => id === platform)), 'Unknown native platform selection');
}
for (const [platform, sdkName] of channels) {
  if (selectedPlatforms && !selectedPlatforms.includes(platform)) continue;
  const directory = path.join(outputRoot, platform, 'letters-words2');
  if (process.env.NATIVE_OUTPUT_ROOT) {
    const provenance = JSON.parse(readFileSync(path.join(directory, 'artifact-manifest.json'), 'utf8'));
    const sources = new Map(provenance.sourceFiles.map((file) => [file.path, file.sha256]));
    assert.equal(sources.size, provenance.sourceFiles.length, 'Native input provenance must have unique paths');
    const required = ['games/local/letters-words2/native.js', 'games/local/letters-words2/native-platform.js', 'games/local/letters-words2/native-session.js', 'games/local/letters-words2/engine.js', 'games/local/letters-words2/library.js', 'games/local/letters-words2/competition-renderer.js', 'platforms/competition/native.js', 'platforms/competition/client.js', 'platforms/competition/format.js', 'apps/shell-minigame/src/competition-availability.mjs', ...(platform === 'alipay' ? ['platforms/alipay/normalize.mjs'] : [])];
    for (const file of required) {
      assert(sources.has(file), `${platform} missing actual native input ${file}`);
      const actual = createHash('sha256').update(readFileSync(path.resolve(sourceRoot, '../../..', file))).digest('hex');
      assert.equal(sources.get(file), actual, `${platform} actual native input digest ${file}`);
    }
  }
  const source = readFileSync(path.join(directory, 'game.js'), 'utf8');
  const release = JSON.parse(readFileSync(path.join(directory, 'release.json'), 'utf8'));
  const project = JSON.parse(readFileSync(path.join(directory, 'game.json'), 'utf8'));
  assert.equal(project.deviceOrientation, 'portrait');
  assert.equal(release.platform, platform); assert.equal(release.game, 'letters-words2');
  assert.match(release.gameplayScope, /solo vocabulary islands, textbooks|native local solo/);
  assert.equal(release.nativeRuntimeVerified, false, 'SDK fixture evidence does not claim official device verification');
  assert.doesNotMatch(source, /document\.|window\.|createElement\(|iframe|XMLHttpRequest|\bIntl\.|new URL\(/);
  const packagedReads = [];
  const fixture = createNativeSDKFixture({ width: 320, height: 568, pixelRatio: 3, safeArea: { top: 30, bottom: 534 },
    launchQuery: { game: 'letters-words2', mini: 'dawn', v: '1', token: 'private', dev: '1' },
    readFile(filePath, encoding) {
      if (platform === 'alipay') assert.match(filePath, /^\/assets\//, 'Alipay raw SDK receives its documented package-rooted path');
      const localPath = platform === 'alipay' ? filePath.slice(1) : filePath;
      const resolved = path.resolve(directory, localPath);
      assert.ok(resolved.startsWith(directory + path.sep));
      assert.equal(encoding, 'utf8'); packagedReads.push(localPath);
      return readFileSync(resolved, 'utf8');
    },
  });
  const images = [];
  const createImage = fixture.sdk.createImage;
  fixture.sdk.createImage = () => {
    return new Proxy(createImage(), { set(image, key, value) {
      if (key === 'src') { images.push(value); assert.ok(existsSync(path.join(directory, value)), `${platform} packaged image ${value}`); }
      return Reflect.set(image, key, value, image);
    } });
  };
  const restoreGlobals = fixture.installGlobals();
  const rawSdk = platform === 'alipay' ? { ...fixture.sdk,
    getStorageSync: ({ key }) => ({ data: fixture.sdk.getStorageSync(key) }),
    setStorageSync: ({ key, data }) => fixture.sdk.setStorageSync(key, data),
    removeStorageSync: ({ key }) => fixture.sdk.removeStorageSync(key),
  } : fixture.sdk;
  const module = { exports: {} };
  const context = vm.createContext({
    [sdkName]: rawSdk, console, exports: module.exports, module,
    Date: globalThis.Date, queueMicrotask,
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
    requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame,
    document: undefined, window: undefined, fetch: undefined, Intl: undefined, URL: undefined, URLSearchParams: undefined,
  });
  let instance;
  try {
    vm.runInContext(source, context, { filename: `${platform}/letters-words2/game.js` });
    await flushNative();
    instance = module.exports.instance;
    assert.ok(instance?.getLayout && instance.stop, `${platform} actual CJS package exports the native session`);
    assert.equal(vm.runInContext('[typeof document,typeof window,typeof fetch,typeof Intl,typeof URL,typeof URLSearchParams].join(",")', context), 'undefined,undefined,undefined,undefined,undefined,undefined');
    assert.equal(instance.state.page, 'play'); assert.equal(instance.state.mini, 'dawn');
    assert.deepEqual([fixture.canvas.width, fixture.canvas.height], [960, 1704]);
    const initial = snapshotNative(instance.state.game);
    await finishNativeIsland(fixture, instance);
    await tapNativeTarget(fixture, instance, '再练一遍');
    assert.deepEqual(snapshotNative(instance.state.game), initial, `${platform} built mini replay preserves the exact fixed board`);
    await finishNativeIsland(fixture, instance);
    await tapNativeTarget(fixture, instance, '去下一座词岛');
    assert.equal(instance.state.mini, 'shore'); await finishNativeWord(fixture, instance);
    await tapNativeTarget(fixture, instance, '返回首页'); await tapNativeTarget(fixture, instance, '每日词岛');
    assert.equal(instance.state.daily, '2026-10-06', `${platform} daily rollover runs without Intl or URL`);
    await finishNativeWord(fixture, instance);
    await tapNativeTarget(fixture, instance, '返回首页'); await tapNativeTarget(fixture, instance, '学习入口'); await tapNativeTarget(fixture, instance, '教材练习');
    await flushNative();
    assert.ok(instance.getLayout().targets.some(item => item.id === 'publisher'));
    assert.ok(packagedReads.includes('assets/english-dict/catalog.json'));
    await tapNativeTarget(fixture, instance, '开始单元练习'); await flushNative();
    assert.equal(instance.state.page, 'play'); assert.ok(instance.state.practice?.bookId);
    const textbook = JSON.parse(readFileSync(path.join(directory, `assets/english-dict/books/${instance.state.practice.bookId}.json`), 'utf8'));
    const expected = practiceBatches(textbook.entries.filter(entry => !instance.state.practice.unit || entry.unit === instance.state.practice.unit));
    assert.deepEqual(snapshotNative(instance.state.practice.batches), expected, `${platform} selects exactly the real packaged textbook unit`);
    assert.deepEqual(readFileSync(path.join(directory, 'assets/english-dict/catalog.json')), readFileSync(path.join(sourceRoot, 'assets/english-dict/catalog.json')));
    await finishNativeWord(fixture, instance);
    await tapNativeTarget(fixture, instance, '返回首页'); await tapNativeTarget(fixture, instance, '学习入口'); await tapNativeTarget(fixture, instance, '我的词单'); await tapNativeTarget(fixture, instance, '编辑词单');
    const text = "can't 不能\nc++ 编程语言\n" + 'a'.repeat(40) + ' 很长的词';
    fixture.emit('KeyboardInput', { value: text }); fixture.emit('KeyboardConfirm', { value: text });
    fixture.setStorageFailure(true);
    await tapNativeTarget(fixture, instance, '用这组词开始');
    assert.match(instance.state.storageNotice, /本次仍可继续/);
    assert.deepEqual(snapshotNative(instance.state.game.words.map(word => word.word)), ["can't", 'c++', 'a'.repeat(40)]);
    await finishNativeIsland(fixture, instance);
    assert.equal(instance.state.game.completed, 3, `${platform} actual CJS bundle completes punctuation and long custom words`);
    assert.equal(fixture.requests.length, 0, 'solo startup, islands, textbooks and custom words never need a browser fetch or competition request');
    assert.ok(images.includes('assets/ui/island.png'));
    for (const sound of fixture.audio) assert.ok(existsSync(path.join(directory, sound.src)));
    fixture.hide(); const saved = snapshotNative(instance.state.game); await fixture.tick(60000); fixture.show();
    assert.deepEqual(snapshotNative(instance.state.game), saved);
    instance.stop(); instance.stop();
    assert.equal([...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
    assert.equal(fixture.timers.size, 0); assert.equal(fixture.stack.length, 0);
    console.log(`${platform}: actual CJS package without DOM/fetch/Intl/URL completed physical mini/replay/next/daily, real packaged textbook and long custom words; storage fallback, lifecycle and disposal passed.`);
  } finally { instance?.stop(); restoreGlobals(); }
}
