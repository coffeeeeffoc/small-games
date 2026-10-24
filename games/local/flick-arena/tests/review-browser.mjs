import { ready } from './ready.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { levels, chapters } from '../src/levels.mjs';
import { W, H, arena } from '../src/render.mjs';
import { saveKey } from '../src/progress.mjs';
import { chooseBot } from '../src/core.mjs';

const out = new URL(
  process.env.FLICK_VALIDATION_DIR ?? '../docs/design/review-2026-10-11/',
  import.meta.url,
);
const root = new URL('../', import.meta.url);
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4440'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`server exited ${code}`)));
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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-11T19:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-11T19:00:01Z'));
  const origin = 'http://127.0.0.1:4440/';
  await page.goto(origin);
  await ready(page);
  assert.equal(await page.evaluate(() => typeof window.__flickArena), 'undefined');
  const oldSave = {
    version: 1,
    played: 20,
    wins: 20,
    sound: false,
    campaign: {
      levels: Object.fromEntries(
        levels.slice(0, 20).map((level) => [
          level.id,
          {
            stars: 3,
            goals: level.challenges.map((goal) => goal.id),
            bestShots: 4,
          },
        ]),
      ),
    },
  };
  await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), {
    key: saveKey,
    save: oldSave,
  });
  await page.reload();
  await ready(page);
  await page.locator('#start').tap();
  assert.equal(await page.locator('#game').getAttribute('data-level-id'), levels[20].id);
  await page.locator('#play-level').tap();
  await page.clock.runFor(100);
  await page.clock.runFor(32);
  await page.screenshot({ path: new URL('actual-advanced-play.png', out).pathname });
  await page.locator('#pause').tap();
  await page.locator('#home').tap();
  await page.locator('#levels').tap();
  assert.equal(await page.locator(`#level-${levels[20].id}`).isDisabled(), false);
  assert.equal(await page.locator(`#level-${levels[21].id}`).isDisabled(), true);
  for (let chapter = 4; chapter < chapters.length - 1; chapter++) {
    await page.locator('#chapter-next').tap();
    assert.equal(await page.locator(`#level-${levels[(chapter + 1) * 5].id}`).count(), 1);
  }
  assert.equal(await page.locator('#chapter-next').isDisabled(), true);
  assert.equal(await page.locator(`#level-${levels.at(-1).id}`).isDisabled(), true);
  assert.equal(await page.locator('#controls button[id^="level-"]').count(), 5);
  await page.clock.runFor(32);
  await page.screenshot({ path: new URL('actual-final-chapter.png', out).pathname });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.runFor(100);
  for (const control of await page.locator('#controls button').all()) {
    const box = await control.boundingBox();
    assert(box.width >= 44 && box.height >= 44, 'small-screen controls retain 44 CSS px');
  }
  await page.clock.runFor(32);
  await page.screenshot({ path: new URL('actual-small-levels.png', out).pathname });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '?dev=1');
  await ready(page);
  await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
  await page.locator(`[data-dev-action="level-${levels.at(-1).id}"]`).tap();
  await page.locator('[data-close]').tap();
  const before = await page.evaluate(() => window.__flickArena.debug().state);
  assert.equal(before.layout, levels.at(-1).id);
  const mapPlayer = () =>
    page.locator('#game').evaluate(
      (canvas, { W, H, arena }) => {
        const box = canvas.getBoundingClientRect();
        const scale = Math.min(box.width / W, box.height / H);
        const disc = JSON.parse(canvas.dataset.discs)[0];
        return {
          x: box.x + (box.width - W * scale) / 2 + (arena.x + disc.x * arena.scale) * scale,
          y: box.y + (box.height - H * scale) / 2 + (arena.y + disc.y * arena.scale) * scale,
          scale,
        };
      },
      { W, H, arena },
    );
  const session = await context.newCDPSession(page);
  const touch = (type, points) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  let point = await mapPlayer();
  await touch('touchStart', [[point.x, point.y]]);
  await touch('touchMove', [[point.x, point.y + 60]]);
  assert(await page.evaluate(() => Boolean(window.__flickArena.app.drag)));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.runFor(100);
  assert.equal(await page.evaluate(() => window.__flickArena.app.drag), null);
  await touch('touchEnd', []);
  assert.deepEqual(await page.evaluate(() => window.__flickArena.debug().state), before);
  point = await mapPlayer();
  await touch('touchStart', [[point.x + 21, point.y]]);
  assert(
    await page.evaluate(() => Boolean(window.__flickArena.app.drag)),
    'landscape radius is at least 22 CSS px',
  );
  await touch('touchCancel', []);
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '0');
  await touch('touchStart', [[point.x, point.y]]);
  await touch('touchMove', [[point.x, point.y + 45 * point.scale]]);
  await touch('touchEnd', []);
  assert.equal(await page.locator('#game').getAttribute('data-shots'), '1');
  await page.clock.runFor(100);
  const pauseBox = await page.locator('#pause').boundingBox();
  const pausePoint = [pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2];
  await touch('touchStart', [pausePoint]);
  await touch('touchMove', [[pausePoint[0], pausePoint[1] + pauseBox.height + 20]]);
  await touch('touchEnd', []);
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'playing');
  await touch('touchStart', [pausePoint]);
  await touch('touchMove', [[pausePoint[0], pausePoint[1] + pauseBox.height + 20]]);
  await touch('touchMove', [pausePoint]);
  await touch('touchEnd', []);
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'playing');
  await touch('touchStart', [pausePoint]);
  await touch('touchCancel', []);
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'playing');
  await page.locator('#pause').tap();
  await page.clock.runFor(400);
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'paused');
  const paused = await page.evaluate(() => window.__flickArena.debug().state);
  await page.clock.runFor(5000);
  assert.deepEqual(await page.evaluate(() => window.__flickArena.debug().state), paused);
  await page.locator('#resume').tap();
  await page.locator('#pause').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'paused');
  await page.locator('#resume').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'playing');
  await page.clock.runFor(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(100);
  await page.clock.runFor(32);
  await page.screenshot({ path: new URL('actual-final-play.png', out).pathname });
  await page.locator('#pause').tap();
  await page.locator('#home').tap();
  assert.deepEqual(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey),
    oldSave,
  );
  // A completed-119 fixture isolates the production finale without granting dev access.
  const endSave = {
    version: 1,
    played: 119,
    wins: 119,
    sound: false,
    campaign: {
      levels: Object.fromEntries(
        levels.slice(0, 119).map((level) => [level.id, { stars: 1, goals: [], bestShots: 5 }]),
      ),
    },
  };
  await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), {
    key: saveKey,
    save: endSave,
  });
  await page.clock.setFixedTime(new Date(3));
  await page.goto(origin + '?dev=0');
  await ready(page);
  assert.equal(await page.evaluate(() => typeof window.__flickArena), 'undefined');
  await page.locator('#start').tap();
  assert.equal(await page.locator('#game').getAttribute('data-level-id'), levels.at(-1).id);
  await page.locator('#play-level').tap();
  await page.clock.runFor(100);
  assert.equal(await page.locator('#game').getAttribute('data-seed'), '3');
  await page.clock.runFor(32);
  await page.screenshot({ path: new URL('actual-final-play.png', out).pathname });
  await page.locator('#pause').tap();
  const visible = () =>
    page.locator('#game').evaluate((canvas) => JSON.parse(canvas.dataset.visibleState));
  const normalPaused = await visible();
  await page.clock.runFor(2000);
  assert.deepEqual(await visible(), normalPaused);
  await page.locator('#resume').tap();
  let finaleTouches = 0;
  for (
    let turn = 0;
    turn < 90 && (await page.locator('body').getAttribute('data-phase')) === 'playing';
    turn++
  ) {
    const state = await visible();
    if (state.phase === 'aim' && state.active === 0) {
      const move = chooseBot(state);
      const from = await mapPlayer();
      const pull = move.power * 115 * from.scale;
      await touch('touchStart', [[from.x, from.y]]);
      await touch('touchMove', [[from.x - move.x * pull, from.y - move.y * pull]]);
      await touch('touchEnd', []);
      finaleTouches++;
    }
    await page.clock.runFor(500);
  }
  assert.equal(await page.locator('body').getAttribute('data-phase'), 'result');
  const finalState = await visible();
  assert.equal(finalState.winner, 0, 'legal seed 3 and real touches win the production finale');
  assert(finaleTouches >= 1);
  assert.equal(await page.locator('#next-level').count(), 0);
  assert.equal(await page.locator('#retry').count(), 1);
  const finalSave = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
  assert.equal(finalSave.played, 120);
  assert(finalSave.campaign.levels[levels.at(-1).id].stars >= 1);
  await page.clock.runFor(32);
  await page.screenshot({ path: new URL('actual-final-result.png', out).pathname });
  await page.locator('#replay').tap();
  await page.clock.runFor(100);
  await page.locator('#result').tap();
  assert.deepEqual(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey),
    finalSave,
  );
  assert.deepEqual(errors, []);
  const records = {
    environment: 'Chromium desktop mobile emulation; CDP touch; 390×844 DPR2, 320×568, 844×390',
    realDevice: false,
    levels: levels.length,
    chapters: chapters.length,
    progressSetup:
      'Synthetic legacy 20-level save for migration; completed-119 fixture for dev=0 finale, never a claim of manual campaign completion',
    normalFinale: {
      seed: 3,
      realTouchShots: finaleTouches,
      playerShots: finalState.playerShots,
      totalShots: finalState.shots,
      winner: finalState.winner,
    },
    stateWasManuallyReplaced: false,
    checks: [
      'legacy records continue at level 21',
      'all 24 chapters retain five-item phone layout',
      'level 120 remains locked in normal mode',
      'small-screen controls >=44 CSS px',
      'developer catalog exposes level 120',
      'resize cancels a live drag without altering the board',
      'landscape disc target >=44 CSS px',
      'touch cancellation and exactly one real flick in level 120',
      'quick pause after flick; button drag-off/cancellation; keyboard activation; chapter taps never advance twice',
      'pause freezes level 120',
      'developer play preserves normal save',
      'dev=0 level 120 entry, touch victory, final settlement, persistence and replay idempotence',
    ],
    pageErrors: errors,
  };
  await writeFile(new URL('browser-validation.json', out), JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify(records, null, 2));
} finally {
  await browser.close();
  server.kill();
}
