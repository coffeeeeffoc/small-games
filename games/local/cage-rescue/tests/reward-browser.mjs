import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, PORT: '4454' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Only this fixture substitutes a GameHost. Production has no test reward source.
  const main = await readFile(new URL('../dist/src/main.mjs', import.meta.url), 'utf8');
  await page.route('**/src/main.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: main.replace('mountCageRescue().catch', 'mountCageRescue(globalThis.__testHost).catch'),
    }),
  );
  await page.addInitScript(() => {
    globalThis.__adOutcome = 'unavailable';
    globalThis.__testHost = {
      session: { adAuthority: 'host' },
      storage: {
        async read() {
          return null;
        },
        async write(key, value) {
          return { value, version: '1' };
        },
      },
      ads: {
        async offer(opportunity) {
          globalThis.__lastOpportunity = opportunity;
          return { status: globalThis.__adOutcome };
        },
      },
    };
  });
  await page.clock.install();
  await page.goto('http://127.0.0.1:4454');
  const snapshot = () => page.evaluate(() => globalThis.__cageRescue.snapshot());
  await page.locator('#start').click();
  let state = await snapshot();
  const bounds = await page.locator('#scene').boundingBox();
  // Miss three balls using actual pointer input and the live requestAnimationFrame loop.
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.89);
  await page.mouse.down();
  for (let i = 0; i < 900 && state.screen !== 'result'; i++) {
    if (state.game.phase === 'ready') {
      await page.mouse.up();
      await page.locator('#launch').click();
      await page.mouse.move(
        bounds.x + (state.game.paddle.x / 390) * bounds.width,
        bounds.y + bounds.height * 0.89,
      );
      await page.mouse.down();
    }
    const x = state.game.ball.x < 195 ? 320 : 70;
    await page.mouse.move(bounds.x + (x / 390) * bounds.width, bounds.y + bounds.height * 0.89);
    await page.clock.runFor(100);
    state = await snapshot();
  }
  await page.mouse.up();
  assert.equal(state.screen, 'result');
  assert.equal(state.game.lossReason, 'no-lives');
  assert.equal(state.trial, false);
  for (const status of ['unavailable', 'dismissed', 'failed']) {
    await page.evaluate((value) => {
      globalThis.__adOutcome = value;
    }, status);
    await page.locator('#revive').click();
    assert.equal((await snapshot()).game.lives, 0, status);
    assert.equal((await snapshot()).game.usedRevive, false, status);
    assert.equal((await snapshot()).screen, 'result');
  }
  await page.evaluate(() => {
    globalThis.__adOutcome = 'completed';
  });
  await page.locator('#revive').click();
  state = await snapshot();
  assert.equal(state.screen, 'play');
  assert.equal(state.game.lives, 1);
  assert.equal(state.game.usedRevive, true);
  assert.equal(state.game.phase, 'ready');
  assert.deepEqual(await page.evaluate(() => __lastOpportunity.reward), {
    ballLives: 1,
    levelId: 'rescue-01',
  });
  assert.deepEqual(errors, []);
  console.log(
    'Reward browser: natural three-ball failure, unavailable/dismissed/failed no reward, completed +1 exactly once — passed.',
  );
} finally {
  await browser.close();
  server.kill();
}
