import test from 'node:test';
import assert from 'node:assert/strict';
import { attachNativeResources } from '../native-resources.mjs';

// A real WASM module exporting answer() = 42. Tests below model the documented
// TapTap package-path interface and execute the bytes with the real Node engine.
const bytes = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 10, 1, 6, 97, 110, 115, 119,
  101, 114, 0, 0, 10, 6, 1, 4, 0, 65, 42, 11,
]).buffer;

test('package reads preserve tap receivers, encoding, frozen capabilities and exact data', async () => {
  const calls = [];
  const manager = {
    readFile(options) {
      assert.equal(this, manager);
      calls.push(options);
      options.success({ data: options.encoding ? 'world' : bytes });
    },
  };
  const sdk = Object.freeze({
    getFileSystemManager() {
      assert.equal(this, sdk);
      return manager;
    },
    createCanvas() {
      assert.equal(this, sdk);
      return 'tap-canvas';
    },
  });
  const bridge = attachNativeResources(sdk);
  assert.equal(bridge.createCanvas(), 'tap-canvas');
  assert.equal({ ...bridge }.createCanvas(), 'tap-canvas');
  assert.equal(await bridge.readFile('rapier/rapier.wasm'), bytes);
  assert.equal(calls[0].filePath, 'rapier/rapier.wasm');
  assert.equal(calls[0].encoding, undefined);
  assert.equal(await bridge.readFile('world.json', 'utf8'), 'world');
  assert.equal(calls[1].encoding, 'utf8');
});

test('package reads reject traversal, wrong data, missing FS and native errors', async () => {
  const bridge = attachNativeResources({
    getFileSystemManager: () => ({ readFile: (o) => o.success({ data: 'not binary' }) }),
  });
  for (const path of ['../secret', 'https://host/x', 'a//b', './a', 'a?x', '/'])
    await assert.rejects(bridge.readFile(path), { code: 'INVALID_PATH' });
  await assert.rejects(bridge.readFile('a', 'json'), { code: 'INVALID_TYPE' });
  await assert.rejects(bridge.readFile('a'), { code: 'INVALID_DATA' });
  await assert.rejects(attachNativeResources({}).readFile('a'), { code: 'UNAVAILABLE' });
  const error = new Error('tap read failure');
  await assert.rejects(
    attachNativeResources({
      getFileSystemManager: () => ({
        readFile() {
          throw error;
        },
      }),
    }).readFile('a'),
    error,
  );
});

test('file timeout remains rejected after late host success', async () => {
  let options;
  const bridge = attachNativeResources(
    {
      getFileSystemManager: () => ({
        readFile(o) {
          options = o;
        },
      }),
    },
    { requestTimeoutMs: 5 },
  );
  const pending = bridge.readFile('a');
  await assert.rejects(pending, { code: 'TIMEOUT' });
  options.success({ data: bytes });
  await assert.rejects(pending, { code: 'TIMEOUT' });
});

test('TapTap WASM receives a package path, executes real code and accepts compressed paths', async () => {
  const engine = globalThis.WebAssembly;
  const imports = {};
  const calls = [];
  const host = {
    async instantiate(path, passedImports) {
      assert.equal(this, host);
      assert.equal(passedImports, imports);
      calls.push(path);
      const result = await engine.instantiate(bytes, passedImports);
      return calls.length === 1 ? result : result.instance;
    },
  };
  try {
    globalThis.WebAssembly = host;
    const bridge = attachNativeResources({
      getFileSystemManager() {
        assert.fail('WASM must not read binary bytes');
      },
    });
    assert.equal(
      (await bridge.instantiateWasm('rapier/rapier.wasm', imports)).instance.exports.answer(),
      42,
    );
    assert.equal(
      (await bridge.instantiateWasm('rapier/rapier.wasm.br', imports)).instance.exports.answer(),
      42,
    );
    assert.deepEqual(calls, ['rapier/rapier.wasm', 'rapier/rapier.wasm.br']);
    await assert.rejects(bridge.instantiateWasm('a.js'), { code: 'INVALID_PATH' });
    await assert.rejects(bridge.instantiateWasm('../rapier.wasm'), { code: 'INVALID_PATH' });
  } finally {
    globalThis.WebAssembly = engine;
  }
});

