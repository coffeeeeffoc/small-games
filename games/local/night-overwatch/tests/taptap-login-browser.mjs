import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const output = new URL(process.env.NIGHT_REPORT_URL || '../reports/taptap-login/', import.meta.url);
await mkdir(output, { recursive: true });
const api = 'https://api.nenggongzhiren.cn/small-games/v1';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const scope = api + '|h5||night-overwatch';
const journalKey = 'night-pending-run-v1:' + encodeURIComponent(scope) + ':' + runId;
const journal = { schema: 1, scope, version: 'night-input-replay-v8', playerId: owner,
  requestId: runId, id: runId, mode: 'level-corridor-01', levelId: 'corridor-01',
  batches: [[{ ticks: 1, input: { type: 'clearInput' } }]], tail: [], acked: 0,
  finishing: true, savedAt: Date.now() };
const credential = (id, kind) => ({ userId: id, playerId: id, game: 'night-overwatch',
  identityKind: kind, nickname: id === owner ? '已绑定飞行员' : '另一个账号',
  sessionId: id, token: (kind === 'guest' ? 'a' : 'b').repeat(64), refreshToken: 'c'.repeat(64),
  expiresAt: Date.now() + 3600000, refreshExpiresAt: Date.now() + 86400000 });
const evidence = { build, environment: 'Real packaged Creator H5 in Chromium; explicit Tap SDK/HTTP fixtures, no production player requests', checks: [], errors: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let activePage;
try {
  for (const mode of ['bind', 'cleanup-throw', 'cleanup-noop', 'fresh-device', 'other-account', 'missing-sdk']) {
    const current = mode === 'other-account' ? other : owner;
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    const requests = [], failures = [];
    let finished = false;
    await context.addInitScript(({ mode, guest, scope, journalKey, journal }) => {
      localStorage.setItem('night-overwatch-coach-v2', 'done');
      if (!localStorage.getItem('login-fixture-seeded')) {
        localStorage.setItem('login-fixture-seeded', '1');
        if (mode !== 'fresh-device') {
          localStorage.setItem('competition-session-v3:' + encodeURIComponent(scope), JSON.stringify({ ...guest, apiAuthority: scope }));
          localStorage.setItem(journalKey, JSON.stringify(journal));
        }
      }
      if (mode.startsWith('cleanup-') && !localStorage.getItem('cleanup-fault-used')) {
        localStorage.setItem('cleanup-fault-used', '1');
        const remove = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function (key) {
          if (this === localStorage && key === journalKey) {
            if (mode === 'cleanup-throw') throw Error('fixture storage busy until reload');
            return;
          }
          return remove.call(this, key);
        };
      }
      if (mode !== 'missing-sdk') globalThis.tap = { login: ({ success }) => success({ code: 'fixture-fresh-host-code' }) };
    }, { mode, guest: credential(owner, 'guest'), scope, journalKey, journal });
    await context.route('https://**/*', async route => {
      const request = route.request(), url = request.url();
      if (!url.startsWith(api + '/')) return route.abort();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' } });
      const path = url.slice(api.length), body = request.postDataJSON();
      requests.push({ path, authorized: !!request.headers().authorization });
      let result, status = 200;
      try {
        if (path === '/sessions/platform') {
          assert.equal(body.platform, 'taptap'); assert.equal(body.appId, 'tapmcjgwi2thafs87k');
          assert.equal(body.game, 'night-overwatch'); assert.equal(body.code, 'fixture-fresh-host-code');
          assert(!('secret' in body));
          result = credential(current, 'platform');
        } else if (path === '/sessions/refresh') { status = 401; result = { error: 'REFRESH_EXPIRED' }; }
        else if (path === '/sessions/logout') result = {};
        else if (path === '/games/night-overwatch') result = { identity: { playerId: current, nickname: credential(current, 'platform').nickname }, capabilities: { multiplayer: false, leaderboards: true } };
        else if (path === '/games/night-overwatch/runs/' + runId) {
          assert.equal(current, owner);
          result = { id: runId, game: 'night-overwatch', board: journal.mode, levelId: journal.levelId,
            version: journal.version, seq: finished ? 1 : 0, status: finished ? 'finished' : 'active', expiresAt: Date.now() + 3600000,
            ...(finished ? { settlement: { accepted: true, fastestEligible: true } } : {}) };
        } else if (path.endsWith('/actions')) { assert.deepEqual(body, { seq: 1, frames: journal.batches[0] }); result = {}; }
        else if (path.endsWith('/finish')) { assert.equal(body.seq, 1); finished = true; result = { accepted: true, fastestEligible: true }; }
        else throw Error('Unexpected API path: ' + path);
      } catch (error) { failures.push(error.message); status = 500; result = { error: 'FIXTURE_FAILED' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result), headers: { 'access-control-allow-origin': '*' } });
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().ui.interfaceArtworkReady && !document.getElementById('night-startup'), undefined, { timeout: 60000 });
    if (mode === 'missing-sdk') {
      await page.waitForFunction(() => SmallGamesServices.status === 'offline');
      assert.equal(requests.length, 0);
    } else {
      await page.waitForFunction(id => __night.snapshot().online.identity.playerId === id, current);
      assert.equal(requests.filter(item => item.path === '/sessions/platform').length, 1);
      assert.equal(requests.find(item => item.path === '/sessions/platform').authorized, mode !== 'fresh-device');
      if (mode === 'bind' || mode.startsWith('cleanup-')) {
        await page.waitForFunction(key => !!localStorage.getItem(key + ':synced'), journalKey);
        const remaining = await page.evaluate(key => localStorage.getItem(key), journalKey);
        if (mode === 'bind') assert.equal(remaining, null);
        else assert.equal(JSON.parse(remaining).finishing, true, 'confirmed journal remains until deletion works');
        await page.screenshot({ path: fileURLToPath(new URL(mode + '-844.png', output)) });
        const runRequests = requests.filter(item => item.path.includes('/runs/')).length;
        await page.reload();
        await page.waitForFunction(id => globalThis.__night?.snapshot().online.identity.playerId === id && SmallGamesServices.status === 'ready', current);
        await page.waitForFunction(key => localStorage.getItem(key) === null, journalKey);
        assert.equal(await page.evaluate(key => !!localStorage.getItem(key + ':synced'), journalKey), true);
        assert.equal(requests.filter(item => item.path.includes('/runs/')).length, runRequests);
        assert.equal(requests.filter(item => item.path.endsWith('/finish')).length, 1);
      } else if (mode === 'other-account') {
        assert.equal(requests.filter(item => item.path.includes('/runs/')).length, 0);
        assert.deepEqual(JSON.parse(await page.evaluate(key => localStorage.getItem(key), journalKey)), journal);
      }
    }
    assert.deepEqual(failures, []);
    assert.equal(requests.filter(item => item.path === '/sessions/guest').length, 0);
    evidence.checks.push({ mode, platformLogins: requests.filter(item => item.path === '/sessions/platform').length,
      finishes: requests.filter(item => item.path.endsWith('/finish')).length, passed: true });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(new URL('evidence.json', output), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: fileURLToPath(new URL('failed.png', output)) });
    evidence.failure = await activePage.evaluate(() => ({ title: document.title, text: document.body.innerText,
      service: globalThis.SmallGamesServices?.status, error: globalThis.SmallGamesServices?.error,
      ui: globalThis.__night?.snapshot().ui }));
  }
  await writeFile(new URL('failure.json', output), JSON.stringify(evidence, null, 2));
  throw error;
} finally { await browser.close(); }
