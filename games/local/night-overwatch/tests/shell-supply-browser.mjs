import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';
import { snapshot } from './flight-browser.mjs';
import { monitorPagesPage } from '../../../../apps/shell-web/scripts/pages-browser-monitor.mjs';

const shell = new URL(process.env.NIGHT_SHELL_URL || 'http://127.0.0.1:4330/');
shell.hash = ''; shell.search = '';
const gameURL = new URL('games/night-overwatch/index.html', shell).href;
const metadataURL = new URL('games/night-overwatch/build-info.json', shell).href;
const response = await fetch(metadataURL);
assert(response.ok, `Shell build metadata HTTP ${response.status}`);
const build = await response.json();
assert.match(process.env.NIGHT_EXPECTED_SOURCE_HASH || '', /^[a-f0-9]{64}$/);
assert.equal(build.sourceHash, process.env.NIGHT_EXPECTED_SOURCE_HASH, 'Owner-confirmed Shell artifact');
assert.equal(build.sourceHash, await sourceHash(), 'Shell artifact matches current production sources');
const output = new URL('../reports/combat-supply/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { status: 'running', shell: shell.href, metadataURL, build,
  expectedSourceHash: process.env.NIGHT_EXPECTED_SOURCE_HASH, results: [], errors: [], warnings: [],
  physicalDevice: false, realAdSdk: false, gameStateSetters: false };
const save = () => writeFile(new URL('shell-verification.json', output), JSON.stringify(report, null, 2) + '\n');
const combat = s => Object.fromEntries(['time', 'remaining', 'phase', 'mission', 'progress', 'convoy',
  'aircraft', 'guns', 'shots', 'shotPositions', 'units', 'fired', 'hits', 'kills', 'friendlyDamage',
  'buff', 'homingAmmo'].map(key => [key, s[key]]));
