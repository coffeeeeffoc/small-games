import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { planRoutes, LEVELS } from '../src/core/index.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../reports/browser/', import.meta.url);
await mkdir(evidence, { recursive: true });
const report = {
  environment:
    'Production Cocos Creator 3.8.8 web-mobile; desktop Chromium mobile/touch emulation, not a physical device',
  checks: [],
  errors: [],
  passed: false,
  build: JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8')),
};
let server;
const port = Number(process.env.TIANXIA_BROWSER_PORT ?? 5199),
  origin = process.env.TIANXIA_BROWSER_URL ?? 'http://127.0.0.1:' + port;
if (!process.env.TIANXIA_BROWSER_URL) {
  server = spawn(
    process.execPath,
    ['server.mjs', '--dist', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
    server.once('exit', (code) => reject(Error('Preview exited ' + code)));
  });
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
report.browser = browser.version();
const contexts = [];
const snapshot = (page) => page.evaluate(() => globalThis.tianxiaSnapshot());
const shot = (page, name) =>
  page.screenshot({ path: fileURLToPath(new URL(name + '.png', evidence)) });
const advance = (page, ms) => page.clock.runFor(Math.max(1, Math.round(ms)));
async function session({
  viewport = { width: 390, height: 844 },
  seed = 3,
  debug = false,
  init,
  ads = false,
} = {}) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('touchcancel event with cancelable=false'))
      report.errors.push(m.text());
  });
  await page.clock.install({ time: new Date('2026-10-22T00:00:00Z') });
  await page.addInitScript(
    ({ seed, ads }) => {
      Object.defineProperty(Crypto.prototype, 'getRandomValues', {
        value(array) {
          array.fill(seed);
          return array;
        },
      });
      Math.random = () => 0.3;
      if (ads) {
        globalThis.__testAdStatus = 'completed';
        globalThis.SmallGamesPublishingConfig = {
          adMode: 'host',
          provider: { show: async () => globalThis.__testHoldAd
            ? new Promise(resolve => globalThis.__finishTestAd = resolve)
            : ({ status: globalThis.__testAdStatus }) },
        };
      }
    },
    { seed, ads },
  );
  if (init) await page.addInitScript(init);
  await page.goto(origin + '/' + (debug ? '?dev=1' : ''));
  await expect(page.locator('#start')).toBeVisible();
  await page.waitForFunction(
    () => globalThis.tianxiaSnapshot?.().ready && globalThis.tianxiaSnapshot?.().artReady,
  );
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
  if (debug) await page.evaluate(() => globalThis.SmallGamesDev.setPanelHidden(true));
  return page;
}
async function begin(page) {
  await page.locator('#start').tap();
  await advance(page, 200);
  const prepared = await snapshot(page);
  assert.equal(prepared.screen, 'prepare');
  assert(prepared.cities.every((c) => c.troops === 0 && c.reserve === 0));
  await page.locator('#begin-battle').tap();
  await advance(page, 100);
  assert.equal((await snapshot(page)).screen, 'battle');
  return prepared;
}
async function mapForInput(page, timeout = 10000) {
  let map;
  await expect
    .poll(
      async () => {
        map = await page.evaluate(() => {
          const s = globalThis.tianxiaSnapshot(),
            board = document.querySelector('#board'),
            rect = board?.getBoundingClientRect(),
            points = globalThis.Tianxia.cityPoints;
          return {
            s,
            r:
              rect?.width > 0 && rect.height > 0 && getComputedStyle(board).visibility === 'visible'
                ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                : null,
            missingCityIds: (s.cities ?? [])
              .filter((c) => !Number.isFinite(points?.[c.id]?.x) || !Number.isFinite(points?.[c.id]?.y))
              .map((c) => c.id),
          };
        });
        if (
          ['prepare', 'battle'].includes(map.s.screen) &&
          map.s.ready &&
          map.s.artReady &&
          map.r &&
          map.s.cities?.length &&
          map.missingCityIds.length === 0
        )
          return null;
        // The paused browser clock must advance for Creator to project its first map frame.
        await advance(page, 50);
        return {
          screen: map.s.screen,
          ready: map.s.ready,
          artReady: map.s.artReady,
          boardVisible: !!map.r,
          cityCount: map.s.cities?.length ?? 0,
          missingCityIds: map.missingCityIds,
        };
      },
      { timeout, intervals: [25], message: 'Map must be visible with every city projected before input' },
    )
    .toBeNull();
  return map;
}
async function tapCity(page, id) {
  const { s } = await mapForInput(page),
    c = s.cities.find((c) => c.id === id);
  assert(c?.client, 'city has a camera-projected client coordinate');
  await page.touchscreen.tap(c.client.x, c.client.y);
  await advance(page, 50);
}
async function clearSelection(page) {
  const { s, r } = await mapForInput(page);
  const points = [
    { x: r.x + 8, y: r.y + r.height * 0.55 },
    { x: r.x + r.width - 8, y: r.y + r.height * 0.65 },
    { x: r.x + 8, y: r.y + r.height - 10 },
  ];
  const point = points.find((p) =>
    s.cities.every((c) => Math.hypot(c.client.x - p.x, c.client.y - p.y) > 50),
  );
  assert(point, 'unoccupied map point exists');
  await page.touchscreen.tap(point.x, point.y);
  await advance(page, 40);
}
async function select(page, id) {
  if ((await snapshot(page)).selected !== id) {
    await clearSelection(page);
    await tapCity(page, id);
  }
  assert.equal((await snapshot(page)).selected, id);
}
async function command(page, junctionId, index) {
  const s = await snapshot(page);
  const j = s.junctions.find((j) => j.id === junctionId);
  await select(page, j.cityId);
  if (index === -1) {
    await page.locator('#hold').tap();
    await advance(page, 50);
  } else await tapCity(page, j.exits[index]);
  assert.equal(
    (await snapshot(page)).junctions.find((x) => x.id === junctionId).routeIndex,
    index,
    'actual touch command applies',
  );
}
async function check(name, run) {
  if (
    process.env.TIANXIA_BROWSER_FILTER &&
    !new RegExp(process.env.TIANXIA_BROWSER_FILTER).test(name)
  )
    return;
  const start = Date.now();
  try {
    const details = await run();
    report.checks.push({ name, passed: true, durationMs: Date.now() - start, ...details });
    console.log('PASS ' + name);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.stack });
    console.error('FAIL ' + name + ': ' + error.message);
  } finally {
    while (contexts.length) await contexts.pop().close();
  }
}
try {
  await check(
    'Home, 100-level catalogue and zero-troop preparation use actual Cocos art',
    async () => {
      const page = await session();
      await expect(page).toHaveTitle('夺城令');
      await expect(page.locator('.home h1')).toHaveText('夺城令');
      await expect(page.locator('#game')).toHaveAttribute('aria-label', '夺城令');
      await shot(page, 'home-390x844');
      assert.equal(await page.locator('[data-game-dev-tools]').count(), 0);
      await page.locator('#levels').tap();
      await expect(page.locator('[data-level="crossroads"]')).toBeEnabled();
      await expect(page.locator('[data-level="campaign-002"]')).toBeDisabled();
      await shot(page, 'levels-390x844');
      for (let i = 1; i < 10; i++) await page.locator('#next-chapter').tap();
      assert.equal(await page.locator('[data-level]').count(), 10);
      await expect(page.locator('[data-level="campaign-100"]')).toBeDisabled();
      await page.locator('#back').tap();
      await page.locator('#start').tap();
      await advance(page, 200);
      const first = await snapshot(page);
      assert(first.cities.every((c) => c.troops === 0 && c.reserve === 0));
      assert(first.junctions.every((j) => j.routeIndex === -1));
      await shot(page, 'prepare-390x844');
      const bounds = await page.locator('#GameCanvas').boundingBox();
      assert(bounds.width >= 300 && bounds.height >= 500);
      assert(
        await page.evaluate(
          () =>
            !!(
              document.getElementById('GameCanvas').getContext('webgl2') ||
              document.getElementById('GameCanvas').getContext('webgl')
            ),
        ),
      );
      return {
        maps: 100,
        initial: first.cities.map((c) => ({ id: c.id, owner: c.owner, troops: c.troops })),
        creator: report.build.creator,
        artReady: first.artReady,
      };
    },
  );
  await check(
    'Tap and drag orders, hold, gesture cancellation and multitouch preserve intentions',
    async () => {
      const page = await session();
      await begin(page);
      const s = await snapshot(page),
        city = s.cities.find((c) => c.owner === 0),
        j = s.junctions.find((j) => j.cityId === city.id);
      await select(page, city.id);
      await command(page, j.id, 0);
      await advance(page, 2500);
      const moving = await snapshot(page);
      assert(
        moving.packets.some((p) => p.owner === 0),
        'orders dispatch real armies',
      );
      await command(page, j.id, -1);
      const packets = (await snapshot(page)).packets
        .filter((p) => p.owner === 0)
        .map((p) => ({ id: p.id, target: p.targetCityId }));
      const before = await snapshot(page);
      await advance(page, 1800);
      const after = await snapshot(page);
      assert(
        after.cities.find((c) => c.id === city.id).troops >
          before.cities.find((c) => c.id === city.id).troops,
      );
      for (const p of packets) {
        const active = after.packets.find((q) => q.id === p.id);
        if (active) assert.equal(active.targetCityId, p.target);
      }
      const cdp = await page.context().newCDPSession(page);
      const source = (await snapshot(page)).cities.find((c) => c.id === city.id).client;
      const target = (await snapshot(page)).cities.find((c) => c.id === j.exits[1]).client;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...source, id: 1 }],
      });
      await advance(page, 35);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...target, id: 1 }],
      });
      await advance(page, 35);
      assert.equal(
        (await snapshot(page)).junctions.find((x) => x.id === j.id).routeIndex,
        -1,
        'preview does not submit',
      );
      assert.equal((await snapshot(page)).preview, true);
      await shot(page, 'route-preview-390x844');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await advance(page, 35);
      assert.equal((await snapshot(page)).preview, false);
      assert.equal((await snapshot(page)).junctions.find((x) => x.id === j.id).routeIndex, -1);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...source, id: 1 }],
      });
      await advance(page, 35);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { ...source, id: 1 },
          { x: source.x + 30, y: source.y + 20, id: 2 },
        ],
      });
      await advance(page, 35);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await advance(page, 35);
      assert.equal((await snapshot(page)).junctions.find((x) => x.id === j.id).routeIndex, -1);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...source, id: 1 }],
      });
      await advance(page, 35);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...target, id: 1 }],
      });
      await advance(page, 35);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await advance(page, 50);
      assert.equal((await snapshot(page)).junctions.find((x) => x.id === j.id).routeIndex, 1);
      await shot(page, 'battle-390x844');
      await page.locator('#pause').tap();
      return {
        gestureChecks: [
          'select',
          'tap-target',
          'hold',
          'departed route fixed',
          'drag preview',
          'touchcancel',
          'multitouch',
          'drag commit',
        ],
      };
    },
  );
  await check(
    'Military intelligence pauses simulation, exposes every faction and restores a visible local radius',
    async () => {
      const page = await session();
      await begin(page);
      await advance(page, 2000);
      await page.locator('#intel').tap();
      await expect(page.locator('[data-source]')).toHaveCount(2);
      const before = await snapshot(page);
      await advance(page, 15000);
      assert.equal((await snapshot(page)).time, before.time);
      await shot(page, 'intel-390x844');
      await page.locator('[data-source="0"]').tap();
      await advance(page, 100);
      assert((await snapshot(page)).range.radius > 0);
      await shot(page, 'aura-390x844');
      await page.locator('#pause').tap();
      await shot(page, 'pause-390x844');
      const paused = (await snapshot(page)).time;
      await advance(page, 10000);
      assert.equal((await snapshot(page)).time, paused);
      await page.locator('#resume').tap();
      await advance(page, 1100);
      assert((await snapshot(page)).time > paused);
      return { pausedSeconds: paused, range: (await snapshot(page)).range };
    },
  );
  await check(
    'Real touch pilot wins, persists unlock and grants one free card; an injected ad upgrades only that card',
    async () => {
      const page = await session({ ads: true, seed: 3 });
      await begin(page);
      await page.locator('#skip-tutorial').tap();
      let next = 0,
        commands = 0;
      for (let step = 0; step < 65 && (await snapshot(page)).screen === 'battle'; step++) {
        const s = await snapshot(page);
        for (const c of planRoutes(s, 0, 'aggressive')) {
          if ((await snapshot(page)).screen !== 'battle') break;
          const current = (await snapshot(page)).junctions.find((j) => j.id === c.junctionId);
          if (current?.owner === 0 && current.routeIndex !== c.routeIndex) {
            await command(page, c.junctionId, c.routeIndex);
            commands++;
          }
        }
        next += 4;
        await advance(page, (next - (await snapshot(page)).time) * 1000);
      }
      const s = await snapshot(page);
      assert.equal(s.screen, 'result');
      assert.equal(s.practice, false);
      assert.equal(s.result.outcome, 'victory');
      let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')));
      assert(saved.completed.includes('crossroads'));
      assert.equal(saved.armory.cards.length, 1);
      const base = { ...saved.armory.cards[0] };
      await shot(page, 'result-victory-390x844');
      await page.evaluate(() => (globalThis.__testAdStatus = 'dismissed'));
      await page.locator('#upgrade-card').tap();
      await expect(page.locator('#notice')).toContainText('保留');
      saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')));
      assert.equal(saved.armory.cards[0].tier, base.tier);
      await page.clock.fastForward(61000);
      await page.evaluate(() => { globalThis.__testHoldAd = true; });
      await page.locator('#upgrade-card').tap();
      await page.clock.fastForward(600000);
      assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')))).armory.cards[0].tier, base.tier);
      await page.evaluate(() => globalThis.__finishTestAd({ status: 'completed' }));
      await expect(page.locator('#upgrade-card')).toHaveCount(0);
      saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')));
      assert.equal(saved.armory.cards.length, 1);
      assert.equal(saved.armory.cards[0].tier, base.tier + 1);
      assert.equal(saved.armory.cards[0].id, base.id);
      await page.locator('#result-home').tap();
      await page.locator('#armory').tap();
      await shot(page, 'armory-390x844');
      await page.locator('[data-equip]').tap();
      await page.locator('#back').tap();
      await page.locator('#levels').tap();
      await expect(page.locator('[data-level="campaign-002"]')).toBeEnabled();
      await page.locator('[data-level="campaign-002"]').tap();
      await advance(page, 120);
      assert.equal(
        (await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')))).armory
          .cards.length,
        1,
        'preparation does not consume',
      );
      await page.locator('#begin-battle').tap();
      await advance(page, 100);
      assert.equal(
        (await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')))).armory
          .cards.length,
        0,
        'starting consumes the equipped one-use card',
      );
      await page.locator('#pause').tap();
      await page.locator('#leave').tap();
      await page.reload();
      await expect(page.locator('#start')).toBeVisible();
      await page.locator('#levels').tap();
      await expect(page.locator('[data-level="campaign-002"]')).toBeEnabled();
      return {
        seed: 3,
        touchCommands: commands,
        result: s.result,
        adEvidence: 'Injected host provider only; no live SDK advertisement',
        freeCard: base,
        upgraded: saved.armory.cards[0],
      };
    },
  );
  await check('Leaving the result invalidates a late card upgrade before mutating the armory', async () => {
    const page = await session({ ads: true, seed: 0 });
    await begin(page);
    await page.locator('#skip-tutorial').tap();
    await advance(page, 181000);
    assert.equal((await snapshot(page)).screen, 'result');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')).armory);
    await page.evaluate(() => { globalThis.__testHoldAd = true; });
    await page.locator('#upgrade-card').tap();
    await page.locator('#result-home').tap();
    await page.evaluate(() => globalThis.__finishTestAd({ status: 'completed' }));
    await advance(page, 100);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')).armory), before);
    return { lateRewardIgnored: true };
  });
  await check(
    'Ordinary defeat also grants its ranking card, and retry preserves the seed',
    async () => {
      const page = await session({ seed: 0 });
      const prepared = await begin(page);
      await page.locator('#skip-tutorial').tap();
      await advance(page, 181000);
      const s = await snapshot(page);
      assert.equal(s.screen, 'result');
      assert.equal(s.result.outcome, 'defeat');
      assert.equal(
        (await page.evaluate(() => JSON.parse(localStorage.getItem('tianxia-chalu:v1')))).armory
          .cards.length,
        1,
      );
      assert.equal(
        await page.locator('#upgrade-card').count(),
        0,
        'no ad provider means no promise of an ad upgrade',
      );
      await shot(page, 'result-defeat-390x844');
      await page.locator('#again').tap();
      await advance(page, 100);
      assert.equal((await snapshot(page)).seed, prepared.seed);
      return { result: s.result, retrySeed: prepared.seed };
    },
  );
  await check(
    'Developer map trials, advanced weapons/generals and codex keep formal progress isolated',
    async () => {
      const page = await session({ debug: true });
      await page.evaluate(() => globalThis.SmallGamesDev.setPanelHidden(false));
      await page.locator('[data-toggle]').tap();
      await page.locator('[data-dev-action="level-71"]').tap();
      await page.locator('[data-close]').tap();
      await advance(page, 150);
      await page.locator('#begin-battle').tap();
      await advance(page, 31000);
      assert.equal((await snapshot(page)).practice, true);
      await shot(page, 'battle-chapter8-390x844');
      await page.locator('#pause').tap();
      await page.locator('#leave').tap();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('tianxia-chalu:v1') ?? '{}'),
      );
      assert.deepEqual(saved.completed ?? [], []);
      assert.equal(saved.armory?.cards?.length ?? 0, 0);
      await page.locator('#codex').tap();
      await shot(page, 'codex-390x844');
      await expect(page.locator('[data-tab]')).toHaveCount(3);
      return { trialLevel: 'campaign-071', formalProgress: saved.completed ?? [] };
    },
  );
  await check(
    'Equipped weapons and automatically recruited generals render, expose local effects and persist codex mastery',
    async () => {
      const page = await session({
        init: () => {
          localStorage.setItem(
            'tianxia-chalu:v1',
            JSON.stringify({
              version: 2,
              armory: {
                cards: [
                  {
                    id: 'fixture-general',
                    kind: 'general',
                    tier: 2,
                    duration: 'daily',
                    expiresAt: Date.now() + 86400000,
                  },
                  {
                    id: 'fixture-weapon',
                    kind: 'weapon',
                    tier: 1,
                    duration: 'single',
                    expiresAt: 0,
                  },
                ],
                equipped: ['fixture-general', 'fixture-weapon'],
                receipts: {},
              },
            }),
          );
        },
      });
      await begin(page);
      await page.locator('#skip-tutorial').tap();
      await advance(page, 23000);
      const s = await snapshot(page);
      assert(s.generals.some((g) => g.owner === 0));
      assert(s.cities.some((c) => c.owner === 0 && c.weapon?.kind === 'crossbow'));
      await shot(page, 'battle-general-390x844');
      await page.locator('#intel').tap();
      assert((await page.locator('[data-source]').count()) >= 4);
      await page.locator('#back').tap();
      await page.locator('#pause').tap();
      await page.locator('#leave').tap();
      await page.locator('#codex').tap();
      await page.locator('[data-tab="general"]').tap();
      await expect(page.locator('.codex-card').filter({ hasText: '猛将' })).toContainText('已掌握');
      await shot(page, 'codex-general-390x844');
      return {
        fixture:
          'Inventory supplied only to exercise equipment rendering; not progression evidence',
        generals: s.generals,
      };
    },
  );
  await check(
    'Small portrait, landscape and restored portrait retain canvas coordinates, 44px controls and match time',
    async () => {
      const page = await session();
      await begin(page);
      await page.locator('#skip-tutorial').tap();
      const checks = [];
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ]) {
        const old = await snapshot(page);
        await page.setViewportSize(viewport);
        await advance(page, 600);
        let s = await snapshot(page);
        assert.equal(s.levelId, old.levelId);
        assert(s.time >= old.time && s.time - old.time < 1.5);
        const own = s.cities.find((c) => c.owner === 0),
          j = s.junctions.find((j) => j.cityId === own.id);
        await select(page, own.id);
        await page.locator('#cycle').tap();
        await advance(page, 350);
        assert.notEqual(
          (await snapshot(page)).junctions.find((x) => x.id === j.id).routeIndex,
          j.routeIndex,
        );
        for (const id of ['pause', 'hold', 'cycle', 'intel']) {
          const b = await page.locator('#' + id).boundingBox();
          assert(
            b.width >= 44 && b.height >= 44,
            `${id} has at least 44 CSS px hit area at ${viewport.width}x${viewport.height}: ${b.width}x${b.height}`,
          );
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const canvas = await page.locator('#GameCanvas').boundingBox();
        assert(canvas.width <= viewport.width + 1 && canvas.height <= viewport.height + 1);
        await shot(page, 'battle-' + viewport.width + 'x' + viewport.height);
        checks.push({ viewport, time: (await snapshot(page)).time, canvas });
      }
      await page.locator('#pause').tap();
      return { checks };
    },
  );
  await check(
    'Background and fullscreen preserve pause; blocked storage and fullscreen refusal remain playable',
    async () => {
      const page = await session();
      await begin(page);
      await advance(page, 1200);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await snapshot(page)).screen, 'pause');
      const at = (await snapshot(page)).time;
      await advance(page, 10000);
      assert.equal((await snapshot(page)).time, at);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.locator('[data-game-fullscreen]').tap();
      await expect(page.locator('[data-game-fullscreen]')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('[data-game-fullscreen]').tap();
      await expect(page.locator('[data-game-fullscreen]')).toHaveAttribute('aria-pressed', 'false');
      assert.equal((await snapshot(page)).time, at);
      await page.locator('#resume').tap();
      await advance(page, 600);
      assert((await snapshot(page)).time > at);
      const denied = await session({
        init: () => {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
              throw new DOMException('Storage disabled', 'SecurityError');
            },
          });
          Element.prototype.requestFullscreen = () =>
            Promise.reject(new DOMException('refused', 'NotAllowedError'));
        },
      });
      await begin(denied);
      const s = await snapshot(denied),
        c = s.cities.find((c) => c.owner === 0);
      await select(denied, c.id);
      await denied.locator('#cycle').tap();
      await advance(denied, 100);
      await expect(denied.locator('#notice')).toContainText('存档暂时不可用');
      await denied.locator('#pause').tap();
      await denied.locator('[data-game-fullscreen]').tap();
      await expect(denied.locator('#game-display-notice')).toBeVisible();
      await denied.locator('#resume').tap();
      assert.equal((await snapshot(denied)).screen, 'battle');
      return {
        background: 'simulated visibility event',
        fullscreen: 'entered/exited actual browser fullscreen; refusal injected',
        storage: 'SecurityError getter; play continued',
      };
    },
  );
  await check('Coordinate input waits for a real Creator map and rejects unavailable maps', async () => {
    const page = await session();
    await assert.rejects(mapForInput(page, 250), /home/);
    await page.evaluate(async () => (await globalThis.System.import('cc')).director.pause());
    await page.locator('#start').tap();
    await advance(page, 150);
    assert((await snapshot(page)).cities.every((c) => c.client === null));
    await assert.rejects(mapForInput(page, 250), /missingCityIds/);
    await page.evaluate(() => {
      setTimeout(async () => (await globalThis.System.import('cc')).director.resume(), 600);
    });
    const { s } = await mapForInput(page);
    const city = s.cities.find((c) => c.owner === 0);
    await select(page, city.id);
    assert.equal((await snapshot(page)).selected, city.id);
    return { delayedCreatorFrameMs: 600, unavailableMapsRejected: ['home', 'unprojected prepare'] };
  });
  await check(
    'Daily equipment expires while preparing, preserving seed and planned orders',
    async () => {
      const page = await session({
        init: () =>
          localStorage.setItem(
            'tianxia-chalu:v1',
            JSON.stringify({
              version: 2,
              armory: {
                cards: [
                  {
                    id: 'expires',
                    kind: 'troops',
                    tier: 3,
                    duration: 'daily',
                    expiresAt: Date.now() + 60000,
                  },
                ],
                equipped: ['expires'],
                receipts: {},
              },
            }),
          ),
      });
      await page.locator('#start').tap();
      const { s: before } = await mapForInput(page),
        c = before.cities.find((c) => c.owner === 0);
      assert.equal(c.troops, 16);
      await select(page, c.id);
      await page.locator('#cycle').tap();
      await advance(page, 100);
      const orders = (await snapshot(page)).junctions.map((j) => j.routeIndex);
      await advance(page, 61000);
      await page.locator('#begin-battle').tap();
      await advance(page, 100);
      const after = await snapshot(page);
      assert.equal(after.seed, before.seed);
      assert.equal(after.cities.find((v) => v.id === c.id)?.troops, 0);
      assert.deepEqual(
        after.junctions.map((j) => j.routeIndex),
        orders,
      );
      await page.locator('#intel').tap();
      await expect(page.locator('[data-source]')).toHaveCount(2);
      return { seed: after.seed, expiredCardRemoved: true };
    },
  );
  report.passed = report.checks.every((c) => c.passed) && report.errors.length === 0;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  server?.kill();
  await writeFile(
    new URL('browser-report.json', evidence),
    JSON.stringify(report, null, 2) + '\n',
  );
}
if (!report.passed) process.exitCode = 1;
