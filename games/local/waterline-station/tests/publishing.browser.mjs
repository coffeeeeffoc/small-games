import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { LEVELS } from '../levels.mjs';
import { STORAGE_KEY } from '../progress.mjs';
import { fixture, snap, ready, tap, settled, cancelTouch } from './browser-support.mjs';
const f = await fixture(),
  checks = [],
  errors = [];
const context = await f.browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: 'reduce',
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => (window.__sharedUrl = text) },
  });
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
async function win() {
  for (const gate of LEVELS[(await snap(page)).levelIndex].solution) {
    await tap(page, 'gate-' + gate);
    await settled(page);
  }
}
try {
  await page.goto(`${f.base}?station=${LEVELS[0].id}&target=1&dev=0`);
  await ready(page);
  await tap(page, 'start');
  const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await cancelTouch(page, 'gate-AB');
  assert.equal((await snap(page)).state.moves, 0);
  await win();
  await tap(page, 'share-result');
  await page.waitForFunction(() => window.__sharedUrl);
  let shared = new URL(await page.evaluate(() => window.__sharedUrl));
  assert.equal(shared.searchParams.get('station'), LEVELS[0].id);
  assert.equal(shared.searchParams.get('target'), '1');
  assert.equal(shared.searchParams.has('dev'), false);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), saved);
  await tap(page, 'result-retry');
  await tap(page, 'hint');
  await win();
  await tap(page, 'share-result');
  await page.waitForFunction(() => !new URL(window.__sharedUrl).searchParams.has('target'));
  checks.push(
    'touch cancel spends no move; real clear; unassisted share includes score; assisted share omits score; sharing strips dev; challenge does not mutate normal save',
  );
  await tap(page, 'result-exit-challenge');
  assert.equal((await snap(page)).screen, 'home');
  assert.equal((await snap(page)).challenge, false);
  assert.equal(new URL(page.url()).searchParams.has('station'), false);
  await tap(page, 'start');
  await win();
  await tap(page, 'next-level');
  await win();
  const normal = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(normal.best[LEVELS[1].id], 2);
  await page.goto(`${f.base}?station=${LEVELS[0].id}&target=1`);
  await ready(page);
  await tap(page, 'start');
  await win();
  await tap(page, 'next-level');
  assert.equal((await snap(page)).challenge, false);
  assert.equal((await snap(page)).targetMoves, null);
  assert.equal((await snap(page)).levelIndex, 1);
  checks.push(
    'challenge exit restores normal progress; normal results persist; next station clears invitation and target',
  );
  await page.goto(`${f.base}?station=${LEVELS[0].id}&target=1`);
  await ready(page);
  await tap(page, 'levels-button');
  await tap(page, 'level-1');
  assert.equal((await snap(page)).challenge, false);
  assert.equal((await snap(page)).levelIndex, 1);
  assert.equal(new URL(page.url()).searchParams.has('target'), false);
  checks.push('normal level selection leaves challenge');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }),
  );
  await win();
  await tap(page, 'share-result');
  await page.locator('#share-fallback[open]').waitFor();
  assert.match(await page.locator('#share-url').inputValue(), /station=shared-level/);
  await page.locator('#share-select').tap();
  assert.equal(
    await page
      .locator('#share-url')
      .evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length),
    true,
  );
  await page.locator('#share-close').tap();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('denied');
        },
      },
    }),
  );
  await tap(page, 'share-result');
  await page.locator('#share-fallback[open]').waitFor();
  await page.locator('#share-close').tap();
  await tap(page, 'result-home');
  assert.equal(await page.locator('#share-fallback').evaluate((el) => el.open), false);
  checks.push(
    'unavailable and rejected clipboard expose selectable URL with close and page cleanup',
  );
  assert.deepEqual(errors, []);
  const out = new URL('../test-results/publishing/', import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(
    new URL('browser-report.json', out),
    JSON.stringify({ browser: await f.browser.version(), checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await f.close();
}
