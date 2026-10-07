import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(repo, 'games/local/travel-bund/package.json'));
const { chromium } = require('@playwright/test');
const runnerSha256 = createHash('sha256')
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest('hex');
const channels = ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'];
const selected = process.env.NATIVE_PLATFORMS?.split(',') || channels;
assert(
  selected.length &&
    new Set(selected).size === selected.length &&
    selected.every((platform) => channels.includes(platform)),
  'Unknown or duplicate Travel native channel',
);
const output = resolve(
  process.env.NATIVE_OUTPUT_ROOT || join(repo, 'apps/shell-minigame/dist/nine-games'),
);
const evidence = resolve(
  process.env.TRAVEL_NATIVE_EVIDENCE_ROOT ||
    join(repo, '.scratch/travel-native-validation/evidence'),
);
const executable = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert(executable, 'Set a real CHROMIUM_PATH or PLAYWRIGHT_EXECUTABLE_PATH');
await mkdir(evidence, { recursive: true });
// Only the contract script's IO locations change; its checks remain intact.
const contractPath = join(repo, 'games/local/travel-bund/native/tests/contracts.mjs');
const contractOriginal = await readFile(contractPath, 'utf8');
const contractReport =
  "new URL('../../docs/platforms/native-design-2026-10-06/contracts-report.json',import.meta.url)";
