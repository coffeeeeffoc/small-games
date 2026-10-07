/* global self, OffscreenCanvas, createImageBitmap, importScripts, document, window, Worker, worker, nativeStatus, requestAnimationFrame */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// This local fixture supplies tap callbacks; Chromium executes genuine WebGL2,
// original model decoding and Rapier WASM. It is not a TapTap tool/device test.
function travelWorker() {
  const hostFetch = self.fetch.bind(self);
  const HostURL = self.URL;
  const HostDecoder = self.TextDecoder;
  const hostWasm = self.WebAssembly;
  const listeners = new Map(),
    frames = new Map(),
    storage = {};
  const io = { package: [], remote: [], storage: [], images: [], decodedImages: [], wasm: [] };
  let game,
    canvas,
    serial = 0,
    firstCanvas = true;
  const emit = (name, event) => {
    for (const fn of [...(listeners.get(name) || [])]) fn(event);
  };
  const snapshot = () => self.postMessage({ kind: 'snapshot', snapshot: game.snapshot(), io });
  const touch = (name, id, x, y) =>
    emit(name, { changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
  self.addEventListener('error', (event) =>
    self.postMessage({ kind: 'error', message: event.message }),
  );
  self.addEventListener('unhandledrejection', (event) =>
    self.postMessage({ kind: 'error', message: event.reason?.stack || String(event.reason) }),
  );
  self.onmessage = async ({ data }) => {
    try {
      if (data.kind === 'init') {
        if (typeof window !== 'undefined' || typeof document !== 'undefined')
          throw Error('Unexpected DOM in TapTap game worker');
        canvas = data.canvas;
        canvas.requestAnimationFrame = (fn) => {
          frames.set(++serial, fn);
          return serial;
        };
        canvas.cancelAnimationFrame = (id) => frames.delete(id);
        // Enforce the documented TapTap package-path instantiate signature;
        // real standard WASM compiles these exact local package bytes afterward.
        const wasm = Object.create(hostWasm);
        wasm.instantiate = async (packagePath, imports) => {
          if (typeof packagePath !== 'string' || !/\.wasm(?:\.br)?$/.test(packagePath))
            throw Error('TapTap WebAssembly.instantiate requires a package WASM path');
          io.wasm.push({ path: packagePath, api: 'WebAssembly.instantiate(path, imports)' });
          const response = await hostFetch('/artifact/' + packagePath.replace(/^\//, ''));
          if (!response.ok) throw Error('Packaged WASM missing: ' + packagePath);
          return hostWasm.instantiate(await response.arrayBuffer(), imports);
        };
        self.WebAssembly = wasm;
        self.GameGlobal = self;
        self.fetch = undefined;
        self.TextDecoder = undefined;
        const tap = {
          createCanvas: () =>
            firstCanvas ? ((firstCanvas = false), canvas) : new OffscreenCanvas(1, 1),
          getWindowInfo() {
            if (this !== tap) throw Error('TapTap native window method lost its SDK receiver');
            return {
              windowWidth: 844,
              windowHeight: 390,
              pixelRatio: 1,
              safeArea: { left: 0, top: 12, right: 844, bottom: 378 },
            };
          },
          getLaunchOptionsSync: () => ({ query: {} }),
          getStorageSync(key) {
            if (typeof key !== 'string') throw Error('TapTap storage needs a string key');
            io.storage.push({ method: 'get', key });
            return storage[key] || '';
          },
          setStorageSync(key, value) {
            if (typeof key !== 'string') throw Error('TapTap storage needs a string key');
            io.storage.push({ method: 'set', key });
            storage[key] = value;
          },
          removeStorageSync: (key) => delete storage[key],
          createImage() {
            const image = new OffscreenCanvas(1, 1);
            Object.defineProperty(image, 'src', {
              set(packagePath) {
                io.images.push(packagePath);
                hostFetch('/artifact/' + packagePath.replace(/^\//, ''))
                  .then((response) => {
                    if (!response.ok) throw Error('Missing packaged image: ' + packagePath);
                    return response.blob();
                  })
                  .then(createImageBitmap)
                  .then((bitmap) => {
                    image.width = bitmap.width;
                    image.height = bitmap.height;
                    image.getContext('2d').drawImage(bitmap, 0, 0);
                    io.decodedImages.push({
                      path: packagePath,
                      width: bitmap.width,
                      height: bitmap.height,
                    });
                    bitmap.close();
                    image.onload?.();
                  })
                  .catch((error) => image.onerror?.(error));
              },
            });
            return image;
          },
          getFileSystemManager: () => ({
            readFile(options) {
              io.package.push({ path: options.filePath, encoding: options.encoding });
              hostFetch('/artifact/' + options.filePath.replace(/^\//, ''))
                .then(async (response) => {
                  if (!response.ok) throw Error('Missing package file: ' + options.filePath);
                  const bytes = await response.arrayBuffer();
                  options.success({
                    data: options.encoding === 'utf8' ? new HostDecoder().decode(bytes) : bytes,
                  });
                })
                .catch((error) => options.fail({ errMsg: error.message }));
            },
          }),
          request(options) {
            if (!['arraybuffer', 'text'].includes(options.responseType))
              throw Error('TapTap resource request must set responseType');
            io.remote.push({ url: options.url, responseType: options.responseType });
            const relative = new HostURL(options.url).pathname.replace(
              /^.*\/games\/travel-bund\//,
              '',
            );
            const controller = new AbortController();
            hostFetch('/remote/' + relative, { signal: controller.signal })
              .then(async (response) => {
                const bytes =
                  options.responseType === 'arraybuffer'
                    ? await response.arrayBuffer()
                    : await response.text();
                options.success({ statusCode: response.status, data: bytes });
              })
              .catch((error) => options.fail({ errMsg: error.message }));
            return { abort: () => controller.abort() };
          },
        };
        for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show']) {
          tap['on' + name] = (fn) => {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
          };
          tap['off' + name] = (fn) => {
            listeners.get(name)?.delete(fn);
            if (!listeners.get(name)?.size) listeners.delete(name);
          };
        }
        self.tap = tap;
        self.exports = {};
        self.__tapTapModules = Object.create(null);
        self.require = (request) => {
          if (request !== './tap-login.js' || !Object.hasOwn(self.__tapTapModules, request))
            throw Error('Unknown or missing packaged TapTap CommonJS companion: ' + request);
          return self.__tapTapModules[request];
        };
        importScripts('/artifact/tap-login.js');
        importScripts('/artifact/game.js');
        if (
          self.__tapTapLogin?.status !== 'unconfigured' ||
          (await self.__tapTapLogin.ready) !== null
        )
          throw Error('Actual TapTap preview login bootstrap must remain unconfigured');
        self.postMessage({
          kind: 'started',
          noDom: typeof document === 'undefined' && typeof window === 'undefined',
          noOtherSdk: ['wx', 'bl', 'tt', 'ks', 'my'].every(
            (key) => typeof self[key] === 'undefined',
          ),
          noGlobalFetch: typeof fetch === 'undefined',
          portableTextDecoder: typeof TextDecoder === 'function',
          actualLoginCompanion: Object.hasOwn(self.__tapTapModules, './tap-login.js'),
          loginStatus: self.__tapTapLogin.status,
        });
        exports.ready.then(
          (value) => {
            game = value;
            self.postMessage({ kind: 'ready', snapshot: game.snapshot(), io });
          },
          (error) => self.postMessage({ kind: 'error', message: error.stack || String(error) }),
        );
      } else if (data.kind === 'frame') {
        const pending = [...frames.entries()];
        frames.clear();
        for (const [, fn] of pending) fn(data.now);
        if (game) snapshot();
        else self.postMessage({ kind: 'frame-ack' });
      } else if (data.kind === 'tap') {
        const button = game
          .snapshot()
          .buttons.find((item) => item.id === data.id && !item.disabled);
        if (!button) throw Error('Missing actual TapTap game control: ' + data.id);
        touch('TouchStart', 99, button.x + button.w / 2, button.y + button.h / 2);
        touch('TouchEnd', 99, button.x + button.w / 2, button.y + button.h / 2);
      } else if (data.kind === 'walk') {
        const button = game.snapshot().buttons.find((item) => item.id === 'joystick');
        touch('TouchStart', 1, button.x + button.w / 2, button.y + button.h / 2);
        touch('TouchMove', 1, button.x + button.w / 2 + 40, button.y + button.h / 2);
      } else if (data.kind === 'cancel-walk') {
        const button = game.snapshot().buttons.find((item) => item.id === 'joystick');
        touch('TouchCancel', 1, button.x + button.w / 2, button.y + button.h / 2);
        snapshot();
      } else if (data.kind === 'hide') {
        emit('Hide');
        snapshot();
      } else if (data.kind === 'show') {
        emit('Show', { query: {} });
        snapshot();
      } else if (data.kind === 'dispose') {
        game.dispose();
        game = null;
        self.postMessage({
          kind: 'disposed',
          listeners: [...listeners.keys()],
          frames: frames.size,
          storage,
          io,
        });
      }
    } catch (error) {
      self.postMessage({ kind: 'error', message: error.stack || String(error) });
    }
  };
  self.postMessage({ kind: 'module-ready' });
}

export async function smokeTapTapTravel(artifact, evidence) {
  const executable = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(
    executable,
    'Travel TapTap smoke requires a real CHROMIUM_PATH/PLAYWRIGHT_EXECUTABLE_PATH',
  );
  const require = createRequire(path.join(repo, 'games/local/travel-bund/package.json'));
  const { chromium } = require('@playwright/test');
  await mkdir(evidence, { recursive: true });
  const artifactBytes = await readFile(path.join(artifact, 'game.js'));
  const workerSource = `(${travelWorker.toString()})();`;
  const report = {
    platform: 'taptap',
    game: 'travel-bund',
    passed: false,
    sourceCommit: JSON.parse(await readFile(path.join(artifact, 'artifact-manifest.json'), 'utf8'))
      .sourceCommit,
    artifactSha256: hash(artifactBytes),
    runnerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    environment:
      'Local tap SDK callbacks in a Chromium DedicatedWorker without DOM or global fetch; genuine OffscreenCanvas WebGL2, original city models, image decoding and actual Rapier WASM. TapTap WebAssembly path signature is checked before local standard WASM compiles the exact packaged file. Official TapTap tool and device acceptance are unrun.',
    officialToolsVerified: false,
    deviceVerified: false,
    errors: [],
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') {
        res.setHeader('content-type', 'text/html');
        res.end('<link rel="icon" href="data:,"><canvas width="844" height="390"></canvas>');
      } else if (pathname === '/worker.js') {
        res.setHeader('content-type', 'text/javascript');
        res.end(workerSource);
      } else {
        const remote = pathname.startsWith('/remote/');
        assert(remote || pathname.startsWith('/artifact/'), 'Unknown resource request');
        const directory = remote ? path.join(repo, 'assets/bund/runtime') : artifact;
        const relative = pathname.slice(remote ? 8 : 10);
        const filename = path.resolve(directory, relative);
        assert(
          filename.startsWith(directory + path.sep),
          'Request stays within resource directory',
        );
        res.setHeader(
          'content-type',
          /\.js$/.test(pathname) ? 'text/javascript' : 'application/octet-stream',
        );
        const bytes = await readFile(filename);
        res.end(
          pathname === '/artifact/game.js'
            ? Buffer.concat([
                Buffer.from('(function(exports,module,require){\n'),
                bytes,
                Buffer.from('\n})(self.exports,{exports:self.exports},self.require);'),
              ])
            : pathname === '/artifact/tap-login.js'
              ? Buffer.concat([
                  Buffer.from(
                    '(function(){const module={exports:{}};(function(exports,module,require){\n',
                  ),
                  bytes,
                  Buffer.from(
                    '\n})(module.exports,module,self.require);self.__tapTapModules["./tap-login.js"]=module.exports;})();',
                  ),
                ])
              : bytes,
        );
      }
    } catch (error) {
      res.writeHead(404).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: executable,
      headless: true,
      args: ['--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      const offscreen = document.querySelector('canvas').transferControlToOffscreen();
      window.worker = new Worker('/worker.js');
      window.nativeStatus = {};
      worker.onerror = (event) => {
        nativeStatus.error = event.message;
      };
      worker.onmessage = ({ data }) => {
        if (data.kind === 'module-ready')
          worker.postMessage({ kind: 'init', canvas: offscreen }, [offscreen]);
        else if (data.kind === 'error') nativeStatus.error = data.message;
        else if (data.kind === 'snapshot') {
          nativeStatus.snapshot = data.snapshot;
          nativeStatus.io = data.io;
          requestAnimationFrame(frame);
        } else if (data.kind === 'frame-ack') requestAnimationFrame(frame);
        else {
          nativeStatus[data.kind] = data;
          if (data.kind === 'started') requestAnimationFrame(frame);
        }
      };
      function frame(now) {
        worker.postMessage({ kind: 'frame', now });
      }
    });
    const wait = async (predicate, argument, timeout = 60000) => {
      await page.waitForFunction(predicate, argument, { timeout });
      const error = await page.evaluate(() => nativeStatus.error);
      assert(!error, error);
    };
    const send = (kind, id) =>
      page.evaluate((message) => worker.postMessage(message), { kind, id });
    await wait(() => nativeStatus.error || nativeStatus.ready, null, 180000);
    const started = await page.evaluate(() => nativeStatus.started);
    assert(
      started.noDom &&
        started.noOtherSdk &&
        started.noGlobalFetch &&
        started.portableTextDecoder &&
        started.actualLoginCompanion,
    );
    assert.equal(started.loginStatus, 'unconfigured');
    report.started = started;
    await send('tap', 'hunts');
    await wait(
      () =>
        nativeStatus.error ||
        (nativeStatus.snapshot?.page === 'hunts' && nativeStatus.io?.decodedImages.length === 4),
    );
    await send('tap', 'back');
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.page === 'playing');
    await send('tap', 'home');
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.page === 'home');
    await send('tap', 'start');
    await wait(
      () =>
        nativeStatus.error ||
        (nativeStatus.snapshot?.page === 'playing' && nativeStatus.snapshot.stats.triangles > 0),
    );
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.stats.grounded);
    const before = await page.evaluate(() => nativeStatus.snapshot.stats.position);
    await send('walk');
    await wait((position) => {
      const current = nativeStatus.snapshot?.stats.position;
      return (
        nativeStatus.error ||
        (current && Math.hypot(position[0] - current[0], position[2] - current[2]) > 1)
      );
    }, before);
    await send('cancel-walk');
    await wait(
      () =>
        nativeStatus.error ||
        (nativeStatus.snapshot?.inputs.stick.every((value) => value === 0) &&
          nativeStatus.snapshot.inputs.touches === 0),
    );
    report.playing = await page.evaluate(() => nativeStatus.snapshot);
    report.io = await page.evaluate(() => nativeStatus.io);
    assert(report.io.wasm.some(({ path: packagePath }) => packagePath.endsWith('rapier.wasm')));
    assert(report.io.package.some((file) => file.path.endsWith('native-assets-manifest.json')));
    assert(report.io.remote.some(({ url }) => url.endsWith('world/world.json')));
    assert(report.io.remote.some(({ url }) => url.includes('city_')));
    assert(report.io.remote.every((request) => request.responseType === 'arraybuffer'));
    const screenshot = path.join(evidence, 'travel-bund-runtime.png');
    await page.screenshot({ path: screenshot, timeout: 120000 });
    report.screenshotSha256 = hash(await readFile(screenshot));
    await send('hide');
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.page === 'pause');
    await send('show');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => nativeStatus.snapshot.page), 'pause');
    await send('tap', 'resume');
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.page === 'playing');
    await send('tap', 'pause');
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.page === 'pause');
    await send('tap', 'settings');
    await wait(() => nativeStatus.error || nativeStatus.snapshot?.page === 'settings');
    await send('tap', 'setting-motion');
    await send('dispose');
    await wait(() => nativeStatus.error || nativeStatus.disposed);
    report.disposed = await page.evaluate(() => nativeStatus.disposed);
    assert.deepEqual(report.disposed.listeners, []);
    assert.equal(report.disposed.frames, 0);
    assert(
      report.disposed.io.storage.some(
        ({ method, key }) => method === 'set' && key === 'travel-bund.settings.v1',
      ),
    );
    report.passed = true;
    return {
      status: 'local-worker-webgl-wasm-smoke-passed',
      officialToolsVerified: false,
      deviceVerified: false,
    };
  } catch (error) {
    report.errors.push(error.stack || String(error));
    throw error;
  } finally {
    await writeFile(
      path.join(evidence, 'travel-bund-runtime.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
