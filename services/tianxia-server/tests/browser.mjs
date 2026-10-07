import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { createTianxiaServer } from '../src/server.mjs';

// Exercise the shipped client against the real HTTP service. The injected clock
// advances existing service rules; there are no production debug hooks or forged results.
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const reportPath = path.join(
  repository,
  'games/local/tianxia-chalu/docs/design/server-browser-report.json',
);
const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-server-browser-'));
const checks = [];
const pageErrors = [];
let app;
let browser;
let current = Date.now();
let failure;

const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

try {
  await promisify(execFile)('pnpm', ['--filter', '@coffeeeeffoc/tianxia-chalu', 'build'], {
    cwd: repository,
  });
  app = await createTianxiaServer({ dataDir: directory, autoTick: false, now: () => current });
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const screen = (name) => expect(page.locator('body')).toHaveAttribute('data-screen', name);
  const advance = (milliseconds) => {
    for (let remaining = milliseconds; remaining > 0; ) {
      const step = Math.min(1000, remaining);
      current += step;
      app.matches.advance();
      remaining -= step;
    }
  };
  const hidden = (value) =>
    page.evaluate((isHidden) => {
      // A deterministic visibility event tests lifecycle handling; this is not a
      // claim of operating-system background suspension or physical-device coverage.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
  const create = async () => {
    const response = page.waitForResponse(
      (entry) => entry.url() === `${base}/api/matches` && entry.request().method() === 'POST',
    );
    await page.locator('#start').tap();
    const created = await (await response).json();
    await screen('battle');
    return app.matches.matches.get(created.matchId);
  };
  const pause = async (match) => {
    await page.locator('#pause').tap();
    await screen('pause');
    await expect(page.locator('#resume')).toBeEnabled();
    assert.equal(match.paused, true);
  };
  const resume = async (match) => {
    await page.locator('#resume').tap();
    await screen('battle');
    assert.equal(match.paused, false);
  };

  await page.goto(`${base}/play/`);
  await screen('home');
  await expect(page.locator('.home-status')).toContainText('服务端对局');
  await page.locator('#settings').tap();
  await expect(page.locator('#online')).toBeChecked();
  await expect(page.locator('#server-url')).toHaveValue(base);
  await page.locator('#check-server').tap();
  await expect(page.locator('#settings-message')).toContainText('连接成功');
  await page.locator('#sound').uncheck();
  await page.locator('#settings-form button[type="submit"]').tap();
  checks.push('Production /play/ defaults to the real service; settings health protocol succeeds.');

  const first = await create();
  const junction = first.state.junctions.find((entry) => entry.id === 'redgate-switch');
  const initialRoute = junction.routeIndex;
  const commandResponse = page.waitForResponse((entry) => entry.url().endsWith('/commands'));
  await page.locator('[data-junction="redgate-switch"]').tap();
  const command = await (await commandResponse).json();
  assert.equal(command.accepted, true);
  assert.equal(first.sequence, 1);
  assert.notEqual(junction.routeIndex, initialRoute);
  await expect(page.locator('[data-junction="redgate-switch"]')).toHaveAttribute(
    'data-route',
    junction.exits[junction.routeIndex],
  );
  advance(2000);
  await expect(page.locator('#timer')).toHaveText('02:58');
  checks.push(
    'A touch route command reaches the authoritative API and its changed route/time render.',
  );

  await pause(first);
  const pausedTime = first.state.time;
  advance(10000);
  assert.equal(first.state.time, pausedTime);
  await resume(first);
  advance(1000);
  await expect(page.locator('#timer')).toHaveText('02:57');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await screen('pause');
  await expect(page.locator('#resume')).toBeEnabled();
  assert.equal(first.paused, true);
  advance(1000);
  assert.equal(first.state.time, pausedTime + 1);
  checks.push('Pause/resume freezes authoritative time without catch-up; pagehide also pauses.');
  await page.locator('#leave').tap();
  await screen('home');

  const createdGate = gate();
  const creationRelease = gate();
  const deferredCreation = async (route) => {
    const response = await route.fetch();
    createdGate.resolve(await response.json());
    await creationRelease.promise;
    await route.fulfill({ response });
  };
  await page.route(`${base}/api/matches`, deferredCreation);
  await page.locator('#start').tap();
  const secondData = await createdGate.promise;
  const second = app.matches.matches.get(secondData.matchId);
  await screen('loading');
  await hidden(true);
  creationRelease.resolve();
  await screen('pause');
  await expect(page.locator('#resume')).toBeEnabled();
  assert.equal(second.paused, true);
  advance(10000);
  assert.equal(second.state.time, 0);
  await page.unroute(`${base}/api/matches`, deferredCreation);
  await hidden(false);
  await resume(second);
  checks.push(
    'Backgrounding during deferred match creation pauses the late-created match before play.',
  );

  await pause(second);
  const resumedGate = gate();
  const resumeRelease = gate();
  const resumeUrl = `${base}/api/matches/${second.id}/resume`;
  const deferredResume = async (route) => {
    const response = await route.fetch();
    resumedGate.resolve();
    await resumeRelease.promise;
    await route.fulfill({ response });
  };
  await page.route(resumeUrl, deferredResume);
  await page.locator('#resume').tap();
  await resumedGate.promise;
  await hidden(true);
  resumeRelease.resolve();
  await expect.poll(() => second.paused).toBe(true);
  await screen('pause');
  await expect(page.locator('#resume')).toBeEnabled();
  advance(10000);
  assert.equal(second.state.time, 0);
  await page.unroute(resumeUrl, deferredResume);
  await hidden(false);
  await resume(second);
  checks.push('Backgrounding during deferred resume returns to a paused authoritative match.');

  const outage = (route) => route.abort('internetdisconnected');
  await page.route(`${base}/api/matches/**`, outage);
  await screen('pause');
  await expect(page.locator('#pause-note')).toContainText('网络未确认暂停');
  await expect(page.locator('#resume')).toBeEnabled();
  assert.equal(second.paused, false);
  advance(180000);
  assert.equal(second.state.status, 'finished');
  const resumeRequests = [];
  const observeResume = (request) => {
    if (request.url() === resumeUrl) resumeRequests.push(request);
  };
  page.on('request', observeResume);
  await page.unroute(`${base}/api/matches/**`, outage);
  await page.locator('#resume').tap();
  await screen('result');
  await expect(page.locator('#result-sync')).toHaveText('服务端战报已保存');
  assert.equal(
    resumeRequests.length,
    0,
    'A terminal reconnect must fetch the result without POST resume.',
  );
  page.off('request', observeResume);
  checks.push(
    'After an outage, a completed service match reconnects directly to its persisted result.',
  );

  await page.locator('#result-home').tap();
  const third = await create();
  await pause(third);
  advance(301000);
  assert.equal(third.state.result.reason, 'expired');
  await page.locator('#resume').tap();
  await screen('result');
  await expect(page.locator('.result-heading')).toContainText('离线过久，对局已结束');
  await expect(page.locator('.result-heading')).not.toContainText('三分钟已至');
  await expect(page.locator('#result-sync')).toHaveText('服务端战报已保存');
  checks.push(
    'A paused session expiring on the service explains expiry instead of a false three-minute defeat.',
  );
  assert.deepEqual(pageErrors, []);
} catch (error) {
  failure = error;
} finally {
  const report = {
    status: failure ? 'failed' : 'passed',
    browser: browser ? `Chromium ${browser.version()}` : 'not started',
    viewport: '390 × 844, mobile touch emulation',
    backend: 'Real HTTP service, isolated temporary result directory, injected service clock',
    limitations:
      'Visibility and pagehide events are deterministic simulations; no physical device or operating-system suspension tested.',
    checks,
    pageErrors,
    ...(failure ? { failure: failure.message } : {}),
  };
  await browser?.close();
  await app?.close();
  await rm(directory, { recursive: true, force: true });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
if (failure) throw failure;
