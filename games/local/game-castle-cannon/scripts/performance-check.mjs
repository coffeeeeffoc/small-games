/* global document */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://local').pathname;
    res.setHeader(
      'Content-Type',
      p.endsWith('.js')
        ? 'text/javascript'
        : p.endsWith('.css')
          ? 'text/css'
          : p.endsWith('.jpg')
            ? 'image/jpeg'
            : p.endsWith('.wav')
              ? 'audio/wav'
              : 'text/html',
    );
    res.end(await readFile(path.join(root, 'dist', p === '/' ? 'index.html' : p)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
const records = [],
  errors = [];
try {
  for (const cacheWorld of [false, true]) {
    for (const lowPower of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error' && /THREE|shader|WebGL/.test(message.text()))
          errors.push(message.text());
      });
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?dev=1${cacheWorld ? '' : '&renderProbe=uncached'}`,
      );
      await expect(page.locator('.castle-root')).toHaveAttribute('data-ready', 'true');
      if (lowPower) {
        await page.locator('[data-action="settings"]').click();
        await page.locator('[data-action="quality"]').click();
        await page.locator('[data-action="home"]').click();
      }
      await page.locator('[data-action="start"]').click();
      const sample = () =>
        page.evaluate(() => ({
          renderer: JSON.parse(document.querySelector('#battle').dataset.renderer),
          status: document.querySelector('#battle').getAttribute('aria-label'),
        }));
      const driver = await page.evaluate(() => {
        const gl = Array.from(document.querySelectorAll('canvas'))
          .map((canvas) => canvas.getContext('webgl2'))
          .find(Boolean);
        if (!gl) return null;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: info
            ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
          timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
        };
      });
      const first = await sample(),
        started = Date.now(),
        latencies = [];
      let last = first;
      while (Date.now() - started < 15000) {
        const before = Date.now();
        last = await sample();
        latencies.push(Date.now() - before);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const seconds = (Date.now() - started) / 1000;
      latencies.sort((a, b) => a - b);
      records.push({
        cacheWorld,
        driver,
        viewport: [960, 540],
        renderSize: lowPower ? [384, 216] : [768, 432],
        shadows: lowPower ? false : { size: 1024, type: 'PCFSoftShadowMap' },
        sourceScene:
          'Identical model, camera, lighting, material, troop instancing and quality setting; only real static-world color/depth cache is toggled',
        lowPower,
        wallSeconds: seconds,
        submittedFrames: last.renderer.submittedFrames - first.renderer.submittedFrames,
        measuredFps: (last.renderer.submittedFrames - first.renderer.submittedFrames) / seconds,
        pageEvaluationP95Ms: latencies[Math.floor(latencies.length * 0.95)],
        initial: first,
        final: last,
        scope:
          'Headless Chromium software WebGL in Linux cloud; wall clock only, no Playwright Clock; not mobile hardware FPS',
      });
      console.log('Measured', lowPower ? 'battery' : 'normal', JSON.stringify(records.at(-1)));
      await page.close();
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    path.join(root, 'docs/design/immersive/performance-evidence.json'),
    JSON.stringify({ records, errors }, null, 2) + '\n',
  );
} finally {
  await browser.close();
  server.close();
}
