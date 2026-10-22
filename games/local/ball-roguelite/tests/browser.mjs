import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createGame, checkpoint, fire, update, brickCenter, FIELD, PHYSICS } from '../core.mjs';
import { LEVELS } from '../levels.mjs';
import { STORAGE_KEY } from '../storage.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const evidence = fileURLToPath(new URL('../docs/design/endless-clarity/actual/', import.meta.url));
await mkdir(evidence, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webp': 'image/webp',
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  channel: 'chromium',
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
});
const report = {
  environment:
    'Linux Chromium mobile touch emulation, production dist; not physical-device validation',
  fixtures:
    'Explicit saved-board fixtures test rare states; ad callbacks use a declared local SDK fixture, never a real advertising SDK.',
  browser: browser.version(),
  checks: [],
  errors: [],
  passed: false,
};
let active;
const snap = (page) => page.locator('#arena').evaluate((element) => element.getOrbitSnapshot());
const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const busy = (phase) => ['flight', 'recall'].includes(phase);
const screenIs = (page, name) => expect(page.locator('body')).toHaveAttribute('data-screen', name);
const settle = (page) =>
  expect.poll(async () => busy((await snap(page)).phase), { timeout: 27000 }).toBe(false);
const identity = (state) =>
  Object.fromEntries(
    [
      'levelId',
      'initialSeed',
      'seed',
      'turn',
      'shots',
      'score',
      'count',
      'damage',
      'waveIndex',
      'upgrades',
      'rewards',
    ].map((key) => [key, state[key]]),
  );
