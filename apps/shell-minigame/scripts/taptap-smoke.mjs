import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import vm from 'node:vm';
import { nineGames } from './nine-games-targets.mjs';
import { verifyArtifact } from './nine-games-build.mjs';
import {
  createNativeSDKFixture,
  flushNative,
} from '../../../games/local/letters-words2/tests/native-sdk-fixture.mjs';
import {
  snapshotNative,
  tapNativeTarget,
  finishNativeIsland,
  finishNativeWord,
} from '../../../games/local/letters-words2/tests/native-test-actions.mjs';
import { practiceBatches } from '../../../games/local/letters-words2/library.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const defaultOutput = path.join(repo, 'apps/shell-minigame/dist/nine-games');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function smokeOptions(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      game: { type: 'string', multiple: true },
      output: { type: 'string' },
      evidence: { type: 'string' },
    },
    allowPositionals: false,
  });
  const games = values.game || nineGames.map(({ id }) => id);
  assert(games.length && new Set(games).size === games.length, 'Duplicate TapTap game selection');
  assert(
    games.every((id) => nineGames.some((game) => game.id === id)),
    'Unknown TapTap game',
  );
  return {
    games,
    output: path.resolve(values.output || process.env.NATIVE_OUTPUT_ROOT || defaultOutput),
    evidence: path.resolve(
      values.evidence ||
        process.env.TAPTAP_EVIDENCE_ROOT ||
        path.join(repo, '.scratch/taptap-smoke'),
    ),
  };
}

