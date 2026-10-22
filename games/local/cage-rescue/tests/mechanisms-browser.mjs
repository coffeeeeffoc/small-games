import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { LEVELS } from '../src/levels.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/design/mechanisms-2026-10-23/', import.meta.url);
const publishing = new URL('../publishing/', import.meta.url);
const port = 4478,
  origin = `http://127.0.0.1:${port}`;
await mkdir(new URL('gameplay/screenshots/', publishing), { recursive: true });
await mkdir(new URL('gameplay/videos/', publishing), { recursive: true });
execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const report = {
  browser: await browser.version(),
  viewport: '390x844',
  checks: [],
  shots: [],
  errors: [],
  limitation:
    'Desktop Chromium touch emulation. Saved-progress fixture selects later levels; gameplay uses native touch activation and scripted pointer moves, without changing simulation state. Recording runs at real speed.',
};
const source = await readFile(new URL('./route-player.mjs', import.meta.url), 'utf8');
const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const snap = (page) => page.evaluate(() => window.__cageRescue.snapshot());
async function shot(page, name) {
  const file = new URL(name + '.png', evidence);
  await page.screenshot({ path: fileURLToPath(file) });
  await copyFile(file, new URL(`gameplay/screenshots/${name}.png`, publishing));
  report.shots.push(name);
}
async function startSteering(page, context) {
  const rect = await page.locator('#scene').boundingBox();
  const paddleX = (await snap(page)).game.paddle.x;
  const contact = await context.newCDPSession(page);
  await contact.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: rect.x + (rect.width * paddleX) / 390, y: rect.y + rect.height * 0.85 },
    ],
  });
  await page.evaluate(async (url) => {
    const { createRoutePlayer } = await import(url),
      play = createRoutePlayer();
    const pointerId = window.__cageRescue.snapshot().activePointer;
    const canvas = document.querySelector('#scene');
    window.__routeEvidence = { maxBalls: 1, damage: false, device: false, gates: false };
    window.__routeStop = false;
    function frame() {
      if (window.__routeStop) return;
      const snapshot = window.__cageRescue.snapshot(),
        state = snapshot.game;
      if (snapshot.screen !== 'play') return;
      const e = window.__routeEvidence;
      e.maxBalls = Math.max(e.maxBalls, 1 + state.extraBalls.length);
      e.damage ||= state.bricks.some((item) => item.maxHp > 2 && item.hp < item.maxHp);
      e.device ||= state.devices.some((item) => item.charges === 0);
      e.gates ||= state.barriers.some((item) => item.open);
      const input = play(state);
      if (input.launch) document.querySelector('#launch').click();
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId,
          pointerType: 'touch',
          isPrimary: true,
          bubbles: true,
          clientX: rect.left + (input.targetX / 390) * rect.width,
          clientY: rect.top + rect.height * 0.85,
        }),
      );
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, moduleURL);
  return async () => {
    await page.evaluate(() => {
      window.__routeStop = true;
    });
    await contact.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await contact.detach();
  };
}
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: fileURLToPath(new URL('gameplay/videos/', publishing)),
      size: { width: 390, height: 844 },
    },
  });
  await context.addInitScript(
    (ids) =>
      localStorage.setItem(
        'cage-rescue:host:progress',
        JSON.stringify({
          version: 'mechanisms-preview',
          value: {
            version: 1,
            completed: Object.fromEntries(
              ids.map((id) => [id, { rescued: 6, seconds: 60, lives: 3 }]),
            ),
          },
        }),
      ),
    LEVELS.map((item) => item.id),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(origin + '/?dev=0');
  await expect(page.locator('#levels')).toBeVisible();
  await shot(page, 'home-390');
  await page.locator('#levels').tap();
  await page.locator('[data-level="7"]').scrollIntoViewIfNeeded();
  await shot(page, 'levels-390');
  await page.locator('[data-level="7"]').tap();
  await expect(page.locator('#launch')).toBeEnabled();
  await shot(page, 'chamber-ready-390');
  await page.locator('#launch').tap();
  let stop = await startSteering(page, context);
  await expect
    .poll(async () => (await snap(page)).game.extraBalls.length, {
      timeout: 65000,
      intervals: [100],
    })
    .toBe(2);
  await page.waitForTimeout(230);
  await shot(page, 'chamber-multiball-390');
  await stop();
  await page.locator('#pause').tap();
  const frozen = (await snap(page)).game;
  await page.waitForTimeout(350);
  assert.deepEqual((await snap(page)).game, frozen);
  await shot(page, 'multiball-pause-390');
  await page.locator('#resume').tap();
  stop = await startSteering(page, context);
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 100000 });
  const result = await snap(page);
  assert.equal(result.game.phase, 'won');
  assert.equal(result.game.rescued, 6);
  await shot(page, 'chamber-result-390');
  await stop();
  report.checks.push(
    'Normal pointer input enters the slit, triggers three balls, freezes all balls during pause, resumes and rescues all six teammates.',
  );
  const video = page.video();
  await context.close();
  await video.saveAs(
    fileURLToPath(new URL('gameplay/videos/chamber-real-time-390x844.webm', publishing)),
  );
  await video.delete();
  // Fast deterministic presentation checks use the browser clock; the recording above does not.
  const checks = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await checks.addInitScript(
    (ids) =>
      localStorage.setItem(
        'cage-rescue:host:progress',
        JSON.stringify({
          version: 'preview',
          value: {
            version: 1,
            completed: Object.fromEntries(
              ids.map((id) => [id, { rescued: 6, seconds: 60, lives: 3 }]),
            ),
          },
        }),
      ),
    LEVELS.map((item) => item.id),
  );
  for (const index of [6, 10, 16, 23, 28]) {
    const view = await checks.newPage();
    view.on('pageerror', (error) => report.errors.push(error.message));
    await view.clock.install();
    await view.goto(origin + '/?dev=0');
    await view.locator('#levels').tap();
    await view.locator(`[data-level="${index}"]`).scrollIntoViewIfNeeded();
    await view.locator(`[data-level="${index}"]`).tap();
    await expect(view.locator('#launch')).toBeEnabled();
    await shot(view, `route-${index + 1}-390`);
    await view.locator('#launch').tap();
    const stop = await startSteering(view, checks);
    let success = false;
    for (let attempt = 0; attempt < 240; attempt++) {
      await view.clock.runFor(250);
      const state = (await snap(view)).game;
      success =
        index === 6
          ? state.bricks.some((item) => item.maxHp > 2 && item.hp < item.maxHp)
          : index === 10
            ? state.barriers.some((item) => item.open)
            : state.devices.some((item) => item.charges === 0);
      if (success || ['won', 'lost'].includes(state.phase)) break;
    }
    assert.ok(success, `route ${index + 1} mechanic was reached through input`);
    await shot(view, `route-${index + 1}-triggered-390`);
    report.checks.push(`Route ${index + 1}: visible mechanic activated through pointer input.`);
    await stop();
    await view.close();
  }
  const small = await checks.newPage();
  await small.setViewportSize({ width: 320, height: 568 });
  await small.goto(origin + '/?dev=0');
  await small.locator('#levels').tap();
  await small.locator('[data-level="7"]').scrollIntoViewIfNeeded();
  await small.locator('[data-level="7"]').tap();
  await expect(small.locator('#launch')).toBeEnabled();
  await shot(small, 'chamber-ready-320');
  assert.ok((await small.locator('#pause').boundingBox()).width >= 44);
  await checks.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.kill('SIGTERM');
}
