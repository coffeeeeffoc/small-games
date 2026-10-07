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
    if (p === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
const metrics = [];
const prefix = process.env.SIEGE_CAPTURE_PREFIX ?? '';
const names = process.env.SIEGE_CAPTURE_NAMES
  ? process.env.SIEGE_CAPTURE_NAMES.split(',')
  : process.env.SIEGE_CAPTURE_PAIR
    ? ['actual-composition', 'actual-battle']
    : [
        'actual-composition',
        'actual-battle',
        'actual-solid-impact',
        'actual-blast-impact',
        'actual-tower-collapse',
        'actual-solid-result',
        'actual-blast-result',
        'actual-tower-result',
      ];
try {
  for (const name of names) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.error(message.text());
        errors.push(message.text());
      }
    });
    // Only artifact inspection controls time. This runs real rule timers without changing battle state.
    // Browser compositor and native input stay available; full gameplay checks use real time.
    const epoch = new Date('2026-10-06T08:00:00Z');
    await page.clock.install({ time: epoch });
    await page.clock.pauseAt(new Date(epoch.valueOf() + 1000));
    await page.goto(`http://127.0.0.1:${server.address().port}/?dev=0`);
    await expect
      .poll(() => page.evaluate(() => document.querySelector('.castle-root')?.dataset.ready), {
        timeout: 30000,
      })
      .toBe('true');
    const cdp = await page.context().newCDPSession(page);
    const advance = async (milliseconds) => {
      // Each chunk remains below the game's one-second resume clamp; real rule substeps run.
      while (milliseconds > 0) {
        const chunk = Math.min(250, milliseconds);
        await page.clock.fastForward(chunk);
        milliseconds -= chunk;
      }
    };
    const attr = (key) =>
      page.evaluate((k) => document.querySelector('#battle').getAttribute(k), key);
    const action = async (id) => {
      const p = await page.evaluate((action) => {
        const r = document.querySelector(`[data-action="${action}"]`).getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, id);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...p,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...p,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
    };
    await action('start');
    if (!(await attr('data-renderer')).includes('three-webgl2'))
      throw new Error('WebGL renderer unavailable');
    let lastPoint,
      actionSubmission = 0;
    const aim = async (x, y) => {
      actionSubmission = JSON.parse(await attr('data-renderer')).submittedFrames;
      const p = JSON.parse(await attr('data-targets')).find((m) => m.ruleX === x && m.ruleY === y);
      if (!p) throw new Error('Target not published');
      lastPoint = { x: p.x, y: p.y };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 270, y: 325 });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: 270,
        y: 325,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        ...lastPoint,
        button: 'left',
        buttons: 1,
      });
    };
    const release = () =>
      cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...lastPoint,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
    const shot = async (x, y) => {
      await aim(x, y);
      await release();
    };
    const hp = (x, value) =>
      expect
        .poll(async () => JSON.parse(await attr('data-targets')).find((m) => m.ruleX === x).hp)
        .toBe(value);
    if (
      [
        'actual-composition',
        'actual-battle',
        'actual-solid-impact',
        'actual-solid-result',
      ].includes(name)
    ) {
      await shot(590, 280);
      await advance(450);
      await hp(590, 0);
      if (name !== 'actual-solid-impact' && name !== 'actual-solid-result') {
        await advance(2550);
        if (name === 'actual-battle') await action('blast');
        await aim(680, 160);
        if (name === 'actual-battle') {
          await release();
          await advance(450);
          await hp(680, 1);
        }
      }
    } else {
      await action('blast');
      await shot(680, 160);
      await advance(450);
      await hp(680, 1);
      if (name === 'actual-tower-collapse' || name === 'actual-tower-result') {
        await advance(2550);
        await action('solid');
        await shot(680, 160);
        await advance(450);
        await hp(680, 0);
      }
    }
    if (name.endsWith('-result')) await advance(1550);
    // Give the real GPU time to finish, then draw one current simulated frame.
    const minimum = name.endsWith('-result')
      ? name === 'actual-tower-result'
        ? 4.9
        : 1.9
      : name === 'actual-composition'
        ? 3.0
        : name === 'actual-battle' || name === 'actual-tower-collapse'
          ? 3.4
          : 0.4;
    for (let attempt = 0; attempt < 80; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 75));
      await advance(33);
      const frame = JSON.parse(await attr('data-renderer'));
      if (frame.frameBattleTime >= minimum && frame.submittedFrames >= actionSubmission + 4) break;
    }
    metrics.push({
      name,
      snapshotClock:
        'Playwright controlled timers in <=250ms chunks; genuine CDP mouse; actual rule substeps, no battle state edits',
      metrics: JSON.parse(await attr('data-renderer')),
      status: await attr('aria-label'),
    });
    if (errors.length) throw new Error(`Runtime errors during capture: ${errors.join('\n')}`);
    const png = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      path.join(root, 'docs/design/immersive', prefix + name + '.png'),
      Buffer.from(png.data, 'base64'),
    );
    const detail = prefix
      ? []
      : name === 'actual-composition'
        ? [
            ['actual-gate-detail', 570, 130, 330, 400],
            ['actual-keep-detail', 250, 0, 580, 265],
          ]
        : name === 'actual-blast-result'
          ? [['actual-blast-detail', 395, 35, 220, 225]]
          : name === 'actual-tower-result'
            ? [['actual-rubble-detail', 290, 115, 360, 405]]
            : [];
    for (const [label, x, y, width, height] of detail) {
      const cropped = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip: { x, y, width, height, scale: 1 },
      });
      await writeFile(
        path.join(root, 'docs/design/immersive', label + '.png'),
        Buffer.from(cropped.data, 'base64'),
      );
    }
    console.log(`Captured ${name}`);
    await page.close();
  }
  await writeFile(
    path.join(root, 'docs/design/immersive', prefix + 'render-evidence.json'),
    JSON.stringify(metrics, null, 2) + '\n',
  );
} finally {
  await browser.close();
  server.close();
}
