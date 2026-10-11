import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4536',
    '--strictPort',
  ],
  { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'] },
);
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
});
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
});
const output = new URL('../docs/design/mobile-levels-2026-10-11/actual/', import.meta.url);
await mkdir(output, { recursive: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.SmallGamesPublishingConfig = { publicUrl: 'https://games.example/moss-garden/' };
    window.__shares = [];
    navigator.share = async (request) => {
      window.__shares.push(request);
    };
  });
  const action = async (id) => {
    await page.locator(`[data-hit-id="${id}"]`).tap();
  };
  const saved = () => page.evaluate(() => localStorage.getItem('moss-garden.save.v1'));
  await page.goto('http://127.0.0.1:4536/');
  await action('home:start');
  await action('cell:0');
  await action('play:pause');
  const original = await saved();
  await page.goto(
    'http://127.0.0.1:4536/?level=moss-09&targetHints=10&targetMistakes=10&targetTime=600000&dev=0&token=private',
  );
  await expect(page.getByRole('button', { name: '挑战第 9 关' })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('actual-invite-390x844.png', output)) });
  await action('home:start');
  await page.screenshot({ path: fileURLToPath(new URL('actual-play-390x844.png', output)) });
  for (let round = 0; round < 3; round++) {
    for (
      let hint = 0;
      hint < 20 && (await page.locator('#garden').getAttribute('data-page')) === 'play';
      hint++
    )
      await action('play:hint');
    await expect(page.locator('#garden')).toHaveAttribute('data-page', 'result');
    if (round === 0) {
      await action('result:share');
      const shared = await page.evaluate(() => window.__shares[0]);
      const url = new URL(shared.url);
      assert.equal(url.origin, 'https://games.example');
      assert.equal(url.searchParams.get('level'), 'moss-09');
      assert(Number(url.searchParams.get('targetHints')) > 0);
      assert(Number(url.searchParams.get('targetTime')) >= 0);
      assert.equal(url.searchParams.has('dev'), false);
      assert.equal(url.searchParams.has('token'), false);
      await page.screenshot({ path: fileURLToPath(new URL('actual-result-390x844.png', output)) });
      await page.setViewportSize({ width: 320, height: 568 });
      for (const button of await page.locator('#controls button').all()) {
        await expect
          .poll(async () => (await button.boundingBox())?.height ?? 0, {
            message: 'Small-screen result controls remain at least 44 CSS pixels after resize',
          })
          .toBeGreaterThanOrEqual(43.9);
      }
      await page.screenshot({ path: fileURLToPath(new URL('actual-result-320x568.png', output)) });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await action(round === 2 ? 'result:levels' : 'result:next');
    if (round < 2) {
      await expect(page.locator('[data-game-ad]')).toHaveCount(0);
      await expect(page.locator('#garden')).toHaveAttribute('data-page', 'play');
    } else {
      const ad = page.locator('[data-game-ad="mock"]');
      await expect(ad).toBeVisible();
      await page.screenshot({ path: fileURLToPath(new URL('actual-ad-390x844.png', output)) });
      await ad.getByRole('button', { name: '关闭并继续' }).tap();
      await expect(page.locator('#garden')).toHaveAttribute('data-page', 'levels');
    }
  }
  assert.equal(
    await saved(),
    original,
    'Shared locked-level challenge does not overwrite progress or active puzzle',
  );
  await expect(page.getByRole('button', { name: '继续第 1 关' })).toBeVisible();
  await action('levels:continue');
  await expect(page.locator('[data-hit-id="cell:0"]')).toHaveAttribute('aria-pressed', 'true');
  assert.equal(JSON.parse(await saved()).active.levelId, 'moss-01');
  await action('play:pause');
  await action('pause:home');
  await action('home:levels');
  await expect(page.locator('[data-hit-id="level:moss-02"]')).toHaveCount(0);
  await action('level:moss-01');
  await expect(page.locator('[data-hit-id="cell:0"]')).toHaveAttribute('aria-pressed', 'true');
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('publishing-browser.json', output),
    JSON.stringify(
      {
        status: 'passed',
        environment: 'Chromium desktop mobile simulation; touch; not a physical device',
        checks: [
          'locked same-level invitation and self-reported target',
          'score-carrying share URL without private fields',
          'normal save and unlock isolation',
          'leaving invitation resumes normal board through continue and selection',
          'same-level replay',
          'third-result selection ad and close/resume to normal selection',
          '390×844 / 320×568 and 44px result controls',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log('moss-garden publishing: 7 checks passed');
} finally {
  await browser.close();
  server.kill();
}
