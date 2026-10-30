import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import {
  ashfallInput,
  assertAshfallGameplay,
  snapshot,
} from '../../../../apps/shell-web/scripts/game-checks/ashfall-front.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const url = process.env.ASHFALL_TEST_URL || 'http://127.0.0.1:4469';
const output = new URL('../../../../outputs/ashfall-front/combat-expansion/', import.meta.url);
await mkdir(output, { recursive: true });
await mkdir(new URL('../publishing/gameplay/screenshots/', import.meta.url), { recursive: true });
const server = process.env.ASHFALL_TEST_URL
  ? null
  : spawn(process.execPath, ['scripts/serve.mjs', '--port', '4469'], {
      cwd: root,
      stdio: 'ignore',
    });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
const report = {
  creator: '3.8.8',
  checks: [],
  errors: [],
  screenshots: [],
  transitions: [],
  limitations: [
    'Desktop Chromium with emulated touch, not a physical phone or TapTap inventory.',
    'Only explicit development fixtures change battle state; timing samples are separate pure-input rule tests.',
  ],
};
const observe = async (page, stage) => {
  const sample = await page.evaluate(() => ({
    timeOrigin: performance.timeOrigin,
    pageTime: performance.now(),
    state: window.Ashfall?.snapshot(),
  }));
  const { state, ...clock } = sample;
  report.transitions.push({
    stage,
    ...clock,
    screen: state?.screen,
    phase: state?.run?.phase,
    time: state?.run?.time,
    rank: state?.run?.rank,
    hp: state?.run?.player?.hp,
    levelIndex: state?.run?.levelIndex,
    choices: state?.run?.choices,
    controls: state?.controls,
  });
  return state;
};
const capture = async (page, name) => {
  await observe(page, name + ':before-screenshot');
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) });
  await observe(page, name + ':after-screenshot');
  report.screenshots.push(name + '.png');
};
const pausePlaying = async (page, input, name) => {
  try {
    let state = await observe(page, name + ':before-pause');
    const seen = new Set();
    while (state?.screen === 'upgrade') {
      const choice = JSON.stringify([state.run.levelIndex, state.run.rank, state.run.choices]);
      assert.ok(!seen.has(choice), 'upgrade UI must make progress before pausing');
      seen.add(choice);
      assert.ok(seen.size <= 16, 'unexpected sequence of upgrades before pausing');
      const free = state.controls.find(
        (c) =>
          !c.disabled &&
          (c.id === 'continue' || (c.id.startsWith('upgrade-') && c.id !== 'upgrade-overdrive')),
      );
      assert.ok(free, 'upgrade must offer an enabled free choice');
      await input.tap(free.id);
      await expect
        .poll(
          async () => {
            const next = await snapshot(page);
            return (
              next.screen !== 'upgrade' ||
              JSON.stringify([next.run.levelIndex, next.run.rank, next.run.choices]) !== choice
            );
          },
          { message: 'real upgrade choice advances the UI' },
        )
        .toBe(true);
      state = await observe(page, name + ':after-upgrade');
    }
    assert.equal(state?.screen, 'playing', 'pause requires a live playing screen');
    assert.ok(
      state.controls.some((c) => c.id === 'pause' && !c.disabled),
      'pause is enabled',
    );
    await input.tap('pause');
    await expect.poll(async () => (await snapshot(page)).screen).toBe('paused');
    await observe(page, name + ':paused');
  } catch (error) {
    try {
      await capture(page, name + '-failure');
    } catch (diagnosticError) {
      report.errors.push('Failure evidence: ' + String(diagnosticError));
    }
    throw error;
  }
};
try {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(url)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
  for (const [width, height] of [
    [844, 390],
    [390, 844],
    [568, 320],
    [932, 430],
    [1024, 390],
    [1280, 720],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      ...(width === 844
        ? {
            recordVideo: {
              dir: root + '../../../outputs/ashfall-front/video',
              size: { width, height },
            },
          }
        : {}),
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(url + '/?dev=1');
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
    const input = await ashfallInput(page, true);
    async function bounds() {
      const s = await snapshot(page);
      for (const b of s.controls) {
        assert.ok(b.w >= 43.5 && b.h >= 43.5, `${width} ${b.id}: touch target ${b.w}x${b.h}`);
        assert.ok(
          b.x >= -1 && b.y >= -1 && b.x + b.w <= width + 1 && b.y + b.h <= height + 1,
          `${width} ${b.id}: clipped`,
        );
      }
    }
    await bounds();
    await capture(page, `home-${width}x${height}`);
    await input.tap('levels');
    await expect.poll(async () => (await snapshot(page)).screen).toBe('levels');
    await bounds();
    await capture(page, `levels-${width}x${height}`);
    await input.tap('next');
    await input.tap('prev');
    await input.tap('home');
    await assertAshfallGameplay(page, true);
    await input.tap('start');
    await bounds();
    const layout = await snapshot(page);
    const movement = layout.controls.filter((b) => b.id === 'move');
    for (const b of movement) {
      assert.ok(
        layout.rotated ? b.y + b.h < height / 2 : b.x + b.w < width / 2,
        `${b.id} stays in the left-hand half of the logical landscape`,
      );
    }
    for (const id of ['fire', 'jump', 'dash']) {
      const b = layout.controls.find((b) => b.id === id);
      assert.ok(layout.rotated ? b.y > height / 2 : b.x > width / 2, id + ' in right-hand half');
    }
    for (const [index, a] of layout.controls.entries())
      for (const b of layout.controls.slice(index + 1))
        assert.ok(
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
          `combat controls overlap: ${a.id}/${b.id}`,
        );
    const cdp = await context.newCDPSession(page);
    try {
      const left = { ...(await input.point('left')), id: 1 },
        jump = { ...(await input.point('jump')), id: 3 },
        dash = { ...(await input.point('dash')), id: 3 },
        shooting = { ...(await input.point('fire')), id: 2 };
      const send = (type, points) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      const leftAim = {
        ...shooting,
        x: shooting.x + (layout.rotated ? 0 : -28),
        y: shooting.y + (layout.rotated ? -28 : 0),
      };
      // Stay on the spawn side of the forward guards while testing controls.
      // Moving right can overtake them and make backward fire trigger XP choices
      // on a slow renderer. Rightward travel and combat are exercised separately.
      // Queue the drag immediately: a delayed press ACK must not hold centre fire.
      await Promise.all([
        page.waitForFunction(
          () => {
            const { player, shots } = globalThis.Ashfall.snapshot().run;
            return player.x < 420 && player.y < 560 && shots > 0;
          },
          undefined,
          { timeout: 5000 },
        ),
        send('touchStart', [left, shooting, jump]),
        send('touchMove', [left, leftAim, jump]),
      ]);
      // CDP touchEnd requires an empty list; start a new complete gesture.
      await send('touchEnd', []);
      await Promise.all([
        // Observe the transient in the page, before a slow protocol ACK can
        // outlast the cooldown. The threshold still proves a real dash began.
        page.waitForFunction(
          () => globalThis.Ashfall.snapshot().run.player.dashCooldown > 0.3,
          undefined,
          { timeout: 5000 },
        ),
        send('touchStart', [left, shooting, dash]),
        send('touchMove', [left, leftAim, dash]),
      ]);
      const logicalAim = { x: -28, y: -28 };
      const aimed = {
        ...shooting,
        x: shooting.x + (layout.rotated ? -logicalAim.y : logicalAim.x),
        y: shooting.y + (layout.rotated ? logicalAim.x : logicalAim.y),
      };
      const centre = { ...(await input.point('move')), id: 1 };
      await send('touchMove', [centre, aimed, dash]);
      // Dash owns velocity until the simulation completes it. A fixed wall-clock
      // sleep can expire before that happens on a loaded Creator/CI renderer.
      await expect
        .poll(
          async () => {
            const state = await snapshot(page);
            assert.equal(
              state.screen,
              'playing',
              `${width}x${height}: centering interrupted: ${JSON.stringify(state.run)}`,
            );
            return Math.abs(state.run.player.vx);
          },
          {
            timeout: 5000,
            message: 'centering the stick stops movement after the active dash',
          },
        )
        .toBeLessThan(1);
      assert.ok(
        Math.abs((await snapshot(page)).run.player.aimAngle + Math.PI * 0.75) < 0.05,
        'upper-left diagonal aim follows logical landscape',
      );
      await send('touchCancel', []);
      await page.waitForTimeout(220);
      const released = (await snapshot(page)).run.shots;
      await page.waitForTimeout(220);
      assert.equal((await snapshot(page)).run.shots, released, 'cancel releases both sticks');
    } finally {
      await cdp.detach();
    }
    await pausePlaying(page, input, `multitouch-${width}x${height}`);
    await input.tap('restart');
    await input.tap('confirm');
    for (let i = 0; i < 3; i++) {
      const tapShots = (await snapshot(page)).run.shots;
      await input.tap('fire');
      await expect.poll(async () => (await snapshot(page)).run.shots).toBeGreaterThan(tapShots);
      await page.waitForTimeout(180);
      assert.equal(
        (await snapshot(page)).run.shots,
        tapShots + 1,
        'one quick tap produces exactly one shot',
      );
    }
    const before = await snapshot(page);
    await input.press(['right', 'fire', 'jump']);
    await page.waitForTimeout(350);
    const during = await snapshot(page);
    assert.ok(
      during.run.player.x > before.run.player.x &&
        during.run.shots > before.run.shots &&
        during.run.player.y < 570,
      'native simultaneous movement, fire and jump',
    );
    await input.release(true);
    const shots = (await snapshot(page)).run.shots;
    await page.waitForTimeout(220);
    assert.equal((await snapshot(page)).run.shots, shots, 'cancel releases fire');
    // Projectiles keep advancing while the screenshot is awaited.
    await capture(page, `combat-${width}x${height}`);
    await pausePlaying(page, input, `combat-${width}x${height}`);
    await bounds();
    await capture(page, `pause-${width}x${height}`);
    assert.ok(
      !(await snapshot(page)).controls.some((b) =>
        ['pause', 'supply', 'sound', 'motion'].includes(b.id),
      ),
      'pause only exposes available actions',
    );
    const buttons = (await snapshot(page)).controls.filter((b) => b.id !== 'pause');
    for (let a = 0; a < buttons.length; a++)
      for (let b = a + 1; b < buttons.length; b++) {
        const x = buttons[a],
          y = buttons[b];
        assert.ok(
          x.x + x.w <= y.x + 0.5 ||
            y.x + y.w <= x.x + 0.5 ||
            x.y + x.h <= y.y + 0.5 ||
            y.y + y.h <= x.y + 0.5,
          `overlapping pause controls ${x.id}/${y.id}`,
        );
      }
    await input.tap('settings');
    await bounds();
    const settings = await snapshot(page);
    await input.tap('sound');
    assert.equal((await snapshot(page)).progress.sound, !settings.progress.sound);
    await input.tap('motion');
    assert.equal((await snapshot(page)).progress.reducedMotion, false);
    await capture(page, `settings-${width}x${height}`);
    await input.tap('back');
    assert.equal((await snapshot(page)).screen, 'paused');
    await input.tap('help');
    await bounds();
    await capture(page, `help-${width}x${height}`);
    await input.tap('back');
    await input.tap('restart');
    assert.equal((await snapshot(page)).screen, 'confirm');
    await bounds();
    await input.tap('resume');
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(page)).screen).toBe('paused');
    await input.tap('leave');
    await input.tap('confirm');
    await page.evaluate(() => window.Ashfall.dev('level', 0));
    await page.evaluate(() => window.Ashfall.dev('upgrade'));
    await expect.poll(async () => (await snapshot(page)).screen).toBe('upgrade');
    const cards = (await snapshot(page)).controls.filter((c) => c.id.startsWith('upgrade-'));
    assert.equal(cards.length, 3);
    assert.equal(cards.filter((c) => c.label.includes('免费')).length, 2);
    await capture(page, `upgrade-${width}x${height}`);
    const room = (await snapshot(page)).run.levelIndex;
    await input.tap('upgrade-power');
    assert.equal(
      (await snapshot(page)).run.levelIndex,
      room,
      'experience choice stays in same room',
    );
    await page.evaluate(() => window.Ashfall.dev('tunnel'));
    const climbSession = await context.newCDPSession(page);
    const centre = await input.point('move');
    const climbLayout = await snapshot(page);
    const movePad = climbLayout.controls.find((c) => c.id === 'move');
    const travel = Math.min(movePad.w, movePad.h) * 0.42;
    const offset = climbLayout.rotated ? { x: -travel, y: 0 } : { x: 0, y: travel };
    await climbSession.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: centre.x + offset.x, y: centre.y + offset.y, id: 1 }],
    });
    await expect
      .poll(async () => (await snapshot(page)).run.player.y, { timeout: 4000 })
      .toBeGreaterThan(800);
    await capture(page, `underground-${width}x${height}`);
    await climbSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: centre.x - offset.x, y: centre.y - offset.y, id: 1 }],
    });
    await expect
      .poll(async () => (await snapshot(page)).run.player.y, { timeout: 4000 })
      .toBeLessThanOrEqual(571);
    await climbSession.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await climbSession.detach();
    await page.evaluate(() => window.Ashfall.dev('clear'));
    await expect.poll(async () => (await snapshot(page)).screen).toBe('result');
    await capture(page, `victory-${width}x${height}`);
    assert.equal(
      (await snapshot(page)).progress.completed.length,
      0,
      'trial does not unlock normal progress',
    );
    await input.tap('retry');
    await page.evaluate(() => window.Ashfall.dev('lose'));
    await capture(page, `defeat-${width}x${height}`);
    await bounds();
    assert.ok(
      !(await snapshot(page)).controls.some((b) => ['levels', 'pause', 'revive'].includes(b.id)),
      'failure has retry and home, no sector picker or unavailable ads',
    );
    await input.tap('retry');
    await input.dispose();
    report.checks.push(
      `Creator quick-tap fire/settings/help/home/23-level pages/multitouch/cancel/pause/confirm/blur/results/retry at ${width}x${height}`,
    );
    const video = page.video();
    await context.close();
    if (video) report.video = await video.path();
  }
  {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
    const page = await context.newPage();
    const missingArt = /\/assets\/.*\.png(?:\?.*)?$/;
    await page.route(missingArt, (route) => route.abort());
    await page.goto(url + '/');
    await expect(page.locator('#ashfall-loading[role="alert"]')).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
    await page.keyboard.press('Enter');
    assert.equal(
      (await snapshot(page)).screen,
      'home',
      'loading failure cannot start an invisible battle',
    );
    await capture(page, 'loading-error');
    await page.unroute(missingArt);
    await page.getByRole('button', { name: '重新加载' }).click();
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    await expect(page.locator('#ashfall-loading')).toHaveCount(0);
    await context.close();
    report.checks.push(
      'Resource failure shows an actionable retry, blocks battle, and reload recovers',
    );
  }
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto(url + '/?dev=1');
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    await page.evaluate(() => {
      window.SmallGamesDev.setPanelHidden(true);
      window.Ashfall.dev('level', 0);
    });
    const input = await ashfallInput(page, true);
    // Explicit fixture: hold screenshot completion until the real upgrade screen is visible.
    const original = page.screenshot.bind(page);
    page.screenshot = async (...args) => {
      const image = await original(...args);
      await page.evaluate(() => window.Ashfall.dev('upgrade'));
      return image;
    };
    try {
      await capture(page, 'async-upgrade-fixture');
    } finally {
      page.screenshot = original;
    }
    const before = report.transitions.find(
      (sample) => sample.stage === 'async-upgrade-fixture:before-screenshot',
    );
    const after = report.transitions.find(
      (sample) => sample.stage === 'async-upgrade-fixture:after-screenshot',
    );
    assert.equal(before.screen, 'playing');
    assert.equal(after.screen, 'upgrade');
    assert.equal(after.timeOrigin, before.timeOrigin);
    assert.ok(after.pageTime > before.pageTime);
    assert.equal((await snapshot(page)).screen, 'upgrade');
    await pausePlaying(page, input, 'async-upgrade-fixture');
    await page.evaluate(() => window.Ashfall.dev('lose'));
    await assert.rejects(
      pausePlaying(page, input, 'async-result-fixture'),
      /pause requires a live playing screen/,
    );
    assert.equal(
      (await snapshot(page)).screen,
      'result',
      'unexpected result is never restarted or hidden',
    );
    await input.dispose();
    await context.close();
    report.checks.push(
      'Explicit asynchronous screenshot fixture: upgrade uses real free UI then pauses; result fails with evidence',
    );
  }
  {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await desktop.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(url + '/');
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    assert.equal(await page.evaluate(() => typeof window.Ashfall.dev), 'undefined');
    assert.equal((await snapshot(page)).rewardAvailable, false);
    const input = await ashfallInput(page, false);
    await input.tap('levels');
    assert.equal(
      (await snapshot(page)).controls.filter((c) => c.id.startsWith('level-') && c.disabled).length,
      5,
    );
    await input.tap('home');
    await assertAshfallGameplay(page, false);
    await input.tap('start');
    const shots = (await snapshot(page)).run.shots;
    await page.mouse.move(940, 320);
    await page.mouse.down();
    await expect.poll(async () => (await snapshot(page)).run.shots).toBeGreaterThan(shots);
    await page.mouse.move(980, 220);
    await page.mouse.up();
    await input.dispose();
    await desktop.close();
    report.checks.push(
      'Normal desktop mode: locked levels, no developer mutations or SDK, native mouse aiming',
    );
  }
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      recordVideo: {
        dir: root + '../../../outputs/ashfall-front/live',
        size: { width: 844, height: 390 },
      },
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    await page.goto(url + '/');
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    const input = await ashfallInput(page, true);
    await input.tap('levels');
    await capture(page, 'levels-normal-844x390');
    await input.tap('home');
    await input.tap('settings');
    await input.tap('sound');
    await input.tap('motion');
    await input.tap('back');
    await page.reload();
    await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
    assert.equal((await snapshot(page)).progress.sound, false, 'sound persisted after refresh');
    assert.equal(
      (await snapshot(page)).progress.reducedMotion,
      true,
      'motion persisted after refresh',
    );
    await input.tap('start');
    await input.press(['right', 'jump', 'dash']);
    await expect
      .poll(async () => (await snapshot(page)).run.enemies.some((e) => e.waveIndex === 1), {
        timeout: 15000,
      })
      .toBe(true);
    const encounter = await snapshot(page);
    assert.equal(encounter.run.waveIndex, 0, 'running ahead does not bypass relay capture');
    assert.equal(encounter.run.shots, 0, 'encounter activates without firing');
    const width = (encounter.logicalWidth * 720) / encounter.logicalHeight;
    assert.ok(
      encounter.run.enemies.some(
        (e) =>
          e.waveIndex === 1 &&
          e.x > encounter.run.player.x &&
          e.x < encounter.run.player.x + width * 0.66 + 50,
      ),
      'new guard appears at the forward viewport edge',
    );
    await input.release();
    await capture(page, 'forward-encounter-844x390');
    await input.press(['fire']);
    await page.waitForTimeout(3600);
    await input.release();
    await pausePlaying(page, input, 'forward-encounter-844x390');
    await input.tap('restart');
    await input.tap('confirm');
    assert.equal((await snapshot(page)).run.levelIndex, 0);
    await input.press(['right', 'fire']);
    await page.waitForTimeout(1000);
    await input.release();
    await input.press(['fire']);
    await page.waitForTimeout(2500);
    await capture(page, 'combat-live-844x390');
    await input.release();
    await pausePlaying(page, input, 'combat-live-844x390');
    await input.dispose();
    const video = page.video();
    report.live = { encounter, final: await snapshot(page) };
    await context.close();
    report.liveVideo = await video.path();
    report.checks.push(
      'Normal touch: persisted settings, no-fire sprint activates forward guards before capturing relay 1, confirmed restart and real combat recording',
    );
  }
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    globalThis.SmallGamesPublishingConfig = {
      adsEnabled: true,
      adMode: 'host',
      platform: 'taptap-h5',
      adUnitId: 'qa-ashfall-only',
    };
    globalThis.__ad = { shown: 0, close: null, error: null };
    globalThis.tap = {
      createRewardedVideoAd: () => ({
        onClose(fn) {
          __ad.close = fn;
        },
        onError(fn) {
          __ad.error = fn;
        },
        offClose() {},
        offError() {},
        load: async () => {},
        show: async () => {
          __ad.shown++;
        },
        destroy() {},
      }),
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url + '/?dev=1');
  await expect.poll(async () => (await snapshot(page))?.ready, { timeout: 60000 }).toBe(true);
  await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  const input = await ashfallInput(page, true);
  for (const result of [
    'completed',
    'dismissed',
    'failed',
    'close-hidden',
    'return-first',
    'stale',
    'cancel',
  ]) {
    await page.evaluate(() => {
      window.Ashfall.dev('level', 0);
      window.Ashfall.dev('damage');
    });
    await input.tap('pause');
    await input.tap('supply');
    await capture(page, 'supply-confirmation-' + result);
    const hp = (await snapshot(page)).run.player.hp;
    await input.tap('claim');
    await expect.poll(async () => (await snapshot(page)).adLocked).toBe(true);
    if (result === 'cancel') {
      await input.tap('cancel');
      await page.evaluate(() => __ad.close?.({ isEnded: true }));
    } else if (result === 'failed') await page.evaluate(() => __ad.error({ errCode: 1004 }));
    else if (result === 'stale') {
      await page.evaluate(() => window.Ashfall.dev('level', 1));
      await page.evaluate(() => __ad.close({ isEnded: true }));
    } else if (result === 'close-hidden') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        __ad.close({ isEnded: true });
      });
      await page.waitForTimeout(80);
      assert.equal((await snapshot(page)).run.player.hp, hp, 'hidden close waits for return');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } else if (result === 'return-first') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        __ad.close({ isEnded: true });
      });
    } else await page.evaluate((ended) => __ad.close({ isEnded: ended }), result === 'completed');
    await expect.poll(async () => (await snapshot(page)).adLocked).toBe(false);
    const state = await snapshot(page);
    assert.equal(
      state.run.player.hp,
      result === 'stale'
        ? 120
        : ['completed', 'close-hidden', 'return-first'].includes(result)
          ? hp + 40
          : hp,
    );
    report.checks.push('SDK fixture: ' + result);
  }
  for (const ended of [false, true]) {
    await page.evaluate(() => {
      window.Ashfall.dev('level', 0);
      window.Ashfall.dev('upgrade');
    });
    await input.tap('upgrade-overdrive');
    await input.tap('claim');
    await expect.poll(async () => (await snapshot(page)).adLocked).toBe(true);
    await page.evaluate((ended) => __ad.close({ isEnded: ended }), ended);
    await expect.poll(async () => (await snapshot(page)).adLocked).toBe(false);
    const upgraded = await snapshot(page);
    assert.equal(upgraded.screen, ended ? 'playing' : 'upgrade');
    assert.equal(upgraded.run.player.maxHp, ended ? 150 : 120);
    if (!ended) await input.tap('upgrade-medical');
  }
  await page.evaluate(() => {
    window.Ashfall.dev('level', 0);
    window.Ashfall.dev('lose');
  });
  await input.tap('revive');
  await input.tap('claim');
  await expect.poll(async () => (await snapshot(page)).adLocked).toBe(true);
  await page.evaluate(() => __ad.close({ isEnded: true }));
  await expect.poll(async () => (await snapshot(page)).run.player.hp).toBe(60);
  await input.tap('resume');
  await expect.poll(async () => (await snapshot(page)).screen).toBe('playing');
  report.checks.push('SDK fixture: revive restores 50% and actually resumes');
  await input.dispose();
  await context.close();
  assert.deepEqual(report.errors, []);
  for (const name of [
    'home-844x390',
    'combat-844x390',
    'levels-844x390',
    'pause-844x390',
    'levels-normal-844x390',
    'combat-live-844x390',
    'forward-encounter-844x390',
    'settings-844x390',
    'defeat-844x390',
  ])
    await copyFile(
      new URL(name + '.png', output),
      new URL('../publishing/gameplay/screenshots/' + name + '.png', import.meta.url),
    );
} catch (error) {
  report.errors.push(String(error));
  console.error(error);
  console.error(JSON.stringify({ transitions: report.transitions.slice(-8) }));
  throw error;
} finally {
  try {
    await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  } finally {
    await browser.close();
    server?.kill();
  }
}
console.log(
  JSON.stringify({
    checks: report.checks,
    errors: report.errors,
    screenshots: report.screenshots.length,
    transitions: report.transitions.length,
  }),
);