function packagedPath(directory, relative) {
  assert.equal(typeof relative, 'string', 'Packaged resource path must be a string');
  const filename = path.resolve(directory, relative.replace(/^\.\//, ''));
  const inside = path.relative(directory, filename);
  assert(
    inside && !inside.startsWith(`..${path.sep}`) && inside !== '..' && !path.isAbsolute(inside),
    'Packaged resources must stay inside the TapTap artifact',
  );
  return filename;
}

/** Run exact companion bytes in the game's existing tap-only VM context. */
export function createTapTapRequire(directory, context, parent = 'game.js') {
  const cache = new Map();
  function from(request, importer) {
    assert(
      typeof request === 'string' && /^\.\.?\//.test(request),
      'TapTap smoke only loads relative packaged CommonJS companions',
    );
    const filename = packagedPath(directory, path.join(path.dirname(importer), request));
    assert.equal(path.extname(filename), '.js', 'TapTap companion must be a CommonJS file');
    assert.equal(realpathSync(filename), filename, 'TapTap companion must not contain symlinks');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    try {
      const source = readFileSync(filename, 'utf8');
      const execute = vm.runInContext(
        `(function(exports,module,require){\n${source}\n})`,
        context,
        { filename, timeout: 10000 },
      );
      const relative = path.relative(directory, filename);
      execute(module.exports, module, (nested) => from(nested, relative));
      return module.exports;
    } catch (error) {
      cache.delete(filename);
      throw error;
    }
  }
  return (request) => from(request, parent);
}

export async function verifyTapTapPackage(directory, selected) {
  const manifest = await verifyArtifact(directory);
  assert.equal(manifest.platform, 'taptap', 'A renamed other-platform package is not TapTap');
  assert.equal(manifest.game, selected.id);
  assert.equal(manifest.officialToolsVerified, false);
  assert.equal(manifest.deviceVerified, false);
  const sourceFiles = new Map(manifest.sourceFiles.map((file) => [file.path, file.sha256]));
  assert.equal(sourceFiles.size, manifest.sourceFiles.length, 'Source provenance must be unique');
  assert(
    sourceFiles.has('platforms/taptap/build.mjs'),
    'Actual TapTap descriptor must be an input',
  );
  assert(
    sourceFiles.has(`${selected.directory}/${selected.entry}`),
    'Actual game native entry is required',
  );
  for (const [relative, expected] of sourceFiles)
    assert.equal(
      hash(readFileSync(packagedPath(repo, relative))),
      expected,
      `Stale input ${relative}`,
    );
  const release = JSON.parse(readFileSync(path.join(directory, 'release.json'), 'utf8'));
  assert.equal(release.game, selected.id);
  assert.equal(release.platform, 'taptap');
  assert.equal(release.nativeRuntimeVerified, false);
  assert.equal(release.officialToolsVerified, false);
  assert.equal(release.deviceVerified, false);
  const config = JSON.parse(readFileSync(path.join(directory, 'game.json'), 'utf8'));
  assert.equal(config.deviceOrientation, selected.orientation);
  const project = JSON.parse(readFileSync(path.join(directory, 'project.config.json'), 'utf8'));
  assert.equal(project.compileType, 'game');
  const source = readFileSync(path.join(directory, 'game.js'), 'utf8');
  assert(/\btap\b/.test(source), 'Native TapTap entry must consume the tap SDK');
  if (selected.id !== 'travel-bund')
    assert(
      !/document\.|window\.|createElement\(|XMLHttpRequest/.test(source),
      'Native Canvas bundle must not call browser document/window/network APIs',
    );
  return { manifest, release, config, source };
}

function canvasFixture(directory, selected) {
  const letters = selected.id === 'letters-words2';
  const fixture = createNativeSDKFixture({
    width: selected.orientation === 'landscape' ? 844 : letters ? 320 : 390,
    height: selected.orientation === 'landscape' ? 390 : letters ? 568 : 844,
    pixelRatio: letters ? 3 : 1,
    ...(letters ? { safeArea: { top: 30, bottom: 534 } } : {}),
    readFile(filePath, encoding) {
      assert.equal(encoding, 'utf8');
      fixture.packagedReads.push(filePath);
      return readFileSync(packagedPath(directory, filePath), 'utf8');
    },
  });
  fixture.packagedReads = [];
  fixture.imagePaths = new Set();
  fixture.loadedPackages = new Set();
  const getWindowInfo = fixture.sdk.getSystemInfoSync;
  fixture.sdk.getWindowInfo = function () {
    assert.equal(this, fixture.sdk, 'TapTap native methods keep their real receiver');
    return getWindowInfo();
  };
  delete fixture.sdk.getSystemInfoSync;
  const createImage = fixture.sdk.createImage;
  fixture.sdk.createImage = () =>
    new Proxy(createImage(), {
      set(target, key, value) {
        if (key === 'src') {
          assert(existsSync(packagedPath(directory, value)), `Missing native image ${value}`);
          fixture.imagePaths.add(value);
          if (selected.subpackageImages)
            assert(
              fixture.loadedPackages.has(value.split('/')[0]),
              'Load subpackage before decode',
            );
        }
        return Reflect.set(target, key, value, target);
      },
    });
  if (selected.subpackageImages) {
    const config = JSON.parse(readFileSync(path.join(directory, 'game.json'), 'utf8'));
    assert(config.subpackages?.length > 1, 'History keeps real image subpackages');
    fixture.sdk.loadSubpackage = (options) => {
      const pkg = config.subpackages.find((item) => item.name === options.name);
      assert(pkg, `Configured TapTap subpackage ${options.name}`);
      vm.runInNewContext(readFileSync(packagedPath(directory, `${pkg.root}/game.js`), 'utf8'), {});
      fixture.loadedPackages.add(pkg.name);
      options.success?.({});
      return { abort() {} };
    };
  }
  return fixture;
}

async function canvasFlow(game, fixture, instance) {
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
    assert.equal(JSON.stringify(instance.getState().board), before, 'Cancel does not move a piece');
    await tapLabel('暂停');
    assert.equal(instance.getState().page, 'pause');
    await tapLabel('继续');
  } else if (game === 'cops-robbers-realtime') {
    assert(fixture.findLabel('街区追捕'));
    await tapLabel('开始游戏');
    await tapLabel('开始行动');
    assert(fixture.findLabel('首页'));
    await fixture.tick(250);
    await tapLabel('首页');
    assert(fixture.findLabel('街区追捕'));
  } else if (game === 'vibeJam-myself-history-guess') {
    assert(fixture.findLabel('开始五幕旅途'));
    await tapLabel('开始五幕旅途');
    assert(fixture.findLabel('暂停'));
    await tapLabel('暂停');
    assert(fixture.findLabel('继续观察'));
    await tapLabel('继续观察');
    const stored = [...fixture.storage.values()].find((value) => value?.journey);
    assert.equal(stored.journey.deck.length, 5);
    assert(fixture.imagePaths.size > 0, 'History actually consumes packaged imagery');
  } else if (game === 'xiangqi-five') {
    const tap = (label) => {
      const hit = instance.getLayout().hits.find((item) => item.label === label);
      assert(hit, label);
      fixture.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
    };
    assert.equal(instance.state.page, 'home');
    tap('电脑对弈');
    tap('棋格0');
    await fixture.tick(101);
    assert.equal(instance.state.game.ply, 2, 'Real computer move without browser globals');
    tap('暂停');
    tap('返回首页');
    tap('同屏双人');
    for (const index of [0, 9, 1, 10, 2, 11, 3, 12, 4]) tap(`棋格${index}`);
    assert.equal(instance.state.game.result, 'red');
    assert.equal(instance.state.page, 'result');
  }
}

async function lettersFlow(directory, fixture, instance) {
  const tap = (label) => tapNativeTarget(fixture, instance, label);
  assert.equal(instance.state.page, 'home');
  await tap('每日词岛');
  assert.equal(instance.state.daily, '2026-10-06');
  await finishNativeWord(fixture, instance);
  await tap('返回首页');
  await tap('学习入口');
  await tap('教材练习');
  await flushNative();
  assert(fixture.packagedReads.includes('assets/english-dict/catalog.json'));
  await tap('开始单元练习');
  assert.equal(instance.state.page, 'play');
  const practice = instance.state.practice;
  const textbook = JSON.parse(
    readFileSync(
      packagedPath(directory, `assets/english-dict/books/${practice.bookId}.json`),
      'utf8',
    ),
  );
  const expected = practiceBatches(
    textbook.entries.filter((entry) => !practice.unit || entry.unit === practice.unit),
  );
  assert.deepEqual(snapshotNative(practice.batches), expected, 'Practice uses actual textbook');
  await finishNativeWord(fixture, instance);
  await tap('返回首页');
  await tap('学习入口');
  await tap('我的词单');
  await tap('编辑词单');
  const text = "can't 不能\nc++ 编程语言\n" + 'a'.repeat(40) + ' 很长的词';
  fixture.emit('KeyboardInput', { value: text });
  fixture.emit('KeyboardConfirm', { value: text });
  fixture.setStorageFailure(true);
  await tap('用这组词开始');
  assert.match(instance.state.storageNotice, /本次仍可继续/);
  assert.deepEqual(snapshotNative(instance.state.game.words.map((word) => word.word)), [
    "can't",
    'c++',
    'a'.repeat(40),
  ]);
  await finishNativeIsland(fixture, instance);
  assert.equal(instance.state.game.completed, 3);
  fixture.setStorageFailure(false);
  assert(fixture.imagePaths.has('assets/ui/island.png'));
}

async function wulongFlow(fixture) {
  assert(fixture.findLabel('开始奇遇'));
  assert(!fixture.findLabel('全屏'));
  const screenPoint = (x, y) => {
    const info = fixture.sdk.getWindowInfo();
    const top = Math.max(
      info.safeArea?.top ?? 0,
      fixture.sdk.getMenuButtonBoundingClientRect().bottom,
    );
    const height = (info.safeArea?.bottom ?? info.windowHeight) - top;
    const width = (height * 390) / 844;
    return { x: (info.windowWidth - width) / 2 + (x * width) / 390, y: top + (y * width) / 390 };
  };
  const tap = async (label) => {
    const point = fixture.findLabel(label) || (label === '返回' ? screenPoint(43, 74) : undefined);
    assert(point, `Missing native control ${label}`);
    fixture.labels.length = 0;
    fixture.tap(point.x + (point.align === 'center' ? 0 : 3), point.y);
    await flushNative();
    await fixture.tick(50);
  };
  await tap('选择关卡');
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
  fixture.hide();
  await flushNative();
  assert(fixture.findLabel('继续探索'));
  const paused = JSON.stringify(fixture.labels);
  await fixture.tick(120000);
  assert.equal(JSON.stringify(fixture.labels), paused);
  fixture.show();
  await tap('继续探索');
  const advance = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 34)
      await fixture.tick(Math.min(34, ms - elapsed));
  };
  const left = screenPoint(44, 770),
    right = screenPoint(124, 770);
  fixture.touchStart(left.x, left.y, 21);
  await advance(180);
  fixture.touchEnd(left.x, left.y, 21);
  await advance(8000);
  fixture.touchStart(right.x, right.y, 22);
  await advance(550);
  fixture.touchEnd(right.x, right.y, 22);
  await advance(2200);
  assert(fixture.findLabel('乌龙解决啦！'), 'Actual touch-only level clear');
  const saved = [...fixture.storage.entries()].find(([key]) => key.includes('wulong-city-v1'));
  assert(saved);
  const progress = JSON.parse(saved[1]).value;
  assert(progress.records['1']);
  assert(progress.unlockedLevels.includes(2));
}

