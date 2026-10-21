import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { nativeFixture } from './native-fixture.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
let bundle;
before(async () => {
  for (const target of ['h5', 'wechat', 'web'])
    execFileSync(process.execPath, ['build.mjs', target], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'pipe' });
  bundle = await read('dist-wechat/pages/lab/index.js');
});
test('default Web, H5 and native packages stay isolated and portable', async () => {
  assert.match(await read('dist/index.html'), /data-platform="web"/);
  assert.match(await read('dist-h5/index.html'), /data-platform="h5"/);
  assert.match(await read('dist-h5/index.html'), /h5\/styles.css/);
  await access(new URL('../dist/web/entry.js', import.meta.url));
  await access(new URL('../dist/src/audio.js', import.meta.url));
  await assert.rejects(access(new URL('../dist-wechat/pages/lab/page.js', import.meta.url)));
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
test('native bundle starts without browser globals and draws through the host', () => {
  const { page, saved, canvas } = nativeFixture((host) => {
    let definition;
    // No DOM, Blob, URL, TextEncoder or Node module loader in the native VM.
    vm.runInNewContext(bundle, {
      wx: host,
      Page: (value) => {
        definition = value;
      },
      setTimeout,
      clearTimeout,
    });
    return definition;
  });
  assert.equal(canvas.width, 1074);
  assert.equal(page.data.scene.width, 72);
  assert.equal(saved.get('echo-lab.scene.v1').version, 2);
  page.onUnload();
});
