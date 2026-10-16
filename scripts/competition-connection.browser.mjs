import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

// Exercise the actual compiled H5 entry and competition bundle. The intercepted
// transport failure sends no request, session, token or score to production.
const matrixPath = path.resolve(process.argv[2] || '');
assert(process.argv[2], 'Pass the exact new matrix.json');
const root = path.dirname(matrixPath),
  matrix = JSON.parse(await readFile(matrixPath, 'utf8'));
const output = path.resolve(process.env.CONNECTION_OUTPUT || 'outputs/connection-diagnostics');
await mkdir(output, { recursive: true });
let current;
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    const file = path.resolve(current, '.' + (pathname === '/' ? '/index.html' : pathname));
    assert(file.startsWith(current + path.sep));
    const bytes = await readFile(file);
    res
      .writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const checks = [];
try {
  for (const game of ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five']) {
    const variant = matrix.variants.find(
      (v) => v.game === game && !v.adsEnabled && v.serviceEnabled,
    );
    assert(variant, 'Missing service-on package');
    current = path.resolve(root, variant.name, 'dist');
    assert(current.startsWith(root + path.sep));
    for (const width of [320, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 320 ? 568 : 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://**/*', (route) => route.abort('failed'));
      await page.goto(`http://127.0.0.1:${server.address().port}/?dev=0`);
      if (game === 'xiangqi-five') {
        await page.locator('#home-start').tap();
        await page.locator('#mode-online').tap();
      } else if (game === 'cops-robbers-realtime')
        await page.locator('[data-competition-entry="friends"]').tap();
      else await page.locator('#friend-duel').tap();
      const info = page.locator('.competition-connection-info');
      await expect(info).toBeVisible();
      assert.equal(await info.getAttribute('open'), null, 'connection details start collapsed');
      await info.locator('summary').tap();
      await expect(info).toHaveAttribute('open', '');
      const text = await info.textContent();
      assert(text.includes('页面推导，未验证请求 Origin'));
      assert(text.includes('建立会话：网络请求未完成'));
      assert(text.includes('POST'));
      assert(!text.includes('CORS'), 'a generic fetch failure does not prove a CORS cause');
      assert(!text.includes('Bearer') && !text.includes('refreshToken') && !text.includes('?dev'));
      const box = await info.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      const summary = await info.locator('summary').boundingBox();
      assert(summary.height >= 44);
      await page.screenshot({ path: path.join(output, `${game}-${width}.png`) });
      assert.deepEqual(errors, []);
      checks.push({ game, width, passed: true, sha256: variant.sha256 });
      console.log(`PASS compiled connection diagnostics ${game} ${width}`);
      await context.close();
    }
  }
  await writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(
      {
        sourceSHA: matrix.sourceSHA,
        browser: browser.version(),
        realDeviceVerified: false,
        productionRequestsSent: false,
        checks,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
