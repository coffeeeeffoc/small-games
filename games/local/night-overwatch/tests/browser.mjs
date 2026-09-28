import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { sourceHash } from '../scripts/artifact.mjs';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [],
  warnings = [],
  report = {};
const base = process.env.NIGHT_URL || 'http://localhost:4318';
const build = await fetch(new URL('build-info.json', base)).then((r) => r.json());
assert.equal(build.sourceHash, await sourceHash(), 'Test the current source build');
report.build = build;
const snapshot = (p) => p.evaluate(() => globalThis.__night.snapshot());
const screenshot = (p, name) =>
  p.screenshot({ path: fileURLToPath(new URL('../reports/' + name + '.png', import.meta.url)) });
async function open(width, height, touch = false) {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: touch ? 2 : 1,
    userAgent: touch
      ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
      : undefined,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      if (m.text().includes('touchcancel event with cancelable=false')) warnings.push(m.text());
      else errors.push(m.text());
    }
  });
  await page.goto(base);
  await page.waitForFunction(
    () =>
      globalThis.__night &&
      globalThis.__night.snapshot().modelImport !== 'loading' &&
      globalThis.__night.snapshot().audio !== 'loading',
  );
  await page.waitForFunction(() => globalThis.__night?.snapshot().buttons.length > 0);
  return page;
}
async function button(p, id, touch = false) {
  const b = (await snapshot(p)).buttons.find((b) => b.id === id);
  assert(b, 'visible button ' + id);
  if (touch) await p.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
  else await p.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await p.waitForTimeout(70);
}
async function aim(p, point) {
  const q = await p.evaluate((p) => __night.screenPoint(p), point);
  await p.mouse.move(q.x, q.y);
  return q;
}
async function desktopWin(p) {
  let down = false,
    chosen = -1;
  const started = Date.now();
  let peakDraws = 0,
    peakEffects = 0;
  while (Date.now() - started < 195000) {
    const s = await snapshot(p);
    peakDraws = Math.max(peakDraws, s.drawCalls);
    peakEffects = Math.max(peakEffects, s.visibleEffects);
    if (s.phase !== 'playing') {
      assert.equal(s.phase, 'success', JSON.stringify(s));
      return { ...s, peakDraws, peakEffects };
    }
    const e = s.units.find((u) => !u.friendly && u.hp > 0);
    if (e) {
      const gun = e.kind === 'heavy' ? 2 : e.kind === 'turret' ? 1 : 0;
      if (chosen !== gun) {
        if (down) await p.mouse.up();
        down = false;
        await p.keyboard.press(String(gun + 1));
        chosen = gun;
      }
      const flight = [0.2, 0.55, 1.05][gun],
        future = s.time - e.born + flight;
      await aim(
        p,
        e.kind === 'light'
          ? {
              x: e.origin.x + Math.sin(future * 0.5) * 5,
              z: e.origin.z + Math.cos(future * 0.5) * 2,
            }
          : e,
      );
      if (gun === 2) {
        if (s.guns[gun].cooldown < 0.05) {
          await p.mouse.down();
          await p.mouse.up();
        }
      } else if (!down) {
        await p.mouse.down();
        down = true;
      }
    } else if (down) {
      await p.mouse.up();
      down = false;
    }
    if (s.convoy === 'holding') await p.keyboard.press('t');
    await p.waitForTimeout(100);
  }
  throw Error('Desktop mission timed out');
}
async function mobileWin(p) {
  const cdp = await p.context().newCDPSession(p);
  const started = Date.now();
  let chosen = -1;
  while (Date.now() - started < 195000) {
    let s = await snapshot(p);
    if (s.phase !== 'playing') {
      assert.equal(s.phase, 'success', JSON.stringify(s));
      return s;
    }
    const e = s.units.find((u) => !u.friendly && u.hp > 0);
    if (e) {
      const gun = e.kind === 'heavy' ? 2 : e.kind === 'turret' ? 1 : 0;
      if (chosen !== gun) {
        await button(p, 'weapon' + gun, true);
        chosen = gun;
        s = await snapshot(p);
      }
      const future = s.time - e.born + [0.2, 0.55, 1.05][gun];
      const target =
        e.kind === 'light'
          ? {
              x: e.origin.x + Math.sin(future * 0.5) * 5,
              z: e.origin.z + Math.cos(future * 0.5) * 2,
            }
          : e;
      const points = await p.evaluate(
        ({ target, current }) => ({
          to: __night.screenPoint(target),
          from: __night.screenPoint(current),
        }),
        { target, current: s.aim },
      );
      const dx = Math.max(-100, Math.min(100, points.to.x - points.from.x)),
        dy = Math.max(-70, Math.min(70, points.to.y - points.from.y));
      const ap = { id: 1, x: 422, y: 170 },
        fire = s.buttons.find((b) => b.id === 'fire'),
        fp = { id: 2, x: fire.x + fire.w / 2, y: fire.y + fire.h / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ap] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...ap, x: ap.x + dx, y: ap.y + dy }],
      });
      if (
        Math.abs(points.to.x - points.from.x) <= 102 &&
        Math.abs(points.to.y - points.from.y) <= 72 &&
        s.guns[gun].cooldown < 0.05
      ) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ ...ap, x: ap.x + dx, y: ap.y + dy }, fp],
        });
        await p.waitForTimeout(gun === 2 ? 70 : 210);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    if (s.convoy === 'holding') await button(p, 'convoy', true);
    await p.waitForTimeout(80);
  }
  throw Error('Touch mission timed out');
}
try {
  if (!process.env.NIGHT_TOUCH_ONLY) {
    const p = await open(1366, 768);
    assert.equal((await snapshot(p)).modelImport, 'loaded');
    assert.equal((await snapshot(p)).audio, 'ready');
    report.initialTransfer = await p.evaluate(() => ({
      bytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
      requests: performance.getEntriesByType('resource').length,
    }));
    await screenshot(p, 'desktop-briefing');
    await button(p, 'start');
    await p.keyboard.press('p');
    await p.waitForTimeout(60);
    await p.keyboard.press('h');
    const before = await snapshot(p);
    console.log('nested pause', before.pauses);
    await p.waitForTimeout(250);
    assert.equal((await snapshot(p)).time, before.time);
    await button(p, 'tab:advanced');
    await p.mouse.move(650, 350);
    await p.mouse.wheel(0, 9000);
    await p.waitForTimeout(100);
    const help = await snapshot(p);
    assert.equal(help.scroll, help.scrollMax);
    assert(help.scrollMax > 0);
    assert(help.buttons.some((b) => b.id === 'fullscreen'));
    await screenshot(p, 'desktop-help-last');
    await button(p, 'close');
    console.log('closed help', (await snapshot(p)).pauses);
    assert((await snapshot(p)).pauses.includes('manual'));
    await p.keyboard.press('p');
    await p.waitForTimeout(60);
    assert.equal((await snapshot(p)).pauses.length, 0);
    await p.keyboard.press('3');
    await aim(p, { x: -38, z: -22 });
    await p.mouse.down();
    await p.waitForTimeout(3400);
    assert.equal((await snapshot(p)).guns[2].ammo, 5);
    await p.mouse.up();
    // Reset via real failure/retry to preserve the six rounds for the win run.
    await aim(p, (await snapshot(p)).units[0]);
    await p.mouse.click(
      (await p.evaluate((p) => __night.screenPoint(p), (await snapshot(p)).units[0])).x,
      (await p.evaluate((p) => __night.screenPoint(p), (await snapshot(p)).units[0])).y,
    );
    await p.waitForTimeout(3200);
    const friendly = (await snapshot(p)).units[0];
    const q = await aim(p, friendly);
    await p.mouse.click(q.x, q.y);
    await p.waitForFunction(() => __night.snapshot().phase === 'failure');
    report.friendlyFailure = {
      phase: (await snapshot(p)).phase,
      friendlyDamage: (await snapshot(p)).friendlyDamage,
    };
    assert((await snapshot(p)).buttons.some((b) => b.id === 'fullscreen'));
    await screenshot(p, 'friendly-fire-failure');
    await button(p, 'retry');
    await p.keyboard.press('t');
    await p.keyboard.press('v');
    await screenshot(p, 'desktop-daylight');
    await p.keyboard.press('v');
    // Zoom preserves the world aim and does not remap in-flight shells.
    const worldAim = (await snapshot(p)).aim;
    await p.keyboard.press('x');
    assert.deepEqual((await snapshot(p)).aim, worldAim);
    await p.keyboard.press('z');
    report.desktopWin = await desktopWin(p);
    await screenshot(p, 'desktop-success');
    console.log('Desktop full mission passed');
    await p.close();
  }
  for (const [w, h] of [
    [667, 375],
    [844, 390],
  ]) {
    const m = await open(w, h, true);
    await button(m, 'start', true);
    await button(m, 'help', true);
    await button(m, 'tab:advanced', true);
    await screenshot(m, `mobile-${w}-help-first`);
    const cdp = await m.context().newCDPSession(m);
    let s = await snapshot(m);
    for (let i = 0; i < 9 && s.scroll < s.scrollMax; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: w / 2, y: h * 0.64 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: w / 2, y: h * 0.34 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await m.waitForTimeout(40);
      s = await snapshot(m);
    }
    assert.equal(s.scroll, s.scrollMax);
    await screenshot(m, `mobile-${w}-help-last`);
    await button(m, 'close', true);
    await button(m, 'weapon0', true);
    s = await snapshot(m);
    const fire = s.buttons.find((b) => b.id === 'fire'),
      fp = { id: 2, x: fire.x + fire.w / 2, y: fire.y + fire.h / 2 };
    const origin = { ...s.aim };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: w * 0.5, y: h * 0.45 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: w * 0.5, y: h * 0.45 }, fp],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: w * 0.55, y: h * 0.4 }, fp],
    });
    await m.waitForTimeout(450);
    s = await snapshot(m);
    assert(s.fired >= 3);
    assert.notDeepEqual(s.aim, origin);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const fired = (await snapshot(m)).fired;
    await m.waitForTimeout(220);
    assert.equal((await snapshot(m)).fired, fired);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fp] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await m.waitForTimeout(90);
    const cancelled = (await snapshot(m)).fired;
    await m.waitForTimeout(220);
    assert.equal((await snapshot(m)).fired, cancelled);
    await button(m, 'pause', true);
    await button(m, 'help', true);
    await m.setViewportSize({ width: h, height: w });
    await m.waitForTimeout(250);
    await button(m, 'close', true);
    s = await snapshot(m);
    assert(s.pauses.includes('manual'));
    assert(s.pauses.includes('orientation'));
    assert(s.buttons.some((b) => b.id === 'fullscreen'));
    await m.setViewportSize({ width: w, height: h });
    await m.waitForTimeout(250);
    assert((await snapshot(m)).pauses.includes('manual'));
    await button(m, 'resume', true);
    await screenshot(m, `mobile-${w}-battle`);
    report['mobile' + w] = { multitouch: true, cancel: true, orientation: true };
    if (w === 844) {
      await m.reload();
      await m.waitForFunction(() =>
        globalThis.__night?.snapshot().buttons.some((b) => b.id === 'start'),
      );
      await button(m, 'start', true);
      await button(m, 'convoy', true);
      report.mobileWin = await mobileWin(m);
      await screenshot(m, 'mobile-success');
      console.log('Touch-only full mission passed');
    }
    await m.close();
  }
  assert.deepEqual(errors, []);
  report.errors = errors;
  report.warnings = warnings;
  await writeFile(
    new URL('../reports/browser-results.json', import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log('Browser checks passed');
} finally {
  await browser.close();
  if (errors.length) console.error(errors);
}
