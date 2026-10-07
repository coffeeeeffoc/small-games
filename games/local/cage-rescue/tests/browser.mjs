import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results');
const design = path.join(root, 'docs/design');
const port = Number(process.env.CAGE_RESCUE_TEST_PORT || 4452);
const origin = `http://127.0.0.1:${port}`;
const report = {
  browser: '',
  checks: [],
  errors: [],
  screenshots: [],
  limitations: [
    'Chromium desktop and emulated touch viewports; no physical phone or native mini-game platform was tested.',
    'Same-origin and cross-origin iframe fixtures exercise the production game and shared development-mode script; the complete Shell build is not launched by this test.',
    'Developer result buttons verify UI and save isolation only. Natural play is recorded separately and uses pointer input without editing game state.',
  ],
};
await mkdir(output, { recursive: true });
await mkdir(design, { recursive: true });
execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (data) => {
  serverOutput += data;
});
server.stderr.on('data', (data) => {
  serverOutput += data;
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let attempt = 0; attempt < 100; attempt++) {
  if (server.exitCode !== null) throw new Error(`Test server exited: ${serverOutput}`);
  try {
    if ((await fetch(origin)).ok) break;
  } catch {
    /* Wait for the owned server. */
  }
  if (attempt === 99) throw new Error('Production server did not become ready');
  await pause(50);
}
const mime = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  try {
    if (url.pathname === '/fixture') {
      const crossOrigin = url.searchParams.has('cross');
      const childBase = crossOrigin ? origin : '';
      response
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/dev-mode.js"></script><style>html,body,main,iframe{margin:0;width:100%;height:100%;border:0}body{overflow:hidden}</style></head><body><main data-game-display-host><iframe title="救援游戏" allow="fullscreen" allowfullscreen></iframe></main><script>const query = SmallGamesDev.withMode(new URLSearchParams(location.search).get('child') || '');document.querySelector('iframe').src = ${JSON.stringify(childBase)} + '/index.html' + (query ? '?' + query : '');</script></body></html>`,
        );
      return;
    }
    const target = path.resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
    assert(target.startsWith(path.join(root, 'dist') + path.sep));
    const body = await readFile(target);
    response
      .writeHead(200, {
        'Content-Type':
          (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8',
      })
      .end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => fixture.listen(0, '127.0.0.1', resolve));
const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
report.browser = await browser.version();
const snapshot = (page) => page.evaluate(() => window.__cageRescue.snapshot());
async function ready(page, url = origin) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__cageRescue);
  await expect(page.locator('#loading-error')).toBeHidden();
}
function observe(page, name) {
  page.on('pageerror', (error) =>
    report.errors.push({ check: name, type: 'pageerror', message: error.message }),
  );
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      [origin, fixtureOrigin].some((base) => response.url().startsWith(base))
    )
      report.errors.push({
        check: name,
        type: 'http',
        status: response.status(),
        url: response.url(),
      });
  });
}
async function shot(page, name, key = false) {
  const filename = path.join(key ? design : output, `${name}.png`);
  await page.screenshot({ path: filename });
  report.screenshots.push(path.relative(root, filename));
}
async function check(name, run) {
  if (process.env.CAGE_RESCUE_TEST_MATCH && !name.includes(process.env.CAGE_RESCUE_TEST_MATCH))
    return;
  try {
    const detail = await run();
    report.checks.push({ name, passed: true, ...detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function fresh(viewport = { width: 390, height: 844 }, name = '') {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  observe(page, name);
  return { context, page };
}
async function back(page) {
  await page.locator('.screen:not([hidden]) [data-back]').tap();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
}
async function moveDev(page, scope = page) {
  const button = scope.getByRole('button', { name: '开发者调试', exact: true });
  const bounds = await button.boundingBox();
  const viewport = page.viewportSize();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width - 30, viewport.height - 30, { steps: 5 });
  await page.mouse.up();
  const moved = await button.boundingBox();
  assert.ok(
    moved.y > bounds.y + 100,
    'the shared developer button can be dragged clear of game controls',
  );
}
async function devAction(page, name) {
  await page.getByRole('button', { name: '开发者调试', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
}

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1280, height: 900 },
  ]) {
    const name = `touch flow ${viewport.width}x${viewport.height}`;
    await check(name, async () => {
      const { context, page } = await fresh(viewport, name);
      try {
        await ready(page);
        assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), false);
        await expect(page.getByRole('button', { name: '开发者调试', exact: true })).toHaveCount(0);
        const isKey = viewport.width === 390;
        if (isKey) await shot(page, 'actual-home', true);
        await page.locator('#levels').tap();
        await expect(page.locator('.level-card')).toHaveCount(6);
        await expect(page.locator('.level-card:not([disabled])')).toHaveCount(1);
        if (isKey) await shot(page, 'actual-levels', true);
        await back(page);
        await page.locator('#settings').tap();
        await page.locator('#sound').tap();
        await expect(page.locator('#sound')).toHaveAttribute('aria-checked', 'false');
        assert.equal((await snapshot(page)).progress.sound, false);
        await back(page);
        await page.reload();
        await page.waitForFunction(() => !!window.__cageRescue);
        assert.equal(
          (await snapshot(page)).progress.sound,
          false,
          'sound preference survives reload',
        );
        await page.locator('#help').tap();
        await expect(page.locator('#help-title')).toHaveText('怎么玩');
        await back(page);
        await page.locator('#outfits').tap();
        await expect(page.locator('.theme-card')).toHaveCount(3);
        await expect(page.locator('.theme-card:not([disabled])')).toHaveCount(1);
        await page.locator('.theme-card:not([disabled])').tap();
        await back(page);
        await page.locator('#start').tap();
        await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
        assert.equal((await snapshot(page)).game.phase, 'ready');
        await page.locator('#launch').tap();
        await expect.poll(async () => (await snapshot(page)).game.phase).toBe('playing');
        const initialY = (await snapshot(page)).game.ball.y;
        await expect
          .poll(async () => (await snapshot(page)).game.ball.y)
          .toBeLessThan(initialY - 8);
        const bounds = await page.locator('#scene').boundingBox();
        const coordinate = (x) => ({
          x: bounds.x + bounds.width * x,
          y: bounds.y + bounds.height * 0.85,
        });
        const touch = await context.newCDPSession(page);
        try {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ id: 1, ...coordinate(0.5) }],
          });
          const pointerId = (await snapshot(page)).activePointer;
          assert.notEqual(pointerId, null);
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ id: 1, ...coordinate(0.8) }],
          });
          await expect.poll(async () => (await snapshot(page)).game.paddle.x).toBeGreaterThan(280);
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [
              { id: 1, ...coordinate(0.8) },
              { id: 2, ...coordinate(0.2) },
            ],
          });
          assert.equal(
            (await snapshot(page)).activePointer,
            pointerId,
            'second touch cannot replace the active pointer',
          );
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { id: 1, ...coordinate(0.8) },
              { id: 2, ...coordinate(0.1) },
            ],
          });
          assert.ok(
            (await snapshot(page)).game.paddle.x > 280,
            'secondary touch cannot steer the paddle',
          );
          await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          await expect.poll(async () => (await snapshot(page)).activePointer).toBe(null);
        } finally {
          await touch.detach();
        }
        if (isKey) await shot(page, 'actual-play', true);
        await page.locator('#pause').tap();
        const frozen = (await snapshot(page)).game;
        await page.waitForTimeout(220);
        assert.deepEqual(
          (await snapshot(page)).game,
          frozen,
          'pause freezes the complete simulation',
        );
        if (isKey) await shot(page, 'actual-pause', true);
        await page.setViewportSize({ width: viewport.height, height: viewport.width });
        assert.deepEqual((await snapshot(page)).game, frozen, 'resize preserves game state');
        await page.locator('#resume').tap();
        await page.waitForTimeout(100);
        const resumed = (await snapshot(page)).game;
        assert.ok(
          resumed.time > frozen.time && resumed.time - frozen.time < 0.3,
          'resume excludes paused time',
        );
        await page.locator('#pause').tap();
        await page.locator('#restart').tap();
        const restarted = (await snapshot(page)).game;
        assert.equal(restarted.phase, 'ready');
        assert.equal(restarted.lives, 3);
        assert.equal(restarted.rescued, 0);
        await page.locator('#pause').tap();
        await page.locator('#home').tap();
        await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await shot(page, `flow-${viewport.width}x${viewport.height}`);
        return {
          viewport,
          touch: 'native CDP drag, second touch ignored, cancel releases capture',
          progressReload: true,
        };
      } finally {
        await context.close();
      }
    });
  }

  await check('production development mode and trial save isolation', async () => {
    const { context, page } = await fresh(undefined, 'development mode');
    try {
      await ready(page, origin + '/?dev=1');
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), true);
      assert.equal(
        await page.evaluate(() => localStorage.getItem('dev')),
        null,
        'URL enable must not persist',
      );
      await moveDev(page);
      await page.locator('#start').tap();
      const before = await page.evaluate(() => localStorage.getItem('cage-rescue:host:progress'));
      await devAction(page, '试玩本关通关');
      await expect(page.locator('body')).toHaveAttribute('data-screen', 'result');
      assert.equal((await snapshot(page)).game.phase, 'won');
      assert.equal((await snapshot(page)).trial, true);
      await expect(page.locator('#result-unlock')).toContainText('试玩不解锁');
      assert.deepEqual((await snapshot(page)).progress.completed, {});
      assert.equal(
        await page.evaluate(() => localStorage.getItem('cage-rescue:host:progress')),
        before,
      );
      await shot(page, 'developer-win-ui-only');
      await page.locator('#next').tap();
      assert.equal((await snapshot(page)).game.levelIndex, 1);
      await devAction(page, '试玩球机会耗尽');
      assert.equal((await snapshot(page)).game.phase, 'lost');
      await expect(page.locator('#revive')).toBeHidden();
      await expect(page.locator('#retry')).toHaveText('免费重试');
      await page.locator('#retry').tap();
      assert.equal((await snapshot(page)).game.phase, 'ready');
      await page.locator('#pause').tap();
      await page.locator('#home').tap();
      await page.locator('#levels').tap();
      await expect(page.locator('.level-card:not([disabled])')).toHaveCount(1);
      await page.evaluate(() => localStorage.setItem('dev', '1'));
      await ready(page, origin + '/?dev=0');
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), false);
      await expect(page.getByRole('button', { name: '开发者调试', exact: true })).toHaveCount(0);
      await ready(page);
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), true);
      return {
        modes: ['URL enabled', 'storage enabled', 'URL explicit off'],
        trialOutcomes: ['won', 'lost'],
        progressSaved: false,
      };
    } finally {
      await context.close();
    }
  });

  await check('blocked storage preserves startup, optional save and URL mode', async () => {
    const { context, page } = await fresh(undefined, 'blocked storage');
    try {
      await context.addInitScript(() =>
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('Blocked', 'SecurityError');
          },
        }),
      );
      await ready(page);
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), false);
      await page.locator('#settings').tap();
      await page.locator('#sound').tap();
      await expect(page.locator('#toast')).toContainText('本机存储不可用');
      await back(page);
      await page.locator('#start').tap();
      await page.locator('#launch').tap();
      assert.equal((await snapshot(page)).game.phase, 'playing');
      await ready(page, origin + '/?dev=1');
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), true);
      return { localGamePlayable: true, URLModePlayable: true };
    } finally {
      await context.close();
    }
  });

  for (const cross of [false, true]) {
    await check(
      `${cross ? 'cross-origin' : 'same-origin'} iframe mode forwarding and fullscreen`,
      async () => {
        const { context, page } = await fresh(undefined, 'iframe');
        try {
          await page.goto(fixtureOrigin + '/fixture?dev=1' + (cross ? '&cross=1' : ''));
          const frame = page.frameLocator('iframe');
          await expect(frame.locator('#start')).toBeVisible();
          assert.equal(await frame.locator('body').evaluate(() => SmallGamesDev.isEnabled()), true);
          assert.ok((await page.locator('iframe').getAttribute('src')).includes('dev=1'));
          await moveDev(page);
          await moveDev(page, frame);
          await frame.locator('#settings').tap();
          await frame.locator('[data-game-fullscreen]').tap();
          await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
          await frame.locator('[data-game-fullscreen]').tap();
          await expect
            .poll(() => page.evaluate(() => document.fullscreenElement === null))
            .toBe(true);
          await frame.locator('#settings-screen [data-back]').tap();
          await frame.locator('#start').tap();
          await frame.locator('#launch').tap();
          await frame.locator('#pause').tap();
          await expect(frame.locator('body')).toHaveAttribute('data-screen', 'pause');
          await frame.locator('#resume').tap();
          await expect(frame.locator('body')).toHaveAttribute('data-screen', 'play');
          await page.goto(
            fixtureOrigin + '/fixture?dev=0&child=dev%3D0' + (cross ? '&cross=1' : ''),
          );
          await expect(frame.locator('#start')).toBeVisible();
          assert.equal(
            await frame.locator('body').evaluate(() => SmallGamesDev.isEnabled()),
            false,
          );
          return {
            fixture: true,
            crossOrigin: cross,
            explicitModeForwarding: true,
            realFullscreen: true,
          };
        } finally {
          await context.close();
        }
      },
    );
  }

  for (const lose of [false, true]) {
    await check(
      `natural pointer play ${lose ? 'ball-loss failure and free retry' : 'first-level rescue and save'}`,
      async () => {
        const { context, page } = await fresh(undefined, 'natural play');
        try {
          await page.clock.install();
          await ready(page);
          await page.locator('#start').tap();
          await page.locator('#launch').tap();
          const touch = await context.newCDPSession(page);
          const bounds = await page.locator('#scene').boundingBox();
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [
              { id: 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.85 },
            ],
          });
          await page.evaluate(
            ({ lose }) => {
              const pointerId = window.__cageRescue.snapshot().activePointer;
              const canvas = document.querySelector('#scene');
              const reflectX = (x) => {
                const left = 23,
                  span = 344;
                const position = (((x - left) % (span * 2)) + span * 2) % (span * 2);
                return left + (position > span ? span * 2 - position : position);
              };
              function steer() {
                const current = window.__cageRescue.snapshot(),
                  state = current.game;
                if (current.screen !== 'play') return;
                if (state.phase === 'ready') document.querySelector('#launch').click();
                const ball = state.ball;
                const eta =
                  ball.vy > 0
                    ? Math.max(0, (state.paddle.y - ball.r - ball.y) / ball.vy)
                    : Infinity;
                const landing = Number.isFinite(eta) ? reflectX(ball.x + ball.vx * eta) : ball.x;
                const cage = state.cages
                  .filter((item) => item.hp > 0)
                  .sort(
                    (a, b) => Math.abs(a.x + a.w / 2 - landing) - Math.abs(b.x + b.w / 2 - landing),
                  )[0];
                const angle = cage
                  ? Math.atan2(cage.x + cage.w / 2 - landing, state.paddle.y - cage.y - cage.h / 2)
                  : Math.sin(state.time) * 0.6;
                let target = landing - ((angle / (Math.PI * 0.365)) * state.paddle.w) / 2;
                const person = state.people
                  .filter((item) => item.status === 'falling' && item.y + item.r < state.paddle.y)
                  .sort((a, b) => b.y - a.y)[0];
                if (person) {
                  const personEta =
                    (state.paddle.y - person.r - person.y) / state.level.personSpeed;
                  const travel = Math.abs(person.x - state.paddle.x) / 1100;
                  if (personEta < 0.65 + travel && (eta > 0.48 || personEta < eta))
                    target = person.x;
                }
                if (lose) target = landing < 195 ? 350 : 40;
                const rect = canvas.getBoundingClientRect();
                canvas.dispatchEvent(
                  new PointerEvent('pointermove', {
                    pointerId,
                    pointerType: 'touch',
                    isPrimary: true,
                    bubbles: true,
                    clientX: rect.left + (target / 390) * rect.width,
                    clientY: rect.top + rect.height * 0.85,
                  }),
                );
                requestAnimationFrame(steer);
              }
              requestAnimationFrame(steer);
            },
            { lose },
          );
          let result;
          let decisionCaptured = false;
          const captureDecision = process.env.CAGE_RESCUE_CAPTURE_DECISION === '1' && !lose;
          const stepMs = captureDecision ? 200 : 5000;
          for (let elapsed = 0; elapsed < 120000; elapsed += stepMs) {
            await page.clock.runFor(stepMs);
            result = await snapshot(page);
            if (elapsed < 10000 && elapsed + stepMs >= 10000 && !lose)
              await shot(page, 'natural-first-release');
            if (
              captureDecision &&
              !decisionCaptured &&
              result.game.ball.vy > 0 &&
              result.game.people.some(
                (person) =>
                  person.status === 'falling' &&
                  person.y > 350 &&
                  Math.abs(person.x - result.game.ball.x) > 100,
              )
            ) {
              await shot(page, 'actual-decision', true);
              decisionCaptured = true;
            }
            if (result.screen === 'result') break;
          }
          // Steering above uses PointerEvents rather than moving the CDP contact.
          // Cancel that contact to avoid a synthetic compatibility tap at its old coordinates.
          await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          await touch.detach();
          assert.equal(
            result.screen,
            'result',
            'normal pointer play reaches a result within 120 simulated seconds',
          );
          assert.equal(result.trial, false);
          if (lose) {
            assert.equal(result.game.phase, 'lost');
            assert.equal(result.game.lossReason, 'no-lives');
            assert.equal(result.game.lives, 0);
            await shot(page, 'natural-failure');
            await expect(page.locator('#revive')).toBeVisible();
            await page.locator('#revive').tap();
            await expect(page.locator('#reward-message')).toContainText('暂无广告');
            assert.equal((await snapshot(page)).game.lives, 0);
            await page.locator('#retry').tap();
            assert.equal((await snapshot(page)).game.phase, 'ready');
            assert.equal((await snapshot(page)).game.lives, 3);
          } else {
            assert.equal(result.game.phase, 'won');
            assert.equal(result.game.rescued, 4);
            assert.equal(Object.keys(result.progress.completed).length, 1);
            await shot(page, 'actual-result', true);
            await page.reload();
            await page.waitForFunction(() => !!window.__cageRescue);
            assert.equal(Object.keys((await snapshot(page)).progress.completed).length, 1);
            await page.locator('#levels').tap();
            await expect(page.locator('.level-card:not([disabled])')).toHaveCount(2);
          }
          return {
            phase: result.game.phase,
            rescued: result.game.rescued,
            lives: result.game.lives,
            seconds: result.game.time,
            trial: false,
            inputs:
              'CDP initial contact followed by PointerEvents; Playwright clock advances requestAnimationFrame without changing game state',
          };
        } finally {
          await context.close();
        }
      },
    );
  }
} finally {
  await browser.close();
  await new Promise((resolve) => fixture.close(resolve));
  server.kill('SIGTERM');
  report.passed = report.checks.every((item) => item.passed) && report.errors.length === 0;
  const reportName = process.env.CAGE_RESCUE_TEST_MATCH
    ? `browser-report-${process.env.CAGE_RESCUE_TEST_MATCH.replace(/[^a-z0-9-]/gi, '-')}.json`
    : 'browser-report.json';
  await writeFile(path.join(output, reportName), JSON.stringify(report, null, 2) + '\n');
  console.log(
    `${report.checks.filter((item) => item.passed).length}/${report.checks.length} browser checks passed; ${report.errors.length} page/resource errors.`,
  );
  if (!report.passed) process.exitCode = 1;
}