test('WASM compile errors, invalid results and missing host fail without fallback', async () => {
  const previous = globalThis.WebAssembly;
  const error = new Error('tap wasm compilation failed');
  let count = 0;
  const bridge = attachNativeResources({
    getFileSystemManager() {
      assert.fail('no byte fallback');
    },
  });
  try {
    globalThis.WebAssembly = {
      instantiate() {
        count++;
        throw error;
      },
    };
    await assert.rejects(bridge.instantiateWasm('rapier.wasm'), error);
    assert.equal(count, 1);
    globalThis.WebAssembly = { instantiate: async () => ({}) };
    await assert.rejects(bridge.instantiateWasm('rapier.wasm'), { code: 'INVALID_WASM_RESULT' });
    globalThis.WebAssembly = undefined;
    await assert.rejects(bridge.instantiateWasm('rapier.wasm'), { code: 'UNAVAILABLE' });
  } finally {
    globalThis.WebAssembly = previous;
  }
});

test('remote assets use tap.request and configured HTTPS domain with exact byte type', async () => {
  let options;
  const sdk = {
    request(o) {
      assert.equal(this, sdk);
      options = o;
      o.success({ statusCode: 200, data: o.responseType === 'text' ? 'world' : bytes });
    },
  };
  const bridge = attachNativeResources(sdk, { allowedAssetHosts: ['assets.example.com'] });
  assert.equal(await bridge.readRemoteAsset('https://assets.example.com/world.glb'), bytes);
  assert.equal(options.responseType, 'arraybuffer');
  assert.equal(options.method, 'GET');
  assert.equal(
    await bridge.readRemoteAsset('https://assets.example.com/world.json', 'utf8'),
    'world',
  );
  assert.equal(options.responseType, 'text');
  await assert.rejects(bridge.readRemoteAsset('https://other.example.com/a'), {
    code: 'HOST_BLOCKED',
  });
  for (const url of [
    'http://assets.example.com/a',
    'https://user@assets.example.com/a',
    'https://assets.example.com:443/a',
    'https://assets.example.com/a#hash',
  ])
    await assert.rejects(bridge.readRemoteAsset(url), { code: 'INVALID_URL' });
  await assert.rejects(attachNativeResources(sdk).readRemoteAsset('https://assets.example.com/a'), {
    code: 'CONFIG_REQUIRED',
  });
});

test('request failure, HTTP error and timeout abort are final', async () => {
  const config = { allowedAssetHosts: ['assets.example.com'], requestTimeoutMs: 5 };
  const url = 'https://assets.example.com/a';
  await assert.rejects(
    attachNativeResources(
      { request: (o) => o.success({ statusCode: 404, data: bytes }) },
      config,
    ).readRemoteAsset(url),
    { code: 'HTTP_ERROR' },
  );
  await assert.rejects(
    attachNativeResources(
      { request: (o) => o.fail({ errMsg: 'host blocked' }) },
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
  const pending = attachNativeResources(
    {
      request(o) {
        late = o;
        return task;
      },
    },
    config,
  ).readRemoteAsset(url);
  await assert.rejects(pending, { code: 'TIMEOUT' });
  assert.equal(aborted, true);
  late.success({ statusCode: 200, data: bytes });
  await assert.rejects(pending, { code: 'TIMEOUT' });
});

test('tap subpackage callbacks retain receiver, identity and failure behavior', async () => {
  const result = { errMsg: 'loadSubpackage:ok' };
  const sdk = {
    loadSubpackage(o) {
      assert.equal(this, sdk);
      assert.equal(o.name, 'photos1');
      o.success(result);
    },
  };
  assert.equal(await attachNativeResources(sdk).loadSubpackage('photos1'), result);
  await assert.rejects(attachNativeResources(sdk).loadSubpackage('../photos'), {
    code: 'INVALID_NAME',
  });
  await assert.rejects(attachNativeResources({}).loadSubpackage('photos1'), {
    code: 'UNAVAILABLE',
  });
  await assert.rejects(
    attachNativeResources({
      loadSubpackage: (o) => o.fail({ errMsg: 'download failed' }),
    }).loadSubpackage('photos1'),
    { code: 'SUBPACKAGE_FAILED' },
  );
});
