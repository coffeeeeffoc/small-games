import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createTianxiaServer } from '../src/server.mjs';
import { sourceHash } from '../../../games/local/tianxia-chalu/scripts/artifact.mjs';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const reportPath = path.join(
  repository,
  'games/local/tianxia-chalu/reports/server-browser-report.json',
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-server-browser-'));
const checks = [],
  pageErrors = [],
  controlRequests = [];
let app,
  browser,
  current = Date.now(),
  failure;
const gate = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
const snapshot = (page) => page.evaluate(() => globalThis.tianxiaSnapshot());
const screen = (page, name) => expect(page.locator('body')).toHaveAttribute('data-screen', name);
const activeRoutes = (j) => j.routeIndices ?? (j.routeIndex < 0 ? [] : [j.routeIndex]);
try {
  const build = JSON.parse(
    await readFile(path.join(repository, 'games/local/tianxia-chalu/dist/build-info.json'), 'utf8'),
  );
  assert.equal(
    build.sourceHash,
    await sourceHash(),
    'Run the actual Creator build before service browser verification',
  );
  app = await createTianxiaServer({ dataDir: directory, autoTick: false, now: () => current });
  const address = await app.listen(0),
    base = 'http://127.0.0.1:' + address.port;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const session = async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('request', (r) => {
      if (/\/api\/matches\/[^/]+\/(pause|resume)$/.test(r.url())) controlRequests.push(r.url());
    });
    await page.addInitScript(() =>
      Object.defineProperty(Crypto.prototype, 'getRandomValues', {
        value(array) {
          array.fill(3);
          return array;
        },
      }),
    );
    await page.goto(base + '/play/');
    await screen(page, 'home');
    await page.waitForFunction(
      () => globalThis.tianxiaSnapshot?.().ready && globalThis.tianxiaSnapshot?.().artReady,
    );
    return page;
  };
  const page = await session();
  const advance = (ms) => {
    for (let remaining = ms; remaining > 0; ) {
      const step = Math.min(1000, remaining);
      current += step;
      app.matches.advance();
      remaining -= step;
    }
  };
  const hidden = (page, value) =>
    page.evaluate((isHidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
  const create = async () => {
    await page.locator('#start').tap();
    await expect(page.locator('#begin-battle')).toBeEnabled();
    const response = page.waitForResponse(
      (r) => r.url() === base + '/api/matches' && r.request().method() === 'POST',
    );
    await page.locator('#begin-battle').tap();
    const created = await (await response).json();
    await screen(page, 'battle');
    return app.matches.matches.get(created.matchId);
  };
  const touchCity = async (page, id) => {
    await expect
      .poll(async () => !!(await snapshot(page)).cities?.find((c) => c.id === id)?.client)
      .toBe(true);
    const p = (await snapshot(page)).cities.find((c) => c.id === id).client;
    await page.touchscreen.tap(p.x, p.y);
  };
  const surrender = async (page) => {
    await page.locator('#battle-back').tap();
    await expect(page.locator('#exit-confirm')).toBeVisible();
    await page.locator('#surrender').tap();
    await screen(page, 'home');
  };
  await expect(page).toHaveTitle('夺城令');
  await expect(page.locator('.home h1')).toHaveText('夺城令');
  await page.locator('#settings').tap();
  await expect(page.locator('#online')).toBeChecked();
  await expect(page.locator('#server-url')).toHaveValue(base);
  await page.locator('#sound').uncheck();
  await page.locator('#settings-form button[type="submit"]').tap();
  checks.push(
    'Production /play/ loads the real Cocos artifact and defaults to the authoritative service.',
  );
  const first = await create();
  const own = first.state.cities.find((c) => c.owner === 0),
    junction = first.state.junctions.find((j) => j.cityId === own.id);
  await touchCity(page, own.id);
  await expect.poll(async () => (await snapshot(page)).selected).toBe(own.id);
  const ack = page.waitForResponse((r) => r.url().endsWith('/commands'));
  await touchCity(page, junction.exits[0]);
  assert.equal((await (await ack).json()).accepted, true);
  assert.equal(first.seats[0].sequence, 1);
  assert.deepEqual(activeRoutes(junction), [0]);
  advance(2000);
  await expect(page.locator('#clock')).toHaveText('2:58');
  checks.push(
    'Real Cocos source/target touches reach the API and render accepted routes and server time.',
  );
  await page.locator('#battle-back').tap();
  await expect(page.locator('#exit-confirm')).toContainText('投降');
  assert.equal(first.paused, false);
  const confirming = first.state.time;
  advance(2000);
  await expect.poll(async () => (await snapshot(page)).time).toBe(confirming + 2);
  assert.equal((await snapshot(page)).inputBlocked, true);
  await page.locator('#keep-battling').tap();
  await screen(page, 'battle');
  await page.locator('#intel').tap();
  const intelligence = first.state.time;
  advance(1000);
  await expect.poll(async () => (await snapshot(page)).time).toBe(intelligence + 1);
  await page.locator('#back').tap();
  await hidden(page, true);
  advance(1000);
  assert.equal(first.paused, false);
  await hidden(page, false);
  await expect.poll(async () => (await snapshot(page)).time).toBe(first.state.time);
  await surrender(page);
  checks.push(
    'Return confirmation, intelligence and backgrounding never pause the authoritative battle; cancellation continues the same match.',
  );

  const simultaneous = await create();
  const troopSource = simultaneous.state.cities.find((c) => c.owner === 0);
  const sourceJunction = simultaneous.state.junctions.find((j) => j.cityId === troopSource.id);
  const relayId = sourceJunction.exits[0];
  await touchCity(page, troopSource.id);
  await touchCity(page, relayId);
  await expect.poll(() => activeRoutes(sourceJunction)).toEqual([0]);
  for (
    let i = 0;
    i < 20 && simultaneous.state.cities.find((c) => c.id === relayId).owner !== 0;
    i++
  )
    advance(1000);
  await expect
    .poll(async () => (await snapshot(page)).cities.find((c) => c.id === relayId).owner)
    .toBe(0);
  const relay = simultaneous.state.junctions.find((j) => j.cityId === relayId);
  const enemy = simultaneous.state.cities.find((c) => c.owner === 1);
  const commandReceived = gate(),
    commandRelease = gate();
  const commandsUrl = base + '/api/matches/' + simultaneous.id + '/commands';
  let intercepted = 0;
  const slowCommand = async (route) => {
    const response = await route.fetch();
    if (++intercepted === 1) {
      commandReceived.resolve();
      await commandRelease.promise;
    }
    await route.fulfill({ response });
  };
  await page.route(commandsUrl, slowCommand);
  await touchCity(page, relayId);
  await touchCity(page, enemy.id);
  await commandReceived.promise;
  await touchCity(page, troopSource.id);
  assert.equal(
    (await snapshot(page)).selected,
    troopSource.id,
    'input stays responsive while acknowledgement is pending',
  );
  await touchCity(page, sourceJunction.exits[1]);
  assert.equal((await snapshot(page)).selected, null);
  assert.equal((await snapshot(page)).queuedOrders, 1);
  commandRelease.resolve();
  await expect.poll(() => activeRoutes(sourceJunction)).toEqual([0, 1]);
  assert(activeRoutes(relay).includes(relay.exits.indexOf(enemy.id)));
  assert.equal(
    simultaneous.seats[0].sequence,
    3,
    'both independent commands are acknowledged exactly once',
  );
  await page.unroute(commandsUrl, slowCommand);
  await surrender(page);
  checks.push(
    'A delayed command acknowledgement preserves independent selection and additive multi-target orders.',
  );

  const created = gate(),
    release = gate();
  const deferCreate = async (route) => {
    const response = await route.fetch();
    created.resolve(await response.json());
    await release.promise;
    await route.fulfill({ response });
  };
  await page.route(base + '/api/matches', deferCreate);
  await page.locator('#start').tap();
  await page.locator('#begin-battle').tap();
  const data = await created.promise,
    second = app.matches.matches.get(data.matchId);
  await hidden(page, true);
  release.resolve();
  await screen(page, 'battle');
  assert.equal(second.paused, false);
  advance(1000);
  await page.unroute(base + '/api/matches', deferCreate);
  await hidden(page, false);
  await expect.poll(async () => (await snapshot(page)).time).toBe(second.state.time);
  checks.push(
    'Backgrounding during a deferred creation keeps the late-created authoritative match running.',
  );
  const outage = (route) => route.abort('internetdisconnected');
  await page.route(base + '/api/matches/**', outage);
  await expect.poll(async () => (await snapshot(page)).connectionLost).toBe(true);
  await expect(page.locator('#connection-status')).toContainText('仍在继续');
  assert.equal(second.paused, false);
  advance(180000);
  assert.equal(second.state.status, 'finished');
  await page.unroute(base + '/api/matches/**', outage);
  await screen(page, 'result');
  await expect(page.locator('#result-sync')).toContainText('已保存');
  await expect.poll(async () => (await snapshot(page)).career.pve.games).toBeGreaterThanOrEqual(1);
  const pveProfile = (await snapshot(page)).career;
  assert(
    pveProfile.recent.some((result) => result.id === second.id && [8, 12, 20].includes(result.xp)),
    'natural server PVE receives the smaller experience award',
  );
  checks.push(
    'Connection loss blocks uncertain commands without pretending to pause; polling recovers the terminal result and the smaller PVE award.',
  );
  await page.locator('#result-home').tap();

  const cancelCreated = gate(),
    cancelRelease = gate();
  const cancelCreate = async (route) => {
    const response = await route.fetch();
    cancelCreated.resolve(await response.json());
    await cancelRelease.promise;
    await route.fulfill({ response });
  };
  await page.route(base + '/api/matches', cancelCreate);
  await page.locator('#start').tap();
  await page.locator('#begin-battle').tap();
  const abandoned = await cancelCreated.promise;
  await page.locator('#back').tap();
  await screen(page, 'levels');
  cancelRelease.resolve();
  await expect
    .poll(() => app.matches.matches.get(abandoned.matchId).state.result?.reason)
    .toBe('abandoned');
  await screen(page, 'levels');
  await page.unroute(base + '/api/matches', cancelCreate);
  await page.locator('#back').tap();
  checks.push('Leaving preparation abandons deferred creation and does not reopen battle.');

  await page.locator('#matchmaking').tap();
  await screen(page, 'matchmaking');
  await expect(page.locator('#match-status')).toContainText('真人');
  assert.equal([...app.matches.matches.values()].filter((m) => m.mode === 'matched').length, 0);
  await page.locator('#match-cancel').tap();
  await screen(page, 'home');
  checks.push('A lone human remains queued with no AI substitution and can cancel.');
  const opponent = await session();
  await page.locator('#matchmaking').tap();
  await expect(page.locator('#match-status')).toContainText('真人');
  await opponent.locator('#matchmaking').tap();
  await Promise.all([screen(page, 'battle'), screen(opponent, 'battle')]);
  const [a, b] = await Promise.all([snapshot(page), snapshot(opponent)]);
  assert.equal(a.mode, 'matched');
  assert.equal(b.mode, 'matched');
  assert.deepEqual(new Set([a.playerFactionId, b.playerFactionId]), new Set([0, 1]));
  const duel = [...app.matches.matches.values()].find(
    (m) => m.mode === 'matched' && m.finishedAt === null,
  );
  assert(duel && duel.state.aiEnabled === false);
  assert.equal(
    duel.state.playerFactionId,
    0,
    'per-player projections never rewrite authoritative state',
  );
  const ownOrder = async (clientPage, snap) => {
    const source = snap.cities.find((c) => c.owner === snap.playerFactionId);
    const j = snap.junctions.find((entry) => entry.cityId === source.id);
    await touchCity(clientPage, source.id);
    await expect.poll(async () => (await snapshot(clientPage)).selected).toBe(source.id);
    const response = clientPage.waitForResponse((r) => r.url().endsWith('/commands'));
    await touchCity(clientPage, j.exits[0]);
    const accepted = await (await response).json();
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.sequence, 1);
    assert.equal(accepted.snapshot.state.playerFactionId, snap.playerFactionId);
  };
  await Promise.all([ownOrder(page, a), ownOrder(opponent, b)]);
  assert.deepEqual(
    duel.seats.map((seat) => seat.sequence),
    [1, 1],
  );
  await page.locator('#battle-back').tap();
  advance(1000);
  await expect.poll(async () => (await snapshot(opponent)).time).toBe(duel.state.time);
  assert(duel.state.time >= 1);
  await page.locator('#keep-battling').tap();
  await surrender(page);
  await screen(opponent, 'result');
  await expect(opponent.locator('#result-sync')).toContainText('已保存');
  const victory = await snapshot(opponent);
  assert.equal(victory.result.outcome, 'victory');
  assert.equal(victory.result.winnerId, b.playerFactionId);
  await expect.poll(async () => (await snapshot(opponent)).career.matched.wins).toBe(1);
  assert.equal((await snapshot(opponent)).career.xp, 100);
  await expect.poll(async () => (await snapshot(page)).career.matched.losses).toBe(1);
  const storedWinner = await opponent.evaluate(
    (origin) => JSON.parse(localStorage.getItem('tianxia-chalu:v1')).onlineProfile[origin].career,
    base,
  );
  assert.equal(storedWinner.matched.games, 1);
  const winnerSeat = duel.seats.find((seat) => seat.factionId === b.playerFactionId);
  await app.matches.result(duel.id, winnerSeat.token);
  assert.equal(
    app.players.profile(winnerSeat.playerId).career.xp,
    100,
    'reading a settled result cannot grant XP twice',
  );
  checks.push(
    'Two isolated browsers match real humans, command their own seats with independent sequences and persist exactly one victory/defeat award.',
  );
  assert.deepEqual(controlRequests, [], 'the UI sends no pause/resume controls');
  assert.deepEqual(pageErrors, []);
} catch (error) {
  failure = error;
} finally {
  await browser?.close();
  await app?.close();
  const resolved = path.resolve(directory);
  if (
    !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
    !path.basename(resolved).startsWith('tianxia-server-browser-')
  )
    throw Error('Unexpected temporary test directory');
  await rm(resolved, { recursive: true, force: true });
  const report = {
    status: failure ? 'failed' : 'passed',
    environment:
      'Chromium 390x844 touch emulation; real HTTP service and matching Creator artifact; injected service clock and client random seed, no forged state/results',
    checks,
    pageErrors,
    ...(failure ? { failure: failure.stack } : {}),
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failure) throw failure;
