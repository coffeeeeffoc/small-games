import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { sourceHash } from '../scripts/artifact.mjs';
import { MISSION } from '../assets/scripts/core/Data.ts';
import { aimAt, evidenceDirectory, acceptanceBuild } from './flight-browser.mjs';

const round = process.env.NIGHT_ROUND || 'feedback-overhaul';
const base = process.env.NIGHT_URL || 'http://localhost:4318';
const dir = evidenceDirectory('polish');
await mkdir(dir, { recursive: true });
const build = await acceptanceBuild(base);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const report = { build, base, round, viewports: [], errors: [], warnings: [], resourcesFailed: [] };
try {
  for (const [width, height] of [
    [1366, 768],
    [844, 390],
    [667, 375],
    [568, 320],
  ]) {
    const touch = width < 1000;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: 1,
      recordVideo: width === 844 ? { dir, size: { width, height } } : undefined,
    });
    const p = await context.newPage();
    p.on('pageerror', (e) => report.errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error')
        (m.text().includes('touchcancel') ? report.warnings : report.errors).push(m.text());
    });
    p.on('requestfailed', (r) => report.resourcesFailed.push(r.url()));
    p.on('response', (r) => {
      if (r.status() >= 400) report.resourcesFailed.push(`${r.status()} ${r.url()}`);
    });
    const snap = () => p.evaluate(() => __night.snapshot());
    const capture = (name) => p.screenshot({ path: `${dir}/${width}-${name}.png` });
    const press = async (id) => {
      let s = await snap();
      if (!s.buttons.some((b) => b.id === id) && s.buttons.some((b) => b.id === 'flightControls')) {
        const b = s.buttons.find((b) => b.id === 'flightControls');
        if (touch) await p.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
        else await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
        await p.waitForTimeout(80);
        s = await snap();
      }
      const b = s.buttons.find((b) => b.id === id);
      assert(b, `visible ${id}`);
      assert(
        b.x >= 0 && b.y >= 0 && b.x + b.w <= width + 1 && b.y + b.h <= height + 1,
        `${id} fits`,
      );
      if (touch) await p.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
      else await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await p.waitForTimeout(90);
    };
    const loaded = Date.now();
    await p.goto(base);
    await p.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready');
    await p.waitForFunction(() => !document.getElementById('night-startup'));
    const loadMs = Date.now() - loaded;
    await capture('briefing');
    await press('start');
    await capture('battle');
    await press('weapon1');
    let s = await snap();
    if (touch) {
      const cdp = await context.newCDPSession(p);
      const f = s.buttons.find((b) => b.id === 'fire');
      const fp = { id: 2, x: f.x + f.w / 2, y: f.y + f.h / 2 };
      const ap = { id: 1, x: width * 0.53, y: height * 0.47 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ap] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...ap, x: ap.x + 20, y: ap.y - 12 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...ap, x: ap.x + 20, y: ap.y - 12 }, fp],
      });
      await p.waitForTimeout(1000);
      assert((await snap()).fired > s.fired, 'two-finger fire');
      await capture('firing');
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [ap, { ...fp, y: f.y - 12 }],
      });
      const slid = (await snap()).fired;
      await p.waitForTimeout(1000);
      const slideStopped = (await snap()).fired === slid;
      assert(slideStopped, 'sliding outside trigger stops fire');
      {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [ap, fp] });
        await p.waitForTimeout(850);
        assert.equal((await snap()).fired, slid, 'sliding back must not re-arm the trigger');
      }
      report.viewports.push({ width, height, loadMs, slideStopped });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      const stopped = (await snap()).fired;
      await p.waitForTimeout(950);
      assert.equal((await snap()).fired, stopped, 'cancel stops fire');
    } else {
      const enemy = s.units.find((u) => u.kind === 'turret');
      const deadline = Date.now() + 25000;
      await aimAt(p, enemy);
      await p.keyboard.down('Space');
      try {
        while (
          (await snap()).units.find((u) => u.id === enemy.id)?.hp > 0 &&
          Date.now() < deadline
        ) {
          await aimAt(p, enemy);
          await p.waitForTimeout(100);
        }
      } finally {
        await p.keyboard.up('Space');
      }
      assert.equal(
        (await snap()).units.find((u) => u.id === enemy.id)?.hp,
        0,
        'Actual long-range shell impacts destroy the emplacement',
      );
      await capture('firing');
      assert((await snap()).kills > 0);
      assert(
        (await snap()).ui.feedback.includes('已清除'),
        'following miss preserves recent kill confirmation',
      );
      report.viewports.push({ width, height, loadMs });
    }
    await press('pause');
    await capture('pause');
    await press('settings');
    assert((await snap()).pauses.includes('settings'));
    const old = (await snap()).ui;
    await press('sound');
    await press('effects');
    assert.equal((await snap()).ui.muted, !old.muted);
    assert.equal((await snap()).ui.reducedEffects, !old.reducedEffects);
    await press('sound');
    await press('effects');
    assert.equal((await snap()).ui.muted, old.muted);
    assert.equal((await snap()).ui.reducedEffects, old.reducedEffects);
    await press('help');
    await capture('help-basic');
    await press('tab:advanced');
    await capture('help');
    await press('close');
    assert.equal((await snap()).modal, 'settings');
    assert((await snap()).pauses.includes('manual'));
    await press('close');
    assert(!(await snap()).pauses.includes('settings'));
    assert((await snap()).pauses.includes('manual'));
    await press('resume');
    if ((await snap()).ui.feedback !== undefined) {
      const shotCount = (await snap()).fired;
      await press('weapon2');
      assert.equal((await snap()).fired, shotCount, 'weapon UI does not fire through');
    }
    if (touch) {
      await p.setViewportSize({ width: height, height: width });
      await p.waitForTimeout(200);
      assert((await snap()).pauses.includes('orientation'));
      await capture('portrait');
      await p.setViewportSize({ width, height });
      await p.waitForTimeout(200);
      assert(!(await snap()).pauses.includes('orientation'));
    }
    s = await snap();
    Object.assign(report.viewports.at(-1), {
      fps: s.frameRate,
      drawCalls: s.drawCalls,
      triangles: s.triangles,
      transfer: await p.evaluate(() =>
        performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
      ),
    });
    if (width === 568 && round !== 'baseline') {
      await p.waitForFunction(() => __night.snapshot().phase !== 'playing', null, {
        timeout: Math.max(30000, (MISSION.duration - s.time + 30) * 3000),
      });
      const failure = await snap();
      assert.equal(
        failure.phase,
        'failure',
        'Unattended mission does not count as a successful player replay',
      );
      if (failure.failure === 'timeout') {
        assert(
          failure.time >= MISSION.duration,
          'Natural timeout reaches the configured mission duration',
        );
        assert(failure.threatsRemaining > 0, 'Timeout still has unresolved threats');
      } else {
        assert.equal(failure.failure, 'vehicle');
        assert.equal(failure.failureCause, 'enemy');
      }
      assert.equal(failure.rescueDamage.friendly, 0);
      assert(
        Math.abs(
          Object.values(failure.damageByThreat).reduce((sum, damage) => sum + damage, 0) -
            failure.rescueDamage.enemy,
        ) < 1e-8,
        'Fractional resisted damage reconciles with every threat contribution',
      );
      await capture('natural-failure');
      await press('retry');
      const retry = await snap();
      assert.equal(retry.phase, 'playing');
      assert.equal(retry.units[0].hp, retry.units[0].maxHp);
      assert.equal(retry.fired, 0);
      assert.deepEqual(retry.damageByThreat, {});
      report.naturalFailure = {
        time: failure.time,
        failure: failure.failure,
        failureCause: failure.failureCause,
        missionSeconds: MISSION.duration,
        damageByThreat: failure.damageByThreat,
        retry: true,
      };
      await capture('retry');
    }
    await context.close();
    if (p.video()) await p.video().saveAs(`${dir}/touch-844-interaction.webm`);
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.resourcesFailed, []);
  assert.equal(build.sourceHash, await sourceHash(), 'Production source changed during acceptance');
} finally {
  await writeFile(`${dir}/results.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Polish ${round}: four viewports, real input, screenshots and touch video saved`);
