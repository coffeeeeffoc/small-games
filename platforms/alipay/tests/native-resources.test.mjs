import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAlipaySdk } from '../normalize.mjs';
import { attachNativeResources } from '../native-resources.mjs';

// Real valid WebAssembly module exporting answer() = 42, executed by Node's engine.
const bytes = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 10, 1, 6, 97, 110, 115, 119,
  101, 114, 0, 0, 10, 6, 1, 4, 0, 65, 42, 11,
]).buffer;
const channel = 'alipay';
function fixture(data = bytes) {
  const calls = [];
  const manager = {
    readFile(options) {
      assert.equal(this, manager);
      calls.push(options);
      options.success({ data });
    },
    readFileSync(filePath, encoding) {
      assert.equal(this, manager);
      calls.push({ filePath, encoding });
      return data;
    },
  };
  const sdk = {
    marker: 42,
    getFileSystemManager() {
      assert.equal(this, sdk);
      return manager;
    },
    createCanvas() {
      assert.equal(this, sdk);
      return this.marker;
    },
  };
  return { sdk, manager, calls, bridge: attachNativeResources(sdk) };
}
test('receiver, binary package path, UTF8 and spread preserve capabilities', async () => {
  const f = fixture();
  assert.equal(f.bridge.createCanvas(), 42);
  assert.equal(f.bridge.createCanvas, f.bridge.createCanvas);
  assert.equal({ ...f.bridge }.createCanvas(), 42);
  assert.equal(await f.bridge.readFile('rapier/rapier.wasm'), bytes);
  assert.equal(
    f.calls[0].filePath,
    channel === 'alipay' ? '/rapier/rapier.wasm' : 'rapier/rapier.wasm',
  );
  assert.equal(f.calls[0].encoding, undefined);
  const utf = fixture('hello');
  assert.equal(await utf.bridge.readFile('world.json', 'utf8'), 'hello');
  assert.equal(utf.calls[0].encoding, 'utf8');
});
test('invalid paths, type mismatches and missing FS fail', async () => {
  const f = fixture();
  for (const path of ['../secret', 'https://host/x', 'a//b', './a', 'a?x', '/']) {
    await assert.rejects(f.bridge.readFile(path), { code: 'INVALID_PATH' });
  }
  await assert.rejects(f.bridge.readFile('a', 'json'), { code: 'INVALID_TYPE' });
  await assert.rejects(fixture('bad').bridge.readFile('a'), { code: 'INVALID_DATA' });
  await assert.rejects(f.bridge.readFile('a', 'utf8'), { code: 'INVALID_DATA' });
  await assert.rejects(attachNativeResources({}).readFile('a'), { code: 'UNAVAILABLE' });
});
test('real WASM executes and corrupt bytes reject without replacement', async () => {
  const result = await fixture().bridge.instantiateWasm('rapier/rapier.wasm');
  assert.equal(result.instance.exports.answer(), 42);
  await assert.rejects(fixture(new ArrayBuffer(4)).bridge.instantiateWasm('bad.wasm'));
  await assert.rejects(fixture().bridge.instantiateWasm('a.js'), { code: 'INVALID_PATH' });
});
test('missing standard engine explicitly fails', async () => {
  const engine = globalThis.WebAssembly;
  try {
    globalThis.WebAssembly = undefined;
    await assert.rejects(fixture().bridge.instantiateWasm('rapier/rapier.wasm'), {
      code: 'UNAVAILABLE',
    });
  } finally {
    globalThis.WebAssembly = engine;
  }
});
test('native read exceptions propagate', async () => {
  const f = fixture();
  const error = new Error('native failure');
  f.manager.readFile = () => {
    throw error;
  };
  f.manager.readFileSync = () => {
    throw error;
  };
  await assert.rejects(f.bridge.readFile('a'), error);
});

test('remote assets use native HTTPS request with exact configured host', async () => {
  let options;
  const sdk = {
    request(value) {
      assert.equal(this, sdk);
      options = value;
      value.success({ status: 200, data: bytes });
    },
  };
  const bridge = attachNativeResources(sdk, { allowedAssetHosts: ['assets.example.com'] });
  assert.equal(await bridge.readRemoteAsset('https://assets.example.com/world.glb'), bytes);
  assert.equal(options.responseType, undefined);
  assert.equal(options.dataType, 'arraybuffer');
  assert.equal(options.method, 'GET');
  sdk.request = (value) => value.success({ status: 200, data: 'world' });
  assert.equal(
    await bridge.readRemoteAsset('https://assets.example.com/world.json', 'utf8'),
    'world',
  );
  await assert.rejects(bridge.readRemoteAsset('https://other.example.com/world.glb'), {
    code: 'HOST_BLOCKED',
  });
  for (const url of [
    'http://assets.example.com/a',
    'https://user@assets.example.com/a',
    'https://assets.example.com:443/a',
    'https://assets.example.com/a#hash',
  ]) {
    await assert.rejects(bridge.readRemoteAsset(url), { code: 'INVALID_URL' });
  }
  await assert.rejects(attachNativeResources(sdk).readRemoteAsset('https://assets.example.com/a'), {
    code: 'CONFIG_REQUIRED',
  });
  await assert.rejects(
    attachNativeResources({}, { allowedAssetHosts: ['assets.example.com'] }).readRemoteAsset(
      'https://assets.example.com/a',
    ),
    { code: 'UNAVAILABLE' },
  );
});
test('remote HTTP failures, bad bytes and timeout reject, late callbacks cannot succeed', async () => {
  const config = { allowedAssetHosts: ['assets.example.com'], requestTimeoutMs: 5 };
  const url = 'https://assets.example.com/a';
  await assert.rejects(
    attachNativeResources(
      { request: (o) => o.success({ status: 404, data: bytes }) },
      config,
    ).readRemoteAsset(url),
    { code: 'HTTP_ERROR' },
  );
  await assert.rejects(
    attachNativeResources(
      { request: (o) => o.success({ status: 200, data: 'not bytes' }) },
      config,
    ).readRemoteAsset(url),
    { code: 'INVALID_DATA' },
  );
  await assert.rejects(
    attachNativeResources(
      { request: (o) => o.fail({ error: 4, errorMessage: 'domain rejected' }) },
      config,
    ).readRemoteAsset(url),
    { code: 'REQUEST_FAILED' },
  );
  let late;
  let aborted = false;
  const task = {
    abort() {
      assert.equal(this, task);
      aborted = true;
    },
  };
  const promise = attachNativeResources(
    {
      request(o) {
        late = o;
        return task;
      },
    },
    config,
  ).readRemoteAsset(url);
  await assert.rejects(promise, { code: 'TIMEOUT' });
  assert.equal(aborted, true);
  late.success({ status: 200, data: bytes });
  await assert.rejects(promise, { code: 'TIMEOUT' });
});

