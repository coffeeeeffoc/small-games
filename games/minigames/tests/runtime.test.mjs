import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanvasRuntime,
  createSdkOverlay,
  mapAssetPath,
  normalizeViewport,
} from '../shared/runtime.js';
import { createBrowserSdk } from '../shared/browser-sdk.js';

function fixture(extra = {}) {
  const calls = [],
    images = [];
  const context = {
    fillRect(...args) {
      assert.equal(this, context);
      calls.push(['fill', ...args]);
    },
    drawImage(image) {
      assert.equal(this, context);
      assert.ok(images.includes(image));
      calls.push(['image', image]);
    },
    measureText() {
      assert.equal(this, context);
      return { width: 40 };
    },
    setTransform() {},
  };
  const source = {
    width: 390,
    height: 844,
    getContext(kind) {
      assert.equal(this, source);
      return kind === '2d' ? context : null;
    },
  };
  const host = {
    value: 42,
    createCanvas() {
      assert.equal(this, host);
      return source;
    },
    getSystemInfoSync() {
      assert.equal(this, host);
      return {
        windowWidth: 390,
        windowHeight: 844,
        pixelRatio: 3,
        safeArea: { top: 20, bottom: 824 },
      };
    },
    createImage() {
      assert.equal(this, host);
      const image = { src: '', onload: null, width: 5 };
      images.push(image);
      return image;
    },
    getStorageSync() {
      assert.equal(this, host);
      return this.value;
    },
    onTouchStart() {
      throw new Error('Raw SDK input must not be subscribed');
    },
  };
  const runtime = createCanvasRuntime({ sdk: host, debug: true, start: () => ({}), ...extra });
  return { runtime, host, source, context, images, calls };
}

test('SDK overlays preserve receivers and enumerable overrides across controller restart spreads', () => {
  const host = {
    value: 5,
    get() {
      return this.value;
    },
  };
  const sdk = createSdkOverlay(host, {
    createCanvas: () => 'surface',
    onTouchEnd: () => 'listener',
  });
  const restarted = { ...sdk };
  assert.equal(restarted.get(), 5);
  assert.equal(restarted.createCanvas(), 'surface');
  assert.equal(restarted.onTouchEnd(), 'listener');
  host.get = function () {
    return this.value + 1;
  };
  assert.equal(sdk.get(), 6);
});

test('real source canvas is separate, static scenes do not upload, realtime uploads are capped', () => {
  const f = fixture({ maxUploadsPerSecond: 30 });
  assert.notEqual(f.runtime.canvas, f.source);
  assert.equal(f.runtime.sourceCanvas, f.source);
  assert.equal(f.runtime.sdk.createCanvas(), f.runtime.canvas);
  const ctx = f.runtime.canvas.getContext('2d');
  assert.equal(ctx.canvas, f.runtime.canvas);
  const upload = (source) => assert.equal(source, f.source);
  assert.equal(f.runtime.uploadFrame(0, upload), true);
  ctx.measureText('a');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  assert.equal(f.runtime.uploadFrame(100, upload), false);
  ctx.fillRect(0, 0, 10, 10);
  assert.equal(f.runtime.uploadFrame(101, upload), true);
  ctx.fillRect(0, 0, 20, 20);
  assert.equal(f.runtime.uploadFrame(102, upload), false);
  assert.equal(f.runtime.uploadFrame(135, upload), true);
  f.runtime.canvas.width = 400;
  assert.equal(f.source.width, 400);
  assert.equal(f.runtime.uploadFrame(170, upload), true);
  f.runtime.stop();
});

test('full touch lists, identity, cancel, hide/show, and resize are owned by the bridge', () => {
  let sdk,
    stopped = 0;
  const events = [];
  const f = fixture({
    start(value) {
      sdk = value;
      for (const name of [
        'TouchStart',
        'TouchMove',
        'TouchEnd',
        'TouchCancel',
        'Hide',
        'Show',
        'WindowResize',
      ])
        sdk[`on${name}`]((event) => events.push([name, event]));
      return {
        stop() {
          stopped++;
        },
      };
    },
  });
  f.runtime.dispatchTouch('start', [{ identifier: 1, x: 10, y: 20 }]);
  f.runtime.dispatchTouch('start', [{ identifier: 2, x: 30, y: 40 }]);
  assert.equal(events[1][1].touches.length, 2);
  f.runtime.dispatchTouch('move', [{ identifier: 1, x: 15, y: 25 }]);
  assert.deepEqual(events[2][1].changedTouches[0], {
    identifier: 1,
    x: 15,
    y: 25,
    clientX: 15,
    clientY: 25,
    pageX: 15,
    pageY: 25,
  });
  f.runtime.dispatchTouch('end', [{ identifier: 2, x: 30, y: 40 }]);
  assert.deepEqual(
    events[3][1].touches.map((t) => t.identifier),
    [1],
  );
  f.runtime.hide();
  f.runtime.hide();
  assert.deepEqual(
    events.slice(-2).map(([name]) => name),
    ['TouchCancel', 'Hide'],
  );
  assert.equal(events.at(-2)[1].touches.length, 0);
  const count = events.length;
  f.runtime.dispatchTouch('start', [{ identifier: 3, x: 1, y: 1 }]);
  assert.equal(events.length, count);
  f.runtime.show();
  f.runtime.show();
  assert.equal(events.at(-1)[0], 'Show');
  f.runtime.dispatchTouch('start', [{ identifier: 4, x: 1, y: 1 }]);
  f.runtime.resize();
  assert.deepEqual(
    events.slice(-2).map(([name]) => name),
    ['TouchCancel', 'WindowResize'],
  );
  f.runtime.stop();
  f.runtime.stop();
  assert.equal(stopped, 1);
  assert.equal(
    f.runtime.uploadFrame(1000, () => assert.fail()),
    false,
  );
  assert.equal(f.runtime.getDebugState().activeTouches.length, 0);
});

