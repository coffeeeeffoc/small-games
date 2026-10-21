import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cloneScene, presets } from '../shared/core/acoustics.js';
import { createLayout } from '../shared/core/layout.js';
import { roomViewport } from '../wechat/canvas.js';
import { createLabPage } from '../wechat/pages/lab/page.js';
import { nativeFixture } from './native-fixture.js';
const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const fixture = (options) => nativeFixture(createLabPage, options);
const event = (dataset, value) => ({ currentTarget: { dataset }, detail: { value } });
test('native page persists and maps touch with DPR', () => {
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
});
