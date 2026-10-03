import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
const url = process.env.URBAN_URL || 'http://127.0.0.1:4330';
const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = async (page, name) => page.screenshot({ path: `${out}/${name}.png` });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.urbanSnapshot);
  await shot(page, 'desktop-start');
  await page.locator('#start').click();
  await page.waitForFunction(() => window.urbanSnapshot().tick >= 20);
  const before = await page.evaluate(() => window.urbanSnapshot());
  await page.keyboard.down('d');
  await sleep(520);
  await page.keyboard.up('d');
  assert.ok((await page.evaluate(() => window.urbanSnapshot().x)) > before.x + 1.5);
  await page.locator('#pause').click();
  const paused = await page.evaluate(() => window.urbanSnapshot());
  await sleep(300);
  assert.equal(await page.evaluate(() => window.urbanSnapshot().tick), paused.tick);
  await page.getByRole('button', { name: '切换全屏', exact: true }).click();
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
  await page.getByRole('button', { name: '切换全屏', exact: true }).click();
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
  await page.locator('#resume').click();
  await page.keyboard.down('a');
  await page.waitForFunction(() => window.urbanSnapshot().x <= -3.3);
  await page.keyboard.up('a');
  await page.waitForFunction(() => window.urbanSnapshot().tick >= 250);
  const focus = await page.evaluate(() => window.urbanSnapshot());
  assert.equal(focus.focus, 'safe-weapon', JSON.stringify(focus));
  assert.ok(focus.stats.supplyDamage > 0);
  await shot(page, 'desktop-supply');
  results.push({ check: 'keyboard, pause, real supply focus', passed: true, state: focus });
  if (!process.argv.includes('--quick')) {
    // Native key input against the actual running game. No direct state writes or fast-forward.
    let held = '',
      capturedBoss = false,
      usedSkill = false;
    const deadline = Date.now() + 130000;
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => window.urbanSnapshot());
      if (s.phase !== 'playing') break;
      let target = 0;
      if (
        (s.tick >= 180 && s.tick < 425) ||
        (s.tick >= 1080 && s.tick < 1340) ||
        (s.tick >= 2310 && s.tick < 2540)
      )
        target = -3.5;
      if (s.tick >= 1680 && s.tick < 1800) target = 3.5;
      if (s.bossWarning) target = s.bossWarning.x >= 0 ? -3 : 3;
      if (!usedSkill && s.tick > 820) {
        await page.keyboard.press('Space');
        usedSkill = true;
      }
      const next = s.x < target - 0.2 ? 'd' : s.x > target + 0.2 ? 'a' : '';
      if (next !== held) {
        if (held) await page.keyboard.up(held);
        if (next) await page.keyboard.down(next);
        held = next;
      }
      if (!capturedBoss && s.tick > 2200) {
        await shot(page, 'desktop-boss');
        capturedBoss = true;
      }
      await sleep(100);
    }
    if (held) await page.keyboard.up(held);
    const end = await page.evaluate(() => window.urbanSnapshot());
    assert.notEqual(end.phase, 'playing', '90-second battle must settle');
    await shot(page, 'desktop-result');
    results.push({ check: 'actual full battle and settlement', passed: true, state: end });
    await page.locator('#retry').click();
    assert.ok((await page.evaluate(() => window.urbanSnapshot())).tick < 30);
    assert.equal((await page.evaluate(() => window.urbanSnapshot())).activeLoops, 1);
    const restartTick = await page.evaluate(() => window.urbanSnapshot().tick);
    await sleep(1100);
    const elapsed = (await page.evaluate(() => window.urbanSnapshot().tick)) - restartTick;
    assert.ok(elapsed >= 29 && elapsed <= 40, `one loop, real clock: ${elapsed} ticks`);
    await page.reload();
    await page.getByRole('button', { name: '本机战绩', exact: true }).click();
    assert.ok(
      (await page.locator('.record-list>div').count()) > 0,
      'practice history survives reload',
    );
  }
  await context.close();
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const mobile = await browser.newContext({
      viewport: size,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
      locale: 'zh-CN',
    });
    const p = await mobile.newPage();
    p.on('pageerror', (error) => errors.push(error.message));
    await p.goto(url);
    await p.locator('#start').tap();
    const cdp = await mobile.newCDPSession(p),
      bounds = await p.locator('#control-zone').boundingBox();
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height * 0.28;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - bounds.width * 0.28, y }],
    });
    await sleep(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = await p.evaluate(() => window.urbanSnapshot());
    assert.ok(moved.x < -2.5);
    await p.locator('#skill').tap();
    assert.equal(
      (await p.evaluate(() => window.urbanSnapshot())).x,
      moved.x,
      'skill button must not drag squad',
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await p.locator('#control-zone').getAttribute('data-dragging'), 'false');
    await p.locator('#pause').tap();
    await p.getByRole('button', { name: '重新开始', exact: true }).tap();
    const restarted = await p.evaluate(() => window.urbanSnapshot());
    assert.ok(restarted.tick < 30);
    assert.equal(restarted.activeLoops, 1);
    await mobile.setOffline(true);
    const offlineStart = await p.evaluate(() => window.urbanSnapshot().tick);
    await sleep(400);
    assert.ok(
      (await p.evaluate(() => window.urbanSnapshot().tick)) > offlineStart,
      'loaded practice runs offline',
    );
    await mobile.setOffline(false);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
    );
    await p.waitForFunction(() => window.urbanSnapshot().tick > 90);
    await shot(p, `mobile-${size.width}x${size.height}`);
    results.push({
      check: `touch, cancellation, UI isolation, restart ${size.width}x${size.height}`,
      passed: true,
      state: await p.evaluate(() => window.urbanSnapshot()),
    });
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        errors,
        results: results.map((r) => ({
          check: r.check,
          tick: r.state.tick,
          phase: r.state.phase,
          render: r.state.render,
        })),
      },
      null,
      2,
    ),
  );
  await writeFile(
    `${out}/${process.argv.includes('--quick') ? 'browser-quick' : 'browser'}.json`,
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        environment: {
          os: process.platform,
          arch: process.arch,
          cpu: cpus()[0]?.model,
          node: process.version,
          url,
        },
        errors,
        results,
        limits:
          'Desktop headless Chromium, mobile viewport emulation. Not native phone or multiplayer acceptance.',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
