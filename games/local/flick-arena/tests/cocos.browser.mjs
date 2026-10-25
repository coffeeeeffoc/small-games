import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { ready } from './ready.mjs';
import { verifyDisplayAndAim } from './display-aim.mjs';
import { levels } from '../src/levels.mjs';
import { saveKey } from '../src/progress.mjs';

const out = new URL(
  process.env.FLICK_VALIDATION_DIR ?? '../docs/design/cocos-2026-10-23/',
  import.meta.url,
);
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4540'], {
  cwd: new URL('../', import.meta.url),
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
});
const errors = [],
  report = { environment: 'Chromium mobile touch emulation, not physical hardware', checks: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto('http://127.0.0.1:4540/?dev=1');
  await ready(page);
  const shot = async (name) => {
    // A Cocos scene is presented on its next frame; do not capture stale nodes after a tap.
    await page.clock.runFor(32);
    await page.screenshot({ path: new URL(name + '.png', out).pathname });
  };
  const engine = await page.evaluate(async () => {
    const cc = await import('./vendor/cocos/cc.js');
    return {
      version: cc.VERSION,
      scene: cc.director.getScene().name,
      canvas2d: document.querySelector('#game').getContext('2d') !== null,
      stats: SmallGamesDev.inspect().game.rendering,
    };
  });
  assert.equal(engine.version, '3.8.8');
  assert.equal(engine.scene, 'Flick Arena');
  assert.equal(engine.canvas2d, false);
  assert(engine.stats.sprites > 10 && engine.stats.graphics > 0);
  assert.equal(await page.locator('#fullscreen, [data-game-fullscreen]').count(), 0);
  await page.evaluate(() => SmallGamesDev.setPanelHidden(true));
  await shot('home');
  const clip = { x: 24, y: 620, width: 342, height: 180 };
  const cocosButtons = await page.screenshot({ clip });
  await page.evaluate(async () => {
    const { draw, W, H } = await import('./src/render.mjs');
    const stage = document.querySelector('#stage'),
      box = stage.getBoundingClientRect();
    const reference = document.createElement('canvas');
    reference.id = 'style-reference';
    reference.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:none';
    reference.width = box.width * devicePixelRatio;
    reference.height = box.height * devicePixelRatio;
    stage.append(reference);
    const ctx = reference.getContext('2d'),
      s = Math.min(reference.width / W, reference.height / H);
    ctx.translate((reference.width - W * s) / 2, (reference.height - H * s) / 2);
    ctx.scale(s, s);
    draw(ctx, window.__flickArena.app);
  });
  const nativeButtons = await page.screenshot({ clip });
  await page.locator('#style-reference').evaluate((element) => element.remove());
  const buttonError = await page.evaluate(
    async ([actual, reference]) => {
      async function pixels(base64) {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const a = await pixels(actual),
        b = await pixels(reference);
      let error = 0;
      for (let i = 0; i < a.length; i++) if (i % 4 !== 3) error += Math.abs(a[i] - b[i]);
      return error / (a.length * 0.75);
    },
    [cocosButtons.toString('base64'), nativeButtons.toString('base64')],
  );
  assert(
    buttonError < 1,
    `button palette, edges and Chinese serif must match the original renderer: ${buttonError}`,
  );
  report.buttonMeanAbsoluteErrorOutOf255 = buttonError;
  await page.locator('#levels').tap();
  await shot('levels');
  await page.locator('#home').tap();
  await page.evaluate(() => SmallGamesDev.setPanelHidden(false));
  await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
  assert.equal(await page.locator('[data-dev-action^="level-"]').count(), levels.length);
  await page.locator(`[data-dev-action="level-${levels.at(-1).id}"]`).tap();
  await page.getByRole('button', { name: '关闭', exact: true }).tap();
  await page.evaluate(() => SmallGamesDev.setPanelHidden(true));
  assert.equal(await page.locator('#game').getAttribute('data-level-id'), levels.at(-1).id);
  await shot('play-final-level');
  await page.locator('#pause').tap();
  assert.equal(await page.locator('#fullscreen, [data-game-fullscreen]').count(), 0);
  await shot('paused');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), saveKey), null);
  await page.locator('#resume').tap();
  // Isolated rendering fixture: sample continuous contraction without changing rules/results.
  const cache = await page.evaluate(() => {
    const game = window.__flickArena,
      snapshot = structuredClone(game.app.state);
    const before = SmallGamesDev.inspect().game.rendering;
    for (let i = 0; i < 60; i++) {
      game.app.state.radius = snapshot.radius - (18 * i) / 59;
      game.render();
    }
    game.app.state = snapshot;
    game.render();
    return { before, after: SmallGamesDev.inspect().game.rendering };
  });
  assert.equal(cache.after.uploads, cache.before.uploads, 'contraction reuses textures');
  assert(cache.after.bytes < 32 * 1024 * 1024);
  const rewards = await page.evaluate(async () => ({
    available: SmallGamesRewardAds.available,
    result: await SmallGamesRewardAds.offer({ id: 'reserved-test' }),
    pending: SmallGamesRewardAds.pending,
  }));
  assert.deepEqual(rewards, {
    available: false,
    result: { status: 'unavailable' },
    pending: false,
  });
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'playing');
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(150);
    await page.locator('#pause').tap();
    assert.equal(await page.locator('body').getAttribute('data-phase'), 'paused');
    for (const button of await page.locator('#controls button').all()) {
      const bounds = await button.boundingBox();
      assert(bounds.height >= 43.9 && bounds.width >= 43.9);
    }
    await shot(`paused-${width}x${height}`);
    await page.locator('#resume').tap();
  }
  assert.deepEqual(errors, []);
  report.displayAndAim = await verifyDisplayAndAim(browser, 'http://127.0.0.1:4540/', out);
  Object.assign(report, { engine, cache, rewards, errors, passed: true });
  report.checks = [
    'real Cocos WebGL scene and sprites/Graphics',
    'button pixel parity against original Canvas renderer, including Chinese serif',
    'all 120 developer actions and last-level touch selection',
    'developer play does not write progress',
    'no fullscreen on home/pause',
    'no ad placement means unavailable without blocking play',
    '60 contraction renders upload no new texture',
    'portrait/small/landscape touch targets',
  ];
  await writeFile(new URL('cocos-browser.json', out), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS Cocos: ' + JSON.stringify(report));
} finally {
  await browser.close();
  server.kill();
}