export async function smokeCanvas(directory, selected, source) {
  const fixture = canvasFixture(directory, selected);
  const restore = fixture.installGlobals();
  const module = { exports: {} };
  const globals = {
    tap: fixture.sdk,
    module,
    exports: module.exports,
    console,
    Date: globalThis.Date,
    queueMicrotask,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    document: undefined,
    window: undefined,
    fetch: undefined,
    Intl: undefined,
    URL: undefined,
    URLSearchParams: undefined,
    structuredClone: undefined,
    performance: undefined,
  };
  globals.GameGlobal = globals;
  const context = vm.createContext(globals);
  context.require = createTapTapRequire(directory, context);
  let mounted;
  try {
    vm.runInContext(source, context, { filename: `taptap/${selected.id}/game.js`, timeout: 10000 });
    await flushNative();
    assert.equal(
      context.__tapTapLogin?.status,
      'unconfigured',
      'Actual unconfigured login bootstrap ran',
    );
    assert.equal(
      await context.__tapTapLogin.ready,
      null,
      'Preview never fabricates a platform identity',
    );
    mounted = module.exports.instance || (await module.exports.ready);
    await flushNative();
    assert(mounted, 'Actual TapTap CJS entry exports a game instance');
    assert.equal(
      vm.runInContext(
        '[typeof document,typeof window,typeof fetch,typeof wx,typeof bl,typeof tt,typeof ks,typeof my].join(",")',
        context,
      ),
      'undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined',
    );
    if (selected.id === 'letters-words2') await lettersFlow(directory, fixture, mounted);
    else if (selected.id === 'wulong-city') await wulongFlow(fixture);
    else await canvasFlow(selected.id, fixture, mounted);
    fixture.hide();
    await fixture.tick(60000);
    fixture.show();
    await flushNative();
    assert(fixture.storage.size > 0, 'Real game progress/settings use native storage');
    assert.equal(
      fixture.requests.length,
      0,
      'Unconfigured local gameplay never logs in or calls a service',
    );
    for (const sound of fixture.audio)
      if (sound.src)
        assert(existsSync(packagedPath(directory, sound.src)), 'Actual packaged audio');
    await (mounted.stop || mounted.dispose).call(mounted);
    mounted = null;
    assert.equal(
      [...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0),
      0,
    );
    assert.equal(fixture.timers.size, 0);
    assert(fixture.audio.every((sound) => !sound.playing));
    return {
      status: 'local-cjs-smoke-passed',
      officialToolsVerified: false,
      deviceVerified: false,
    };
  } finally {
    await (mounted?.stop || mounted?.dispose)?.call(mounted);
    restore();
  }
}

