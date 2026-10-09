import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { layouts } from '../src/layouts.mjs';
import { createMatch, chooseBot, seeded, physics } from '../src/core.mjs';
import { W, H, arena } from '../src/render.mjs';
import { saveKey } from '../src/progress.mjs';

const root = new URL('../', import.meta.url);
const out = new URL('../docs/design/multi-round-2026-10-09/', import.meta.url);
const started = performance.now();
const records = {
  environment: 'Chromium desktop emulation, 390×844, touch, DPR 2',
  realDevice: false,
};
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4427'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error('server exited ' + code)));
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const origin = 'http://127.0.0.1:4427/';
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-09T12:00:01Z'));
  await page.goto(origin);
  const screenshot = (name) =>
    page.screenshot({ path: new URL('actual-' + name + '.png', out).pathname });
  const advance = (ms) => page.clock.runFor(ms);
  const phase = () => page.locator('body').getAttribute('data-phase');
  const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
  const debug = () => page.evaluate(() => window.__flickArena.debug());
  const session = await context.newCDPSession(page);
  const touch = (type, points) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y, id], index) => ({ x, y, id: id ?? index })),
    });
  const map = ([x, y]) =>
    page.locator('#game').evaluate(
      (canvas, { x, y, W, H }) => {
        const box = canvas.getBoundingClientRect();
        const scale = Math.min(box.width / W, box.height / H);
        return [
          box.x + (box.width - W * scale) / 2 + x * scale,
          box.y + (box.height - H * scale) / 2 + y * scale,
        ];
      },
      { x, y, W, H },
    );
  const position = ([x, y]) => [arena.x + x * arena.scale, arena.y + y * arena.scale];
  async function drag(from, to, { cancel = false, shot = false } = {}) {
    await touch('touchStart', [await map(from)]);
    await advance(32);
    await touch('touchMove', [await map(to)]);
    await advance(32);
    if (shot) await screenshot('aim');
    await touch(cancel ? 'touchCancel' : 'touchEnd', []);
    await advance(64);
  }
  async function practice() {
    await page.locator('#layouts').tap();
    await page.locator('#layout-0').tap();
    await advance(1400);
    assert.equal(await phase(), 'playing');
  }
  async function flick(from, move, shot = false) {
    await drag(from, [from[0] - move.x * move.power * 115, from[1] - move.y * move.power * 115], {
      shot,
    });
  }
  // Public read-only canvas state describes the displayed pucks without opening developer methods.
  async function visibleDiscs() {
    const discs = JSON.parse(await page.locator('#game').getAttribute('data-discs'));
    return discs.map((disc) => ({ ...disc, vx: 0, vy: 0, fall: disc.alive ? 0 : 1 }));
  }

  await screenshot('home');
  assert.equal(await page.evaluate(() => typeof window.__flickArena), 'undefined');
  await page.locator('#help').tap();
  await screenshot('help');
  await page.locator('#home').tap();
  await page.locator('#layouts').tap();
  assert.equal(await page.locator('#controls button').count(), layouts.length + 1);
  await screenshot('layouts');
  await page.locator('#layout-0').tap();
  await advance(1400);
  await screenshot('play');
  await page.locator('#pause').tap();
  assert.equal(await page.locator('#pause').count(), 0);
  await screenshot('paused');
  await page.locator('#sound').tap();
  await page.locator('#resume').tap();

  const initial = position(layouts[0].points[0]);
  const target = layouts[0].points[1];
  const dx = target[0] - layouts[0].points[0][0];
  const dy = target[1] - layouts[0].points[0][1];
  const length = Math.hypot(dx, dy);
  const opening = { x: dx / length, y: dy / length, power: 1 };
  await drag(initial, [initial[0] - opening.x * 115, initial[1] - opening.y * 115], {
    cancel: true,
  });
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '0');
  // Pull back to the disc before releasing also cancels a shot.
  await touch('touchStart', [await map(initial)]);
  await touch('touchMove', [await map([initial[0], initial[1] + 60])]);
  await touch('touchMove', [await map([initial[0] + 2, initial[1] + 2])]);
  await touch('touchEnd', []);
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '0');
  const normalStarted = await page.evaluate(() => Date.now());
  await flick(initial, opening, true);
  await advance(1200);
  assert.equal(await phase(), 'playing', 'a full-force opening must leave a continuing match');
  assert(
    (await visibleDiscs()).every((disc) => disc.alive),
    'opening does not eliminate a rival',
  );
  await advance(4300);
  let normalAttempts = 1;
  for (let n = 0; n < 30 && (await phase()) !== 'result'; n++) {
    const discs = await visibleDiscs();
    const active = Number(await page.locator('#game').getAttribute('data-active'));
    const physicsPhase = await page.locator('#game').getAttribute('data-physics-phase');
    if (active === 0 && physicsPhase === 'aim' && discs[0].alive) {
      const displayed = createMatch(layouts[0], 900 + n);
      displayed.discs = discs;
      displayed.turn = Number(await page.locator('#game').getAttribute('data-turn'));
      displayed.shots = Number(await page.locator('#game').getAttribute('data-shots'));
      displayed.radius = Number(await page.locator('#game').getAttribute('data-radius'));
      const move = chooseBot(displayed, seeded(n + 18));
      const before = displayed.shots;
      await flick(position([discs[0].x, discs[0].y]), move);
      assert.equal(
        Number(await page.locator('#game').getAttribute('data-shots')),
        before + 1,
        'each real normal-mode gesture launches exactly one shot',
      );
      normalAttempts++;
    }
    await advance(5500);
  }
  assert.equal(
    await phase(),
    'result',
    'normal mode completes through touch gestures and elapsed time',
  );
  assert(normalAttempts >= 4, 'normal match offers several player attempts');
  records.normal = {
    playerAttempts: normalAttempts,
    gameplaySeconds: ((await page.evaluate(() => Date.now())) - normalStarted) / 1000,
    rounds: Number(await page.locator('#game').getAttribute('data-turn')),
    totalShots: Number(await page.locator('#game').getAttribute('data-shots')),
  };
  console.log('Normal touch match: ' + JSON.stringify(records.normal));
  await screenshot('result');
  assert.equal((await stored()).played, 1);
  const normalSave = await stored();
  await page.locator('#replay').tap();
  assert.equal(await phase(), 'replay');
  await screenshot('replay');
  await page.locator('#result').tap();
  await advance(2000);
  assert.deepEqual(await stored(), normalSave, 'replay never settles a match twice');
  await page.locator('#again').tap();
  await advance(1400);
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '0');
  await page.locator('#pause').tap();
  await page.locator('#home').tap();

  // A separate full developer-mode match uses read-only debug positions and real CDP gestures.
  await page.goto(origin + '?dev=1');
  await practice();
  assert.deepEqual(await stored(), normalSave);
  const p = await map(position((await debug()).state.discs.map((disc) => [disc.x, disc.y])[0]));
  await touch('touchStart', [p]);
  await touch('touchStart', [p, [350, 700]]);
  await touch('touchMove', [
    [p[0] + 20, p[1] + 45],
    [345, 710],
  ]);
  assert.notEqual((await debug()).drag, null);
  await touch('touchEnd', [[345, 710, 1]]);
  assert.notEqual(
    (await debug()).drag,
    null,
    'lifting the second finger cannot release the first drag',
  );
  assert.equal((await debug()).state.shots, 0);
  await touch('touchCancel', []);
  assert.equal((await debug()).drag, null);
  assert.equal((await debug()).state.shots, 0);
  const pausedBefore = (await debug()).state;
  await page.locator('#pause').tap();
  await advance(5000);
  assert.deepEqual((await debug()).state, pausedBefore);
  await page.locator('#resume').tap();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await phase(), 'paused');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('#resume').tap();

  let shrinkSeen = false,
    warningSeen = false;
  let devAttempts = 0,
    devElapsed = 0;
  const devStartSave = await page.evaluate(() => window.__flickArena.app.save.played);
  for (let n = 0; n < 40 && (await phase()) !== 'result'; n++) {
    const current = (await debug()).state;
    if (current.phase === 'aim' && current.active === 0) {
      const move = chooseBot(current, seeded(current.shots + 8));
      await flick(position([current.discs[0].x, current.discs[0].y]), move);
      devAttempts++;
    }
    for (let ticks = 0; ticks < 70 && (await phase()) !== 'result'; ticks++) {
      await advance(100);
      devElapsed += 100;
      const state = (await debug()).state;
      if (state.turn === physics.safeRounds && !warningSeen) {
        await screenshot('shrink-warning');
        warningSeen = true;
      }
      if (state.phase === 'shrinking' && !shrinkSeen) {
        shrinkSeen = true;
        await screenshot('shrink');
        const contracting = (await debug()).state;
        await page.locator('#pause').tap();
        await advance(3500);
        assert.deepEqual(
          (await debug()).state,
          contracting,
          'pause freezes both radius and shrink progress during contraction',
        );
        await screenshot('shrink-paused');
        await page.locator('#resume').tap();
      }
      if (state.phase === 'aim' && state.active === 0) break;
    }
  }
  assert.equal(await phase(), 'result', 'developer mode also completes without forced settlement');
  const devResult = (await debug()).state;
  assert(devAttempts >= 4);
  assert(warningSeen && shrinkSeen, 'a full match passes the warning and visible shrink phases');
  records.developer = {
    playerAttempts: devAttempts,
    rounds: devResult.turn,
    totalShots: devResult.shots,
    gameplaySeconds: devElapsed / 1000,
    warningSeen,
    shrinkSeen,
    shrinkPauseVerified: true,
    stateWasManuallyReplaced: false,
  };
  console.log('Developer touch match: ' + JSON.stringify(records.developer));
  assert.equal(await page.evaluate(() => window.__flickArena.app.save.played), devStartSave + 1);
  assert.deepEqual(
    await stored(),
    normalSave,
    'developer settlement stays out of normal statistics',
  );
  await page.locator('#replay').tap();
  await page.locator('#result').tap();
  assert.equal(await page.evaluate(() => window.__flickArena.app.save.played), devStartSave + 1);
  await page.locator('#again').tap();
  await advance(1400);
  const resizeBefore = (await debug()).state;
  await page.setViewportSize({ width: 844, height: 390 });
  await advance(100);
  assert.deepEqual((await debug()).state, resizeBefore, 'landscape resizing preserves the match');
  await screenshot('landscape');
  const landscapeFrom = position([resizeBefore.discs[0].x, resizeBefore.discs[0].y]);
  await flick(landscapeFrom, { x: 0, y: -1, power: 0.24 });
  assert.equal((await debug()).state.playerShots, 1, 'landscape touch mapping stays aligned');
  await page.locator('#pause').tap();
  await page.locator('#home').tap();
  await page.setViewportSize({ width: 320, height: 568 });
  await practice();
  await screenshot('small-screen');
  const smallBefore = (await debug()).state;
  await flick(position([smallBefore.discs[0].x, smallBefore.discs[0].y]), {
    x: 0,
    y: -1,
    power: 0.24,
  });
  assert.equal((await debug()).state.playerShots, 1, 'small-screen touch mapping stays aligned');
  await page.locator('#pause').tap();
  await advance(100);
  assert.equal(await phase(), 'paused', 'small-screen pause remains accessible after a shot');
  await page.locator('#home').tap();

  await page.evaluate(() => localStorage.setItem('dev', '1'));
  await page.goto(origin + '?dev=0');
  assert.equal(
    await page.evaluate(() => typeof window.__flickArena),
    'undefined',
    'URL off overrides storage on',
  );
  assert.deepEqual(await stored(), normalSave);
  const fallback = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await fallback.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('disabled');
    };
    Storage.prototype.setItem = () => {
      throw new Error('disabled');
    };
  });
  const fallbackPage = await fallback.newPage();
  fallbackPage.on('pageerror', (error) => errors.push(error.message));
  await fallbackPage.clock.install({ time: new Date('2026-10-09T15:00:00Z') });
  await fallbackPage.clock.pauseAt(new Date('2026-10-09T15:00:01Z'));
  await fallbackPage.goto(origin + '?dev=0');
  await fallbackPage.locator('#start').tap();
  await fallbackPage.clock.runFor(1400);
  assert.equal(await fallbackPage.locator('body').getAttribute('data-phase'), 'playing');
  await fallback.close();
  assert.deepEqual(errors, []);
  records.checks = [
    'normal touch multi-round settlement',
    'help and layout navigation',
    'touch cancellation and pull-back cancellation',
    'second-finger release isolation',
    'pause/resume and blur/focus',
    'natural shrink warning, contraction and paused contraction',
    'replay does not duplicate settlement',
    'retry resets match',
    'normal/dev statistics isolation',
    'landscape and 320×568 touch mapping',
    'explicit dev=0 precedence',
    'unavailable storage fallback',
  ];
  records.pageErrors = errors;
  records.wallSeconds = Math.round((performance.now() - started) / 100) / 10;
  await writeFile(new URL('browser-validation.json', out), JSON.stringify(records, null, 2) + '\n');
  console.log('PASS: ' + JSON.stringify(records));
} finally {
  await browser.close();
  server.kill();
}
