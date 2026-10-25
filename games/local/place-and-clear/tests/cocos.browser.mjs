import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { getLevel } from '../src/levels.mjs';
import { canPlace } from '../src/engine.mjs';
import { inputFor } from './cocos-input.mjs';
// Keep repeatable test output separate from the historical release evidence.
const output = new URL('../reports/browser/', import.meta.url);
await mkdir(output, { recursive: true });
let server,
  url = process.env.PLACE_AND_CLEAR_BROWSER_URL || process.env.GAME_URL;
if (!url) {
  server = spawn(
    process.execPath,
    [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))],
    { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  url = await new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/localhost:\d+/);
      if (match) resolve(match[0]);
    });
    server.once('error', reject);
    server.once('exit', (code) => reject(Error('Preview exited ' + code)));
  });
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
});
const errors = [],
  checks = [];
let video;
const pass = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
async function phone(width = 390, height = 844, options = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    ...options,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/api/'))
      errors.push(r.status() + ' ' + r.url());
  });
  return { context, page, ...inputFor(page) };
}
async function open(p, query = '') {
  await p.page.goto(url + query);
  await p.ready();
  assert.equal((await p.snapshot()).creator, '3.8.8');
  await expect(p.page).toHaveTitle(/摆消乐/);
  await expect(p.page.locator('#game')).toHaveAttribute('aria-label', '摆消乐');
}
async function shot(p, name) {
  await p.page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) });
}
const legal = (state) => {
  for (let slot = 0; slot < 3; slot++)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) if (canPlace(state, slot, x, y)) return { slot, x, y };
  throw Error('No legal move');
};
try {
  const p = await phone(390, 844, {
    recordVideo: {
      dir: fileURLToPath(new URL('../reports/videos/', import.meta.url)),
      size: { width: 390, height: 844 },
    },
  });
  video = p.page.video();
  await open(p);
  await shot(p, 'home-390x844');
  assert.equal(await p.page.locator('[data-game-fullscreen]').count(), 0);
  assert.equal(await p.page.evaluate(() => globalThis.PlaceAndClearDev), undefined);
  await p.control('start');
  await p.screen('brief');
  await shot(p, 'brief-390x844');
  await p.control('begin');
  await p.screen('playing');
  await shot(p, 'game-390x844');
  const before = (await p.snapshot()).state;
  await p.control('reset-options');
  await shot(p, 'reset-390x844');
  await p.control('reward-confirm');
  assert.match((await p.snapshot()).message, /暂不可用/);
  assert.deepEqual((await p.snapshot()).state, before);
  pass('No-ID reset does not reward or change the board');
  await p.control('pause');
  await p.screen('pause');
  await shot(p, 'pause-390x844');
  await p.control('resume');
  const move = getLevel(1).solution[0];
  await p.drag(move, true);
  assert.equal((await p.snapshot()).state.stats.placements, 0);
  await p.drag(move);
  await p.screen('result');
  assert.equal((await p.snapshot()).state.status, 'won');
  assert.equal((await p.snapshot()).state.stats.lines, 1);
  await shot(p, 'win-390x844');
  pass('Real touch drag/cancel, clear and win');
  await p.control('retry');
  await p.control('home');
  await p.control('start');
  assert.equal((await p.snapshot()).state.levelId, 1);
  await p.page.reload();
  await p.ready();
  await p.control('start');
  assert.equal((await p.snapshot()).state.levelId, 1);
  await p.control('pause');
  await p.control('exit-level');
  assert.equal((await p.snapshot()).progress.currentGame, null);
  pass('Pause, home, reload, resume and explicit exit preserve their save semantics');
  await p.control('levels');
  await shot(p, 'levels-390x844');
  assert.equal((await p.snapshot()).controls.find((c) => c.id === 'level:30').disabled, true);
  await p.control('home');
  for (const [action, variant] of [
    ['practice', 'classic'],
    ['refill', 'refill'],
  ]) {
    await p.control('endless');
    await p.control(action);
    let s = (await p.snapshot()).state;
    const initial = structuredClone(s.candidates),
      m = legal(s);
    await p.cell(m);
    s = (await p.snapshot()).state;
    if (variant === 'classic') {
      assert.deepEqual(s.used, [m.slot]);
      assert.equal(s.placedInGroup, 1);
    } else {
      assert.equal(s.variant, 'refill');
      assert.equal(s.used.length, 0);
      for (let i = 0; i < 3; i++)
        if (i !== m.slot) assert.deepEqual(s.candidates[i], initial[i]);
    }
    await shot(p, variant + '-390x844');
    await p.control('pause');
    await p.control('end-run');
    await p.screen('result');
    await p.control('home');
  }
  pass('Both endless variants keep their original candidate rules and separate records');
  await p.control('start');
  if ((await p.snapshot()).screen === 'brief') await p.control('begin');
  const saved = await p.page.evaluate(() =>
    localStorage.getItem('three-choose-two-progress-v1'),
  );
  await open(p, '?dev=1');
  await p.control('levels');
  for (let i = 0; i < 3; i++) await p.control('levels-next');
  await p.control('level:120');
  await p.control('begin');
  assert.equal((await p.snapshot()).state.levelId, 120);
  assert.equal((await p.snapshot()).devPractice, true);
  await shot(p, 'dev-level120-390x844');
  await p.control('home');
  assert.equal(
    await p.page.evaluate(() => localStorage.getItem('three-choose-two-progress-v1')),
    saved,
  );
  pass('Developer UI can scroll/select level 120 without changing real progress');
  await open(p, '?dev=0');
  assert.equal(await p.page.evaluate(() => typeof globalThis.PlaceAndClearDev), 'undefined');
  await p.control('start');
  await p.page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await p.page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await p.screen('pause');
  await p.control('resume');
  assert.equal((await p.snapshot()).screen, 'playing');
  pass('BFCache pagehide keeps the live session usable');
  await p.context.close();
  const videoPath = await video.path();
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  const desktop = { page: desktopPage, ...inputFor(desktopPage, false) };
  await open(desktop);
  await desktop.control('start');
  await desktop.control('begin');
  await desktop.drag(getLevel(1).solution[0], true);
  assert.equal((await desktop.snapshot()).state.stats.placements, 0);
  await desktop.drag(getLevel(1).solution[0]);
  await desktop.screen('result');
  assert.equal((await desktop.snapshot()).state.status, 'won');
  await desktopContext.close();
  pass('Desktop mouse drag uses its own cursor position and ignores simulated touch duplicates');
  for (const [width, height] of [
    [320, 568],
    [360, 740],
    [844, 390],
  ]) {
    const q = await phone(width, height);
    await open(q);
    await q.control('start');
    await q.control('begin');
    await q.control('reset-options');
    await q.control('reward-cancel');
    await q.control('pause');
    await q.control('resume');
    await shot(q, 'layout-' + width + 'x' + height);
    assert((await q.snapshot()).controls.some((c) => c.id === 'board'));
    await q.context.close();
  }
  pass('320/360/landscape scrolling and controls');
  const rewards = await phone();
  await rewards.page.addInitScript(() => {
    globalThis.PlaceAndClearHost = {
      ads: {
        offer: () => {
          globalThis.__offers = (globalThis.__offers || 0) + 1;
          return new Promise((resolve) => (globalThis.__completeAd = resolve));
        },
        cancel() {},
      },
    };
  });
  await open(rewards);
  await rewards.control('endless');
  await rewards.control('practice');
  for (const status of ['dismissed', 'failed', 'unavailable', 'completed']) {
    const prev = (await rewards.snapshot()).state;
    await rewards.control('reset-options');
    await rewards.control('reward-confirm');
    assert.equal((await rewards.snapshot()).rewardPending, true);
    await rewards.page.evaluate((status) => globalThis.__completeAd({ status }), status);
    await expect.poll(async () => (await rewards.snapshot()).rewardPending).toBe(false);
    const next = (await rewards.snapshot()).state;
    if (status === 'completed') {
      assert.notDeepEqual(next.candidates, prev.candidates);
      for (const key of ['board', 'score', 'group', 'stats', 'rng'])
        assert.deepEqual(next[key], prev[key]);
      assert.equal(next.resetRewardIds.length, 1);
    } else assert.deepEqual(next, prev);
  }
  pass('Host ad outcomes: completed only, unchanged board/score/RNG, no fake default');
  for (const order of ['completion-first', 'visible-first']) {
    const prev = (await rewards.snapshot()).state;
    await rewards.control('reset-options');
    await rewards.control('reward-confirm');
    await rewards.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (order === 'completion-first') {
      await rewards.page.evaluate(() => globalThis.__completeAd({ status: 'completed' }));
      await rewards.page.waitForTimeout(100);
      assert.deepEqual((await rewards.snapshot()).state, prev);
    }
    await rewards.page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (order === 'visible-first')
      await rewards.page.evaluate(() => globalThis.__completeAd({ status: 'completed' }));
    await expect
      .poll(async () => (await rewards.snapshot()).state.resetRewardIds.length)
      .toBe(prev.resetRewardIds.length + 1);
  }
  const old = (await rewards.snapshot()).state;
  await rewards.control('reset-options');
  await rewards.control('reward-confirm');
  await rewards.control('reward-cancel');
  await rewards.control('home');
  await rewards.control('endless');
  await rewards.control('refill');
  const current = (await rewards.snapshot()).state;
  await rewards.page.evaluate(() => globalThis.__completeAd({ status: 'completed' }));
  await rewards.page.waitForTimeout(100);
  assert.deepEqual((await rewards.snapshot()).state, current);
  assert.notEqual(current.initialSeed, old.initialSeed);
  pass('Hidden/visible callback orders and cancelled late completions');
  await rewards.context.close();
  const share = await phone();
  await share.page.addInitScript(() => {
    globalThis.SmallGamesPublishingConfig = {
      publicUrl: 'https://games.example/place-and-clear/',
    };
    globalThis.__shares = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (request) => globalThis.__shares.push(request),
    });
  });
  await open(share, '?seed=1337&targetScore=100&variant=classic&dev=0&token=private');
  await share.control('challenge-invite');
  assert.equal((await share.snapshot()).state.initialSeed, 1337);
  assert(!(await share.snapshot()).controls.some((c) => c.id === 'reset-options'));
  await share.control('pause');
  await share.control('end-run');
  await share.control('share');
  const payload = await share.page.evaluate(() => globalThis.__shares[0]);
  assert.equal(new URL(payload.url).origin, 'https://games.example');
  assert.equal(new URL(payload.url).searchParams.get('seed'), '1337');
  assert(!new URL(payload.url).searchParams.has('dev'));
  assert(!new URL(payload.url).searchParams.has('token'));
  await share.context.close();
  pass('Safe share URL and fair same-seed challenge');
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('browser-report.json', output),
    JSON.stringify(
      {
        status: 'passed',
        creator: '3.8.8',
        actualDevice: false,
        adProvider: 'contract fixture; no real ad fill',
        checks,
        errors,
        videoPath,
      },
      null,
      2,
    ),
  );
  console.log('All Creator browser checks passed.');
} finally {
  await browser.close();
  server?.kill();
}