export async function runTapTapSmoke(options = smokeOptions()) {
  const results = [];
  for (const game of options.games) {
    const selected = nineGames.find(({ id }) => id === game);
    const directory = path.join(options.output, 'taptap', game);
    let result;
    if (selected.cocos) {
      if (!existsSync(directory)) {
        const statusFile = path.join(options.output, 'taptap-build-status.json');
        assert(existsSync(statusFile), 'Missing TapTap artifact has no build status');
        const build = JSON.parse(readFileSync(statusFile, 'utf8'));
        const entries = build.results.filter(
          (entry) => entry.game === game && entry.platform === 'taptap',
        );
        assert.equal(
          entries.length,
          1,
          'Missing artifact needs one matching game/platform build entry',
        );
        const entry = entries[0];
        assert.equal(entry.status, 'blocked', 'Missing artifact is not a successful build');
        assert.match(
          entry.reason,
          /requires Creator 3\.8\.x with official tap-minigame-ts v1\.2\.2 conversion/,
        );
        assert.equal(entry.officialTools, 'unrun');
        assert.equal(entry.device, 'unrun');
        result = {
          status: 'blocked-missing-official-cocos-conversion-runtime-unrun',
          reason: entry.reason,
          officialToolsVerified: false,
          deviceVerified: false,
        };
      } else {
        const { verifyTapTapCocosArtifact } = await import('./taptap-cocos.mjs');
        const manifest = await verifyTapTapCocosArtifact(directory);
        assert.equal(manifest.game, game);
        result = {
          status: 'converted-cocos-integrity-passed-runtime-unrun',
          officialToolsVerified: false,
          deviceVerified: false,
        };
      }
    } else {
      const { source } = await verifyTapTapPackage(directory, selected);
      if (game === 'travel-bund') {
        const { smokeTapTapTravel } = await import('./taptap-travel-smoke.mjs');
        result = await smokeTapTapTravel(directory, options.evidence);
      } else result = await smokeCanvas(directory, selected, source);
    }
    results.push({ game, ...result });
    console.log(
      `taptap/${game}: ${result.status}; official developer tool/device acceptance unrun.`,
    );
  }
  return results;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const results = await runTapTapSmoke();
  if (results.some(({ status }) => status.startsWith('blocked-'))) process.exitCode = 1;
}
