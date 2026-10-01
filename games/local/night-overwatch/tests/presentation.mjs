import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { sourceHash } from '../scripts/artifact.mjs';
import { waitForImpact, evidenceDirectory, acceptanceBuild } from './flight-browser.mjs';

const base = process.env.NIGHT_URL || 'http://localhost:4318';
const build = await acceptanceBuild(base);
const dir = evidenceDirectory('presentation');
await mkdir(dir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [],
  results = [];
try {
  for (const [width, height] of [
    [1366, 768],
    [667, 375],
    [844, 390],
    [568, 320],
  ]) {
    const touch = width < 1000;
    const p = await browser.newPage({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: touch ? 2 : 1,
      userAgent: touch
        ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
        : undefined,
    });
    p.on('pageerror', (e) => errors.push(e.message));
    const snap = () => p.evaluate(() => __night.snapshot());
    const shot = (name) =>
      p.screenshot({
        path: `${dir}/refined-${width}-${name}.png`,
      });
    async function click(id) {
      const visible = await snap();
      if (
        !visible.buttons.some((b) => b.id === id) &&
        visible.buttons.some((b) => b.id === 'flightControls')
      )
        await click('flightControls');
      await p.waitForFunction(
        (id) => globalThis.__night?.snapshot().buttons.some((b) => b.id === id),
        id,
      );
      const b = (await snap()).buttons.find((b) => b.id === id);
      assert(
        b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height,
        `${id} inside viewport`,
      );
      if (touch) await p.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
      else await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await p.waitForTimeout(100);
    }
    await p.goto(base);
    await p.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready');
    await p.waitForFunction(() => !document.getElementById('night-startup'));
    await click('fullscreen');
    await p.waitForFunction(() => !!document.fullscreenElement);
    await click('fullscreen');
    await p.waitForFunction(() => !document.fullscreenElement);
    await click('start');
    let s = await snap();
    assert(
      s.buttons.some((b) => b.id === 'fullscreen'),
      'Live fullscreen never requires opening tools',
    );
    assert(!s.ui.fire.includes('LMB'));
    assert(s.ui.fire.includes(touch ? '按住开火' : '按住左键开火'));
    const beforePanel = s.fired;
    await click('flightControls');
    await click('flightControls');
    assert.equal((await snap()).fired, beforePanel, 'Tactical drawer does not fire through');
    await shot('thermal');
    await click('sensor');
    await shot('daylight');
    await click('weapon2');
    assert((await snap()).ui.fire.includes(touch ? '点按开火' : '单击左键开火'));
    if (!touch) {
      const q = await p.evaluate((v) => __night.screenPoint(v), (await snap()).units[0]);
      await p.mouse.move(q.x, q.y);
      await p.waitForTimeout(50);
      s = await snap();
      assert(s.friendlyRisk, `friendly aim reached: ${JSON.stringify(s.aim)}`);
      assert(s.ui.warning.includes('友方'));
      assert.equal(s.ui.warningColor.toLowerCase().slice(0, 6), 'ff525b');
      await shot('friendly-warning');
      await p.mouse.down();
      await p.mouse.up();
      await p.waitForTimeout(80);
      s = await snap();
      assert(s.shots.length > 0, 'Real input launches a heavy shell');
      assert(
        Math.abs(s.shots[0].origin.y - s.aircraft.y) < 4,
        'Launch altitude follows the aircraft mount',
      );
      assert(
        s.shots[0].origin.y - s.shots[0].targetY > 50,
        'Long-range descent from aircraft to terrain',
      );
      assert(s.ui.warning.includes('友方'), 'warning stays during reload');
      const before = s.shots[0];
      await p.mouse.move(width / 2, height / 2);
      const after = (await snap()).shots.find((a) => a.id === before.id);
      assert(after && after.x === before.x && after.z === before.z && after.due === before.due);
      await waitForImpact(p, before);
      await shot('heavy-impact');
    }
    const beforeFullscreen = await snap();
    await click('fullscreen');
    await p.waitForFunction(() => !!document.fullscreenElement);
    await click('fullscreen');
    await p.waitForFunction(() => !document.fullscreenElement);
    s = await snap();
    assert(s.time >= beforeFullscreen.time && s.progress >= beforeFullscreen.progress);
    assert.equal(s.held.length, 0);
    assert.equal(s.phase, 'playing');
    assert.equal(s.modelImport, 'loaded');
    await click('settings');
    assert((await snap()).pauses.includes('settings'));
    await click('help');
    const helpTime = (await snap()).time;
    await click('fullscreen');
    await p.waitForFunction(() => !!document.fullscreenElement);
    await click('fullscreen');
    await p.waitForFunction(() => !document.fullscreenElement);
    assert.equal((await snap()).time, helpTime);
    await click('close');
    assert.equal((await snap()).modal, 'settings');
    assert.equal((await snap()).time, helpTime, 'Closing help keeps settings paused');
    await click('close');
    assert(!(await snap()).pauses.includes('settings'));
    if (!touch) {
      for (let i = 0; i < 7; i++) await click('zoomIn');
      await click('locate');
      await shot('vehicle-detail');
    }
    results.push({
      viewport: { width, height },
      fullScreenBriefingAndBattle: true,
      fullScreenHelpKeepsPause: true,
      fireHint: s.ui.fire,
      renderNodes: s.renderNodes,
      triangles: s.triangles,
      drawCalls: s.drawCalls,
      friendlyWarning: !touch ? true : 'desktop covered',
      modelImport: s.modelImport,
      audio: s.audio,
    });
    await p.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(build.sourceHash, await sourceHash(), 'Production source changed during acceptance');
  await writeFile(
    `${dir}/presentation.json`,
    JSON.stringify({ build, base, results, errors }, null, 2),
  );
  console.log(
    'Presentation, red friendly warning, launch snapshot and actual fullscreen passed at all 4 viewports',
  );
} finally {
  await browser.close();
}
