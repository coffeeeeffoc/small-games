// Run after pnpm build:pages. Uses current copied artifacts, never a remote release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, expect } from '@playwright/test';
import { preview } from 'vite';
import { markers, exerciseStandalone } from './standalone-game-checks.mjs';

const workspace = new URL('../../../', import.meta.url);
const output = new URL('.scratch/six-games-95/integration/', workspace);
await mkdir(output, { recursive: true });
const selected = process.env.GAME_IDS?.split(',') ?? [
  'carding-car',
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
];
const catalog = JSON.parse(
  await readFile(new URL('../src/standalone-games.json', import.meta.url)),
);
const games = selected.map((id) => catalog.find((game) => game.id === id));
async function artifactHash(directory) {
  const hash = createHash('sha256');
  for (const name of (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()) {
    hash.update(relative(fileURLToPath(directory), name).replaceAll('\\', '/'));
    hash.update(await readFile(name));
  }
  return hash.digest('hex');
}
// A per-file comparison catches an old Shell copy even when its index is unchanged.
async function compareBuild(game) {
  const source = new URL(`${game.source}/${game.output}/`, workspace);
  const destination = new URL(`../dist/games/${game.id}/`, import.meta.url);
  for (const entry of await readdir(source, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = relative(fileURLToPath(source), join(entry.parentPath, entry.name)).replaceAll(
      '\\',
      '/',
    );
    assert.deepEqual(
      await readFile(new URL(name, destination)),
      await readFile(new URL(name, source)),
      `Stale Shell artifact: ${game.id}/${name}`,
    );
  }
  return artifactHash(source);
}
const artifacts = {};
for (const game of games) artifacts[game.id] = await compareBuild(game);
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: '/small-games/',
  preview: { host: '127.0.0.1', port: 0 },
});
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const results = [],
  errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const game of games) {
    for (const entry of ['embedded', 'standalone', 'unsupported']) {
      const context = await browser.newContext({
        ...devices['Pixel 7'],
        viewport:
          game.id === 'carding-car' ? { width: 844, height: 390 } : { width: 390, height: 844 },
      });
      if (entry === 'unsupported')
        await context.addInitScript(() => {
          Object.defineProperty(globalThis.Element.prototype, 'requestFullscreen', {
            configurable: true,
            value: undefined,
          });
          Object.defineProperty(globalThis.Element.prototype, 'webkitRequestFullscreen', {
            configurable: true,
            value: undefined,
          });
        });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${game.id}/${entry}: ${error.message}`));
      page.on('response', (response) => {
        if (response.url().startsWith(origin) && response.status() >= 400)
          errors.push(`${response.status()}: ${response.url()}`);
      });
      page.on('request', (request) => {
        if (/localhost:43002|127\.0\.0\.1:43002/.test(request.url()))
          errors.push(`Unexpected Runtime: ${request.url()}`);
      });
      const url =
        entry === 'embedded'
          ? `${origin}/small-games/#/games/${game.id}`
          : `${origin}/small-games/games/${game.id}/index.html`;
      try {
        assert.equal((await page.goto(url)).status(), 200);
        const frame = entry === 'embedded' ? page.frameLocator('iframe') : page;
        await expect(frame.locator(markers[game.id]).first()).toBeVisible({ timeout: 120000 });
        const actualFrame =
          entry === 'embedded'
            ? await (await page.locator('iframe').elementHandle()).contentFrame()
            : page.mainFrame();
        await actualFrame.waitForLoadState();
        const fullscreen =
          entry === 'embedded'
            ? page.locator('nav [data-game-fullscreen]')
            : frame.locator('[data-game-fullscreen]').first();
        await expect(fullscreen).toBeVisible();
        await fullscreen.click();
        if (entry === 'unsupported') {
          await expect(frame.locator('#game-display-notice')).toContainText('不支持');
          assert.equal(await page.evaluate(() => globalThis.document.fullscreenElement), null);
        } else {
          await expect
            .poll(() => page.evaluate(() => !!globalThis.document.fullscreenElement))
            .toBe(true);
          await expect(fullscreen).toHaveText('退出全屏');
        }
        await exerciseStandalone(frame, game.id, true);
        // Prove the same globalThis.document survives mode changes. Per-game tests cover its full loop.
        const identity = await actualFrame.evaluate(() => {
          globalThis.__displayTestIdentity = crypto.randomUUID();
          return globalThis.__displayTestIdentity;
        });
        const storage = await actualFrame.evaluate(() =>
          JSON.stringify(Object.fromEntries(Object.entries(globalThis.localStorage))),
        );
        if (entry !== 'unsupported') {
          await page.evaluate(() => globalThis.document.exitFullscreen());
          await expect(fullscreen).toHaveText('全屏');
        }
        assert.equal(
          await actualFrame.evaluate(() => globalThis.__displayTestIdentity),
          identity,
          'display change reloaded game',
        );
        // No gameplay actions between snapshots; fullscreen must not reset saved progress.
        assert.equal(
          await actualFrame.evaluate(() =>
            JSON.stringify(Object.fromEntries(Object.entries(globalThis.localStorage))),
          ),
          storage,
        );
        await page.setViewportSize({ width: 305, height: 740 });
        await expect
          .poll(
            () =>
              actualFrame.evaluate(
                () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
              ),
            { message: `${game.id}: narrow horizontal overflow` },
          )
          .toBe(true);
        await page.setViewportSize({ width: 844, height: 390 });
        assert.equal(await actualFrame.evaluate(() => globalThis.__displayTestIdentity), identity);
        await page.screenshot({ path: fileURLToPath(new URL(`${game.id}-${entry}.png`, output)) });
        if (entry === 'embedded') {
          await page.getByRole('button', { name: '返回目录', exact: true }).click();
          await expect(page.locator('iframe')).toHaveCount(0);
          await page.goto(url);
          await page.reload();
          await expect(page.locator('nav strong')).toHaveText(game.title);
          await expect(page.frameLocator('iframe').locator(markers[game.id]).first()).toBeVisible({
            timeout: 120000,
          });
        }
        results.push({
          game: game.id,
          entry,
          result: 'passed',
          artifact: artifacts[game.id],
          physicalDevice: false,
        });
        console.log(
          `PASS ${game.id}: ${entry}, interaction, display state, progress, orientation, 305px`,
        );
      } catch (error) {
        await page
          .screenshot({ path: fileURLToPath(new URL(`${game.id}-${entry}-failure.png`, output)) })
          .catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
  }
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error.stack || error.message);
  throw error;
} finally {
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser ? await browser.version() : null,
        artifacts,
        results,
        errors,
        limitations:
          'Windows Chrome viewport/touch emulation. No Android/iOS physical device, native platform, public room or real player acceptance.',
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await server.close();
}
