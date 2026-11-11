import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL('../reports/2026-11-12-game-updates/', import.meta.url);
await mkdir(out, { recursive: true });
const source = await readFile(new URL('../dist/game-service-config.js', import.meta.url), 'utf8');
const config = JSON.parse(source.match(/Object\.freeze\((\{[^]*\})\);/)[1]);
const assets = assetFixture('00000000-0000-4000-8000-000000000007');
const checks = [], browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
try {
  for (const [width, height] of [[568,320], [844,390], [1280,720]]) {
    const touch = width < 1000, context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let outdated = true, failRooms = false, missingLatest = false, failMetadata = false;
    await context.route('**/game-service-config.js', route => route.fulfill({ contentType: 'text/javascript', body:
      `globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({ ...config, competitionEnabled: true, apiUrl: 'https://night-update.test/api', release: { ...config.release, version: '1.0.16', channel: 'taptap-h5' } })});` }));
    // Keep the production bridge, identity and durable recorder; only HTTP responses are fixtures.
    await context.route('https://night-update.test/api/**', async route => {
      const path = new URL(route.request().url()).pathname, rooms = path.endsWith('/rooms'), metadata = path.endsWith('/games/night-overwatch');
      if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
      requests.push(path);
      const body = path.endsWith('/sessions/guest') ? {
        game: 'night-overwatch', playerId: assets.playerId, identityKind: 'guest', token: 'a'.repeat(64),
        sessionId: '00000000-0000-4000-8000-000000000001', refreshToken: 'b'.repeat(64),
        expiresAt: Date.now() + 900000, refreshExpiresAt: Date.now() + 86400000,
      } : metadata ? {
        identity: { playerId: assets.playerId, nickname: '夜航07' }, capabilities: { multiplayer: true, leaderboards: true },
        release: { currentBuildId: config.release.buildId, latestBuildId: outdated ? 'night-next-fixture' : config.release.buildId,
          currentVersion: '0.0.1', ...(missingLatest ? {} : { latestVersion: outdated ? '1.0.17' : '1.0.16' }),
          update: outdated ? 'required' : 'none', canStartNewGames: false, admissions: { ranked: false, multiplayer: false }, action: 'reopen' },
      } : path.endsWith('/assets') ? assets : rooms ? (failRooms ? { error: 'SERVICE_UNAVAILABLE' } : { rooms: [] }) : undefined;
      assert(body, `Unexpected API request: ${path}`);
      await route.fulfill({ status: rooms && failRooms || metadata && failMetadata ? 503 : 200, contentType: 'application/json', body: JSON.stringify(metadata && failMetadata ? { error: 'SERVICE_UNAVAILABLE' } : body) });
    });
    const click = id => press(page, id, touch, false);
    const labels = () => page.evaluate(async () => { const { director, Label } = await System.import('cc'); return director.getScene().getComponentsInChildren(Label).filter(l => l.node.activeInHierarchy).map(l => l.string).join('\n'); });
    const capture = async name => { await settleVisuals(page); assertLayout(await snapshot(page), width, height); await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, out)) }); };
    const home = async () => {
      for (let i = 0; i < 5; i++) {
        const s = await snapshot(page);
        if (s.online.panel) await click('online:back');
        else if (s.progression.page) await click('qm:back');
        else return;
      }
      assert.fail('Return to home through actual controls');
    };
    const lobby = async () => { await home(); await click('qm:modes'); await click('mode:duel'); await click('mode:enter'); };
    try {
      await page.goto(base + '?dev=0');
      await page.waitForFunction(() => globalThis.__night?.snapshot().online.release && __night.snapshot().ui.interfaceArtworkReady && !document.getElementById('night-startup'));
      await capture('home'); await click('online:version');
      await page.waitForFunction(() => !__night.snapshot().online.checkingRelease);
      let text = await labels(); assert.match(text, /游戏更新/); assert.match(text, /发现新版本/);
      assert.match(text, /当前版本：1\.0\.16 · taptap-h5/);assert.match(text, /最新版本：1\.0\.17 · taptap-h5/);assert.doesNotMatch(text,/0\.0\.1/,'current version comes from the installed client');
      assert.match(text, /构建标识：night-/); assert.doesNotMatch(text, /新对局暂不可用|中途刷新|保存与重进|正在自动保存|记录已自动保存/);
      assert(!(await snapshot(page)).buttons.some(b => b.id === 'online:releaseSave'));
      await capture('update');
      const before = requests.filter(p => p.endsWith('/games/night-overwatch')).length;
      await click('online:releaseCheck');
      await page.waitForFunction(() => !__night.snapshot().online.checkingRelease);
      assert(requests.filter(p => p.endsWith('/games/night-overwatch')).length > before);
      missingLatest = true;await click('online:releaseCheck');await page.waitForFunction(() => !__night.snapshot().online.checkingRelease);
      assert.match(await labels(),/最新版本：暂未获取/);await capture('missing-latest');
      missingLatest = false;await click('online:releaseCheck');await page.waitForFunction(() => !__night.snapshot().online.checkingRelease);
      await lobby(); await page.waitForFunction(() => __night.snapshot().online.panel === 'menu');
      assert.equal((await snapshot(page)).online.releaseIssue, undefined, 'outdated policy alone never warns');
      assert(requests.some(p => p.endsWith('/rooms')), 'compatible requests still reach the server');
      failRooms = true;
      await page.waitForFunction(() => __night.snapshot().online.recordSaveStatus === 'saved', null, { timeout: 10000 });
      await home(); await click('online:version'); await capture('request-failed');
      text = await labels(); assert.match(text, /本次请求未完成/); assert.match(text, /记录已自动保存/);
      failRooms = false; await lobby();
      await page.waitForFunction(() => !__night.snapshot().online.releaseIssue);
      await home(); await click('online:version');
      outdated = false; missingLatest = true; await click('online:releaseCheck');
      await page.waitForFunction(() => __night.snapshot().online.release.update === 'none');
      text = await labels();assert.match(text, /已是最新版本/);assert.match(text,/最新版本：1\.0\.16 · taptap-h5/,'a matching latest build identifies the same local version'); await capture('latest');
      failRooms = true; await lobby();
      await page.waitForFunction(() => __night.snapshot().online.message.includes('网络异常'));
      assert.equal((await snapshot(page)).online.releaseIssue, undefined, 'latest client failures are not blamed on an update');
      failMetadata = true;await page.reload();
      await page.waitForFunction(() => globalThis.__night?.snapshot().ui.interfaceArtworkReady && !document.getElementById('night-startup'));
      await click('settings');await click('online:version');await page.waitForFunction(() => !__night.snapshot().online.checkingRelease);
      text = await labels();assert.match(text,/当前版本：1\.0\.16 · taptap-h5/);assert.match(text,/最新版本：暂未获取/);await capture('offline');
      assert.deepEqual(errors, []);
      checks.push({ width, height, requests: requests.length, autoSaved: true, latestFailureHasNoUpdateWarning: true, currentVersionOffline: true, latestVersion: '1.0.17', missingLatestNotGuessed: true });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await writeFile(new URL('results.json', out), JSON.stringify({ build, fixture: 'HTTP only; production bridge, recorder and storage', checks }, null, 2));
console.log(`Game updates passed: ${checks.length} sizes; compatible requests, auto-save, retry recovery and latest-client failures.`);
