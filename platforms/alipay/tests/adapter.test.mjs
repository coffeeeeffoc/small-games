import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAlipaySdk } from '../normalize.mjs';
import { alipayPlatform } from '../build.mjs';

function fixture() {
  const listeners = new Map();
  const calls = [];
  const storage = new Map();
  const sdk = {
    createCanvas() {
      assert.equal(this, sdk);
      return { getContext() {} };
    },
    getSystemInfoSync() {
      return { windowWidth: 390, windowHeight: 844, safeArea: { top: 40 } };
    },
    getStorageSync(options) {
      assert.equal(this, sdk);
      calls.push(options);
      return { data: storage.get(options.key) };
    },
    setStorageSync(options) {
      calls.push(options);
      storage.set(options.key, options.data);
      return {};
    },
    removeStorageSync(options) {
      calls.push(options);
      storage.delete(options.key);
    },
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show']) {
    sdk[`on${name}`] = function (listener) {
      assert.equal(this, sdk);
      listeners.set(name, listener);
    };
    sdk[`off${name}`] = function (listener) {
      assert.equal(listeners.get(name), listener);
      listeners.delete(name);
    };
  }
  return { sdk, listeners, calls };
}

test('Alipay object storage signatures round-trip the existing save string', () => {
  const { sdk, calls } = fixture();
  const native = normalizeAlipaySdk(sdk);
  assert.equal(native.getStorageSync('absent'), undefined);
  native.setStorageSync('save', '{"version":1}');
  assert.equal(native.getStorageSync('save'), '{"version":1}');
  native.removeStorageSync('save');
  assert.deepEqual(calls, [
    { key: 'absent' },
    { key: 'save', data: '{"version":1}' },
    { key: 'save' },
    { key: 'save' },
  ]);
});

test('returned or thrown storage errors never become a fake successful save', () => {
  const { sdk } = fixture();
  for (const method of ['getStorageSync', 'setStorageSync', 'removeStorageSync']) {
    sdk[method] = () => ({ error: 12 });
    assert.throws(() => normalizeAlipaySdk(sdk)[method]('save', 'value'), /storage failed/);
    sdk[method] = () => {
      throw new Error('denied');
    };
    assert.throws(() => normalizeAlipaySdk(sdk)[method]('save', 'value'), /denied/);
  }
});

test('native touch subscriptions preserve multi-touch, cancel and exact removal identity', () => {
  const { sdk, listeners } = fixture();
  const native = normalizeAlipaySdk(sdk);
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel']) {
    const event = {
      changedTouches: [
        { clientX: 10, clientY: 20, identifier: 1 },
        { clientX: 30, clientY: 40, identifier: 2 },
      ],
    };
    let received;
    const listener = (value) => {
      received = value;
    };
    native[`on${name}`](listener);
    listeners.get(name)(event);
    assert.equal(received, event);
    native[`off${name}`](listener);
    assert.equal(listeners.has(name), false);
  }
});

test('background and foreground subscriptions are removable and retain launch options', () => {
  const { sdk, listeners } = fixture();
  const native = normalizeAlipaySdk(sdk);
  let hidden = 0;
  let scene;
  const hide = () => {
    hidden++;
  };
  const show = (options) => {
    scene = options.scene;
  };
  native.onHide(hide);
  native.onShow(show);
  listeners.get('Hide')();
  listeners.get('Show')({ scene: 'test' });
  assert.equal(hidden, 1);
  assert.equal(scene, 'test');
  native.offHide(hide);
  native.offShow(show);
  assert.equal(listeners.size, 0);
});

test('missing native capabilities fail without DOM or wx substitution', () => {
  assert.throws(() => normalizeAlipaySdk(undefined), /native mini-game/);
  const { sdk } = fixture();
  sdk.createCanvas = () => null;
  assert.throws(() => normalizeAlipaySdk(sdk).createCanvas(), /native Canvas/);
  delete sdk.offTouchCancel;
  assert.throws(() => normalizeAlipaySdk(sdk), /offTouchCancel/);
});

test('optional capabilities remain unavailable; unsuccessful host exit reports failure', () => {
  const { sdk } = fixture();
  const native = normalizeAlipaySdk(sdk);
  assert.equal(native.createRewardedVideoAd, undefined);
  assert.equal(native.shareAppMessage, undefined);
  assert.equal(native.login, undefined);
  let success = 0;
  let failure = 0;
  native.exitMiniProgram({
    success() {
      success++;
    },
    fail() {
      failure++;
    },
  });
  assert.equal(success, 0);
  assert.equal(failure, 1);
  assert.deepEqual(native.getSystemInfoSync().safeArea, { top: 40 });
});

