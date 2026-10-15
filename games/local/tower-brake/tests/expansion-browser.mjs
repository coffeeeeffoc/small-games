import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { LEVELS } from '../levels.mjs';

import { RANKED_RULE_VERSION } from '../engine.mjs';

const gameId = 'tower-brake';
const cage = gameId === 'cage-rescue';
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/design/endless-2026-10-12/', import.meta.url);
const port = cage ? 4473 : 4474;
const origin = `http://127.0.0.1:${port}`;
execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', String(port)], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const report = {
  gameId,
  browser: await browser.version(),
  checks: [],
  screenshots: [],
  limitations: [
    'Desktop Chromium with emulated touch; no physical phone. API routes below are UI contract fixtures, not backend verification.',
  ],
};
const errors = [];
const selectors = cage
  ? {
      levels: '#levels',
      levelsBack: '#levels-screen [data-back]',
      board: '#leaderboard',
      boardBack: '#leaderboard-screen [data-back]',
      endless: '#endless',
      pause: '#pause',
      resume: '#resume',
      home: '#home',
      label: '#level-name',
    }
  : {
      levels: '#choose-level',
      levelsBack: '#levels-home',
      board: '#leaderboard-button',
      boardBack: '#leaderboard-home',
      endless: '#endless-game',
      pause: '#pause-button',
      resume: '#resume-game',
      home: '#pause-home',
      label: '#level-label',
    };