await save();
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
report.browserVersion = browser.version();
try {
  for (const scenario of [
    { id: 'desktop', width: 1280, height: 720, touch: false },
    { id: 'touch', width: 844, height: 390, touch: true },
    { id: 'provider-failed', width: 844, height: 390, touch: true, fixture: 'failed' },
  ]) {
    const result = { ...scenario, status: 'running', screenshots: [], checks: [] };
    report.results.push(result); await save();
    console.log(`Shell supply: ${scenario.id}`);
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height },
      hasTouch: scenario.touch, isMobile: scenario.touch,
      ...(scenario.touch ? { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' } : {}) });
    const page = await context.newPage();
    monitorPagesPage(page, shell.href, report.errors, scenario.id);
    if (scenario.fixture) await page.addInitScript(status => {
      if (!globalThis.location.pathname.includes('/games/night-overwatch/')) return;
      const offers = [];
      Object.defineProperty(globalThis, '__shellSupplyOffers', { get: () => structuredClone(offers) });
      // Test only: replace the public ad boundary, never simulation, inventory or save state.
      globalThis.SmallGamesRewardAds = { async offer(opportunity) {
        offers.push(structuredClone(opportunity));
        await new Promise(resolve => setTimeout(resolve, 650));
        return { status };
      } };
    }, scenario.fixture);
    let frame;
    const capture = async name => {
      const filename = `shell-${scenario.id}-${name}.png`;
      await page.screenshot({ path: fileURLToPath(new URL(filename, output)) });
      result.screenshots.push(filename);
    };
    try {
      // Same catalog navigation as pages-smoke.mjs; keep the actual Shell iframe and permissions.
      await page.goto(shell.href);
      await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
      await page.locator('article').filter({ hasText: '夜航守望' })
        .getByRole('link', { name: '进入游戏', exact: true }).click();
      await expect(page).toHaveURL(`${shell.href}#/games/night-overwatch`);
      const iframe = page.locator('iframe');
      frame = await (await iframe.elementHandle()).contentFrame();
      assert(frame);
      assert.equal(frame.url(), gameURL);
      result.iframe = { url: frame.url(), sandbox: await iframe.getAttribute('sandbox'), allow: await iframe.getAttribute('allow') };
      await frame.waitForFunction(() => globalThis.__night?.snapshot().modelImport === 'loaded' &&
        !globalThis.document.getElementById('night-startup'), null, { timeout: 60000 });
      result.publicAdProvider = await frame.evaluate(() => typeof globalThis.SmallGamesRewardAds?.offer === 'function');
      result.adBoundary = scenario.fixture ? 'public SmallGamesRewardAds.offer failure fixture' : 'unmodified Shell / built-in Web mock';
      const canvas = frame.locator('#GameCanvas');
      // The exported flight-browser press helper uses top-page coordinates; iframe input needs this mapping.
      const press = async id => {
        await expect.poll(async () => (await snapshot(frame)).buttons.some(b => b.id === id)).toBe(true);
        const b = (await snapshot(frame)).buttons.find(b => b.id === id);
        const position = await canvas.evaluate((element, button) => {
          const bounds = element.getBoundingClientRect(), s = globalThis.__night.snapshot();
          const transform = new globalThis.DOMMatrix(globalThis.getComputedStyle(globalThis.document.getElementById('GameDiv')).transform);
          const x = button.x + button.w / 2, y = button.y + button.h / 2;
          return transform.b > .5 ? { x: bounds.width - y * bounds.width / s.ui.height, y: x * bounds.height / s.ui.width }
            : { x: x * bounds.width / s.ui.width, y: y * bounds.height / s.ui.height };
        }, b);
        await (scenario.touch ? canvas.tap({ position }) : canvas.click({ position }));
        await frame.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
      };
      const frozen = async label => {
        const before = await snapshot(frame);
        assert(before.pauses.length, label); assert.deepEqual(before.held, []);
        await page.waitForTimeout(220);
        assert.deepEqual(combat(await snapshot(frame)), combat(before), label);
        result.checks.push(label); return before;
      };
      const resume = async () => {
        const time = (await snapshot(frame)).time;
        await press('resume');
        await expect.poll(async () => (await snapshot(frame)).time).toBeGreaterThan(time);
        assert.deepEqual((await snapshot(frame)).pauses, []);
      };
      await press('missions'); await press('training'); await press('start');
      await expect.poll(async () => (await snapshot(frame)).time).toBeGreaterThan(0);
      const initial = await snapshot(frame);
      await press('supply');
      assert.equal((await snapshot(frame)).modal, 'supply:offer');
      await frozen('supply freezes battle and clears input'); await capture('supply');
      await press('supplyWatch');
      if (scenario.fixture) {
        await expect.poll(async () => (await snapshot(frame)).modal).toBe('pause');
        const failed = await frozen('failed provider returns to paused battle');
        assert.equal(failed.pendingSupply, false); assert.equal(failed.homingAmmo, initial.homingAmmo);
        result.offers = await frame.evaluate(() => globalThis.__shellSupplyOffers);
        assert.deepEqual(result.offers, [{ id: 'night-overwatch:supply', reward: { supplyChoice: 1 } }]);
        await capture('failure'); await resume();
        result.checks.push('failed provider grants nothing; real input resumes battle');
      } else {
        await expect.poll(async () => (await snapshot(frame)).advert?.mock).toBe(true);
        await frozen('built-in mock advert freezes battle');
        await press('adCancel');
        assert.equal((await snapshot(frame)).modal, 'pause');
        assert.equal((await snapshot(frame)).pendingSupply, false);
        assert.equal((await snapshot(frame)).homingAmmo, initial.homingAmmo);
        await frozen('cancel grants nothing and returns to pause'); await resume();
        await press('pause'); await frozen('manual pause freezes battle');
        await press('supply'); await press('supplyWatch');
        await expect.poll(async () => (await snapshot(frame)).advert?.mock).toBe(true);
        await press('adClose');
        const choice = await frozen('completed ad persists one pending choice while battle stays frozen');
        assert.equal(choice.pendingSupply, true); assert.equal(choice.homingAmmo, initial.homingAmmo);
        assert.deepEqual(choice.buttons.filter(b => b.id.startsWith('reward:')).map(b => b.id).sort(),
          ['reward:ammo', 'reward:rate', 'reward:tracking']);
        await capture('choice'); await press('reward:ammo');
        const claimed = await snapshot(frame);
        assert.equal(claimed.homingAmmo, initial.homingAmmo + 2); assert.equal(claimed.pendingSupply, false);
        assert.equal(claimed.buff, null); assert.equal(claimed.fired, initial.fired);
        assert(claimed.resumeCountdown > 2 && claimed.resumeCountdown <= 3);
        await capture('countdown');
        const digits = new Set([Math.ceil(claimed.resumeCountdown)]), deadline = Date.now() + 12000;
        let current = claimed;
        while (current.resumeCountdown > 0 && Date.now() < deadline) {
          digits.add(Math.ceil(current.resumeCountdown));
          assert.deepEqual(combat(current), combat(claimed), 'countdown never advances combat');
          assert.deepEqual(current.held, []);
          await page.waitForTimeout(100); current = await snapshot(frame);
        }
        assert.deepEqual([...digits], [3, 2, 1]); assert.equal(current.resumeCountdown, 0);
        assert.deepEqual(current.pauses, []);
        await expect.poll(async () => (await snapshot(frame)).time).toBeGreaterThan(claimed.time);
        result.countdownDigits = [...digits];
        result.checks.push('one choice grants exactly two rounds without firing; 3/2/1 freezes combat then resumes');
        await press('pause'); await frozen('post-claim pause remains usable'); await resume();
        assert.equal((await snapshot(frame)).homingAmmo, initial.homingAmmo + 2);
        result.checks.push('post-claim pause/resume preserves inventory');
      }
      await page.getByRole('button', { name: '返回目录', exact: true }).click();
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '摸鱼游戏社' })).toBeVisible();
      result.checks.push('Shell return removes iframe and restores catalog');
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed'; result.error = error.stack;
      result.failureSnapshot = frame ? await snapshot(frame).catch(() => null) : null;
      await capture('failure').catch(() => {}); throw error;
    } finally { await context.close(); await save(); }
  }
  // Root preview has no favicon; keep that browser request visible without hiding game failures.
  const favicon404 = `console: Failed to load resource: the server responded with a status of 404 (Not Found) (${new URL('/favicon.ico', shell).href}:1:1)`;
  report.warnings = report.errors.filter(message => message.endsWith(favicon404));
  report.errors = report.errors.filter(message => !message.endsWith(favicon404));
  assert.deepEqual(report.errors, [], 'No page, console or Shell resource errors');
  const finalMetadata = await fetch(metadataURL, { cache: 'no-store' });
  assert(finalMetadata.ok, `Final Shell build metadata HTTP ${finalMetadata.status}`);
  report.buildAfter = await finalMetadata.json();
  assert.equal(report.buildAfter.sourceHash, report.expectedSourceHash, 'Shell build stayed pinned through the suite');
  assert.equal(await sourceHash(), report.expectedSourceHash, 'Production source stayed pinned through the suite');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally { await browser.close(); await save(); }
console.log(`Shell supply passed: ${report.results.length} scenarios; ${build.sourceHash}`);