assert.equal(
  contractOriginal.split(contractReport).length,
  2,
  'Reviewed contract report location changed',
);
const contractSource = contractOriginal
  .replace(contractReport, JSON.stringify(join(evidence, 'contracts-report.json')))
  .replace(
    /new URL\((['"])([^'"]+)\1,import\.meta\.url\)/g,
    (_, quote, relative) =>
      'new URL(' + JSON.stringify(new URL(relative, 'file://' + contractPath).href) + ')',
  )
  .replace(
    "import {build} from 'esbuild';",
    "import {createRequire} from 'node:module';const {build}=createRequire(" +
      JSON.stringify(join(repo, 'games/local/travel-bund/package.json')) +
      ")('esbuild');",
  );
const contractHarness = join(evidence, 'controlled-contracts.mjs');
await writeFile(contractHarness, contractSource);
try {
  execFileSync(process.execPath, [contractHarness], { cwd: repo, stdio: 'inherit' });
} finally {
  await rm(contractHarness, { force: true });
}
// Local SDK callbacks exercise the actual production wrappers, normalizer and
// resource bridges. The browser supplies genuine WebGL2, WASM and image decoding;
// this is not official native SDK/device acceptance.
function nativeWorkerFixture() {
  let game, platform;
  const listeners = new Map(),
    frames = new Map(),
    storage = {};
  let serial = 0,
    first = true;
  const io = {
    package: [],
    remote: [],
    storage: [],
    launchSuccess: 0,
    images: [],
    decodedImages: [],
  };
  const emit = (name, arg) => {
    for (const fn of [...(listeners.get(name) || [])]) fn(arg);
  };
  self.addEventListener('error', (e) => self.postMessage({ kind: 'error', message: e.message }));
  self.addEventListener('unhandledrejection', (e) =>
    self.postMessage({ kind: 'error', message: e.reason?.stack || String(e.reason) }),
  );
  self.onmessage = async ({ data }) => {
    try {
      if (data.kind === 'init') {
        platform = data.platform;
        if (
          typeof window !== 'undefined' ||
          typeof document !== 'undefined' ||
          typeof wx !== 'undefined'
        )
          throw Error('Unexpected DOM/wx alias');
        delete globalThis.TextDecoder;
        const canvas = data.canvas;
        canvas.requestAnimationFrame = (fn) => {
          frames.set(++serial, fn);
          return serial;
        };
        canvas.cancelAnimationFrame = (id) => frames.delete(id);
        const fixture = {
          createCanvas: () => (first ? ((first = false), canvas) : new OffscreenCanvas(1, 1)),
          createImage() {
            const image = new OffscreenCanvas(1, 1);
            Object.defineProperty(image, 'src', {
              set(path) {
                io.images.push(path);
                fetch('/artifact/' + path.replace(/^\//, ''))
                  .then((r) => {
                    if (!r.ok) throw Error('image ' + path);
                    return r.blob();
                  })
                  .then(createImageBitmap)
                  .then((bitmap) => {
                    image.width = bitmap.width;
                    image.height = bitmap.height;
                    image.getContext('2d').drawImage(bitmap, 0, 0);
                    io.decodedImages.push({ path, width: bitmap.width, height: bitmap.height });
                    bitmap.close();
                    image.onload?.();
                  })
                  .catch((error) => image.onerror?.(error));
              },
            });
            return image;
          },
          getSystemInfoSync: () => ({
            windowWidth: 844,
            windowHeight: 390,
            pixelRatio: 1,
            safeArea: { left: 0, top: 12, right: 844, bottom: 378 },
          }),
          getStorageSync(key) {
            if (platform === 'alipay') {
              if (!key || typeof key !== 'object' || typeof key.key !== 'string')
                throw Error('my storage must use object key');
              io.storage.push({ method: 'get', shape: 'object', key: key.key });
              return { data: storage[key.key] };
            }
            if (typeof key !== 'string') throw Error('string storage key required');
            io.storage.push({ method: 'get', shape: 'string', key });
            return storage[key] || '';
          },
          setStorageSync(key, value) {
            if (platform === 'alipay') {
              if (
                !key ||
                typeof key !== 'object' ||
                typeof key.key !== 'string' ||
                !Object.hasOwn(key, 'data')
              )
                throw Error('my setStorageSync object required');
              io.storage.push({ method: 'set', shape: 'object', key: key.key });
              storage[key.key] = key.data;
              return {};
            }
            if (typeof key !== 'string') throw Error('string setStorage key required');
            io.storage.push({ method: 'set', shape: 'string', key });
            storage[key] = value;
          },
          removeStorageSync(key) {
            if (platform === 'alipay') {
              delete storage[key.key];
              return {};
            }
            delete storage[key];
          },
          getFileSystemManager() {
            if (platform === 'kuaishou')
              return {
                readFileSync(path, encoding) {
                  io.package.push({ path, encoding, api: 'readFileSync' });
                  const xhr = new XMLHttpRequest();
                  xhr.open('GET', '/artifact/' + path.replace(/^\//, ''), false);
                  xhr.responseType = 'arraybuffer';
                  xhr.send();
                  if (xhr.status !== 200) throw Error('KS sync file ' + path);
                  return encoding === 'utf8'
                    ? new TextDecoder().decode(xhr.response)
                    : xhr.response;
                },
              };
            return {
              readFile(options) {
                if (platform === 'alipay' && !options.filePath.startsWith('/'))
                  throw Error('my code path must be rooted');
                io.package.push({
                  path: options.filePath,
                  encoding: options.encoding,
                  api: 'readFile',
                });
                fetch('/artifact/' + options.filePath.replace(/^\//, ''))
                  .then(async (r) => {
                    if (!r.ok) throw Error('file ' + options.filePath);
                    const bytes = await r.arrayBuffer();
                    options.success({
                      data: options.encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes,
                    });
                  })
                  .catch((e) =>
                    options.fail(
                      platform === 'alipay' ? { errorMessage: e.message } : { errMsg: e.message },
                    ),
                  );
              },
            };
          },
          request(options) {
            const myShape = platform === 'alipay';
            if (
              myShape &&
              (!['arraybuffer', 'text'].includes(options.dataType) ||
                Object.hasOwn(options, 'responseType'))
            )
              throw Error('my request must use dataType, not responseType');
            if (!myShape && !['arraybuffer', 'text'].includes(options.responseType))
              throw Error('responseType required');
            io.remote.push({
              url: options.url,
              responseType: options.responseType,
              dataType: options.dataType,
              statusField: myShape ? 'status' : 'statusCode',
            });
            const path = new URL(options.url).pathname.replace(/^.*\/games\/travel-bund\//, '');
            const controller = new AbortController();
            fetch('/remote/' + path, { signal: controller.signal })
              .then(async (r) => {
                const bytes =
                  (myShape ? options.dataType : options.responseType) === 'arraybuffer'
                    ? await r.arrayBuffer()
                    : await r.text();
                options.success(
                  myShape
                    ? { status: r.status, data: bytes }
                    : { statusCode: r.status, data: bytes },
                );
              })
              .catch((e) =>
                options.fail(myShape ? { errorMessage: e.message } : { errMsg: e.message }),
              );
            return { abort: () => controller.abort() };
          },
        };
        for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show']) {
          fixture['on' + name] = (fn) => {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
          };
          fixture['off' + name] = (fn) => {
            listeners.get(name)?.delete(fn);
            if (!listeners.get(name)?.size) listeners.delete(name);
          };
        }
        if (platform === 'bilibili') {
          fixture.launchSuccess = () => {
            io.launchSuccess++;
          };
          fixture.getLaunchOptionsSync = () => ({ scene: 'local-harness', query: {} });
        }
        const namespace = {
          wechat: 'wx',
          bilibili: 'bl',
          douyin: 'tt',
          kuaishou: 'ks',
          alipay: 'my',
        }[platform];
        self[namespace] = fixture;
        self.exports = {};
        importScripts('/artifact/game.js');
        self.postMessage({
          kind: 'started',
          platform,
          namespace,
          noDom: true,
          noWxAlias: typeof wx === 'undefined',
          nativeWasmNamespaceAbsent:
            typeof TTWebAssembly === 'undefined' && typeof WXWebAssembly === 'undefined',
          portableTextDecoder: typeof TextDecoder === 'function',
        });
        exports.ready.then(
          (value) => {
            game = value;
            self.postMessage({ kind: 'ready', snapshot: game.snapshot(), io });
          },
          (e) => self.postMessage({ kind: 'error', message: e.stack || String(e) }),
        );
      } else if (data.kind === 'frame') {
        const pending = [...frames.entries()];
        frames.clear();
        for (const [, fn] of pending) fn(data.now);
        if (game) self.postMessage({ kind: 'snapshot', snapshot: game.snapshot(), io });
        else self.postMessage({ kind: 'frame-ack' });
      } else if (data.kind === 'tap') {
        const b = game.snapshot().buttons.find((b) => b.id === data.id && !b.disabled);
        if (!b) throw Error('button ' + data.id);
        const p = { identifier: 99, clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 };
        emit('TouchStart', { changedTouches: [p] });
        emit('TouchEnd', { changedTouches: [p] });
      } else if (data.kind === 'hide') {
        emit('Hide');
        self.postMessage({ kind: 'snapshot', snapshot: game.snapshot(), io });
      } else if (data.kind === 'show') {
        emit('Show', { scene: 'local-harness', query: {} });
      } else if (data.kind === 'dispose') {
        game.dispose();
        self.postMessage({ kind: 'disposed', listeners: [...listeners.keys()], storage, io });
      }
    } catch (error) {
      self.postMessage({ kind: 'error', message: error.stack || String(error) });
    }
  };
  self.postMessage({ kind: 'module-ready' });
}
const workerSource = `(${nativeWorkerFixture.toString()})();`;

const workerPath = join(evidence, 'actual-cjs-worker.js');
await writeFile(workerPath, workerSource);
try {
  for (const platform of selected) {
    const artifact = join(output, platform, 'travel-bund');
    const gameBytes = await readFile(artifact + '/game.js'),
      report = {
        runnerSha256,
        sourceCommit: JSON.parse(await readFile(join(artifact, 'artifact-manifest.json'), 'utf8'))
          .sourceCommit,
        platform,
        artifact: artifact + '/game.js',
        artifactSha256: createHash('sha256').update(gameBytes).digest('hex'),
        environment:
          'DedicatedWorker no DOM, genuine OffscreenCanvas WebGL2/Canvas2D, actual standard WebAssembly and real original models; LOCAL platform-specific FS/request/storage/events callbacks drive unmodified final CJS production resource bridge; image decoding is explicit local createImage fixture backed by real OffscreenCanvas and createImageBitmap. Not official developer tool/device/platform-native WASM namespace acceptance.',
        cjsLoader:
          'Exact artifact bytes used as body of static CommonJS module-scope function during HTTP delivery; no eval, rebuilding, or artifact mutation. Worker fixture is separate.',
        passed: false,
        errors: [],
      };
    const server = createServer(async (req, res) => {
      const name = new URL(req.url, 'http://localhost').pathname;
      try {
        if (name === '/') {
          res.setHeader('content-type', 'text/html');
          res.end('<link rel="icon" href="data:,"><canvas width="844" height="390"></canvas>');
          return;
        }
        const path =
          name === '/worker.js'
            ? workerPath
            : name.startsWith('/remote/')
              ? join(repo, 'assets/bund/runtime', name.slice(8))
              : join(artifact, name.replace(/^\/artifact\//, ''));
        res.setHeader(
          'content-type',
          name.endsWith('.js')
            ? 'text/javascript'
            : name.endsWith('.wasm')
              ? 'application/wasm'
              : 'application/octet-stream',
        );
        const bytes = await readFile(path);
        res.end(
          name === '/artifact/game.js'
            ? Buffer.concat([
                Buffer.from('(function(exports,module){\n'),
                bytes,
                Buffer.from('\n})(self.exports,{exports:self.exports});'),
              ])
            : bytes,
        );
      } catch (e) {
        res.writeHead(404).end(String(e));
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const browser = await chromium.launch({
      executablePath: executable,
      headless: true,
      args: ['--enable-unsafe-swiftshader'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate((platform) => {
        const canvas = document.querySelector('canvas'),
          offscreen = canvas.transferControlToOffscreen();
        window.worker = new Worker('/worker.js');
        window.nativeStatus = {};
        worker.onerror = (e) => (nativeStatus.error = e.message);
        worker.onmessage = ({ data }) => {
          if (data.kind === 'module-ready')
            worker.postMessage({ kind: 'init', canvas: offscreen, platform }, [offscreen]);
          else if (data.kind === 'error') nativeStatus.error = data.message;
          else if (data.kind === 'started') {
            nativeStatus.started = data;
            requestAnimationFrame(frame);
          } else if (data.kind === 'snapshot') {
            nativeStatus.snapshot = data.snapshot;
            nativeStatus.io = data.io;
            requestAnimationFrame(frame);
          } else if (data.kind === 'frame-ack') requestAnimationFrame(frame);
          else nativeStatus[data.kind] = data;
        };
        function frame(now) {
          worker.postMessage({ kind: 'frame', now });
        }
      }, platform);
      await page.waitForFunction(() => nativeStatus.error || nativeStatus.ready, null, {
        timeout: 180000,
      });
      let state = await page.evaluate(() => nativeStatus);
      assert.ok(!state.error, state.error);
      assert.ok(state.started.noDom);
      assert.equal(state.started.noWxAlias, platform !== 'wechat');
      report.started = state.started;
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'hunts' }));
      await page.waitForFunction(
        () =>
          nativeStatus.error ||
          (nativeStatus.snapshot?.page === 'hunts' && nativeStatus.io?.decodedImages?.length === 4),
        null,
        { timeout: 30000 },
      );
      assert.ok(!(await page.evaluate(() => nativeStatus.error)));
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'back' }));
      await page.waitForFunction(() => nativeStatus.snapshot.page === 'playing');
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'home' }));
      await page.waitForFunction(() => nativeStatus.snapshot.page === 'home');
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'start' }));
      await page.waitForFunction(
        () =>
          nativeStatus.error ||
          (nativeStatus.snapshot?.page === 'playing' && nativeStatus.snapshot.stats.triangles > 0),
        null,
        { timeout: 60000 },
      );
      state = await page.evaluate(() => nativeStatus);
      assert.ok(!state.error, state.error);
      await page.waitForFunction(
        () => nativeStatus.error || nativeStatus.snapshot?.stats.grounded,
        null,
        { timeout: 60000 },
      );
      assert.ok(!(await page.evaluate(() => nativeStatus.error)));
      await page.waitForTimeout(300);
      report.playing = await page.evaluate(() => nativeStatus.snapshot);
      assert.ok(report.playing.stats.grounded);
      report.io = await page.evaluate(() => nativeStatus.io);
      assert.ok(report.io.package.some((x) => x.path.endsWith('rapier.wasm')));
      assert.ok(report.io.remote.some((x) => x.url.includes('city_')));
      assert.ok(
        report.io.remote.every((x) =>
          platform === 'alipay'
            ? x.dataType === 'arraybuffer' && x.statusField === 'status'
            : x.responseType === 'arraybuffer' && x.statusField === 'statusCode',
        ),
      );
      if (platform === 'kuaishou')
        assert.ok(report.io.package.every((x) => x.api === 'readFileSync'));
      if (platform === 'alipay') assert.ok(report.io.package.every((x) => x.path.startsWith('/')));
      if (platform === 'bilibili') assert.equal(report.io.launchSuccess, 1);
      await page.screenshot({
        path: evidence + '/final-travel-' + platform + '-cjs-worker.png',
        timeout: 120000,
      });
      report.screenshotSha256 = createHash('sha256')
        .update(await readFile(evidence + '/final-travel-' + platform + '-cjs-worker.png'))
        .digest('hex');
      await page.evaluate(() => worker.postMessage({ kind: 'hide' }));
      await page.waitForFunction(() => nativeStatus.snapshot.page === 'pause');
      await page.evaluate(() => worker.postMessage({ kind: 'show' }));
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => nativeStatus.snapshot.page), 'pause');
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'resume' }));
      await page.waitForFunction(() => nativeStatus.snapshot.page === 'playing');
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'pause' }));
      await page.waitForFunction(() => nativeStatus.snapshot.page === 'pause');
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'settings' }));
      await page.waitForFunction(() => nativeStatus.snapshot.page === 'settings');
      await page.evaluate(() => worker.postMessage({ kind: 'tap', id: 'setting-motion' }));
      await page.evaluate(() => worker.postMessage({ kind: 'dispose' }));
      await page.waitForFunction(() => nativeStatus.disposed);
      assert.deepEqual(await page.evaluate(() => nativeStatus.disposed.listeners), []);
      report.disposed = await page.evaluate(() => nativeStatus.disposed);
      assert.ok(
        report.disposed.io.storage.some(
          (x) => x.method === 'set' && x.key === 'travel-bund.settings.v1',
        ),
      );
      if (platform === 'alipay')
        assert.ok(report.disposed.io.storage.every((x) => x.shape === 'object'));
      report.passed = true;
    } catch (e) {
      report.errors.push(e.stack);
      throw e;
    } finally {
      await writeFile(
        evidence + '/final-travel-' + platform + '-cjs-worker.json',
        JSON.stringify(report, null, 2),
      );
      await browser.close();
      await new Promise((r) => server.close(r));
    }
    console.log(
      JSON.stringify({
        passed: report.passed,
        artifactSha256: report.artifactSha256,
        triangles: report.playing?.stats.triangles,
        errors: report.errors,
      }),
    );
  }
} finally {
  await rm(workerPath, { force: true });
}
