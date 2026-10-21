import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createGame, checkpoint, fire, update, brickCenter, FIELD } from '../core.mjs';
import { STORAGE_KEY } from '../storage.mjs';
const root = fileURLToPath(new URL('../dist/', import.meta.url)),
  evidence = fileURLToPath(new URL('../docs/design/cocos-crystal/actual/', import.meta.url));
await mkdir(evidence, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === '/iframe') {
      res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          '<link rel="icon" href="/favicon.svg"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:100vw;height:100dvh}</style><iframe allow="fullscreen; autoplay" src="/index.html?dev=0"></iframe>',
        );
      return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    assert(!path.relative(root, file).startsWith('..'));
    const target = (await stat(file)).isDirectory() ? path.join(file, 'index.html') : file;
    res
      .writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' })
      .end(await readFile(target));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  channel: 'chromium',
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
});
const report = {
  environment:
    'Linux Chromium mobile touch emulation, production dist; not physical-device validation',
  browser: browser.version(),
  checks: [],
  errors: [],
  passed: false,
};
let active;
const snap = (page) => page.locator('#arena').evaluate((e) => e.getOrbitSnapshot());
async function shot(page, dx, dy, cancel = false) {
  const state = await snap(page),
    b = await page.locator('#arena').boundingBox(),
    cdp = await page.context().newCDPSession(page);
  const map = (x, y) => ({ x: b.x + (x * b.width) / 390, y: b.y + (y * b.height) / 620 });
  const k = Math.min(1, 450 / Math.max(1, Math.abs(dy)));
  const p = map(Math.max(22, Math.min(368, state.launchX + dx * k)), Math.max(40, 574 + dy * k));
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [map(state.launchX, 574)],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`) });
}
async function targets(page, selector) {
  for (const el of await page.locator(selector).all()) {
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox(),
      v = page.viewportSize();
    assert(
      b.width >= 43.5 && b.height >= 43.5,
      `44px ${await el.getAttribute('id')} ${JSON.stringify(b)}`,
    );
    assert(
      b.x >= -0.5 &&
        b.y >= -0.5 &&
        b.x + b.width <= v.width + 0.5 &&
        b.y + b.height <= v.height + 0.5,
      `inbounds ${await el.getAttribute('id')}`,
    );
    assert(
      await el.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
      `not obscured ${await el.getAttribute('id')}`,
    );
  }
}
function data(run) {
  return {
    schemaVersion: 2,
    completed: {},
    bestEndless: 0,
    lastLevel: 'stardust',
    lastMode: run?.levelId === 'endless' ? 'endless' : 'campaign',
    sound: true,
    haptics: false,
    runs: {
      campaign: run?.levelId === 'stardust' ? checkpoint(run) : null,
      endless: run?.levelId === 'endless' ? checkpoint(run) : null,
    },
  };
}
async function open({
  run = null,
  viewport = { width: 390, height: 844 },
  ads = false,
  query = '',
  blocked = false,
} = {}) {
  if (active) await active.close();
  active = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await active.addInitScript(
    ({ saved, key, ads, blocked }) => {
      if (blocked)
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('storage blocked');
          },
        });
      else if (saved && !sessionStorage.getItem('orbit-fixture')) {
        localStorage.setItem(key, JSON.stringify(saved));
        sessionStorage.setItem('orbit-fixture', '1');
      }
      window.__contexts = [];
      const Original = window.AudioContext;
      if (Original)
        window.AudioContext = class extends Original {
          constructor(...args) {
            super(...args);
            window.__contexts.push(this);
          }
        };
      if (ads)
        window.SmallGamesPublishingConfig = {
          adMode: 'host',
          provider: {
            show: () =>
              new Promise((resolve) => {
                window.__finishAd = resolve;
              }),
            cancel() {},
          },
        };
    },
    { saved: run ? data(run) : null, key: STORAGE_KEY, ads, blocked },
  );
  const page = await active.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !m.text().startsWith('Ignored attempt to cancel a touchcancel event')
    )
      report.errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.url().startsWith(origin) && r.status() >= 400)
      report.errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(origin + query);
  await expect(page.locator('#start')).toBeVisible();
  return page;
}
function plan(state) {
  const game = createGame(state.levelId);
  for (const k of [
    'turn',
    'score',
    'count',
    'damage',
    'seed',
    'nextId',
    'waveIndex',
    'launchX',
    'upgrades',
    'bricks',
    'rewards',
  ])
    game[k] = structuredClone(state[k]);
  const points = [
    ...game.bricks.filter((b) => b.kind !== 'pickup').map(brickCenter),
    ...Array.from({ length: 13 }, (_, i) => ({ x: 27 + i * 28, y: 70 + (i % 3) * 80 })),
  ];
  let best;
  for (const p of points) {
    const d = { x: p.x - game.launchX, y: p.y - FIELD.floor + FIELD.radius + 1 },
      trial = structuredClone(game);
    fire(trial, d.x, d.y);
    for (let i = 0; trial.phase === 'flight' && i < 480; i++) update(trial, 1 / 30);
    const danger = trial.bricks
      .filter((b) => b.hp > 0 && b.kind !== 'pickup')
      .reduce((s, b) => s + b.hp * (1 + b.r * b.r), 0);
    const value =
      trial.phase === 'won'
        ? 1e9
        : trial.phase === 'lost'
          ? -1e9
          : trial.score * 100 - danger + trial.count * 25;
    if (!best || value > best.value) best = { d, value };
  }
  return best.d;
}
try {
  let page = await open({ run: createGame('stardust', { seed: 20261006 }) });
  await targets(page, '#home button');
  await capture(page, 'home-390');
  assert.equal(await page.locator('body').getAttribute('data-engine'), 'cocos-3.8.8');
  assert.equal(await page.evaluate(() => document.querySelector('canvas').getContext('2d')), null);
  const engine = await page.evaluate(async () => {
    const { cc } = await import('/vendor/cocos/bootstrap.mjs');
    return {
      version: cc.VERSION,
      sprites: cc.director.getScene().getComponentsInChildren(cc.Sprite).length,
      labels: cc.director.getScene().getComponentsInChildren(cc.Label).length,
    };
  });
  assert.equal(engine.version, '3.8.8');
  assert(engine.sprites > 5 && engine.labels > 5);
  await page.locator('#levels-button').tap();
  await expect(page.locator('.level-card:disabled')).toHaveCount(5);
  await targets(page, '#levels button');
  await capture(page, 'levels-390');
  await page.locator('[data-level="stardust"]').tap();
  await targets(page, '#playing button');
  await capture(page, 'play-390');
  const before = await snap(page);
  await shot(page, -65, -410, true);
  assert.equal((await snap(page)).shots, before.shots);
  assert.equal((await snap(page)).aiming, false);
  await shot(page, -65, -410);
  await expect.poll(async () => (await snap(page)).collisionCount).toBeGreaterThan(0);
  await capture(page, 'impact-390');
  await expect.poll(async () => (await snap(page)).audio.shatters).toBeGreaterThan(0);
  await page.locator('#pause').tap();
  const paused = await snap(page);
  await page.waitForTimeout(120);
  assert.deepEqual((await snap(page)).balls, paused.balls);
  await expect.poll(() => page.evaluate(() => window.__contexts.at(-1)?.state)).toBe('suspended');
  await capture(page, 'paused-390');
  await page.locator('#pause-sound').tap();
  await page.locator('#resume').tap();
  await expect.poll(() => page.evaluate(() => window.__contexts.at(-1)?.state)).toBe('suspended');
  await page.locator('#pause').tap();
  await page.locator('#pause-help').tap();
  await capture(page, 'help-390');
  await page.locator('#help-back').tap();
  await page.locator('#back-home').tap();
  const savedTurn = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).runs.campaign.turn,
    STORAGE_KEY,
  );
  await page.reload();
  await page.locator('#start').tap();
  assert.equal((await snap(page)).phase, 'aim');
  assert.equal((await snap(page)).turn, savedTurn);
  report.checks.push(
    'real Cocos3.8.8 WebGL Sprite/Label scene; 390px touch targets, unlocks, cancelled gesture, collision pitch+shatter, pause freeze, mute, help, pre-volley checkpoint',
  );
  // Complete the opening campaign using actual touch inputs, without modifying its rules.
  for (let turn = 0; turn < 26; turn++) {
    const state = await snap(page);
    if (['won', 'lost'].includes(state.phase)) break;
    if (state.phase === 'upgrade') {
      await capture(page, 'reward-390');
      const id = ['power', 'pierce', 'extra', 'chain', 'blast', 'critical'].find((x) =>
        state.cards.includes(x),
      );
      await page.locator(`[data-upgrade="${id}"]`).tap();
      continue;
    }
    if (state.phase === 'flight') {
      await expect
        .poll(async () => (await snap(page)).phase, { timeout: 23000 })
        .not.toBe('flight');
      continue;
    }
    const d = plan(state);
    await shot(page, d.x, d.y);
    await expect.poll(async () => (await snap(page)).phase, { timeout: 23000 }).not.toBe('flight');
  }
  assert.equal((await snap(page)).phase, 'won');
  await capture(page, 'victory-390');
  await page.locator('#next').tap();
  assert.equal((await snap(page)).levelId, 'prism');
  await page.locator('#pause').tap();
  await page.locator('#back-home').tap();
  await page.locator('#endless-button').tap();
  await page.locator('#pause').tap();
  await page.locator('#back-home').tap();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.runs.campaign.levelId, 'prism');
  assert.equal(saved.runs.endless.levelId, 'endless');
  report.checks.push(
    'natural touch campaign victory/next unlock and independent campaign/endless checkpoints',
  );
  const upgrade = createGame('endless', { seed: 41 });
  upgrade.turn = 5;
  upgrade.phase = 'upgrade';
  upgrade.cards = ['power', 'pierce', 'chain'];
  upgrade.bricks.forEach((b) => (b.r += 3));
  page = await open({ run: upgrade });
  await page.locator('#start').tap();
  await expect(page.locator('#upgrade')).toBeVisible();
  await targets(page, '#upgrade button');
  await capture(page, 'reward-390');
  const sheet = await page.locator('[data-upgrade]').first().boundingBox();
  assert(sheet.y > 844 * 0.58);
  assert(await page.locator('#arena').isVisible());
  await page.locator('[data-upgrade="power"]').tap();
  assert.equal((await snap(page)).damage, 2);
  await page.locator('#supply').tap();
  await expect(page.locator('#reward-status')).toContainText('广告暂未就绪');
  assert(await page.locator('#reward-resonance').isDisabled());
  await capture(page, 'supply-unavailable');
  await page.locator('#supply-back').tap();
  report.checks.push(
    'five-turn reward bottom sheet leaves field visible; absent SDK never gives simulated production rewards',
  );
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    page = await open({ viewport, run: upgrade });
    await targets(page, '#home button');
    await capture(page, `home-${viewport.width}`);
    await page.locator('#levels-button').tap();
    await targets(page, '#levels button');
    await capture(page, `levels-${viewport.width}`);
    await page.locator('#levels-home').tap();
    await page.locator('#start').tap();
    await targets(page, '#upgrade button');
    await capture(page, `reward-${viewport.width}`);
    await page.locator('[data-upgrade="pierce"]').tap();
    await targets(page, '#playing button');
    await page.locator('#supply').tap();
    await targets(page, '#supply-panel button');
    await capture(page, `supply-${viewport.width}`);
    await page.locator('#supply-back').tap();
    await shot(page, -30, -400);
    assert.equal((await snap(page)).shots, 1);
    await page.locator('#pause').tap();
    const frozen = await snap(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    assert.deepEqual((await snap(page)).balls, frozen.balls);
    await page.locator('#resume').tap();
    await capture(page, `rotated-from-${viewport.width}`);
  }
  report.checks.push(
    '320x568 +844x390 touch targets, saved-level layout, reward/supply panels, real gestures, rotation preserves paused volley',
  );
  const rescue = createGame('endless', { seed: 88 });
  rescue.bricks = [
    { id: 1, c: 0, r: 9, kind: 'brick', hp: 999, maxHp: 999 },
    { id: 2, c: 3, r: 8, kind: 'brick', hp: 99, maxHp: 99 },
    { id: 3, c: 1, r: 3, kind: 'brick', hp: 80, maxHp: 80 },
  ];
  rescue.nextId = 4;
  page = await open({ run: rescue, ads: true });
  await page.locator('#start').tap();
  await page.locator('#supply').tap();
  await page.locator('#reward-resonance').tap();
  await expect.poll(() => page.evaluate(() => typeof window.__finishAd)).toBe('function');
  await page.evaluate(() => window.__finishAd({ status: 'dismissed' }));
  await expect(page.locator('#reward-status')).toContainText('未领取');
  assert.equal((await snap(page)).rewards.resonance, 0);
  await page.locator('#reward-resonance').tap();
  await page.waitForTimeout(30);
  await page.evaluate(() => window.__finishAd({ status: 'completed' }));
  await expect(page.locator('#reward-status')).toContainText('已生效');
  assert.equal((await snap(page)).rewards.resonance, 1);
  assert(await page.locator('#reward-resonance').isDisabled());
  await capture(page, 'reward-ad-completed');
  await page.locator('#supply-back').tap();
  await shot(page, 0, -400);
  await page.locator('#recall').tap();
  await expect(page.locator('#result')).toBeVisible();
  await capture(page, 'failure-390');
  const loss = await snap(page);
  await page.locator('#result-supply').tap();
  await page.locator('#reward-rescue').tap();
  await page.waitForTimeout(30);
  await page.evaluate(() => window.__finishAd({ status: 'completed' }));
  await expect(page.locator('#reward-status')).toContainText('两行已清除');
  const cleared = await snap(page);
  assert.equal(cleared.score, loss.score);
  assert.equal(cleared.turn, loss.turn);
  assert.equal(cleared.rewards.rescue, 1);
  assert.equal(cleared.phase, 'aim');
  await page.locator('#supply-back').tap();
  await page.reload();
  await page.locator('#start').tap();
  assert.equal((await snap(page)).rewards.rescue, 1);
  assert.equal((await snap(page)).rewards.resonance, 1);
  report.checks.push(
    'SDK fixture dismissed/completed; once-only resonance, loss rescue, no score/turn award, persisted grants',
  );
  page = await open({ ads: true });
  await page.locator('#start').tap();
  await page.locator('#supply').tap();
  await page.locator('#reward-resonance').tap();
  await page.waitForTimeout(30);
  await page.locator('#supply-back').tap();
  await page.evaluate(() => window.__finishAd({ status: 'completed' }));
  assert.equal((await snap(page)).rewards.resonance, 0);
  await page.locator('#pause').tap();
  await page.locator('#back-home').tap();
  page = await open({ query: '/?challenge=orbit-v2&level=stardust&seed=88&targetScore=12&dev=0' });
  await page.locator('#challenge-orbit').tap();
  assert.equal((await snap(page)).challenge, true);
  assert(await page.locator('#supply').isDisabled());
  report.checks.push('cancelled/late ad completion ignored; same-seed challenge has no ad buffs');
  page = await open({ blocked: true, query: '/?dev=0' });
  await page.locator('#start').tap();
  await shot(page, 0, -400);
  assert.equal((await snap(page)).shots, 1);
  report.checks.push('blocked storage remains playable');
  page = await open({ query: '/?dev=1' });
  assert.equal(await page.evaluate(() => typeof window.__orbit.startPractice), 'function');
  await page.evaluate(() => window.__orbit.startPractice('orbit'));
  assert.equal((await snap(page)).practice, true);
  assert(await page.locator('#supply').isDisabled());
  await page.goto(origin + '/iframe');
  const frame = page.frameLocator('iframe');
  await frame.locator('#start').tap();
  await expect(frame.locator('body')).toHaveAttribute('data-screen', 'playing');
  await frame.locator('#pause').tap();
  await frame.locator('#back-home').tap();
  await capture(page, 'iframe-home');
  report.checks.push('dev practice isolation and production iframe home/play/pause/back');
  const popupReady = page.waitForEvent('popup');
  await page.evaluate(() => window.open('/?dev=0', '_blank'));
  const popup = await popupReady;
  popup.on('pageerror', (error) => report.errors.push(error.message));
  await expect(popup.locator('#start')).toBeVisible();
  await popup.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
  );
  assert.equal(popup.isClosed(), false);
  const teardown = await popup.evaluate(async () => {
    const { cc } = await import('/vendor/cocos/bootstrap.mjs');
    return { paused: cc.game.isPaused(), scene: cc.director.getScene() === null };
  });
  assert.deepEqual(teardown, { paused: true, scene: true });
  await popup.close();
  report.checks.push(
    'non-BFCache teardown releases scene and pauses Cocos without closing script-opened window',
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(
    path.join(evidence, 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log(JSON.stringify(report, null, 2));