test('image paths are mapped, native drawImage receives raw Image, and onload survives', () => {
  const f = fixture({ assetRoot: 'game-assets' });
  const image = f.runtime.sdk.createImage();
  let loaded = 0;
  image.onload = function (event) {
    assert.equal(this, image);
    assert.equal(event.type, 'load');
    loaded++;
  };
  image.src = './home-city.png';
  assert.equal(f.images[0].src, 'game-assets/home-city.png');
  f.runtime.uploadFrame(0, () => {});
  f.images[0].onload({ type: 'load' });
  assert.equal(loaded, 1);
  assert.equal(f.runtime.getDebugState().dirty, true);
  f.runtime.canvas.getContext('2d').drawImage(image, 0, 0);
  assert.equal(f.calls.at(-1)[1], f.images[0]);
  f.runtime.stop();
  assert.equal(f.images[0].onload, null);
  for (const url of [
    'https://example.com/a.png',
    'data:image/png;base64,aaa',
    'wxfile://a',
    '/game.png',
    '//cdn.example.com/a',
  ])
    assert.equal(mapAssetPath(url, 'assets'), url);
});

test('DPR and high resolution viewports respect the shared pixel budget', () => {
  const viewport = normalizeViewport({ windowWidth: 390, windowHeight: 844, pixelRatio: 4 });
  assert.equal(viewport.pixelRatio, 1.5);
  const large = normalizeViewport({
    windowWidth: 8000,
    windowHeight: 4000,
    pixelRatio: 4,
    safeArea: { top: 40, bottom: 3960 },
  });
  assert.ok(large.windowWidth * large.windowHeight * large.pixelRatio ** 2 <= 2_000_000.001);
  assert.ok(large.safeArea.top < 40);
  assert.throws(() => normalizeViewport({ windowWidth: 0, windowHeight: 1 }), /viewport/);
});

test('failed uploads remain dirty, dispose is honored, debug is opt-in', () => {
  let disposed = false;
  const f = fixture({
    debug: false,
    start: () => ({
      dispose() {
        disposed = true;
      },
    }),
  });
  assert.equal(f.runtime.getDebugState, undefined);
  assert.throws(
    () =>
      f.runtime.uploadFrame(0, () => {
        throw new Error('GPU unavailable');
      }),
    /GPU/,
  );
  assert.equal(
    f.runtime.uploadFrame(1, () => {}),
    true,
  );
  f.runtime.stop();
  assert.equal(disposed, true);
});

test('browser preview storage is isolated from existing H5 storage', () => {
  const storage = new Map([['save', 'h5']]);
  const sdk = createBrowserSdk({
    game: 'cops-robbers',
    window: {
      document: {},
      localStorage: {
        getItem: (k) => storage.get(k),
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
      },
    },
  });
  sdk.setStorageSync('save', 'cocos');
  assert.equal(sdk.getStorageSync('save'), 'cocos');
  assert.equal(storage.get('save'), 'h5');
  sdk.removeStorageSync('save');
  assert.equal(storage.get('save'), 'h5');
});

test('show resynchronizes viewport before forwarding the real invitation payload', () => {
  let size = { windowWidth: 390, windowHeight: 844, pixelRatio: 1 };
  const events = [];
  const f = fixture({
    getViewport: () => size,
    start: (sdk) => {
      sdk.onWindowResize(() => events.push(['resize', sdk.getSystemInfoSync().windowWidth]));
      sdk.onShow((payload) => events.push(['show', payload]));
      return {};
    },
  });
  f.runtime.hide();
  size = { windowWidth: 844, windowHeight: 390, pixelRatio: 2 };
  const payload = { query: { game: 'xiangqi-five', matchId: 'ABCDEF012345' } };
  f.runtime.show(payload);
  assert.deepEqual(events, [
    ['resize', 844],
    ['show', payload],
  ]);
  assert.equal(f.runtime.getViewport().pixelRatio, 1.5);
  f.runtime.stop();
});
