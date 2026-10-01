import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { acceptanceBuild, evidenceDirectory, snapshot, press, assertLayout, navigateMap, aimAt, waitForImpact } from './flight-browser.mjs';

// Owner-supplied URL/hash are mandatory. This suite never builds or changes production files.
const base = process.env.NIGHT_URL;
const build = await acceptanceBuild(base);
process.env.NIGHT_REPORT_DIR ||= fileURLToPath(new URL('../reports/interaction-overhaul/', import.meta.url));
const dir = evidenceDirectory('review');
await mkdir(dir, { recursive: true });
const report = {
  build, base, started: new Date().toISOString(), status: 'running',
  environment: 'Isolated desktop Chromium; Playwright mouse and CDP emulated touch, NOT physical devices',
  productionMutations: false, checks: [], errors: [],
};
const browser = await chromium.launch({
  headless: process.env.NIGHT_HEADED !== '1',
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
console.log(`Review evidence: ${dir}`);
try {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) {
    if (process.env.NIGHT_REVIEW_WIDTH && width !== Number(process.env.NIGHT_REVIEW_WIDTH)) continue;
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const cdp = touch ? await context.newCDPSession(page) : undefined;
    page.on('pageerror', (e) => report.errors.push({ width, message: e.message }));
    page.on('requestfailed', (r) => report.errors.push({ width, url: r.url(), message: r.failure()?.errorText }));
    page.on('response', (r) => { if (r.status() >= 400) report.errors.push({ width, url: r.url(), status: r.status() }); });
    let current;
    const save = () => writeFile(path.join(dir, 'results.json'), JSON.stringify(report, null, 2));
    const capture = async (name) => {
      const prefix = `${width}-${current.name}-${name}`;
      await page.screenshot({ path: path.join(dir, `${prefix}.png`) });
      await writeFile(path.join(dir, `${prefix}.json`), JSON.stringify(await snapshot(page), null, 2));
      current.evidence.push(`${prefix}.png`);
    };
    const hit = async (id) => {
      current.steps.push({ action: 'press', id, button: (await snapshot(page)).buttons.find((b) => b.id === id) });
      await press(page, id, touch, false);
      assertLayout(await snapshot(page), width, height);
    };
    const point = async (id, finger = 1) => {
      const b = (await snapshot(page)).buttons.find((b) => b.id === id);
      assert(b, `Visible button ${id}`);
      return { id: finger, x: b.x + b.w / 2, y: b.y + b.h / 2 };
    };
    const touchEvent = async (type, touchPoints) => {
      current.steps.push({ action: type, touchPoints });
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      await page.waitForTimeout(35);
    };
    const noFire = (before, after) => {
      assert.equal(after.fired, before.fired, 'No unintended shot');
      assert.deepEqual(after.guns.map((g) => g.ammo), before.guns.map((g) => g.ammo), 'No unintended ammunition consumption');
      assert.deepEqual(after.held, [], 'No stuck fire input');
    };
    const frozen = async () => {
      const before = await snapshot(page);
      await page.waitForTimeout(250);
      const after = await snapshot(page);
      for (const key of ['time', 'aircraft', 'shots', 'shotPositions', 'fired']) assert.deepEqual(after[key], before[key], `Pause freezes ${key}`);
    };
    const fullscreen = async () => {
      const before = await snapshot(page);
      await hit('fullscreen');
      await page.waitForFunction(() => !!document.fullscreenElement);
      await capture(`fullscreen-${current.evidence.length}`);
      await hit('fullscreen');
      await page.waitForFunction(() => !document.fullscreenElement);
      const after = await snapshot(page);
      assert.deepEqual(after.pauses, before.pauses, 'Fullscreen preserves pause stack');
      if (before.pauses.length) assert.equal(after.time, before.time, 'Fullscreen never advances paused mission');
      noFire(before, after);
    };
    const run = async (name, check, playing = true) => {
      if (process.env.NIGHT_REVIEW_CASE && !name.includes(process.env.NIGHT_REVIEW_CASE)) return;
      current = { width, height, touch, name, status: 'running', steps: [], evidence: [] };
      report.checks.push(current);
      try {
        await page.goto(base);
        await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && __night.snapshot().buttons.some((b) => b.id === 'start'));
        await page.waitForFunction(() => {
          const startup = document.querySelector('#night-startup');
          return !startup || startup.hidden || getComputedStyle(startup).display === 'none' || getComputedStyle(startup).visibility === 'hidden';
        });
        if (playing) await hit('start');
        await check();
        current.status = 'passed';
      } catch (e) {
        current.status = 'failed';
        current.failure = e.stack;
        await capture('failure').catch(() => {});
      }
      await save();
      console.log(`${width} ${name}: ${current.status}`);
      if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
      await page.mouse.up().catch(() => {});
    };

    await run('briefing-globals', async () => {
      await capture('briefing');
      await fullscreen();
      await hit('settings');
      assert.equal((await snapshot(page)).modal, 'settings');
      await hit('help');
      await capture('briefing-help');
      await hit('close');
      assert.equal((await snapshot(page)).modal, 'settings');
      await hit('close');
      assert.equal((await snapshot(page)).modal, 'briefing');
      await hit('start');
      assert.equal((await snapshot(page)).phase, 'playing');
    }, false);

    await run('pause-settings-help', async () => {
      const before = await snapshot(page);
      await hit('pause');
      await frozen();
      await capture('pause');
      assert.deepEqual((await snapshot(page)).buttons.map((b) => b.id).sort(), ['fullscreen', 'resume', 'settings']);
      await hit('settings');
      await capture('settings');
      for (const [id, key] of [['sound', 'muted'], ['effects', 'reducedEffects']]) {
        const value = (await snapshot(page)).ui[key];
        await hit(id);
        assert.equal((await snapshot(page)).ui[key], !value);
        await hit(id);
      }
      await hit('language');
      await capture('settings-en');
      await hit('language');
      await hit('help');
      await capture('help');
      await fullscreen();
      await hit('tab:advanced');
      if (touch) {
        await touchEvent('touchStart', [{ id: 1, x: width / 2, y: height * 0.62 }]);
        await touchEvent('touchMove', [{ id: 1, x: width / 2, y: height * 0.45 }]);
        await touchEvent('touchEnd', []);
      } else {
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(100);
      }
      const help = await snapshot(page);
      assert(help.scrollMax === 0 || help.scroll > 0, 'Help scroll uses real input');
      await capture('help-scrolled');
      await hit('close');
      assert.equal((await snapshot(page)).modal, 'settings');
      await hit('close');
      assert.equal((await snapshot(page)).modal, 'pause');
      await fullscreen();
      if (touch) await page.touchscreen.tap(4, height / 2);
      else await page.mouse.click(4, height / 2);
      assert.equal((await snapshot(page)).modal, 'pause', 'Outside tap cannot dismiss pause');
      await hit('resume');
      await page.waitForTimeout(200);
      noFire(before, await snapshot(page));
      assert((await snapshot(page)).time > before.time, 'Resume advances mission');
    });

    await run('live-fullscreen-and-drawer', async () => {
      const before = await snapshot(page);
      await fullscreen();
      await capture('battle');
      await hit('flightControls');
      await capture('drawer');
      await hit('zoomIn');
      await hit('zoomOut');
      await hit('flightControls');
      noFire(before, await snapshot(page));
    });

    await run('fire-cancellation', async () => {
      await navigateMap(page, { x: 0, z: -60 }, touch);
      const f = await point('fire', 2), away = { id: 2, x: width / 2, y: height * 0.55 };
      const before = await snapshot(page);
      if (touch) await touchEvent('touchStart', [f]);
      else { await page.mouse.move(f.x, f.y); await page.mouse.down(); }
      await page.waitForTimeout(350);
      assert((await snapshot(page)).fired > before.fired, 'Actual automatic fire');
      if (touch) await touchEvent('touchMove', [away]);
      else await page.mouse.move(away.x, away.y);
      const off = await snapshot(page);
      await page.waitForTimeout(250);
      if (touch) await touchEvent('touchMove', [f]);
      else await page.mouse.move(f.x, f.y);
      await page.waitForTimeout(250);
      noFire(off, await snapshot(page));
      if (touch) await touchEvent('touchCancel', []);
      else await page.mouse.up();
      await hit('settings');
      await frozen();
      await hit('close');
      const resumed = await snapshot(page);
      await page.waitForTimeout(200);
      noFire(resumed, await snapshot(page));
      await capture('clean-resume');
    });

    await run('pinch-or-wheel', async () => {
      await navigateMap(page, { x: 0, z: -60 }, touch);
      const before = await snapshot(page);
      if (touch) {
        const a = { id: 1, x: width * 0.43, y: height * 0.56 }, b = { id: 2, x: width * 0.57, y: height * 0.56 };
        await touchEvent('touchStart', [a]);
        await touchEvent('touchStart', [a, b]);
        const wide = [{ ...a, x: a.x - 35 }, { ...b, x: b.x + 35 }];
        await touchEvent('touchMove', wide);
        assert((await snapshot(page)).zoom > before.zoom, 'Spread zooms in');
        await capture('pinch-expanded');
        await touchEvent('touchMove', [a, b]);
        assert(Math.abs((await snapshot(page)).zoom - before.zoom) < 0.03, 'Pinch reverses zoom');
        await touchEvent('touchEnd', [a]);
        await capture('remaining-finger-before');
        const observeAim = () => page.evaluate(() => {
          const s = __night.snapshot();
          return { aim: s.aim, aimScreen: __night.screenPoint(s.aim), zoom: s.zoom, fired: s.fired, held: s.held };
        });
        const remaining = await observeAim();
        await touchEvent('touchMove', [{ ...a, x: a.x + 60 }]);
        const moved = await observeAim();
        // World.update keeps the cursor screen-stable as the aircraft moves; world coordinates drift.
        const drift = Math.hypot(moved.aimScreen.x - remaining.aimScreen.x, moved.aimScreen.y - remaining.aimScreen.y);
        current.steps.push({ action: 'remaining-finger-screen-drift', fingerTravelCSS: 60, pixels: drift, before: remaining, after: moved });
        await capture('remaining-finger-after-60px');
        assert(drift < 1, 'Remaining finger cannot become an unexpected aim drag (one CSS pixel tolerance)');
        assert.equal(moved.zoom, remaining.zoom, 'Remaining finger cannot keep zooming');
        await touchEvent('touchCancel', []);
        await page.waitForTimeout(200);
        await capture('cancelled-no-fire');
      } else {
        await page.mouse.move(width * 0.53, height * 0.5);
        await page.mouse.wheel(0, -180);
        await page.waitForTimeout(150);
        const zoomed = await snapshot(page);
        assert(zoomed.zoom > before.zoom, 'Wheel up zooms in');
        await capture('wheel-expanded');
        await page.mouse.wheel(0, 180);
        await page.waitForTimeout(150);
        assert((await snapshot(page)).zoom < zoomed.zoom, 'Wheel down zooms out');
        const settings = await point('settings');
        await page.mouse.move(settings.x, settings.y);
        const hud = await snapshot(page);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(100);
        assert.equal((await snapshot(page)).zoom, hud.zoom, 'Wheel over HUD does not zoom battlefield');
      }
      const after = await snapshot(page);
      noFire(before, after);
      assert.equal(after.selected, before.selected, 'Zoom does not switch weapons');
    });

    await run('markers-and-dust', async () => {
      await page.waitForFunction(() => __night.snapshot().units.some((u) => !u.friendly && u.hp > 0 && u.kind === 'turret'));
      const enemy = (await snapshot(page)).units.find((u) => !u.friendly && u.hp > 0 && u.kind === 'turret');
      await navigateMap(page, enemy, touch);
      await hit('flightControls');
      for (let i = 0; i < 4; i++) await hit('zoomIn');
      await hit('flightControls');
      await aimAt(page, enemy, touch, cdp);
      await capture((await snapshot(page)).thermal ? 'enemy-thermal' : 'enemy-day');
      await hit('flightControls');
      await hit('sensor');
      await aimAt(page, enemy, touch, cdp);
      await capture((await snapshot(page)).thermal ? 'enemy-thermal' : 'enemy-day');
      await hit('weapon2');
      for (let i = 0; i < 4; i++) {
        const target = (await snapshot(page)).units.find((u) => u.id === enemy.id);
        if (target.hp <= 0) break;
        await page.waitForFunction(() => __night.snapshot().guns[2].cooldown < 0.001);
        await aimAt(page, target, touch, cdp);
        const fired = (await snapshot(page)).fired;
        await hit('fire');
        const s = await snapshot(page);
        assert.equal(s.fired, fired + 1, 'Heavy input launches one shell');
        const impact = await waitForImpact(page, s.shots.at(-1));
        current.steps.push({ action: 'impact', impact });
        await page.waitForTimeout(250);
        await capture(`impact-${i}`);
        await page.waitForTimeout(1000);
        await capture(`dust-${i}`);
      }
      await page.waitForTimeout(2200);
      await capture('persistent-dust');
      current.visualReviewRequired = true;
      current.smoke = (await snapshot(page)).effects.smoke;
      const friend = (await snapshot(page)).units.find((u) => u.friendly && u.hp > 0 && u.routeOffset === undefined);
      await navigateMap(page, friend, touch);
      await aimAt(page, friend, touch, cdp);
      assert((await snapshot(page)).friendlyRisk, 'Friendly warning follows actual aim');
      await capture('friendly-focus');
    });

    await run('focused-target-label', async () => {
      const enemy = (await snapshot(page)).units.find((u) => !u.friendly && u.hp > 0 && u.kind === 'turret');
      assert(enemy);
      await navigateMap(page, enemy, touch);
      await hit('flightControls');
      for (let i = 0; i < 4; i++) await hit('zoomIn');
      await hit('flightControls');
      await aimAt(page, enemy, touch, cdp);
      await capture('wave-banner-active');
      const early = await snapshot(page);
      await page.waitForFunction(() => !__night.snapshot().ui.notice);
      await aimAt(page, enemy, touch, cdp);
      await capture('wave-banner-cleared');
      current.steps.push({ action: 'focus-label-comparison', target: enemy.id, early: early.unitLabels, later: (await snapshot(page)).unitLabels });
      assert(early.unitLabels.some((l) => l.id === enemy.id && l.active), 'A centered aimed enemy remains identified while the wave notice is shown');
    });

    await run('friendly-warning-overlap', async () => {
      const friend = (await snapshot(page)).units.find((u) => u.friendly && u.hp > 0 && u.routeOffset === undefined);
      await navigateMap(page, friend, touch);
      await hit('weapon2');
      await aimAt(page, friend, touch, cdp);
      current.steps.push({ action: 'reticle-position', point: await page.evaluate(() => __night.screenPoint(__night.snapshot().aim)) });
      await capture('centered-friendly-day');
      await hit('flightControls');
      await hit('sensor');
      await aimAt(page, friend, touch, cdp);
      await capture('centered-friendly-thermal');
      current.visualReviewRequired = true;
    });

    if (!touch) await run('right-click-controls', async () => {
      const b = await point('weapon2');
      await page.mouse.click(b.x, b.y, { button: 'right' });
      await capture('right-click-weapon');
      current.steps.push({ action: 'right-click', button: 'weapon2', x: b.x, y: b.y, selected: (await snapshot(page)).selected });
      assert.equal((await snapshot(page)).selected, 0, 'Temporary-focus mouse button does not activate HUD weapon selection');
    });

    await run('wide-field-markers', async () => {
      const measure = () => page.evaluate(() => {
        const s = __night.snapshot();
        const units = s.units.filter((u) => u.hp > 0).map((u) => ({ id: u.id, group: u.group, friendly: u.friendly, kind: u.kind, screen: __night.screenPoint(u) }));
        const closePairs = [];
        for (let i = 0; i < units.length; i++) for (const b of units.slice(i + 1)) {
          const a = units[i], dx = Math.abs(a.screen.x - b.screen.x), dy = Math.abs(a.screen.y - b.screen.y);
          if (a.screen.x < 0 || a.screen.x > innerWidth || a.screen.y < 58 || a.screen.y > innerHeight - 74 || b.screen.x < 0 || b.screen.x > innerWidth || b.screen.y < 58 || b.screen.y > innerHeight - 74) continue;
          if (dx < 16 && dy < 16) closePairs.push({ a: a.id, b: b.id, team: a.friendly === b.friendly ? a.friendly ? 'friendly' : 'enemy' : 'mixed', dx, dy });
        }
        return { zoom: s.zoom, units, closePairs };
      });
      await capture('wide');
      current.steps.push({ action: 'projected-unit-spacing', measurement: await measure() });
      await hit('flightControls');
      for (let i = 0; i < 4; i++) await hit('zoomIn');
      await hit('flightControls');
      await capture('zoomed');
      current.steps.push({ action: 'projected-unit-spacing-zoomed', measurement: await measure() });
      current.visualReviewRequired = true;
    });

    await run('friendly-group-focus', async () => {
      const initial = await snapshot(page);
      const count = initial.unitLabels.find((l) => l.active && /^×[2-9]/.test(l.text));
      assert(count, 'A distant friendly formation has a visible count label');
      const friend = initial.units.find((u) => u.id === count.id);
      assert(friend?.friendly, 'Count label belongs to a friendly formation');
      const memberIds = initial.units.filter((u) => u.friendly && u.group === friend.group && u.hp > 0).map((u) => u.id);
      current.steps.push({ action: 'choose-visible-friendly-group', group: friend.group, memberIds, label: count });
      await capture('distant-group-count');
      await aimAt(page, friend, touch, cdp);
      await capture('focused-group-expanded');
      const focused = await snapshot(page);
      const focusGeometry = await page.evaluate((ids) => {
        const s = __night.snapshot(), aim = __night.screenPoint(s.aim);
        return { aim, members: s.units.filter((u) => ids.includes(u.id)).map((u) => {
          const p = __night.screenPoint(u);
          return { id: u.id, point: p, distanceCSS: Math.hypot(p.x - aim.x, p.y - aim.y) };
        }) };
      }, memberIds);
      current.steps.push({ action: 'focus-group-labels', labels: focused.unitLabels.filter((l) => memberIds.includes(l.id)), aimedUnit: focused.aimedUnit, focusGeometry });
      assert(Math.min(...focusGeometry.members.map((u) => u.distanceCSS)) < 4, 'Real touch aim reaches the visual focus area of the previously grouped formation');
      assert(focused.unitLabels.some((l) => memberIds.includes(l.id) && l.active && /护卫|救援车|ESCORT|RESCUE/.test(l.text)), 'Focused formation expands to an identified individual');
      assert(!focused.unitLabels.some((l) => memberIds.includes(l.id) && l.active && /^×/.test(l.text)), 'Focused group count does not remain over its expanded members');
      noFire(initial, focused);
      current.visualReviewRequired = true;
    });
    await context.tracing.stop({ path: path.join(dir, `${width}-trace.zip`) });
    await context.close();
  }
  await acceptanceBuild(base);
  assert(report.checks.length, 'At least one scenario selected');
  report.status = report.checks.some((c) => c.status !== 'passed') || report.errors.length ? 'failed' : 'browser-checks-passed-visual-review-pending';
} catch (e) {
  report.status = 'invalid-or-incomplete';
  report.failure = e.stack;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(path.join(dir, 'results.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`${report.status}: ${dir}`);
if (report.status !== 'browser-checks-passed-visual-review-pending') process.exitCode = 1;