test('Alipay normalization retains real request and binary file resources', async () => {
  const f = fixture();
  for (const name of [
    'getSystemInfoSync',
    'onTouchStart',
    'offTouchStart',
    'onTouchMove',
    'offTouchMove',
    'onTouchEnd',
    'offTouchEnd',
    'onTouchCancel',
    'offTouchCancel',
    'onHide',
    'offHide',
    'onShow',
    'offShow',
  ])
    f.sdk[name] = () => {};
  f.sdk.request = function (options) {
    assert.equal(this, f.sdk);
    assert.equal(options.responseType, undefined);
    assert.equal(options.dataType, 'arraybuffer');
    options.success({ status: 200, data: bytes });
  };
  const bridge = attachNativeResources(normalizeAlipaySdk(f.sdk), {
    allowedAssetHosts: ['assets.example.com'],
  });
  assert.equal(await bridge.readFile('rapier/rapier.wasm'), bytes);
  assert.equal(await bridge.readRemoteAsset('https://assets.example.com/world.glb'), bytes);
});

test('native subpackage loading preserves receiver and platform callback result', async () => {
  const result = { success: true };
  const sdk = {
    loadSubpackage(options) {
      assert.equal(this, sdk);
      assert.equal(options.name, 'photos1');
      options.success(result);
      return undefined;
    },
  };
  assert.equal(await attachNativeResources(sdk).loadSubpackage('photos1'), result);
  await assert.rejects(attachNativeResources({}).loadSubpackage('photos1'), {
    code: 'UNAVAILABLE',
  });
  await assert.rejects(attachNativeResources(sdk).loadSubpackage('../photos'), {
    code: 'INVALID_NAME',
  });
});
test('subpackage native failure and timeout propagate; late callbacks cannot change result', async () => {
  const config = { requestTimeoutMs: 5 };
  const error = { errorMessage: 'download failed', code: 73 };
  await assert.rejects(
    attachNativeResources({ loadSubpackage: (o) => o.fail(error) }, config).loadSubpackage(
      'photos1',
    ),
    { code: 'SUBPACKAGE_FAILED', cause: error },
  );
  let late;
  let aborted = false;
  const task = {
    abort() {
      assert.equal(this, task);
      aborted = true;
    },
  };
  const promise = attachNativeResources(
    {
      loadSubpackage(o) {
        late = o;
        return task;
      },
    },
    config,
  ).loadSubpackage('photos1');
  await assert.rejects(promise, { code: 'TIMEOUT' });
  assert.equal(aborted, true);
  late.success({ success: true });
  await assert.rejects(promise, { code: 'TIMEOUT' });
  // Hosts such as my do not document a task return. A timeout still fails without inventing one.
  await assert.rejects(
    attachNativeResources({ loadSubpackage() {} }, config).loadSubpackage('photos1'),
    { code: 'TIMEOUT' },
  );
});

test('Alipay normalized subpackage uses only documented lowercase p method', async () => {
  const f = fixture();
  for (const name of [
    'getSystemInfoSync',
    'onTouchStart',
    'offTouchStart',
    'onTouchMove',
    'offTouchMove',
    'onTouchEnd',
    'offTouchEnd',
    'onTouchCancel',
    'offTouchCancel',
    'onHide',
    'offHide',
    'onShow',
    'offShow',
  ])
    f.sdk[name] = () => {};
  f.sdk.loadSubPackage = () => {
    throw new Error('Undocumented uppercase alias called');
  };
  await assert.rejects(attachNativeResources(normalizeAlipaySdk(f.sdk)).loadSubpackage('photos1'), {
    code: 'UNAVAILABLE',
  });
  f.sdk.loadSubpackage = function (options) {
    assert.equal(this, f.sdk);
    options.success({ success: true });
  };
  assert.deepEqual(
    await attachNativeResources(normalizeAlipaySdk(f.sdk)).loadSubpackage('photos1'),
    { success: true },
  );
  f.sdk.loadSubpackage = (options) => options.success({ success: false });
  await assert.rejects(attachNativeResources(normalizeAlipaySdk(f.sdk)).loadSubpackage('photos1'), {
    code: 'SUBPACKAGE_FAILED',
  });
});