async function createContext() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  return context;
}
async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/?dev=0', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(selectors.endless)).toBeVisible();
  return page;
}
async function shot(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', evidence)) });
  report.screenshots.push(name + '.png');
}
try {
  await mkdir(evidence, { recursive: true });
  const context = await createContext();
  const requests = [];
  await context.route('**/api/competition/v1/**', async (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url() });
    if (request.method() !== 'GET') return route.abort('internetdisconnected');
    const board = request.url().includes('/leaderboards/');
    const row = {
      rank: 1,
      name: '<img src=x onerror=alert(1)>',
      score: board && request.url().endsWith('/campaign') ? 30 : 42,
      secondary: 12345,
    };
    return route.fulfill({
      json: board
        ? { top: [row], me: { ...row, rank: 2 } }
        : {
            identity: { kind: 'anonymous', playerId: null, name: null },
            boards: ['campaign', 'endless'],
          },
    });
  });
  const page = await open(context);
  await shot(page, 'actual-home');
  await page.locator(selectors.levels).tap();
  await expect(page.locator('[data-level]')).toHaveCount(30);
  await expect(page.locator('[data-level]:disabled')).toHaveCount(29);
  await page.locator('[data-level="29"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-level="29"]')).toBeVisible();
  await shot(page, 'actual-levels');
  await page.locator(selectors.levelsBack).tap();
  await page.locator(selectors.board).tap();
  await expect(page.locator('#leaderboard-identity')).toContainText('未登录');
  await expect(page.locator('#leaderboard-list')).toContainText(cage ? '42 人' : '42 层');
  await page.locator('[data-board="campaign"]').tap();
  await expect(page.locator('#leaderboard-list')).toContainText('第 30 关 · 12.3 秒');
  await expect(page.locator('#leaderboard-list img')).toHaveCount(0);
  await expect(page.locator('#leaderboard-me')).toContainText('2');
  assert.ok(
    requests.every((item) => item.method === 'GET'),
    'reading boards must not create a guest session',
  );
  await shot(page, 'actual-leaderboard');
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const selector of [selectors.boardBack, '#leaderboard-retry', '[data-board="campaign"]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(
        box && box.height >= 44 && box.x >= 0 && box.x + box.width <= viewport.width + 1,
        selector,
      );
    }
    await shot(page, `actual-leaderboard-${viewport.width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  report.checks.push(
    '30 routes, 29 locked, last route scrollable; two board types, safe names, milliseconds displayed as seconds, anonymous read has no session mutation',
  );
  await page.locator(selectors.boardBack).tap();
  const saved = cage
    ? {
        version: 'legacy',
        value: {
          version: 1,
          completed: Object.fromEntries(
            LEVELS.slice(0, 6).map((level) => [level.id, { rescued: 6, seconds: 30, lives: 3 }]),
          ),
        },
      }
    : {
        version: 1,
        unlocked: 8,
        selected: 7,
        best: { 'last-descent': { elapsed: 12, maxStreak: 6, brakesUsed: 1 } },
      };
  await page.evaluate(
    ({ cage, saved }) =>
      localStorage.setItem(
        cage ? 'cage-rescue:host:progress' : 'tower-brake-v1',
        JSON.stringify(saved),
      ),
    { cage, saved },
  );
  await page.reload();
  await page.locator(selectors.levels).tap();
  await expect(page.locator('[data-level]:not(:disabled)')).toHaveCount(cage ? 7 : 9);
  await page.locator(selectors.levelsBack).tap();
  await page.locator(selectors.endless).tap();
  await expect(page.locator(selectors.label)).toContainText('无尽');
  if (cage) {
    await expect(page.locator('#launch')).toBeEnabled();
    await page.locator('#launch').tap();
  }
  await page.locator(selectors.pause).tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await shot(page, 'actual-endless-pause');
  await page.locator(selectors.resume).tap();
  await expect(page.locator('#play-screen')).toBeVisible();
  await page.locator(selectors.pause).tap();
  await page.locator(selectors.home).tap();
  await expect(page.locator(selectors.endless)).toBeVisible();
  report.checks.push(
    'legacy clears unlock the next new route; offline endless entry, pause, resume and home remain usable',
  );
  // Seed previously earned progress only to inspect chapter artwork through the real selection UI.
  const advancedSave = cage
    ? {
        version: 'preview',
        value: {
          version: 1,
          completed: Object.fromEntries(
            LEVELS.slice(0, 24).map((level) => [level.id, { rescued: 6, seconds: 30, lives: 3 }]),
          ),
        },
      }
    : { version: 1, unlocked: 25, selected: 24 };
  await page.evaluate(
    ({ cage, value }) =>
      localStorage.setItem(
        cage ? 'cage-rescue:host:progress' : 'tower-brake-v1',
        JSON.stringify(value),
      ),
    { cage, value: advancedSave },
  );
  await page.reload();
  await page.locator(selectors.levels).tap();
  await page.locator('[data-level="24"]').scrollIntoViewIfNeeded();
  await page.locator('[data-level="24"]').tap();
  if (cage) await expect(page.locator('#launch')).toBeEnabled();
  await shot(page, 'actual-mechanics');
  report.checks.push(
    'combined chapter artwork is rendered through normal selection with a prepared progress fixture',
  );
  await context.close();

  // Delayed optional module must not indefinitely freeze local play or start a cancelled run.
  const delayed = await createContext();
  let sessions = 0;
  await delayed.route('**/game-services.js', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2300));
    await route.fulfill({ response }).catch(() => {});
  });
  await delayed.route('**/api/competition/v1/**', (route) => {
    if (route.request().method() === 'POST') sessions++;
    return route.abort('internetdisconnected');
  });
  const latePage = await open(delayed);
  await latePage.locator(selectors.endless).tap();
  await latePage.locator(selectors.pause).tap();
  await latePage.locator(selectors.home).tap();
  await latePage.waitForTimeout(2500);
  await expect(latePage.locator(selectors.endless)).toBeVisible();
  assert.equal(sessions, 0, 'a late module must not start a run cancelled at home');
  await latePage.locator(selectors.endless).tap();
  if (cage) {
    await expect(latePage.locator('#launch')).toBeEnabled({ timeout: 2500 });
    await latePage.locator('#launch').tap();
  } else
    await expect(latePage.locator('#charge-hint')).not.toContainText('准备', { timeout: 2500 });
  report.checks.push(
    'late optional module cannot restart a cancelled run; local retry remains playable',
  );
  await delayed.close();
  const blocked = await createContext();
  let releaseModule;
  const moduleGate = new Promise((resolve) => {
    releaseModule = resolve;
  });
  await blocked.route('**/game-services.js', async (route) => {
    await moduleGate;
    await route.abort('internetdisconnected').catch(() => {});
  });
  const blockedPage = await open(blocked);
  await blockedPage.locator(selectors.endless).tap();
  if (cage) {
    await expect(blockedPage.locator('#launch')).toBeEnabled({ timeout: 2500 });
    await blockedPage.locator('#launch').tap();
    await expect(blockedPage.locator('#launch')).toBeHidden();
  } else {
    await expect(blockedPage.locator('#charge-hint')).not.toContainText('准备', { timeout: 2500 });
    await blockedPage.locator('#brake-button').tap();
    await expect(blockedPage.locator('#brake-button')).toHaveAttribute('data-charges', '0');
  }
  releaseModule();
  await blocked.close();
  report.checks.push(
    '320px and landscape leaderboard controls remain touch sized; a module that never loads cannot freeze local input beyond startup timeout',
  );
  // Production artifact handshake: only compatible runs may submit input.
  for (const variant of ['same', 'old', 'new', 'missing', 'legacy-strict', 'rejected']) {
    const versionContext = await createContext();
    const writes = [];
    await versionContext.route('**/api/competition/v1/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST') writes.push({ path, body: request.postDataJSON() });
      if (path.endsWith('/sessions/guest'))
        return route.fulfill({ json: { token: 'a'.repeat(64), expiresAt: Date.now() + 3600000 } });
      if (path.endsWith('/runs')) {
        assert.equal(request.postDataJSON().version, RANKED_RULE_VERSION);
        if (variant === 'legacy-strict' || variant === 'rejected')
          return route.fulfill({
            status: variant === 'legacy-strict' ? 422 : 409,
            json: { error: variant === 'legacy-strict' ? 'INVALID_INPUT' : 'RULE_VERSION_CHANGED' },
          });
        return route.fulfill({ json: {
          id: 'version-run', seed: 73, seq: 0,
          ...(variant === 'missing' ? {} : {
            version: variant === 'same' ? RANKED_RULE_VERSION : `${RANKED_RULE_VERSION}-${variant}`,
          }),
        } });
      }
      return route.fulfill({ json: path.endsWith('/finish') ? { accepted: true } : {} });
    });
    const versionPage = await open(versionContext);
    await versionPage.locator(selectors.endless).tap();
    if (variant === 'same') {
      await expect(versionPage.locator('#ranking-note')).toHaveText('成绩验证中');
    } else {
      const updatePrompt = versionPage.locator(cage ? '#toast' : '#feedback');
      await expect(updatePrompt).toBeVisible();
      await expect(updatePrompt).toContainText('请更新后重试');
      await expect(versionPage.locator('#ranking-note')).toContainText('可继续本地练习');
      if (variant === 'new') await shot(versionPage, 'actual-rule-version-update');
    }
    if (cage) {
      await expect(versionPage.locator('#launch')).toBeEnabled();
      await versionPage.locator('#launch').tap();
      await expect(versionPage.locator('#launch')).toBeHidden();
    } else {
      await expect(versionPage.locator('#charge-hint')).not.toContainText('准备');
      await versionPage.locator('#brake-button').tap();
      await expect(versionPage.locator('#brake-button')).toHaveAttribute('data-charges', '0');
    }
    if (variant === 'same') {
      await expect.poll(() => writes.some(({ path }) => path.endsWith('/actions')), { timeout: 8000 }).toBe(true);
    }
    await versionPage.locator(selectors.pause).tap();
    await versionPage.locator(selectors.resume).tap();
    await versionPage.locator(selectors.pause).tap();
    await versionPage.locator(selectors.home).tap();
    await expect(versionPage.locator(selectors.endless)).toBeVisible();
    if (variant !== 'same')
      assert.ok(!writes.some(({ path }) => /\/(actions|finish)$/.test(path)), variant);
    await versionContext.close();
  }
  report.checks.push('artifact rule handshake: same version records; older/newer/missing responses and pre-handshake/updated server rejections show update prompt, allow local touch play, pause/resume/home and never upload');
  assert.deepEqual(errors, []);
  report.passed = true;
} finally {
  await writeFile(
    new URL('expansion-browser-report.json', evidence),
    JSON.stringify({ ...report, errors }, null, 2) + '\n',
  );
  await browser.close();
  server.kill('SIGTERM');
}
console.log(`PASS ${gameId}: ${report.checks.length} expansion browser groups`);
