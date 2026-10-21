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
  'games/local/tianxia-chalu/docs/design/cocos-2026-10-22/server-browser-report.json',
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-server-browser-'));
const checks = [],
  pageErrors = [];
let app,
  browser,
  current = Date.now(),
  failure;
const gate = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript(() =>
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      value(array) {
        array.fill(3);
        return array;
      },
    }),
  );
  const screen = (name) => expect(page.locator('body')).toHaveAttribute('data-screen', name);
  const snapshot = () => page.evaluate(() => globalThis.tianxiaSnapshot());
  const advance = (ms) => {
    for (let remaining = ms; remaining > 0; ) {
      const step = Math.min(1000, remaining);
      current += step;
      app.matches.advance();
      remaining -= step;
    }
  };
  const hidden = (value) =>
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
    await screen('battle');
    return app.matches.matches.get(created.matchId);
  };
  const pause = async (match) => {
    await page.locator('#pause').tap();
    await screen('pause');
    await expect(page.locator('#pause-note')).toContainText('服务端已暂停');
    assert.equal(match.paused, true);
  };
  const resume = async (match) => {
    await page.locator('#resume').tap();
    await screen('battle');
    assert.equal(match.paused, false);
  };
  await page.goto(base + '/play/');
  await screen('home');
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
  await expect
    .poll(async () => !!(await snapshot()).cities.find((c) => c.id === own.id)?.client)
    .toBe(true);
  const point = (await snapshot()).cities.find((c) => c.id === own.id).client;
  await page.touchscreen.tap(point.x, point.y);
  await expect.poll(async () => (await snapshot()).selected).toBe(own.id);
  const ack = page.waitForResponse((r) => r.url().endsWith('/commands'));
  await page.locator('#cycle').tap();
  assert.equal((await (await ack).json()).accepted, true);
  assert.equal(first.sequence, 1);
  assert.equal(junction.routeIndex, 0);
  advance(2000);
  await expect(page.locator('#clock')).toHaveText('2:58');
  checks.push(
    'A real Cocos city touch plus direction control reaches the API and renders the accepted route and server time.',
  );
  await pause(first);
  const paused = first.state.time;
  advance(10000);
  assert.equal(first.state.time, paused);
  await resume(first);
  advance(1000);
  await expect(page.locator('#clock')).toHaveText('2:57');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await screen('pause');
  await expect(page.locator('#pause-note')).toContainText('服务端已暂停');
  assert.equal(first.paused, true);
  advance(1000);
  assert.equal(first.state.time, paused + 1);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await page.locator('#leave').tap();
  await screen('home');
  checks.push(
    'Pause, resume and BFCache-style pagehide keep the server match paused without abandoning it.',
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
  await hidden(true);
  release.resolve();
  await screen('pause');
  await expect(page.locator('#pause-note')).toContainText('服务端已暂停');
  assert.equal(second.paused, true);
  advance(10000);
  assert.equal(second.state.time, 0);
  await page.unroute(base + '/api/matches', deferCreate);
  await hidden(false);
  await resume(second);
  checks.push(
    'Backgrounding during deferred creation pauses the late-created match before gameplay.',
  );
  await pause(second);
  const resumed = gate(),
    resumeRelease = gate(),
    resumeUrl = base + '/api/matches/' + second.id + '/resume';
  const deferResume = async (route) => {
    const response = await route.fetch();
    resumed.resolve();
    await resumeRelease.promise;
    await route.fulfill({ response });
  };
  await page.route(resumeUrl, deferResume);
  await page.locator('#resume').tap();
  await resumed.promise;
  await hidden(true);
  resumeRelease.resolve();
  await expect.poll(() => second.paused).toBe(true);
  await screen('pause');
  advance(10000);
  assert.equal(second.state.time, 0);
  await page.unroute(resumeUrl, deferResume);
  await hidden(false);
  await resume(second);
  checks.push('Backgrounding during deferred resume returns to a paused authoritative match.');
  const outage = (route) => route.abort('internetdisconnected');
  await page.route(base + '/api/matches/**', outage);
  await screen('pause');
  await expect(page.locator('#pause-note')).toContainText('尚未确认服务端暂停');
  assert.equal(second.paused, false);
  advance(180000);
  assert.equal(second.state.status, 'finished');
  const resumeRequests = [];
  const observe = (request) => {
    if (request.url() === resumeUrl) resumeRequests.push(request.url());
  };
  page.on('request', observe);
  await page.unroute(base + '/api/matches/**', outage);
  await page.locator('#resume').tap();
  await screen('result');
  await expect(page.locator('#result-sync')).toHaveText('服务端战报已保存');
  assert.equal(resumeRequests.length, 0);
  page.off('request', observe);
  checks.push(
    'An outage never falsely claims pause; reconnect fetches a terminal result without a rejected resume POST.',
  );
  await page.locator('#result-home').tap();
  const third = await create();
  await pause(third);
  advance(301000);
  assert.equal(third.state.result.reason, 'expired');
  await page.locator('#resume').tap();
  await screen('result');
  await expect(page.locator('.result-heading')).toContainText('离线过久');
  await expect(page.locator('.result-heading')).not.toContainText('第 0 名');
  await expect(page.locator('#result-sync')).toHaveText('服务端战报已保存');
  checks.push('Expired match explains expiry and awards no card or invented rank.');
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
  await screen('levels');
  cancelRelease.resolve();
  await expect
    .poll(() => app.matches.matches.get(abandoned.matchId).state.result?.reason)
    .toBe('abandoned');
  await screen('levels');
  await page.unroute(base + '/api/matches', cancelCreate);
  checks.push(
    'Leaving preparation cancels a deferred creation, abandons its late server match and never reopens battle.',
  );
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
      'Chromium 390x844 touch emulation; real HTTP service and real Creator artifact; injected service clock, no forged results',
    checks,
    pageErrors,
    ...(failure ? { failure: failure.stack } : {}),
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failure) throw failure;
