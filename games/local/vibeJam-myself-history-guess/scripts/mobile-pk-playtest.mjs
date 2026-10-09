// Real Chromium touch emulation against the running game and its HTTP service.
// This is not native-device acceptance; no application API responses are mocked.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const base = process.env.PLAYTEST_URL || 'http://127.0.0.1:4175/';
const directory = resolve(
  fileURLToPath(new URL('../docs/design/mobile-pk-2026-10-09/', import.meta.url)),
);
const storageKey = 'here-and-then.v1';
const errors = [];
const screenshots = [];
const observations = [];
let browser;

async function phone(width = 390, height = 844, setup) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  if (setup) await context.addInitScript(setup);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  return { context, page };
}
const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
async function capture(page, name) {
  await noOverflow(page);
  const filename = `actual-${name}.png`;
  await page.screenshot({
    path: resolve(directory, filename),
    animations: 'disabled',
    fullPage: true,
  });
  screenshots.push(filename);
}
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1,
    `horizontal overflow: ${JSON.stringify(dimensions)}`,
  );
}
async function touchTargets(page) {
  const undersized = await page
    .locator('button, input:not([type="hidden"]), select, [role="button"]')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
        })
        .map((node) => ({
          label: node.getAttribute('aria-label') || node.id || node.textContent.trim().slice(0, 30),
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        }))
        .filter((item) => item.width < 43.5 || item.height < 43.5),
    );
  assert.deepEqual(undersized, [], 'all visible controls provide a 44 CSS px touch target');
}
async function ready(page) {
  await page.locator('#panorama').waitFor({ state: 'visible' });
  await page.locator('#load-cover').waitFor({ state: 'hidden' });
  await page.waitForFunction(() =>
    Number.isFinite(Number(document.querySelector('#panorama')?.dataset.yaw)),
  );
}
async function inspectResult(page) {
  await page.locator('#next').waitFor({ state: 'visible' });
  const text = await page.locator('#app').innerText();
  assert.doesNotMatch(
    text,
    /正确(?:地点|年代|时间|答案)|实际(?:地点|年代|年份)|相差\s*\d|偏差\s*\d|\d[\d,.]*\s*(?:公里|千米|km)|公元前?\s*\d+\s*年|答案揭晓|查看史料|对照地图/iu,
    'score page does not disclose an answer or a numerical error',
  );
  assert.equal(
    await page.locator('.answer-pin, .source-link, #compare-map').count(),
    0,
    'no answer marker, source link or reveal control',
  );
  await noOverflow(page);
}
async function gesture(page, selector = '#panorama') {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(selector).boundingBox();
  const center = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.5 };
  const originalYaw = Number(await page.locator(selector).getAttribute('data-yaw'));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...center, id: 1 }],
  });
  for (let index = 1; index <= 6; index++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: center.x - index * 12, y: center.y, id: 1 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(
    (yaw) => Math.abs(Number(document.querySelector('#panorama').dataset.yaw) - yaw) > 5,
    originalYaw,
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...center, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.locator('#scene-reset').tap();
  const fov = Number(await page.locator(selector).getAttribute('data-fov'));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: center.x - 24, y: center.y, id: 1 },
      { x: center.x + 24, y: center.y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: center.x - 65, y: center.y, id: 1 },
      { x: center.x + 65, y: center.y, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(
    (previous) => Number(document.querySelector('#panorama').dataset.fov) < previous - 5,
    fov,
  );
  await page.locator('#scene-reset').tap();
  await cdp.detach();
}
function assertPublicProjection(value, path = 'response') {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.ok(
      !/^(?:year|lat|lng|location|tolerance|correctYear|correctLocation|answerYear|answerLocation|yearError|distanceKm|distance|explanation|source|answer|targetYear|targetLocation|sceneId|seed|deck)$/i.test(
        key,
      ),
      `${path}.${key} leaks an answer, error or future question`,
    );
    assertPublicProjection(item, `${path}.${key}`);
  }
}
function monitorApi(page) {
  const pending = [],
    exchanges = [];
  page.on('response', (response) => {
    if (
      !new URL(response.url()).pathname.startsWith('/api/history/') ||
      !response.headers()['content-type']?.includes('application/json')
    )
      return;
    pending.push(
      response.json().then((body) => {
        assertPublicProjection(body);
        exchanges.push({
          path: new URL(response.url()).pathname.replace(
            /(?:runs|invites)\/[^/]+/,
            (match) => `${match.split('/')[0]}/<opaque>`,
          ),
          status: response.status(),
          body,
        });
      }),
    );
  });
  return {
    exchanges,
    async checked() {
      await Promise.all(pending);
      return exchanges;
    },
  };
}

