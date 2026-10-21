import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { cloneScene, presets } from '../shared/core/acoustics.js';
import { createLayout } from '../shared/core/layout.js';
import { roomViewport } from '../wechat/canvas.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
let bundle;
before(async () => {
  for (const target of ['h5', 'wechat', 'web'])
    execFileSync(process.execPath, ['build.mjs', target], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'pipe' });
  bundle = await read('dist-wechat/pages/lab/index.js');
});
function fixture({ storageFails = false } = {}) {
  let definition;
  const saved = new Map(),
    files = new Map(),
    notices = [];
  let pick;
  const context = new Proxy(
    {},
    {
      get: (target, key) => target[key] || (() => {}),
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  const canvas = { getContext: () => context };
  const fs = {
    unlinkSync: (path) => files.delete(path),
    writeFileSync: (path, value) => files.set(path, value),
    readFileSync: (path) => files.get(path),
  };
  const host = {
    env: { USER_DATA_PATH: '/user' },
    getFileSystemManager: () => fs,
    getStorageSync: (key) => saved.get(key),
    setStorageSync: (key, value) => {
      if (storageFails) throw new Error('denied');
      saved.set(key, value);
    },
    showToast: (value) => notices.push(value.title),
    getWindowInfo: () => ({ pixelRatio: 3 }),
    createSelectorQuery: () => ({
      in() {
        return this;
      },
      select() {
        return this;
      },
      fields() {
        return this;
      },
      exec(fn) {
        fn([{ node: canvas, width: 358, height: 290 }]);
      },
    }),
    chooseMessageFile(options) {
      pick = options;
    },
    shareFileMessage({ success }) {
      success();
    },
    setClipboardData({ success }) {
      success();
    },
    getClipboardData({ success }) {
      success({ data: '{}' });
    },
  };
  // No DOM, Blob, URL, TextEncoder or Node module loader in the native VM.
  vm.runInNewContext(bundle, {
    wx: host,
    Page: (value) => {
      definition = value;
    },
    setTimeout,
    clearTimeout,
  });
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(values, callback) {
      assert.notEqual(this.alive, false, 'no setData after unload');
      Object.assign(this.data, values);
      callback?.();
    },
  };
  page.onLoad();
  page.onReady();
  return { page, host, saved, files, notices, canvas, pick: () => pick, definition };
}
const event = (dataset, value) => ({ currentTarget: { dataset }, detail: { value } });
test('default Web, H5 and native packages stay isolated and portable', async () => {
  assert.match(await read('dist/index.html'), /data-platform="web"/);
  assert.match(await read('dist-h5/index.html'), /data-platform="h5"/);
  assert.match(await read('dist-h5/index.html'), /h5\/styles.css/);
  await access(new URL('../dist/web/entry.js', import.meta.url));
  await assert.rejects(access(new URL('../dist/wechat', import.meta.url)));
  await assert.rejects(access(new URL('../dist/h5', import.meta.url)));
  const config = JSON.parse(await read('dist-wechat/project.config.json'));
  assert.equal(config.compileType, 'miniprogram');
  assert.equal(config.miniprogramRoot, './');
  assert.doesNotMatch(
    bundle,
    /\b(?:document|window|Blob|TextEncoder|OfflineAudioContext)\b|\bimport\s/,
  );
  assert.doesNotMatch(await read('dist-wechat/pages/lab/index.wxml'), /web-view|fullscreen/);
  assert.equal(
    await read('shared/browser/fullscreen.js'),
    await read('../../../platforms/h5/fullscreen.js'),
  );
});
test('native bundle starts without browser globals, persists and maps touch with DPR', () => {
  const { page, saved, canvas } = fixture();
  assert.equal(canvas.width, 1074);
  assert.equal(page.data.scene.width, 72);
  assert.equal(saved.get('echo-lab.scene.v1').version, 2);
  const view = roomViewport(page.scene, 358, 290),
    source = { ...page.scene.source };
  const touch = {
    identifier: 7,
    x: view.x + source.x * view.scale,
    y: view.y + source.y * view.scale,
  };
  page.touchStart({ touches: [touch] });
  assert.equal(page.selected, 'source');
  page.touchMove({ touches: [{ ...touch, x: touch.x + 20, y: touch.y + 10 }] });
  assert.ok(page.scene.source.x > source.x);
  const x = page.scene.source.x;
  page.touchCancel();
  page.touchMove({ touches: [{ ...touch, x: touch.x + 80 }] });
  assert.equal(page.scene.source.x, x);
  page.addPanel(event({ type: 'absorber' }));
  assert.equal(page.scene.panels.length, 2);
  page.edit(event({ field: 'angle' }, 45));
  assert.equal(page.object().angle, 45);
  page.edit(event({ field: 'scatter' }, 70));
  assert.equal(page.object().scatter, 70);
  page.removePanel();
  assert.equal(page.scene.panels.length, 1);
  page.onUnload();
});
test('native picker hide/show preserves explicit import, unload discards late results', async () => {
  const { page, files, pick } = fixture();
  files.set(
    '/layout',
    JSON.stringify(
      createLayout(cloneScene(presets.dry), { preset: 'dry', sound: 'kick', volume: 42 }),
    ),
  );
  const pending = page.importLayout();
  page.onHide();
  page.onShow();
  pick().success({ tempFiles: [{ path: '/layout', size: 500 }] });
  await pending;
  assert.equal(page.data.presetIndex, 2);
  assert.equal(page.data.volume, 42);
  assert.equal(page.data.inputName, '短鼓点');
  const late = page.importLayout();
  page.onHide();
  page.onUnload();
  pick().success({ tempFiles: [{ path: '/layout', size: 500 }] });
  await late;
  assert.equal(page.alive, false);
});
test('native page tolerates storage failure, rejects invalid imports and resets failed stop', async () => {
  const { page, files, pick, notices } = fixture({ storageFails: true });
  assert.ok(notices.some((text) => text.includes('自动保存')));
  const before = JSON.stringify(page.scene);
  files.set('/bad', '{"format":"echo-lab","version":999}');
  const pending = page.importLayout();
  pick().success({ tempFiles: [{ path: '/bad', size: 100 }] });
  await pending;
  assert.equal(JSON.stringify(page.scene), before);
  assert.equal(page.data.busy, false);
  page.setData({ recording: true });
  page.audio.stopRecording = () => {
    throw new Error('stop failed');
  };
  page.record();
  assert.equal(page.data.recording, false);
  assert.equal(page.data.busy, false);
  page.onUnload();
});
test('WXML handlers exist and native exports call actual file share then clean up', async () => {
  const { page, definition, files } = fixture();
  const wxml = await read('wechat/pages/lab/index.wxml');
  for (const match of wxml.matchAll(/(?:bind|catch)\w+="([A-Za-z]\w*)"/g))
    assert.equal(typeof definition[match[1]], 'function', match[1]);
  let delivered;
  page.audio.host.shareFileMessage = ({ filePath, success }) => {
    delivered = files.get(filePath);
    success();
  };
  await page.exportLayout();
  assert.equal(JSON.parse(delivered).format, 'echo-lab');
  assert.equal(files.size, 0);
  page.onUnload();
});

test('legacy browser module URLs forward to the shared implementations', async () => {
  const geometry = await import('../src/acoustics.js');
  const shared = await import('../shared/core/acoustics.js');
  assert.equal(geometry.computePaths, shared.computePaths);
  const layout = await import('../src/layout.js');
  assert.equal(layout.createLayout, createLayout);
  assert.equal(typeof layout.createRoomLink, 'function');
  const audio = await import('../src/audio.js');
  assert.equal(audio.AudioEngine, (await import('../shared/browser/audio.js')).AudioEngine);
  await access(new URL('../dist/src/audio.js', import.meta.url));
});
