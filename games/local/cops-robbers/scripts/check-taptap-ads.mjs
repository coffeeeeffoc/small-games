import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../../../outputs/cops-robbers/taptap-h5/dist/', import.meta.url));
const zip = new URL('../../../../outputs/cops-robbers/cops-robbers-taptap-h5.zip', import.meta.url);
const packageRecord = JSON.parse(await readFile(new URL('../docs/qa/taptap-h5-package.json', import.meta.url)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(await readFile(zip)), packageRecord.sha256, 'ZIP must match the package receipt');
assert.equal(packageRecord.adPlatform, 'taptap-h5');
assert.equal(packageRecord.adMode, 'host');
for (const file of packageRecord.files) assert.equal(hash(await readFile(resolve(root, file.path))), file.sha256, `Extracted resource: ${file.path}`);
const browserEnv = { ...process.env };
if (browserEnv.BROWSER_EXECUTABLE) {
  browserEnv.PLAYWRIGHT_EXECUTABLE_PATH = browserEnv.BROWSER_EXECUTABLE;
  browserEnv.CHROMIUM_PATH = browserEnv.BROWSER_EXECUTABLE;
}
const preparation = execFileSync(process.execPath, [fileURLToPath(new URL('../../../../scripts/browser-preparation.mjs', import.meta.url)), '--reuse-installed'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env: browserEnv,
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
console.log(preparation.trim());
// The CLI's last line is its result; earlier lines retain download and launch diagnostics.
const { executablePath } = JSON.parse(preparation.trim().split(/\r?\n/).at(-1));
const names = new Set(packageRecord.files.map(file => file.path));
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!names.has(name) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); return response.end(); }
    const path = resolve(root, name);
    if (await realpath(path) !== path) throw new Error('No symlink resources');
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(500); response.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const output = new URL('../outputs/taptap-ads/', import.meta.url);
const report = { zipSha256: packageRecord.sha256, platform: 'taptap-h5', sdkFixture: true, realAdsVerified: false, realDeviceVerified: false, checks: [] };
let browser;
const ready = page => page.waitForFunction(() => !document.getElementById('hint').disabled);
async function check(name, run, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.failure()?.errorText));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/?dev=0&motion=reduce`);
    await page.locator('#home-start').waitFor();
    const config = await page.evaluate(() => globalThis.SmallGamesPublishingConfig);
    assert.equal(config.adMode, 'host'); assert.equal(config.platform, 'taptap-h5');
    await page.locator('#home-start').tap();
    await run(page);
    assert.deepEqual(errors, []);
    report.checks.push({ name, passed: true }); console.log(`PASS ${name}`);
  } finally { await context.close(); }
}
async function inject(page, behavior = 'normal') {
  await page.evaluate(behavior => {
    globalThis.SmallGamesPublishingConfig = Object.freeze({ adMode: 'host', platform: 'taptap-h5', adUnitId: 'fixture-portrait' });
    globalThis.__tapCalls = [];
    globalThis.tap = { createRewardedVideoAd(options) {
      __tapCalls.push(options);
      if (behavior === 'create-failed') throw new Error('create');
      const ad = {
        onClose(fn) { globalThis.__tapClose = fn; }, onError(fn) { globalThis.__tapError = fn; },
        offClose() { __tapCalls.push('offClose'); }, offError() { __tapCalls.push('offError'); },
        load() { __tapCalls.push('load'); return behavior === 'load-failed' ? Promise.reject(new Error('load')) : Promise.resolve(); },
        show() { __tapCalls.push('show'); return behavior === 'show-failed' ? Promise.reject(new Error('show')) : Promise.resolve(); },
        destroy() { __tapCalls.push('destroy'); },
      };
      return ad;
    } };
    for (const name of ['wx', 'tt', 'bl']) globalThis[name] = { createRewardedVideoAd() { throw new Error(`Wrong channel: ${name}`); } };
  }, behavior);
}
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ channel: 'chromium', executablePath });
  report.browser = await browser.version();
  report.browserExecutable = executablePath;
  report.node = process.version;
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await check(`missing-host-no-mock-${viewport.width}`, async page => {
      const before = await page.locator('body').getAttribute('data-turn');
      await page.getByTestId('hint').tap(); await ready(page);
      assert.equal(await page.locator('[data-game-ad], .hint-circle').count(), 0);
      assert.match(await page.locator('#play-prompt').textContent(), /广告暂不可用/);
      assert.equal(await page.locator('body').getAttribute('data-turn'), before);
      await page.locator('#focus-toggle').tap();
      await page.locator('#resume-patrol').tap();
    }, viewport);
    await check(`tap-complete-cancel-${viewport.width}`, async page => {
      await inject(page);
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state);
      await page.getByTestId('hint').tap();
      await page.waitForFunction(() => globalThis.__tapCalls.includes('show'));
      assert.equal(await page.locator('.hint-circle').count(), 0, 'show resolution never rewards');
      await page.locator('#hint').evaluate(button => button.click());
      assert.equal(await page.evaluate(() => __tapCalls.filter(call => typeof call === 'object').length), 1);
      await page.evaluate(() => __tapClose({ isEnded: false })); await ready(page);
      assert.equal(await page.locator('.hint-circle').count(), 0);
      await page.getByTestId('hint').tap();
      await page.waitForFunction(() => __tapCalls.filter(call => call === 'show').length === 2);
      await page.evaluate(() => { __tapClose({ isEnded: true }); __tapClose({ isEnded: true }); });
      await page.locator('.hint-circle').waitFor();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state), before);
      assert.deepEqual(await page.evaluate(() => __tapCalls.filter(call => typeof call === 'object')), [{ adUnitId: 'fixture-portrait' }, { adUnitId: 'fixture-portrait' }]);
      await page.screenshot({ path: fileURLToPath(new URL(`tap-hint-${viewport.width}.png`, output)) });
    }, viewport);
  }
  for (const behavior of ['create-failed', 'load-failed', 'show-failed']) await check(behavior, async page => {
    await inject(page, behavior); await page.getByTestId('hint').tap(); await ready(page);
    assert.equal(await page.locator('[data-game-ad], .hint-circle').count(), 0);
    assert.match(await page.locator('#play-prompt').textContent(), /广告加载失败/);
  });
  for (const cause of ['return', 'timeout', 'background']) await check(`late-close-after-${cause}`, async page => {
    await inject(page); if (cause === 'timeout') await page.clock.install();
    await page.getByTestId('hint').tap(); await page.waitForFunction(() => __tapCalls.includes('show'));
    if (cause === 'return') await page.locator('#focus-toggle').evaluate(button => button.click());
    if (cause === 'timeout') await page.clock.fastForward(45001);
    if (cause === 'background') await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    });
    await page.waitForFunction(() => !document.querySelector('[inert]'));
    await page.evaluate(() => __tapClose({ isEnded: true }));
    assert.equal(await page.locator('.hint-circle').count(), 0);
    assert.equal(await page.evaluate(() => __tapCalls.filter(call => call === 'destroy').length), 1);
  });
  report.passed = true;
} finally {
  try { await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n'); }
  finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
