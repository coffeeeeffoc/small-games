import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { referenceInput } from '../src/core.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'docs/qa');
await mkdir(out, { recursive: true });
await mkdir(path.join(root, 'publishing/gameplay/screenshots'), { recursive: true });
await mkdir(path.join(root, 'outputs'), { recursive: true });
const port = Number(process.env.SKYBOUND_TEST_PORT || 4478);
execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
const server = spawn(
  process.execPath,
  ['server.mjs', '--dist', '--port', String(port), '--host', '127.0.0.1'],
  { cwd: root, stdio: 'pipe' },
);
const origin = 'http://127.0.0.1:' + port;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(origin)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 50));
}
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
});
const report = {
  environment: 'Desktop Chromium, mobile viewport + native CDP multi-touch. Not a physical phone.',
  browser: await browser.version(),
  checks: [],
  errors: [],
  screenshots: [],
};
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const visualOnly = process.env.SKYBOUND_VISUAL_ONLY === '1';
if (visualOnly)
  await context.addInitScript(() => {
    localStorage.setItem(
      'skybound-odyssey:host:progress',
      JSON.stringify({
        version: 'visual-fixture',
        value: { version: 1, completed: ['snowline', 'cloudpass'] },
      }),
    );
  });
const page = await context.newPage();
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) report.errors.push(r.url() + ':' + r.status());
});
const capture = async (name) => {
  await page.screenshot({ path: path.join(out, name + '.png') });
  report.screenshots.push(name + '.png');
};
const snap = () => page.evaluate(() => window.SmallGamesDev.inspect().game);
async function boot() {
  await page.goto(origin + '/?dev=1');
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
}
async function driveCurrent({ shots = false } = {}) {
  const session = await context.newCDPSession(page);
  let count = 0;
  const samples = [];
  const seen = new Set();
  const deadline = Date.now() + 150000;
  try {
    while (Date.now() < deadline) {
      const s = await snap();
      if (s.screen === 'result') {
        assert.equal(
          s.run.status,
          'complete',
          JSON.stringify({
            reason: s.run.reason,
            distance: s.run.distance,
            seed: s.run.seed,
            samples,
          }),
        );
        (report.runs ||= []).push({
          seed: s.run.seed,
          route: s.run.routeId,
          distance: s.run.distance,
          elapsed: s.run.elapsed,
          status: s.run.status,
          vehicle: s.run.vehicle,
        });
        return s;
      }
      const input = referenceInput(s.run);
      samples.push({ z: s.run.distance, x: s.run.x, actual: s.input, desired: input });
      if (samples.length > 12) samples.shift();
      const points = await page.evaluate(({ steer, brake }) => {
        const map = (el, x, y) => {
          const b = el.getBoundingClientRect();
          return el.closest('[data-rotated="true"]')
            ? {
                x: b.right - (y / el.clientHeight) * b.width,
                y: b.top + (x / el.clientWidth) * b.height,
              }
            : {
                x: b.left + (x / el.clientWidth) * b.width,
                y: b.top + (y / el.clientHeight) * b.height,
              };
        };
        const pad = document.querySelector('#steering-pad'),
          b = document.querySelector('#brake');
        const p = map(pad, pad.clientWidth * (0.5 + steer * 0.49), pad.clientHeight * 0.5);
        const result = [{ id: 1, ...p }];
        if (brake) result.push({ id: 2, ...map(b, b.clientWidth / 2, b.clientHeight / 2) });
        return result;
      }, input);
      if (!count) {
        const center = await page.locator('.steer-dot').boundingBox();
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, x: center.x + center.width / 2, y: center.y + center.height / 2 }],
        });
        count = 1;
      }
      if (points.length !== count) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const center = await page.locator('.steer-dot').boundingBox();
        const starts = [{ id: 1, x: center.x + center.width / 2, y: center.y + center.height / 2 }];
        if (points.length === 2) starts.push(points[1]);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: starts });
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
      count = points.length;
      if (shots && !seen.has(s.run.scene) && s.run.distance % 240 > 85) {
        seen.add(s.run.scene);
        await page.screenshot({
          path: path.join(root, 'publishing/gameplay/screenshots', s.run.scene + '-1280x720.png'),
        });
        console.log('Captured scene', s.run.scene);
      }
      await page.waitForTimeout(65);
    }
    throw new Error('Natural touch play timed out');
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
}
try {
  await boot();
  if (!visualOnly) {
    await capture('home-844x390');
    await page.locator('#choose-route').tap();
    await expect(page.locator('.route-card:disabled')).toHaveCount(2);
    await capture('routes-844x390');
    await page.locator('#routes-screen [data-home]').tap();
    await page.locator('#help-button').tap();
    await capture('help-844x390');
    await page.locator('#help-screen [data-home]').tap();
    await page.locator('#settings-button').tap();
    await page.locator('#motion-toggle').tap();
    await page.waitForTimeout(2700);
    await expect(page.locator('#motion-status')).toContainText(/触屏/);
    await capture('settings-844x390');
    await page.locator('#settings-screen [data-home]').tap();
    await page.locator('#start-game').tap();
    await page.waitForTimeout(400);
    await capture('play-844x390');
    const session = await context.newCDPSession(page);
    const left = await page.locator('#steer-left').boundingBox(),
      brake = await page.locator('#brake').boundingBox();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: left.x + left.width / 2, y: left.y + left.height / 2 },
        { id: 2, x: brake.x + brake.width / 2, y: brake.y + brake.height / 2 },
      ],
    });
    await page.waitForTimeout(220);
    assert.ok((await snap()).run.x < -0.05);
    assert.ok((await snap()).run.speed < 20);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual((await snap()).input, { steer: 0, brake: false });
    await session.detach();
    report.checks.push('Real multi-touch steer + brake and touchCancel release');
    await page.locator('#pause-button').tap();
    await capture('pause-844x390');
    const paused = (await snap()).run.distance;
    await page.waitForTimeout(300);
    assert.equal((await snap()).run.distance, paused);
    await page.locator('#resume-game').tap();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#game')).toHaveAttribute('data-screen', 'pause');
    report.checks.push('Pause freezes simulation; blur pauses without auto-resume');
    await page.locator('#pause-retry').tap();
    const seed = (await snap()).run.seed;
    await expect(page.locator('#result-screen')).toBeVisible({ timeout: 8000 });
    await capture('failure-844x390');
    assert.match((await snap()).run.reason, /撞上/);
    await page.locator('#retry-game').tap();
    assert.equal((await snap()).run.seed, seed);
    await page.locator('#pause-button').tap();
    await page.locator('#pause-screen [data-home]').tap();
    report.checks.push('Uncontrolled run fails; retry preserves seed');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#game')).toHaveAttribute('data-rotated', 'true');
    await capture('home-390x844');
    await page.locator('#start-game').tap();
    const rs = await context.newCDPSession(page),
      rp = await page.locator('#steer-right').boundingBox();
    await rs.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: rp.x + rp.width / 2, y: rp.y + rp.height / 2 }],
    });
    await page.waitForTimeout(200);
    assert.ok((await snap()).run.x > 0.05);
    await rs.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await rs.detach();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#game')).toHaveAttribute('data-screen', 'pause');
    report.checks.push(
      'Portrait CSS rotation maps real touch correctly; resize preserves and pauses run',
    );
    await page.locator('#pause-retry').tap();
    const first = await driveCurrent();
    assert.ok(first.progress.completed.includes('snowline'));
    await capture('complete-844x390');
    console.log('Natural touch: first route complete');
    await page.reload();
    await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
    await page.locator('#choose-route').tap();
    await expect(page.locator('.route-card:disabled')).toHaveCount(1);
    await page.locator('[data-route="cloudpass"]').tap();
    await driveCurrent();
    console.log('Natural touch: second route complete');
    report.checks.push(
      'Natural touch completes first two routes; progression and refresh restore work',
    );
    await page.locator('#result-screen [data-home]').tap();
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#choose-route').tap();
  await page.locator('[data-route="wavecrest"]').tap();
  // Record the actual canvas output while real touch controls advance the run.
  await page.evaluate(() => {
    const canvas = document.querySelector('#scene');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    window.__capture = { recorder, chunks, stream };
    recorder.start();
  });
  const last = await driveCurrent({ shots: true });
  assert.equal(last.run.vehicle, 'surf');
  const recording = await page.evaluate(async () => {
    const cap = window.__capture;
    await new Promise((resolve) => {
      cap.recorder.onstop = resolve;
      cap.recorder.stop();
    });
    cap.stream.getTracks().forEach((t) => t.stop());
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(new Blob(cap.chunks, { type: 'video/webm' }));
    });
  });
  await writeFile(path.join(root, 'outputs/gameplay.webm'), Buffer.from(recording, 'base64'));
  report.checks.push(
    'Natural multi-touch completes all five scenes and all three vehicles; real canvas recording captured',
  );
  await page.locator('#new-run').tap();
  assert.notEqual((await snap()).run.seed, last.run.seed);
  await page.locator('#pause-button').tap();
  await page.locator('#pause-screen [data-home]').tap();
  await page.locator('#endless-game').tap();
  assert.equal((await snap()).run.routeId, 'endless');
  report.checks.push('New journey changes seed; endless entry starts');
  await page.goto(origin + '/?dev=0');
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), false);
  assert.equal(await page.evaluate(() => window.SmallGamesDev.inspect().game), undefined);
  report.checks.push('Explicit dev=0 disables game diagnostics');
  const blocked = await browser.newContext({
    viewport: { width: 667, height: 320 },
    isMobile: true,
    hasTouch: true,
  });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  const bp = await blocked.newPage();
  await bp.goto(origin + '/?dev=1');
  await expect(bp.locator('#game')).toHaveAttribute('data-ready', 'true');
  await bp.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  await bp.locator('#start-game').tap();
  await expect(bp.locator('#result-screen')).toBeVisible({ timeout: 8000 });
  await bp.locator('#retry-game').tap();
  await expect(bp.locator('#game')).toHaveAttribute('data-screen', 'play');
  await bp.screenshot({ path: path.join(out, 'small-storage-blocked-667x320.png') });
  await blocked.close();
  report.checks.push('667×320 touch flow works with blocked storage');
  const unreadable = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });
  await unreadable.addInitScript(() => {
    window.__saveWrites = 0;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('skybound-odyssey:')) throw new Error('read temporarily unavailable');
      return null;
    };
    Storage.prototype.setItem = function () {
      window.__saveWrites++;
    };
  });
  const up = await unreadable.newPage();
  await up.goto(origin + '/?dev=0');
  await expect(up.locator('#game')).toHaveAttribute('data-ready', 'true');
  await up.locator('#settings-button').click();
  await up.locator('#sound-toggle').click();
  assert.equal(await up.evaluate(() => window.__saveWrites), 0);
  await unreadable.close();
  report.checks.push('Unreadable existing storage is never overwritten by settings');

  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(
    path.join(out, visualOnly ? 'visual-report.json' : 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  server.kill();
}
console.log('PASS', JSON.stringify(report.checks));
