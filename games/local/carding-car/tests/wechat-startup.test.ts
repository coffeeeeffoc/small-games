import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { instrumentWechatStartup, verifyResourceConfig } from '../scripts/wechat-startup.mjs';

test('caught startup failure reports missing device files without losing the original error', async () => {
  let modal;
  const wx = {
    getFileSystemManager: () => ({ readdirSync(dir) {
      if (dir === 'assets/internal') throw new Error('no such directory');
      return ['resources'];
    } }),
    showModal(options) { modal = options; },
  };
  const source = 'Promise.reject(new Error("readFile:fail no such file assets/internal/config.json")).catch((err) => { console.error(err); });';
  await vm.runInNewContext(instrumentWechatStartup(source), { wx, console: { error() {} } });
  assert.match(modal.content, /readFile:fail no such file assets\/internal\/config.json/);
  assert.match(modal.content, /assets\/internal: no such directory/);
  assert.match(modal.content, /subpackages: resources/);
  assert.throws(() => instrumentWechatStartup('changed template'), /handler changed/);
});

test('rejects stale resource configuration while allowing current configuration and read failures', () => {
  const popups = [];
  let result = { packs: { old: [] } };
  let readError = null;
  const fsUtils = { readJson(file, callback) { callback(readError, result); } };
  verifyResourceConfig({ showModal: (o) => popups.push(o) }, fsUtils, ['current'], 'test-build');
  fsUtils.readJson('subpackages/resources/config.json', (error) => assert.match(error.message, /test-build/));
  assert.equal(popups.length, 1);
  result = { packs: { current: [] } };
  fsUtils.readJson('subpackages/resources/config.json', (error, data) => {
    assert.equal(error, null);
    assert.equal(data, result);
  });
  readError = new Error('readFile failed');
  fsUtils.readJson('subpackages/resources/config.json', (error) => assert.equal(error, readError));
  assert.equal(popups.length, 1);
});

test('installs verification before the engine adapter captures readJson', () => {
  const original = () => {};
  const fsUtils = { readJson: original };
  const source = "require('./engine-adapter'); function failed(err) { console.error(err); }";
  vm.runInNewContext(instrumentWechatStartup(source, ['current'], 'test'), {
    wx: {}, window: { fsUtils }, console: { warn() {} },
    require() { assert.notEqual(fsUtils.readJson, original); },
  });
});