export async function runMobileSuite(suite = 'all') {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium',
    headless: true,
  });
  const startedAt = new Date().toISOString();
  try {
    if (suite === 'core' || suite === 'all') await coreSuite();
    if (suite === 'chapters' || suite === 'all') await chapterSuite();
    if (suite === 'pk' || suite === 'all') await pkSuite();
    if (suite === 'polish') await polishSuite();
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    let previous = {};
    try {
      previous = JSON.parse(await readFile(resolve(directory, 'verification.json'), 'utf8'));
    } catch {}
    const report = {
      environment: {
        browser: 'Chromium',
        input: 'Playwright touch + CDP touch gestures',
        base,
        api: 'Actual Node + SQLite HTTP service; no successful API responses mocked',
        nativeDevice: false,
      },
      limitation:
        'Desktop browser mobile emulation only. Native WeChat, iOS, Android and physical devices were not exercised by these scripts.',
      reference: 'concept.png',
      suites: {
        ...(previous.suites || {}),
        [suite]: {
          startedAt,
          completedAt: new Date().toISOString(),
          status: 'passed',
          observations,
          screenshots: [...new Set(screenshots)],
          errors,
        },
      },
    };
    await writeFile(
      resolve(directory, 'verification.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(`PASS ${suite}: ${observations.join('; ')}`);
  } finally {
    await browser.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await runMobileSuite(process.argv[2] || 'all');
async function waitForRun(page, predicate = (run) => run.phase === 'guessing') {
  const response = await page.waitForResponse(async (response) => {
    if (
      !/\/api\/history\/(?:runs(?:\/[^/]+)?(?:\/next)?|invites\/[^/]+\/join)$/.test(
        new URL(response.url()).pathname,
      ) ||
      !response.ok()
    )
      return false;
    try {
      const body = await response.json();
      return predicate(body.run || body);
    } catch {
      return false;
    }
  });
  const body = await response.json();
  return body.run || body;
}
function validTimedRun(run) {
  assertPublicProjection(run);
  assert.equal(run.total, 5);
  assert.equal(run.phase, 'guessing');
  assert.match(run.round.image, /^\/api\/history\/images\/[A-Za-z0-9_-]{24,}$/);
  assert.ok(
    run.round.expiresAt - run.serverNow > 20000 && run.round.expiresAt - run.serverNow <= 25000,
    'the HTTP service starts a 25-second deadline',
  );
}
async function imageFingerprint(page, run) {
  const response = await page.request.get(new URL(run.round.image, base).href);
  assert.equal(response.status(), 200);
  const { createHash } = await import('node:crypto');
  return createHash('sha256')
    .update(await response.body())
    .digest('hex');
}
async function nav(page, name) {
  await page.locator(`[data-nav="${name}"]`).first().tap();
}
async function startPractice(page) {
  await page.locator('#start').tap();
  if (await page.locator('#begin-level').count()) await page.locator('#begin-level').tap();
  await ready(page);
}
async function choose(page, year = 1420, city = '北京') {
  await page.locator('#map-tab').tap();
  await page.locator('#city-search').fill(city);
  await page.locator('#search-results button').first().tap();
  await page.locator('#era-select').selectOption(year < 0 ? 'bce' : 'ce');
  await page.locator('#year-number').fill(String(Math.abs(year)));
  assert.equal(
    await page.locator('#submit').isDisabled(),
    false,
    'valid location and year enable submission',
  );
}
async function submitLocal(page) {
  await page.locator('#submit').tap();
  await inspectResult(page);
  const score = Number(
    (await page.locator('.result-score strong').innerText()).replaceAll(',', ''),
  );
  assert.ok(score >= 0 && score <= 5000, 'round score is bounded');
  return score;
}
async function coreSuite() {
  const { context, page } = await phone();
  await page.goto(base);
  assert.match(await page.title(), /此时/);
  await capture(page, 'home-390');
  await touchTargets(page);
  await nav(page, 'help');
  assert.match(await page.locator('#app').innerText(), /没有公元 0 年/);
  await capture(page, 'help-390');
  await touchTargets(page);
  await page.locator('#back').tap();
  await nav(page, 'journal');
  await capture(page, 'journal-390');
  await nav(page, 'settings');
  const sound = await page.locator('#sound').getAttribute('aria-pressed');
  await page.locator('#sound').tap();
  assert.notEqual(await page.locator('#sound').getAttribute('aria-pressed'), sound);
  await capture(page, 'settings-390');
  await touchTargets(page);
  await page.locator('[data-game-fullscreen]').tap();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.locator('[data-game-fullscreen]').tap();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.reload();
  await page.locator('#start').tap();
  await capture(page, 'prepare-390');
  await page.locator('#begin-level').tap();
  await ready(page);
  assert.equal(await page.locator('#submit').isDisabled(), true);
  assert.ok(Number((await page.locator('#timer').innerText()).match(/\d+/)[0]) <= 25);
  await capture(page, 'play-390');
  await touchTargets(page);
  await gesture(page);
  await page.locator('#pause').tap();
  const paused = (await saved(page)).mobileJourney;
  assert.equal(paused.phase, 'paused');
  await capture(page, 'pause-390');
  const bars = await page
    .locator('#pause svg rect')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: node.getAttribute('x'),
        y: node.getAttribute('y'),
        width: node.getAttribute('width'),
        height: node.getAttribute('height'),
      })),
    );
  assert.equal(bars.length, 2);
  assert.equal(bars[0].width, bars[1].width);
  assert.equal(bars[0].height, bars[1].height);
  assert.equal(bars[0].y, bars[1].y);
  assert.ok(
    Number(bars[0].x) + Number(bars[0].width) < Number(bars[1].x),
    'pause bars are separated and parallel',
  );
  await page.waitForTimeout(1200);
  assert.equal(
    (await saved(page)).mobileJourney.pausedRemaining,
    paused.pausedRemaining,
    'local pause preserves remaining time',
  );
  await page.locator('#resume').tap();
  await page.locator('#map-tab').tap();
  const map = await page.locator('#guess-map').boundingBox();
  await page.touchscreen.tap(map.x + map.width * 0.62, map.y + map.height * 0.52);
  assert.match(await page.locator('#location-status').innerText(), /已标记/);
  const paths = await page.locator('.leaflet-overlay-pane > svg').first().boundingBox();
  assert.ok(paths.width > 150 && paths.height > 100, 'world geometry is visible');
  assert.ok((await page.locator('.leaflet-overlay-pane path').count()) > 170);
  await page.locator('#year-number').fill('0');
  assert.equal(await page.locator('#submit').isDisabled(), true);
  await choose(page, -221, '长安');
  assert.equal(await page.locator('#year-range').inputValue(), '-221');
  await capture(page, 'map-390');
  await page.locator('#pause').tap();
  await page.locator('#pause-home').tap();
  const local = (await saved(page)).mobileJourney;
  await page.reload();
  await page.locator('#start').tap();
  await ready(page);
  assert.equal(await page.locator('#year-number').inputValue(), '221');
  assert.equal(await page.locator('#era-select').inputValue(), 'bce');
  assert.deepEqual((await saved(page)).mobileJourney.guess, local.guess);
  assert.deepEqual((await saved(page)).mobileJourney.deck, local.deck);
  await page.locator('#submit').evaluate((button) => {
    button.click();
    button.click();
  });
  await inspectResult(page);
  assert.equal(
    (await saved(page)).mobileJourney.results.length,
    1,
    'double submit records one local answer',
  );
  const firstScore = await page.locator('.result-score strong').innerText();
  await capture(page, 'score-390');
  await touchTargets(page);
  await page.reload();
  await page.locator('#start').tap();
  await inspectResult(page);
  assert.equal(
    await page.locator('.result-score strong').innerText(),
    firstScore,
    'result survives refresh without adding points',
  );
  for (let index = 1; index < 3; index++) {
    await page.locator('#next').tap();
    await ready(page);
    await choose(page);
    await submitLocal(page);
  }
  const run = (await saved(page)).mobileJourney;
  await page.locator('#next').tap();
  await page.locator('#finish-next').waitFor();
  const complete = await saved(page);
  assert.equal(complete.records['lanes-1'].complete, true);
  assert.equal(
    complete.records['lanes-1'].best,
    run.results.reduce((sum, item) => sum + item.total, 0),
  );
  assert.equal(complete.mobileJourney, null);
  assert.equal(await page.locator('.score-receipt > div').count(), 3);
  await capture(page, 'summary-390');
  await page.locator('#again').tap();
  await ready(page);
  assert.equal((await saved(page)).mobileJourney.index, 0);
  assert.deepEqual(
    (await saved(page)).mobileJourney.deck,
    run.deck,
    'retry keeps the local sublevel and resets the round',
  );
  await page.locator('#pause').tap();
  await page.locator('#pause-home').tap();
  await nav(page, 'journal');
  assert.doesNotMatch(
    await page.locator('#app').innerText(),
    /公元前?\s*\d+\s*年|正确地点|查看史料|年代误差|地点误差/,
  );
  assert.equal(await page.locator('.source-link').count(), 0);
  await context.close();
  observations.push(
    '390px touch flow: home/help/settings/fullscreen, panorama drag/cancel, true map tap, invalid year/BCE, pause/resume, persisted guesses/results, one-time score, three-round completion, retry and private journal',
  );

  for (const [width, height, label] of [
    [320, 568, '320'],
    [430, 932, '430'],
    [844, 390, 'landscape'],
  ]) {
    const sample = await phone(width, height);
    await sample.page.goto(base);
    await capture(sample.page, `home-${label}`);
    await touchTargets(sample.page);
    await startPractice(sample.page);
    await capture(sample.page, `play-${label}`);
    await touchTargets(sample.page);
    await choose(sample.page);
    await capture(sample.page, `map-${label}`);
    await touchTargets(sample.page);
    await submitLocal(sample.page);
    await capture(sample.page, `score-${label}`);
    await touchTargets(sample.page);
    await sample.context.close();
  }
  observations.push(
    '320×568, 390×844, 430×932 and 844×390: no horizontal overflow and all visible controls at least 44 CSS px',
  );

  const timed = await phone();
  await timed.page.goto(base);
  await startPractice(timed.page);
  const started = Date.now(),
    deadline = (await saved(timed.page)).mobileJourney.deadline;
  assert.ok(
    deadline - started > 22000 && deadline - started <= 25000,
    'practice starts a real 25-second clock',
  );
  await timed.page.locator('#next').waitFor({ timeout: 28000 });
  await inspectResult(timed.page);
  assert.ok(Date.now() - started >= 22000, 'timeout is exercised with real elapsed time');
  assert.equal(await timed.page.locator('.result-score strong').innerText(), '0');
  assert.match(await timed.page.locator('#app').innerText(), /超时.*0 分/);
  assert.equal((await saved(timed.page)).mobileJourney.results[0].timedOut, true);
  await capture(timed.page, 'timeout-390');
  await timed.context.close();
  observations.push(
    'Real elapsed 25-second timeout submits exactly one zero-score result without disclosing an answer',
  );
}
async function chapterSuite() {
  const { context, page } = await phone(320, 568);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${base}?route=market&v=1&year=1100&dev=0`);
  assert.equal(
    await page.locator('#start').count(),
    1,
    'legacy fixed-topic links no longer auto-start known-answer challenges',
  );
  await nav(page, 'chapters');
  await capture(page, 'chapters-320');
  await touchTargets(page);
  assert.equal(
    await page.locator('[data-chapter]:disabled').count(),
    2,
    'later chapters begin locked',
  );
  await page.locator('[data-chapter="lanes"]').tap();
  await capture(page, 'levels-320');
  await touchTargets(page);
  assert.equal(
    await page.locator('[data-level]:disabled').count(),
    2,
    'later sublevels begin locked',
  );
  await page.locator('[data-level="lanes-1"]').tap();
  await page.locator('#begin-level').tap();
  await ready(page);
  await page.locator('#map-tab').tap();
  await page.locator('#city-search').fill('京');
  assert.ok(
    (await page.locator('#search-results button').count()) >= 2,
    'ambiguous city names retain alternatives',
  );
  await page.locator('#city-search').press('ArrowUp');
  assert.equal(
    await page.locator('#search-results button').last().getAttribute('aria-selected'),
    'true',
    'initial ArrowUp selects the last candidate',
  );
  await page.locator('#city-search').press('Escape');
  assert.equal(
    await page.locator('#city-search').inputValue(),
    '京',
    'Escape retains the search query',
  );
  await page.locator('#city-search').press('ArrowDown');
  assert.equal(await page.locator('#search-results [aria-selected="true"]').count(), 1);
  await page.locator('#city-search').press('Escape');
  assert.equal(await page.locator('#city-search').getAttribute('aria-expanded'), 'false');
  await page.locator('#city-search').press('Enter');
  assert.equal(
    (await saved(page)).mobileJourney.guess,
    null,
    'Enter after Escape cannot select a hidden candidate',
  );
  await page.locator('#city-search').press('ArrowDown');
  await page.locator('#city-search').press('Enter');
  assert.ok(
    (await saved(page)).mobileJourney.guess,
    'keyboard navigation can select a visible candidate',
  );
  const { LEVELS } = await import('../src/chapters.js');
  for (const [levelIndex, level] of LEVELS.entries()) {
    if (levelIndex > 0) {
      await page.locator('#finish-next').tap();
      await page.locator('#begin-level').tap();
      await ready(page);
    }
    for (let index = 0; index < 3; index++) {
      assert.match(
        await page.locator('#round-label').innerText(),
        new RegExp(`第 ${index + 1} / 3 幕`),
      );
      await choose(page, index === 0 ? -221 : 1420);
      await submitLocal(page);
      await page.locator('#next').tap();
      if (index < 2) await ready(page);
    }
    await page.locator('#finish-next').waitFor();
    const record = await saved(page);
    assert.equal(
      record.records[level.id].complete,
      true,
      `normal progression completes ${level.id}`,
    );
    assert.equal(
      Object.values(record.records).filter((item) => item.complete).length,
      levelIndex + 1,
    );
    assert.equal(record.best, 0, 'new local progress never overwrites the legacy five-round score');
    assert.equal(record.mobileJourney, null);
    assert.equal(await page.locator('.score-receipt > div').count(), 3);
    await noOverflow(page);
  }
  await nav(page, 'home');
  await nav(page, 'chapters');
  assert.equal(await page.locator('[data-chapter]:disabled').count(), 0);
  await page.reload();
  await nav(page, 'journal');
  assert.match(await page.locator('.journal-stats').innerText(), /9\s*\/\s*9/);
  assert.equal((await saved(page)).visited.length, 27);
  await capture(page, 'journal-complete-320');
  assert.ok(
    !requests.some((url) => /\/api\/history\/(?:sessions|runs)/.test(url)),
    'all local chapters work without creating an online session',
  );
  await context.close();
  observations.push(
    'Nine sublevels / 27 touch-played scenes progress through normal locks, preserve all scores on reload, and never create online sessions or alter legacy records; city keyboard/Escape input remains valid',
  );

  const unavailable = await phone(390, 844, () => {
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await unavailable.page.goto(base);
  await startPractice(unavailable.page);
  await choose(unavailable.page);
  await submitLocal(unavailable.page);
  assert.match(await unavailable.page.locator('#app').innerText(), /本幕评分/);
  await unavailable.context.close();
  observations.push('Blocked browser storage degrades to playable in-memory practice');

  const failure = await phone();
  let interrupted = false;
  await failure.page.route('**/data/world.json', (route) => {
    if (!interrupted) {
      interrupted = true;
      return route.abort('failed');
    }
    return route.continue();
  });
  await failure.page.goto(base);
  await failure.page.locator('#start').tap();
  await failure.page.locator('#begin-level').tap();
  await failure.page.locator('#retry').waitFor();
  assert.match(await failure.page.locator('#load-cover').innerText(), /没能打开/);
  await failure.page.locator('#retry').tap();
  await ready(failure.page);
  await choose(failure.page);
  await submitLocal(failure.page);
  await failure.context.close();
  observations.push(
    'A real map-load network failure exposes retry and successful retry restores the playable scene',
  );
}
async function answerOnline(page) {
  const pending = page.waitForResponse(
    (response) =>
      /\/api\/history\/runs\/[^/]+\/answers$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST',
  );
  await page.locator('#submit').tap();
  const response = await pending;
  assert.equal(response.status(), 200);
  const body = await response.json();
  assertPublicProjection(body);
  return body.run;
}
async function completeOnline(page, initial, expected = null) {
  let run = initial;
  const fingerprints = [];
  for (let index = 0; index < 5; index++) {
    await ready(page);
    validTimedRun(run);
    const fingerprint = await imageFingerprint(page, run);
    fingerprints.push(fingerprint);
    if (expected)
      assert.equal(
        fingerprint,
        expected[index],
        `friend receives the identical frozen image for round ${index + 1}`,
      );
    await choose(page, 1000 + index * 100);
    run = await answerOnline(page);
    assert.equal(run.results.length, index + 1, 'the server records exactly one answer per round');
    assert.ok(
      run.results.every(
        (result) => Number.isInteger(result.score) && result.score >= 0 && result.score <= 5000,
      ),
    );
    assert.equal(
      run.score,
      run.results.reduce((sum, result) => sum + result.score, 0),
    );
    if (index < 4) {
      await inspectResult(page);
      if (index === 0 && !expected) await capture(page, 'pk-score-390');
      const next = waitForRun(page);
      await page.locator('#next').tap();
      run = await next;
    }
  }
  await page.locator('#share-result').waitFor();
  assert.equal(run.phase, 'finished');
  assert.equal(run.round, null);
  assert.equal(await page.locator('.score-receipt > div').count(), 5);
  assert.doesNotMatch(
    await page.locator('#app').innerText(),
    /正确(?:答案|地点|年份)|地点误差|年代误差|\d+\s*(?:公里|千米)/,
  );
  return { run, fingerprints };
}
async function pkSuite() {
  const host = await phone(390, 844, () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('clipboard unavailable')) },
    });
  });
  const api = monitorApi(host.page);
  await host.page.goto(`${base}?dev=0&token=private&year=1420#secret`);
  await host.page.locator('#friend-entry').tap();
  await capture(host.page, 'pk-home-390');
  await touchTargets(host.page);
  await host.page.locator('#create-duel').tap();
  await host.page.locator('#begin-competition').waitFor();
  await capture(host.page, 'pk-prepare-390');
  const start = waitForRun(host.page);
  await host.page.locator('#begin-competition').tap();
  const initial = await start;
  validTimedRun(initial);
  const complete = await completeOnline(host.page, initial);
  await capture(host.page, 'pk-summary-390');
  await host.page.locator('#share-result').tap();
  await host.page.locator('#share-link').waitFor();
  const shareBounds = await host.page.locator('#share-invite').boundingBox();
  assert.ok(
    shareBounds.y >= 0 && shareBounds.y + shareBounds.height <= 844,
    'the primary share action is completely visible on the first phone screen',
  );
  const link = new URL(await host.page.locator('#share-link').inputValue());
  assert.deepEqual([...link.searchParams.keys()], ['invite']);
  assert.equal(link.hash, '');
  assert.doesNotMatch(link.href, /dev=|token=|year=|scene=|daily=|route=|seed=|private/);
  assert.match(link.searchParams.get('invite'), /^[A-Za-z0-9_-]{24,}$/);
  await host.page.locator('#copy-invite').tap();
  assert.match(await host.page.locator('#share-status').innerText(), /长按/);
  await capture(host.page, 'pk-share-390');
  await touchTargets(host.page);
  await host.page.evaluate(() =>
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => Promise.reject(new DOMException('cancel', 'AbortError')),
    }),
  );
  await host.page.locator('#share-invite').tap();
  await host.page.waitForFunction(() =>
    /保留|取消/.test(document.querySelector('#toast')?.textContent || ''),
  );
  assert.equal(
    await host.page.locator('#share-link').inputValue(),
    link.href,
    'canceling the system share retains the invite',
  );

  const friend = await phone();
  const friendApi = monitorApi(friend.page);
  await friend.page.goto(link.href);
  await friend.page.locator('#accept-invite').waitFor();
  assert.match(
    await friend.page.locator('.invitation-score strong').innerText(),
    new RegExp(String(complete.run.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  );
  await capture(friend.page, 'pk-invite-390');
  await touchTargets(friend.page);
  const joining = waitForRun(friend.page);
  await friend.page.locator('#accept-invite').tap();
  const joined = await joining;
  const result = await completeOnline(friend.page, joined, complete.fingerprints);
  assert.equal(
    result.run.score,
    complete.run.score,
    'same five guesses against frozen questions have identical server scores',
  );
  assert.match(await friend.page.locator('#app').innerText(), /不分高下/);
  await capture(friend.page, 'pk-friend-result-390');
  await host.page.locator('#refresh-challengers').tap();
  await host.page.locator('#challenger-list .challenger-list > div').waitFor();
  assert.match(await host.page.locator('#challenger-list').innerText(), /与你并列/);
  assert.match(
    await host.page.locator('#challenger-list').innerText(),
    new RegExp(String(result.run.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')),
  );
  await capture(host.page, 'pk-host-challengers-390');
  await nav(friend.page, 'leaderboard');
  await friend.page.locator('#rank-content .empty-state').waitFor();
  assert.match(await friend.page.locator('#rank-content').innerText(), /还没有正式成绩/);
  assert.equal(
    await friend.page.locator('.ranking li').count(),
    0,
    'guest PK never fabricates public ranking entries',
  );
  await capture(friend.page, 'leaderboard-week-390');
  await touchTargets(friend.page);
  await friend.page.locator('#rank-day').tap();
  await friend.page.locator('#rank-content .empty-state').waitFor();
  assert.match(await friend.page.locator('#rank-content').innerText(), /还没有正式成绩/);
  await capture(friend.page, 'leaderboard-day-390');
  await friend.page.locator('#rank-play').tap();
  await friend.page.locator('#guest-duel').waitFor();
  assert.match(await friend.page.locator('#service-state').innerText(), /游客|可信|账号/);
  assert.equal(
    await friend.page.locator('#begin-competition').count(),
    0,
    'an untrusted guest cannot begin a ranked run',
  );
  await capture(friend.page, 'ranked-identity-required-390');
  const exchanges = await api.checked(),
    friendExchanges = await friendApi.checked();
  assert.equal(exchanges.filter((item) => /\/answers$/.test(item.path)).length, 5);
  assert.equal(friendExchanges.filter((item) => /\/answers$/.test(item.path)).length, 5);
  assert.ok([...exchanges, ...friendExchanges].every((item) => item.status < 400));
  assert.ok(
    friendExchanges
      .filter((item) => /\/leaderboard$/.test(item.path))
      .every((item) => item.body.entries.length === 0),
  );
  observations.push(
    'Actual SQLite HTTP service: two independent guest browsers complete ten touch-submitted rounds with the same five image hashes and identical scores; host receives the completed challenger score; all JSON projections omit answers, coordinates, numerical errors, seeds and future questions',
  );
  observations.push(
    'Opaque 24h invite links contain only invite; clipboard failure and canceled system sharing are recoverable; public day/week rankings remain truly empty and trusted identity gates ranked play',
  );
  await friend.context.close();
  await host.page.reload();
  await host.page.locator('#friend-entry').tap();
  await host.page.locator('#last-duel').tap();
  await host.page.locator('#share-result').waitFor();
  await host.page.locator('#share-result').tap();
  await host.page.locator('#share-link').waitFor();
  assert.equal(
    await host.page.locator('#share-link').inputValue(),
    link.href,
    'the finished host challenge and its invitation survive reload',
  );

  await host.page.evaluate(() => {
    window.shareCalls = 0;
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => {
        window.shareCalls++;
        return new Promise((resolve, reject) => {
          window.rejectShare = reject;
        });
      },
    });
  });
  await host.page.locator('#share-invite').tap();
  await host.page.locator('#share-invite').dispatchEvent('click');
  assert.equal(
    await host.page.evaluate(() => window.shareCalls),
    1,
    'repeated taps open only one system share',
  );
  await host.page.locator('#back').tap();
  const focus = await host.page.evaluate(() => document.activeElement.id);
  await host.page.evaluate(async () => {
    window.rejectShare(new Error('late cancellation'));
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(await host.page.locator('#share-link').count(), 0);
  assert.equal(
    await host.page.evaluate(() => document.activeElement.id),
    focus,
    'stale share failures cannot move focus or create a panel on another page',
  );
  await host.context.close();
  observations.push(
    'Native share uses a single in-flight action; late rejection after page navigation cannot reopen stale sharing UI',
  );

  const resumed = await phone();
  const resumedApi = monitorApi(resumed.page);
  await resumed.page.goto(base);
  await resumed.page.locator('#friend-entry').tap();
  await resumed.page.locator('#create-duel').tap();
  await resumed.page.locator('#begin-competition').waitFor();
  const launched = waitForRun(resumed.page);
  await resumed.page.locator('#begin-competition').tap();
  const original = await launched;
  await ready(resumed.page);
  await resumed.page.locator('#pause').tap();
  assert.match(await resumed.page.locator('.pause-card').innerText(), /仍.*计时|原截止时间/);
  await resumed.page.locator('#pause-home').tap();
  await resumed.page.reload();
  await resumed.page.locator('#friend-entry').tap();
  await resumed.page.locator('#create-duel').tap();
  await resumed.page.locator('#begin-competition').waitFor();
  const recovery = waitForRun(resumed.page);
  await resumed.page.locator('#begin-competition').tap();
  const restored = await recovery;
  await ready(resumed.page);
  assert.equal(restored.id, original.id);
  assert.equal(restored.round.id, original.round.id);
  assert.equal(
    restored.round.expiresAt,
    original.round.expiresAt,
    'leaving and refreshing cannot reset a server deadline',
  );
  await resumed.page.locator('#next').waitFor({ timeout: 28000 });
  await inspectResult(resumed.page);
  assert.equal(await resumed.page.locator('.result-score strong').innerText(), '0');
  assert.ok(
    (await resumedApi.checked()).some((item) => item.body.run?.results?.[0]?.timedOut === true),
  );
  await capture(resumed.page, 'pk-timeout-390');
  await resumed.context.close();
  observations.push(
    'A live competitive run resumes the same round/deadline after home and reload; the real service records zero at the original deadline',
  );
}
// Targeted rerun for the final search/share changes, without repeating elapsed-time tests.
async function polishSuite() {
  const keyboard = await phone(320, 568);
  await keyboard.page.goto(base);
  await startPractice(keyboard.page);
  await keyboard.page.locator('#map-tab').tap();
  await keyboard.page.locator('#city-search').fill('京');
  await keyboard.page.locator('#city-search').press('ArrowUp');
  assert.equal(
    await keyboard.page.locator('#search-results button').last().getAttribute('aria-selected'),
    'true',
  );
  await keyboard.page.locator('#city-search').press('Escape');
  assert.equal(await keyboard.page.locator('#city-search').inputValue(), '京');
  await keyboard.page.locator('#city-search').press('Enter');
  assert.equal((await saved(keyboard.page)).mobileJourney.guess, null);
  await keyboard.page.locator('#city-search').press('ArrowDown');
  await keyboard.page.locator('#city-search').press('Enter');
  assert.ok((await saved(keyboard.page)).mobileJourney.guess);
  await keyboard.page.locator('#year-number').fill('1420');
  await keyboard.page.locator('#year-number').fill('0');
  assert.equal((await saved(keyboard.page)).mobileJourney.yearTouched, false);
  await keyboard.page.reload();
  await keyboard.page.locator('#start').tap();
  await ready(keyboard.page);
  assert.equal(
    await keyboard.page.locator('#submit').isDisabled(),
    true,
    'an invalid year stays invalid after reload',
  );
  await keyboard.context.close();
  observations.push(
    'Final search regression: initial ArrowUp selects last candidate; Escape retains text; hidden Enter cannot select; ArrowDown reopens; invalid year cannot become a valid persisted answer',
  );

  const host = await phone(390, 844, () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('unavailable')) },
    });
  });
  const hostApi = monitorApi(host.page);
  await host.page.goto(base);
  await host.page.locator('#friend-entry').tap();
  await host.page.locator('#create-duel').tap();
  await host.page.locator('#begin-competition').waitFor();
  const pending = waitForRun(host.page);
  await host.page.locator('#begin-competition').tap();
  const complete = await completeOnline(host.page, await pending);
  await host.page.locator('#share-result').tap();
  await host.page.locator('#share-link').waitFor();
  const bounds = await host.page.locator('#share-invite').boundingBox();
  assert.ok(
    bounds.y >= 0 && bounds.y + bounds.height <= 844,
    'share CTA fully visible in first viewport',
  );
  const link = await host.page.locator('#share-link').inputValue();
  await capture(host.page, 'pk-share-390');
  await touchTargets(host.page);
  await host.page.reload();
  await host.page.locator('#friend-entry').tap();
  await host.page.locator('#last-duel').tap();
  await host.page.locator('#share-result').waitFor();
  await host.page.locator('#share-result').tap();
  await host.page.locator('#share-link').waitFor();
  assert.equal(await host.page.locator('#share-link').inputValue(), link);
  const friend = await phone();
  const friendApi = monitorApi(friend.page);
  await friend.page.goto(link);
  await friend.page.locator('#accept-invite').waitFor();
  const joining = waitForRun(friend.page);
  await friend.page.locator('#accept-invite').tap();
  await completeOnline(friend.page, await joining, complete.fingerprints);
  await host.page.locator('#refresh-challengers').tap();
  await host.page.locator('#challenger-list .challenger-list > div').waitFor();
  assert.match(await host.page.locator('#challenger-list').innerText(), /与你并列/);
  await capture(host.page, 'pk-host-challengers-390');
  await hostApi.checked();
  await friendApi.checked();
  await friend.context.close();
  await host.context.close();
  observations.push(
    'Final share layout: primary CTA completely visible in 390×844; completed duel and exact invitation recover after reload; a real friend completion refreshes host challenge results',
  );
}
