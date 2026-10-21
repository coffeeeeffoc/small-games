import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installStartup } from '../startup/install.mjs';
test('branding installer replaces one Creator boot chain and adds accessible real loading states', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'station-startup-'));
  try {
    await writeFile(
      path.join(dir, 'index.html'),
      '<html><head><title>Cocos Creator | homebound-station</title></head><body><div id="GameDiv"><canvas id="GameCanvas"></canvas></div><script>System.import("./index.abc.js").catch(console.error)</script></body></html>',
    );
    await writeFile(path.join(dir, 'index.abc.js'), 'const path="./application.abc.js";');
    await installStartup(dir);
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    assert.equal((html.match(/window.HomeboundStartup.boot\(/g) || []).length, 1);
    assert.ok(!html.includes('System.import("./index.abc.js")'));
    assert.match(html, /homebound-ready/);
    assert.match(html, /EVENT_AFTER_DRAW/);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /loading-retry/);
    assert.match(html, /station-icon.png/);
    assert.ok((await readFile(path.join(dir, 'station-icon.png'))).length > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('unknown Creator bootstrap fails closed rather than publishing a broken loader', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'station-startup-'));
  try {
    await writeFile(path.join(dir, 'index.html'), '<html><head></head><body></body></html>');
    await assert.rejects(installStartup(dir), /Unknown Creator/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