const simulation = (state) => ({
  ...identity(state),
  phase: state.phase,
  flight: state.flight,
  elapsed: state.elapsed,
  emitted: state.emitted,
  volley: state.volley,
  absorbed: state.absorbed,
  balls: state.balls,
  bricks: state.bricks,
  cards: state.cards,
  launchX: state.launchX,
});
async function frozen(page, name) {
  await screenIs(page, name);
  const before = await snap(page);
  await page.waitForTimeout(160);
  assert.deepEqual(
    simulation(await snap(page)),
    simulation(before),
    `${name} must freeze the authoritative simulation`,
  );
  return before;
}
async function noFullscreen(page) {
  await expect(
    page.locator('[data-game-fullscreen], #home-fullscreen, #pause-fullscreen'),
  ).toHaveCount(0);
}
async function centered(page) {
  const box = await page.locator('#choice-panel').boundingBox();
  const stage = await page.locator('#GameDiv').boundingBox();
  assert(box && stage, 'dialog has measurable geometry');
  assert(
    Math.abs(box.x + box.width / 2 - stage.x - stage.width / 2) < 2,
    'dialog horizontally centered',
  );
  assert(
    Math.abs(box.y + box.height / 2 - stage.y - stage.height / 2) < 2,
    'dialog vertically centered',
  );
  assert(box.height < stage.height * 0.88, 'dialog leaves surrounding scene visible');
  assert(
    box.y > stage.y && box.y + box.height < stage.y + stage.height,
    'dialog is inside the stage',
  );
}
async function shot(page, dx, dy, cancel = false) {
  const state = await snap(page),
    box = await page.locator('#arena').boundingBox();
  assert.equal(state.phase, 'aim', 'only aim may launch a real gesture');
  const baseY = FIELD.floor - FIELD.radius - 1;
  const scale = Math.min(
    1,
    dx < 0
      ? (state.launchX - FIELD.left - 3) / -dx
      : dx > 0
        ? (FIELD.right - 3 - state.launchX) / dx
        : 1,
    dy < 0 ? (baseY - FIELD.top - 3) / -dy : 1,
  );
  assert(scale > 0 && dy * scale < -6, 'planned direction remains valid within the touch board');
  const map = (x, y) => ({ x: box.x + (x * box.width) / 390, y: box.y + (y * box.height) / 620 });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [map(state.launchX, baseY)],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [map(state.launchX + dx * scale, baseY + dy * scale)],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
}
async function capture(page, name, scene = page) {
  // Semantic controls update before Cocos submits its new display list.
  await scene.locator('#GameCanvas').evaluate(async () => {
    const { cc } = await import('/vendor/cocos/bootstrap.mjs');
    for (let i = 0; i < 2; i++)
      await new Promise((resolve) => cc.director.once(cc.Director.EVENT_AFTER_DRAW, resolve));
  });
  await page.screenshot({ path: path.join(evidence, `${name}.png`) });
}
async function targets(page, selector) {
  for (const element of await page.locator(selector).all()) {
    if (!(await element.isVisible())) continue;
    const box = await element.boundingBox(),
      viewport = page.viewportSize();
    const id = await element.getAttribute('id');
    if (await element.getAttribute('data-icon')) {
      assert(
        (await element.getAttribute('aria-label'))?.trim(),
        `${id} has an accessible action name`,
      );
      assert.equal(
        await element.textContent(),
        '',
        `${id} uses a drawn icon rather than button text`,
      );
    }
    assert(box.width >= 43.5 && box.height >= 43.5, `44px ${id} ${JSON.stringify(box)}`);
    assert(
      box.x >= -0.5 &&
        box.y >= -0.5 &&
        box.x + box.width <= viewport.width + 0.5 &&
        box.y + box.height <= viewport.height + 0.5,
      `inbounds ${id}`,
    );
    assert(
      await element.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
      `not obscured ${id}`,
    );
  }
}
function data(run = null) {
  return {
    schemaVersion: 2,
    completed: {},
    bestEndless: 0,
    lastLevel: 'stardust',
    lastMode: run?.levelId === 'endless' ? 'endless' : 'campaign',
    sound: true,
    haptics: false,
    runs: {
      campaign: run && run.levelId !== 'endless' ? checkpoint(run) : null,
      endless: run?.levelId === 'endless' ? checkpoint(run) : null,
    },
  };
}
async function open({
  run = null,
  storage = null,
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
    ({ initial, key, ads, blocked }) => {
      if (blocked)
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('storage blocked');
          },
        });
      else if (initial && !sessionStorage.getItem('orbit-fixture')) {
        localStorage.setItem(key, JSON.stringify(initial));
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
      window.__adRequests = 0;
      if (ads)
        window.SmallGamesPublishingConfig = {
          adMode: 'host',
          provider: {
            show: () =>
              new Promise((resolve) => {
                window.__adRequests++;
                window.__finishAd = resolve;
              }),
            cancel() {},
          },
        };
    },
    { initial: storage || (run ? data(run) : null), key: STORAGE_KEY, ads, blocked },
  );
  const page = await active.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Ignored attempt to cancel a touchcancel event')
    )
      report.errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400)
      report.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(origin + query);
  await expect(page.locator('#start')).toBeVisible();
  await noFullscreen(page);
  return page;
}
async function leave(page, trigger = '#back-home') {
  await page.locator(trigger).tap();
  await screenIs(page, 'confirm');
  await page.locator('#confirm-accept').tap();
  await expect(page.locator('#start')).toBeVisible();
}
async function requestAd(page, button, result) {
  const previous = await page.evaluate(() => window.__adRequests);
  await page.locator(button).tap();
  await expect.poll(() => page.evaluate(() => window.__adRequests)).toBe(previous + 1);
  await page.evaluate((status) => window.__finishAd({ status }), result);
}
// Same independent trajectory search as the rules regression: no live rule/board mutation.
function plan(state) {
  const game = createGame(state.levelId, {
    seed: state.initialSeed || state.seed,
    practice: state.practice,
    challenge: state.challenge,
  });
  for (const key of [
    'turn',
    'score',
    'count',
    'damage',
    'seed',
    'initialSeed',
    'nextId',
    'waveIndex',
    'launchX',
    'upgrades',
    'bricks',
    'rewards',
    'elapsed',
    'bestCombo',
    'shots',
    'cards',
  ])
    if (state[key] !== undefined) game[key] = structuredClone(state[key]);
  const angles = Array.from(
    { length: 25 },
    (_, index) => -Math.PI + PHYSICS.minAngle + (index * (Math.PI - 2 * PHYSICS.minAngle)) / 24,
  );
  const directions = [
    ...angles.map((angle) => ({ x: Math.cos(angle) * 500, y: Math.sin(angle) * 500 })),
    ...game.bricks
      .filter((brick) => brick.hp > 0 && brick.kind !== 'pickup')
      .map(brickCenter)
      .map((point) => ({ x: point.x - game.launchX, y: point.y - FIELD.floor + FIELD.radius + 1 })),
  ];
  let best;
  for (const direction of directions) {
    const scale = Math.min(
      1,
      direction.x < 0
        ? (game.launchX - FIELD.left - 3) / -direction.x
        : direction.x > 0
          ? (FIELD.right - 3 - game.launchX) / direction.x
          : 1,
    );
    if (direction.y * scale >= -6) continue;
    const trial = structuredClone(game);
    trial.events = [];
    if (!fire(trial, direction.x, direction.y)) continue;
    for (let frame = 0; busy(trial.phase) && frame < 60 * 27; frame++) update(trial, 1 / 60);
    assert(!busy(trial.phase), 'candidate trajectory respects the flight/return deadline');
    const danger = trial.bricks
      .filter((brick) => brick.hp > 0 && brick.kind !== 'pickup')
      .reduce((sum, brick) => sum + brick.hp * (1 + brick.r * brick.r), 0);
    const value =
      trial.phase === 'lost'
        ? -1e9
        : trial.phase === 'won'
          ? 1e9
          : trial.score * 100 - danger + trial.count * 25;
    if (!best || value > best.value) best = { direction, value };
  }
  assert(best, 'a real touch-accessible aim exists');
  return best.direction;
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
      labels: cc.director
        .getScene()
        .getComponentsInChildren(cc.Label)
        .map((label) => label.string),
      graphics: cc.director.getScene().getComponentsInChildren(cc.Graphics).length,
    };
  });
  assert.equal(engine.version, '3.8.8');
  assert(
    engine.sprites > 5 && engine.graphics >= 3,
    'Cocos sprites and drawn icon paths are present',
  );
  for (const title of ['星轨弹珠', '星域挑战', '无尽模式'])
    assert(engine.labels.includes(title), `visible mode/title: ${title}`);
  assert(
    !engine.labels.some((label) => /继续旅程|重新开局/.test(label)),
    'common actions are rendered as icons',
  );
  await page.locator('#settings-button').tap();
  await centered(page);
  await targets(page, '#settings button');
  await expect(page.locator('#settings-sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-haptics')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#settings-haptics').tap();
  await expect(page.locator('#settings-haptics')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-help').tap();
  await centered(page);
  await capture(page, 'help-390');
  await page.locator('#help-back').tap();
  await screenIs(page, 'settings');
  await page.locator('#settings-close').tap();
  await screenIs(page, 'home');
  assert.equal((await saved(page)).haptics, true);
  await page.locator('#levels-button').tap();
  await expect(page.locator('.level-card')).toHaveCount(4);
  await expect(page.locator('.level-card:disabled')).toHaveCount(3);
  await expect(page.locator('#levels-page')).toHaveText('1 / 2');
  await targets(page, '#levels button');
  await capture(page, 'levels-390');
  const firstPage = await page
    .locator('.level-card')
    .evaluateAll((cards) => cards.map((card) => card.dataset.level));
  await page.locator('#levels-next').tap();
  await expect(page.locator('.level-card')).toHaveCount(4);
  await expect(page.locator('.level-card:disabled')).toHaveCount(4);
  await expect(page.locator('#levels-next')).toBeDisabled();
  const secondPage = await page
    .locator('.level-card')
    .evaluateAll((cards) => cards.map((card) => card.dataset.level));
  assert.deepEqual(
    [...firstPage, ...secondPage],
    LEVELS.map((level) => level.id),
  );
  assert.equal(new Set([...firstPage, ...secondPage]).size, 8);
  await capture(page, 'levels-page2-390');
  await page.locator('#settings-button').tap();
  await page.locator('#settings-close').tap();
  await expect(page.locator('#levels-page')).toHaveText('2 / 2');
  await page.locator('#levels-prev').tap();
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
  await page.locator('#settings-button').tap();
  const inSettings = await frozen(page, 'settings');
  await centered(page);
  await expect.poll(() => page.evaluate(() => window.__contexts.at(-1)?.state)).toBe('suspended');
  await page.locator('#settings-sound').tap();
  await expect(page.locator('#settings-sound')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#settings-help').tap();
  await frozen(page, 'help');
  await page.locator('#help-back').tap();
  assert.deepEqual(simulation(await snap(page)), simulation(inSettings));
  await capture(page, 'settings-390');
  await page.locator('#settings-close').tap();
  await screenIs(page, 'playing');
  await expect.poll(() => page.evaluate(() => window.__contexts.at(-1)?.state)).toBe('suspended');
  await page.locator('#pause').tap();
  await frozen(page, 'paused');
  await centered(page);
  await targets(page, '#paused button');
  await noFullscreen(page);
  await capture(page, 'paused-390');
  await page.locator('#resume').tap();
  await screenIs(page, 'playing');
  await expect.poll(() => page.evaluate(() => window.__contexts.at(-1)?.state)).toBe('suspended');
  await page.locator('#back-home').tap();
  const confirmation = await frozen(page, 'confirm');
  await centered(page);
  await capture(page, 'leave-confirm-390');
  await page.locator('#confirm-cancel').tap();
  await screenIs(page, 'playing');
  const continued = await snap(page);
  assert.equal(continued.initialSeed, confirmation.initialSeed);
  assert.equal(continued.shots, confirmation.shots);
  assert.equal(continued.levelId, confirmation.levelId);
  await leave(page);
  const savedTurn = (await saved(page)).runs.campaign.turn;
  await page.reload();
  await page.locator('#settings-button').tap();
  await expect(page.locator('#settings-sound')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#settings-haptics')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-close').tap();
  await page.locator('#start').tap();
  assert.equal((await snap(page)).phase, 'aim');
  assert.equal((await snap(page)).turn, savedTurn);
  report.checks.push(
    'real Cocos WebGL Sprite/Label scene; eight levels in two locked pages; cancelled touch; global settings/help back paths; settings/pause/confirmation freeze; mute survives resume/reload; pre-volley checkpoint; no fullscreen controls',
  );

  // Natural first-starfield completion: only production touchscreen inputs and upgrade buttons.
  for (let round = 0; round < 40; round++) {
    const state = await snap(page);
    if (['won', 'lost'].includes(state.phase)) break;
    if (state.phase === 'upgrade') {
      await centered(page);
      const id = ['power', 'pierce', 'extra', 'chain', 'blast', 'critical'].find((value) =>
        state.cards.includes(value),
      );
      await page.locator(`[data-upgrade="${id}"]`).tap();
    } else if (busy(state.phase)) await settle(page);
    else {
      const direction = plan(state);
      await shot(page, direction.x, direction.y);
      await settle(page);
    }
  }
  assert.equal((await snap(page)).phase, 'won');
  await capture(page, 'victory-390');
  await page.locator('#next').tap();
  assert.equal((await snap(page)).levelId, 'prism');
  await leave(page);
  await page.locator('#endless-button').tap();
  await leave(page);
  const completed = await saved(page);
  assert.equal(completed.runs.campaign.levelId, 'prism');
  assert.equal(completed.runs.endless.levelId, 'endless');
  assert(completed.completed.stardust);
  report.checks.push(
    'unmodified first campaign naturally won through actual touch trajectories; next level unlocked; campaign and endless checkpoints stay independent',
  );

  // Explicit progress fixture makes preservation of both saves and a nonzero record observable.
  const restartData = structuredClone(completed);
  const endless = createGame('endless', { seed: 3021 });
  endless.turn = 3;
  endless.shots = 3;
  endless.score = 17;
  restartData.runs.endless = checkpoint(endless);
  restartData.bestEndless = 487;
  restartData.lastMode = 'endless';
  page = await open({ storage: restartData });
  const beforeNew = await saved(page);
  await page.locator('#endless-new').tap();
  await screenIs(page, 'confirm');
  await centered(page);
  await page.locator('#confirm-cancel').tap();
  await screenIs(page, 'home');
  assert.deepEqual(await saved(page), beforeNew, 'cancelling home restart changes neither save');
  await page.locator('#endless-new').tap();
  await page.locator('#confirm-accept').tap();
  await screenIs(page, 'playing');
  let fresh = await snap(page);
  assert.equal(fresh.levelId, 'endless');
  assert.equal(fresh.turn, 0);
  assert.equal(fresh.shots, 0);
  assert.equal(fresh.score, 0);
  let progress = await saved(page);
  assert.deepEqual(progress.runs.campaign, beforeNew.runs.campaign);
  assert.deepEqual(progress.completed, beforeNew.completed);
  assert.equal(progress.bestEndless, 487);
  assert.equal(progress.sound, beforeNew.sound);
  assert.equal(progress.haptics, beforeNew.haptics);
  const unchangedSave = structuredClone(progress);
  await page.locator('#restart-run').tap();
  await frozen(page, 'confirm');
  await page.locator('#confirm-cancel').tap();
  assert.deepEqual(simulation(await snap(page)), simulation(fresh));
  assert.deepEqual(await saved(page), unchangedSave);
  await shot(page, 0, -400);
  await page.locator('#recall').tap();
  await settle(page);
  const previousRun = await snap(page);
  assert.equal(previousRun.turn, 1);
  await page.locator('#restart-run').tap();
  await page.locator('#confirm-accept').tap();
  fresh = await snap(page);
  assert.equal(fresh.turn, 0);
  assert.equal(fresh.shots, 0);
  assert.equal(fresh.score, 0);
  progress = await saved(page);
  assert.deepEqual(progress.runs.campaign, beforeNew.runs.campaign);
  assert.deepEqual(progress.completed, beforeNew.completed);
  assert.equal(progress.bestEndless, 487);
  assert.equal(progress.runs.endless.turn, 0);
  await capture(page, 'endless-restarted-390');
  report.checks.push(
    'explicit two-mode save fixture: home endless-new and in-game restart require confirmation, cancellation preserves state/save, acceptance resets only current endless run and retains campaign, record and settings',
  );

  const upgrade = createGame('endless', { seed: 41 });
  upgrade.turn = 5;
  upgrade.phase = 'upgrade';
  upgrade.cards = ['power', 'pierce', 'chain'];
  upgrade.bricks.forEach((brick) => {
    brick.r += 3;
  });
  page = await open({ run: upgrade });
  await page.locator('#start').tap();
  await expect(page.locator('#upgrade')).toBeVisible();
  await centered(page);
  await targets(page, '#upgrade button');
  await expect(page.locator('#upgrade-home, #upgrade-supply')).toHaveCount(0);
  assert(await page.locator('#arena').isVisible());
  await capture(page, 'reward-390');
  await page.locator('#settings-button').tap();
  const upgrading = await frozen(page, 'settings');
  await page.locator('#settings-close').tap();
  await screenIs(page, 'upgrade');
  assert.deepEqual(simulation(await snap(page)), simulation(upgrading));
  await page.locator('[data-upgrade="power"]').tap();
  assert.equal((await snap(page)).damage, 2);
  await page.locator('#supply').tap();
  await centered(page);
  await expect(page.locator('#reward-status')).toContainText('广告暂未就绪');
  assert(await page.locator('#reward-resonance').isDisabled());
  await capture(page, 'supply-unavailable');
  await page.locator('#supply-back').tap();
  report.checks.push(
    'explicit fifth-turn upgrade fixture: centered choice region preserves visible board; settings returns to pending upgrade; absent SDK never grants simulated production rewards',
  );

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    page = await open({ viewport, run: upgrade });
    await targets(page, '#home button');
    await capture(page, `home-${viewport.width}`);
    await page.locator('#settings-button').tap();
    await centered(page);
    await targets(page, '#settings button');
    await page.locator('#settings-help').tap();
    await centered(page);
    await targets(page, '#help button');
    await capture(page, `help-${viewport.width}`);
    await page.locator('#help-back').tap();
    await page.locator('#settings-close').tap();
    await page.locator('#levels-button').tap();
    await targets(page, '#levels button');
    await capture(page, `levels-${viewport.width}`);
    await page.locator('#levels-next').tap();
    await targets(page, '#levels button');
    await page.locator('#levels-home').tap();
    await page.locator('#start').tap();
    await centered(page);
    await targets(page, '#upgrade button');
    await expect(page.locator('#upgrade-home, #upgrade-supply')).toHaveCount(0);
    await capture(page, `reward-${viewport.width}`);
    await page.locator('[data-upgrade="pierce"]').tap();
    await targets(page, '#playing button');
    await page.locator('#supply').tap();
    await centered(page);
    await targets(page, '#supply-panel button');
    await capture(page, `supply-${viewport.width}`);
    await page.locator('#supply-back').tap();
    await page.locator('#back-home').tap();
    await centered(page);
    await targets(page, '#confirm button');
    await page.locator('#confirm-cancel').tap();
    await shot(page, -30, -400);
    assert.equal((await snap(page)).shots, 1);
    await page.locator('#pause').tap();
    const paused = await frozen(page, 'paused');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    assert.deepEqual(simulation(await snap(page)), simulation(paused));
    await centered(page);
    await noFullscreen(page);
    await page.locator('#resume').tap();
    await capture(page, `rotated-from-${viewport.width}`);
  }
  report.checks.push(
    '320x568 and 844x390 touch targets, both level pages, centered settings/help/upgrade/supply/confirmation, real gestures and rotation preserve paused volley',
  );

  // Explicit durable-target fixture: show damage cracks, then real polygon shards and return feedback.
  const glass = createGame('endless', { seed: 62 });
  glass.count = 1;
  glass.bricks = [
    // Keep the damaged glass above the centered pause panel so its evidence stays visible.
    { id: 99, c: 3, r: 0, kind: 'brick', hp: 2, maxHp: 2 },
    { id: 100, c: 0, r: 1, kind: 'brick', hp: 90, maxHp: 90 },
  ];
  glass.nextId = 101;
  page = await open({ run: glass });
  await page.locator('#start').tap();
  await shot(page, 0, -400);
  await expect
    .poll(async () => (await snap(page)).visuals.cracked, { intervals: [20, 20, 20] })
    .toBeGreaterThan(0);
  await page.locator('#pause').tap();
  await capture(page, 'damage-cracks-390');
  assert((await snap(page)).visuals.cracked > 0);
  await page.locator('#resume').tap();
  await settle(page);
  assert((await snap(page)).visuals.returns > 0);
  const glassPauseBox = await page.locator('#pause').boundingBox();
  await shot(page, 0, -400);
  await expect
    .poll(async () => (await snap(page)).visuals.shards, { intervals: [16, 16, 16] })
    .toBeGreaterThan(0);
  await page.touchscreen.tap(
    glassPauseBox.x + glassPauseBox.width / 2,
    glassPauseBox.y + glassPauseBox.height / 2,
  );
  const shattered = await frozen(page, 'paused');
  assert(shattered.visuals.shatters > 0 && shattered.visuals.maxShards >= 6);
  assert(shattered.visuals.shards > 0 && shattered.visuals.shardNodes <= 48);
  assert(shattered.audio.shatters > 0);
  await capture(page, 'crystal-shards-390');
  await page.locator('#resume').tap();
  await settle(page);
  report.checks.push(
    'explicit two-hit glass fixture uses real launches: visible cracks, six-piece crystal shatter, clear breaking audio and animated natural returns reported by scene statistics',
  );

  // Explicit absorber fixture: every actual projectile is consumed, while permanent inventory stays.
  const absorber = createGame('endless', { seed: 63 });
  absorber.bricks = [{ id: 99, c: 3, r: 6, kind: 'absorber', hp: 99, maxHp: 99 }];
  absorber.nextId = 100;
  page = await open({ run: absorber });
  await page.locator('#start').tap();
  const inventory = (await snap(page)).count;
  await shot(page, 0, -400);
  await expect
    .poll(async () => (await snap(page)).visuals.absorptions, { intervals: [20, 20, 20] })
    .toBeGreaterThan(0);
  await page.locator('#pause').tap();
  const consumed = await frozen(page, 'paused');
  assert.equal(consumed.count, inventory);
  assert(consumed.visuals.absorptions > 0);
  assert(consumed.absorbed > 0 && consumed.emitted >= consumed.absorbed);
  assert.equal(consumed.volley, inventory);
  assert(
    consumed.volley - consumed.absorbed < consumed.count,
    'absorbed marbles reduce this volley, not permanent inventory',
  );
  await capture(page, 'absorber-impact-390');
  await page.locator('#resume').tap();
  await settle(page);
  const absorbed = await snap(page);
  assert.equal(absorbed.visuals.absorptions, inventory);
  assert.equal(absorbed.absorbed, inventory);
  assert.equal(absorbed.emitted, inventory);
  assert.equal(absorbed.count, inventory);
  assert.equal(absorbed.bricks.find((brick) => brick.id === 99).hp, 99 - inventory);
  report.checks.push(
    'explicit absorber fixture consumes actual emitted marbles and reduces this volley while permanent ball count remains unchanged',
  );

  // Secondary damage is visible in the actual scene, including reduced-motion mode.
  for (const [effect, seed, reduced] of [
    ['chain', 2, false],
    ['blast', 1, false],
    ['chain', 2, true],
    ['blast', 1, true],
  ]) {
    const feedback = createGame('endless', { seed });
    feedback.seed = seed;
    feedback.count = 1;
    feedback.upgrades[effect] = 3;
    feedback.bricks = [
      { id: 99, c: 3, r: 1, kind: 'brick', hp: 170, maxHp: 170 },
      { id: 101, c: 4, r: 1, kind: 'brick', hp: 170, maxHp: 170 },
    ];
    feedback.nextId = 102;
    page = await open({ run: feedback });
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#start').tap();
    const pauseTarget = await page.locator('#pause').boundingBox();
    await shot(page, 0, -400);
    await expect
      .poll(async () => (await snap(page)).visuals[`${effect}s`], { intervals: [16, 16, 16] })
      .toBeGreaterThan(0);
    await page.touchscreen.tap(
      pauseTarget.x + pauseTarget.width / 2,
      pauseTarget.y + pauseTarget.height / 2,
    );
    const impact = await snap(page);
    assert.equal(impact.bricks.find((b) => b.id === 101).hp, 169);
    assert(impact.visuals[`${effect}s`] > 0, 'secondary damage has a visible effect');
    await capture(page, `${effect}-${reduced ? 'reduced' : 'impact'}-390`);
  }
  report.checks.push(
    'chain source/destination line and blast neighbourhood outline accompany secondary damage, including reduced motion',
  );

  // Empty-board fixture isolates shallow launch and visible accelerating manual recall.
  const returning = createGame('endless', { seed: 64 });
  returning.bricks = [];
  page = await open({ run: returning });
  await page.locator('#start').tap();
  await shot(page, 150, -12);
  await expect.poll(async () => (await snap(page)).shots).toBe(1);
  const pauseBox = await page.locator('#pause').boundingBox();
  await page.locator('#pause').tap();
  const shallow = await frozen(page, 'paused');
  assert.equal(shallow.phase, 'flight');
  assert(shallow.balls.some((ball) => Math.abs(ball.vx) > 0 && Math.abs(ball.vy / ball.vx) < 0.25));
  await capture(page, 'shallow-angle-390');
  await page.locator('#resume').tap();
  await page.locator('#recall').tap();
  // Observe the short return in one browser round trip, then send a real touch immediately.
  // Repeated locator/actionability waits can otherwise outlive the one-second animation.
  const { recalling, movingBack, hint } = await page.evaluate(async () => {
    const arena = document.querySelector('#arena');
    const recalling = arena.getOrbitSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      recalling,
      movingBack: arena.getOrbitSnapshot(),
      hint: document.querySelector('#shot-hint').textContent,
    };
  });
  await page.touchscreen.tap(pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2);
  const pausedRecall = await frozen(page, 'paused');
  assert.equal(recalling.phase, 'recall');
  assert(
    recalling.balls.length > 0 && recalling.balls.some((ball) => ball.returning),
    'recall visibly retains returning marbles',
  );
  assert(hint.includes('召回'));
  assert.equal(movingBack.phase, 'recall');
  assert(
    movingBack.balls.some((ball) => {
      const previous = recalling.balls.find((other) => other.id === ball.id);
      return previous && Math.hypot(ball.x - previous.x, ball.y - previous.y) > 0.1;
    }),
    'returning marbles visibly travel before settlement',
  );
  assert.equal(pausedRecall.phase, 'recall');
  assert(pausedRecall.balls.length > 0, 'manual recall is not instant deletion');
  await capture(page, 'manual-recall-390');
  await page.locator('#resume').tap();
  await settle(page);
  const returned = await snap(page);
  assert.equal(returned.turn, 1);
  assert(returned.visuals.recalls > 0 && returned.visuals.returns > 0);
  assert.equal(returned.balls.length, 0);
  await capture(page, 'marbles-returned-390');
  report.checks.push(
    'actual shallow-angle touch is accepted; recall remains visible with moving marbles, pauses exactly, resumes and settles only after return animation',
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
  await requestAd(page, '#reward-resonance', 'dismissed');
  await expect(page.locator('#reward-status')).toContainText('未领取');
  assert.equal((await snap(page)).rewards.resonance, 0);
  await requestAd(page, '#reward-resonance', 'completed');
  await expect(page.locator('#reward-status')).toContainText('已生效');
  assert.equal((await snap(page)).rewards.resonance, 1);
  assert(await page.locator('#reward-resonance').isDisabled());
  await capture(page, 'reward-ad-completed');
  await page.locator('#supply-back').tap();
  await shot(page, 0, -400);
  await page.locator('#recall').tap();
  await settle(page);
  await expect(page.locator('#result')).toBeVisible();
  await capture(page, 'failure-390');
  const loss = await snap(page);
  await page.locator('#result-supply').tap();
  await requestAd(page, '#reward-rescue', 'completed');
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
    'declared local SDK fixture: dismissed/completed callbacks, once-only resonance, animated-recall loss, rescue without score/turn awards, persisted grants; no real SDK claimed',
  );

  page = await open({ ads: true });
  await page.locator('#start').tap();
  await page.locator('#supply').tap();
  await page.locator('#reward-resonance').tap();
  await expect.poll(() => page.evaluate(() => window.__adRequests)).toBe(1);
  await page.locator('#supply-back').tap();
  await page.evaluate(() => window.__finishAd({ status: 'completed' }));
  assert.equal((await snap(page)).rewards.resonance, 0);
  await leave(page);
  page = await open({ query: '/?challenge=orbit-v3&level=stardust&seed=88&targetScore=12&dev=0' });
  await page.locator('#challenge-orbit').tap();
  assert.equal((await snap(page)).challenge, true);
  assert(await page.locator('#supply').isDisabled());
  report.checks.push(
    'late ad completion after cancellation is ignored; current same-seed challenge disables advertising buffs',
  );
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
  await screenIs(frame, 'playing');
  await frame.locator('#settings-button').tap();
  await screenIs(frame, 'settings');
  await frame.locator('#settings-close').tap();
  await screenIs(frame, 'playing');
  await frame.locator('#pause').tap();
  await screenIs(frame, 'paused');
  await frame.locator('#resume').tap();
  await frame.locator('#back-home').tap();
  await frame.locator('#confirm-cancel').tap();
  await screenIs(frame, 'playing');
  await leave(frame);
  await noFullscreen(frame);
  await capture(page, 'iframe-home', frame);
  report.checks.push(
    'dev practice isolation and production iframe settings/play/pause/direct-return cancellation and confirmation',
  );
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
    'non-BFCache teardown releases the scene and pauses Cocos without closing the script-opened window',
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(
    path.join(evidence, 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