test('Alipay descriptor uses native game configuration and never invents preview IDs', () => {
  const preview = alipayPlatform.files({ game: 'test', appId: '' });
  assert.equal(alipayPlatform.sdk, 'my');
  assert.equal(preview['game.json'].deviceOrientation, 'portrait');
  assert.equal(preview['alipay-preview.json'].preview, true);
  assert.equal(preview['alipay-preview.json'].appId, null);
  const configured = alipayPlatform.files({
    game: 'test',
    appId: '2026000000000000',
    orientation: 'landscape',
  });
  assert.equal(configured['game.json'].deviceOrientation, 'landscape');
  assert.equal(configured['alipay-preview.json'].preview, false);
  assert.equal(alipayPlatform.appId.test('touristappid'), false);
  const textbook = alipayPlatform.files({ game: 'letters-words2', appId: '' });
  assert.equal(textbook['mini.project.json'].format, 2);
  assert.deepEqual(textbook['mini.project.json'].assetsInclude, [
    'competition-action.wav',
    'assets/english-dict/**/*.json',
  ]);
  assert.deepEqual(
    alipayPlatform.files({ game: 'wulong-city', appId: '' })['mini.project.json'].assetsInclude,
    ['assets/audio/*.wav'],
  );
});

test('native file manager preserves receiver, utf8 data and read errors for the textbook loader', async () => {
  const { sdk } = fixture();
  const catalog = { books: [], publishers: [] };
  let denied = false;
  const manager = {
    readFile(options) {
      assert.equal(this, manager);
      assert.equal(options.filePath, '/assets/english-dict/catalog.json');
      assert.equal(options.encoding, 'utf8');
      if (denied) options.fail(new Error('denied'));
      else options.success({ data: JSON.stringify(catalog) });
    },
  };
  sdk.getFileSystemManager = function () {
    assert.equal(this, sdk);
    return manager;
  };
  const native = normalizeAlipaySdk(sdk);
  assert.equal(typeof native.getFileSystemManager().readFile, 'function');
  const read = () =>
    new Promise((resolve, reject) =>
      native.getFileSystemManager().readFile({
        filePath: 'assets/english-dict/catalog.json',
        encoding: 'utf8',
        success: (result) => resolve(JSON.parse(result.data)),
        fail: reject,
      }),
    );
  assert.deepEqual(await read(), catalog);
  denied = true;
  await assert.rejects(read(), /denied/);
  delete sdk.getFileSystemManager;
  assert.equal(normalizeAlipaySdk(sdk).getFileSystemManager, undefined);
});

test('file adapter roots code-package paths and preserves local file protocols', () => {
  const { sdk } = fixture();
  const paths = [];
  const manager = {
    readFile(options) {
      assert.equal(this, manager);
      paths.push(options.filePath);
      options.fail('unreadable');
    },
  };
  sdk.getFileSystemManager = () => manager;
  const fs = normalizeAlipaySdk(sdk).getFileSystemManager();
  const sourcePaths = [
    './assets/book.json',
    '/assets/book.json',
    'https://resource/tmp.json',
    'https://usr/data.json',
  ];
  let errors = 0;
  for (const filePath of sourcePaths)
    fs.readFile({
      filePath,
      encoding: 'utf8',
      fail() {
        errors++;
      },
    });
  assert.deepEqual(paths, [
    '/assets/book.json',
    '/assets/book.json',
    'https://resource/tmp.json',
    'https://usr/data.json',
  ]);
  assert.equal(errors, 4);
});

test('keyboard forwards multiline options, input/confirm/complete values and exact cleanup', () => {
  const { sdk, listeners } = fixture();
  let options;
  let hidden = false;
  sdk.showKeyboard = function (value) {
    assert.equal(this, sdk);
    options = value;
    value.success();
  };
  sdk.hideKeyboard = function (value) {
    assert.equal(this, sdk);
    hidden = true;
    value.success();
  };
  for (const name of ['KeyboardInput', 'KeyboardConfirm', 'KeyboardComplete']) {
    sdk[`on${name}`] = function (listener) {
      assert.equal(this, sdk);
      listeners.set(name, listener);
    };
    sdk[`off${name}`] = function (listener) {
      assert.equal(this, sdk);
      assert.equal(listeners.get(name), listener);
      listeners.delete(name);
    };
  }
  const native = normalizeAlipaySdk(sdk);
  let opened = false;
  const inputOptions = {
    defaultValue: 'apple 苹果\nbook 书',
    maxLength: 5000,
    multiple: true,
    confirmHold: false,
    confirmType: 'done',
    success() {
      opened = true;
    },
  };
  native.showKeyboard(inputOptions);
  assert.equal(options, inputOptions);
  assert.equal(opened, true);
  for (const name of ['KeyboardInput', 'KeyboardConfirm', 'KeyboardComplete']) {
    const event = { value: 'apple 苹果\nbook 书' };
    let received;
    const listener = (value) => {
      received = value;
    };
    native[`on${name}`](listener);
    listeners.get(name)(event);
    assert.equal(received, event);
    native[`off${name}`](listener);
    assert.equal(listeners.has(name), false);
  }
  native.hideKeyboard({ success() {} });
  assert.equal(hidden, true);
  delete sdk.offKeyboardConfirm;
  assert.equal(normalizeAlipaySdk(sdk).onKeyboardConfirm, undefined);
  assert.equal(normalizeAlipaySdk(sdk).offKeyboardConfirm, undefined);
});
