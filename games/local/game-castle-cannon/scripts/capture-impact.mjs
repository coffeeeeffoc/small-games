/* global document */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, process.env.SIEGE_CAPTURE_DIR ?? 'docs/design/immersive');
const prefix = process.env.SIEGE_CAPTURE_PREFIX ?? 'approach';
const artView = process.env.SIEGE_ART_VIEW;
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname;
    if (name === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    res.setHeader(
      'Content-Type',
      name.endsWith('.js')
        ? 'text/javascript'
        : name.endsWith('.css')
          ? 'text/css'
          : name.endsWith('.jpg')
            ? 'image/jpeg'
            : name.endsWith('.wav')
              ? 'audio/wav'
              : 'text/html',
    );
    res.end(await readFile(path.join(root, 'dist', name === '/' ? 'index.html' : name)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const epoch = new Date('2026-10-06T08:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(new Date(epoch.valueOf() + 1000));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/?${artView ? `dev=1&artView=${encodeURIComponent(artView)}` : 'dev=0'}`,
  );
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.castle-root')?.dataset.ready), {
      timeout: 30000,
    })
    .toBe('true');
  const cdp = await page.context().newCDPSession(page);
  const attr = (key) =>
    page.evaluate((k) => document.querySelector('#battle').getAttribute(k), key);
  const frame = async () => JSON.parse(await attr('data-renderer'));
  const advance = async (milliseconds) => {
    while (milliseconds > 0) {
      const step = Math.min(250, milliseconds);
      await page.clock.fastForward(step);
      milliseconds -= step;
    }
  };
  const click = async (selector) => {
    const point = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  };
  const shoot = async (ruleX) => {
    const target = JSON.parse(await attr('data-targets')).find((t) => t.ruleX === ruleX);
    assert(target);
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
      x: target.x,
      y: target.y,
      button: 'left',
      buttons: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: target.x,
      y: target.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  };
  const freezeAndDrain = async () => {
    const time = await page.evaluate(() => Date.now());
    await page.clock.setFixedTime(new Date(time));
    const before = (await frame()).submittedFrames;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Only scheduling advances. Fixed Date keeps the actual battle and shot age frozen.
      await page.clock.fastForward(33);
      if ((await frame()).submittedFrames >= before + 3) break;
    }
    assert((await frame()).submittedFrames >= before + 3, 'GPU never submitted the frozen state');
    return time;
  };
  const save = async (name) => {
    const image = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(path.join(output, name + '.png'), Buffer.from(image.data, 'base64'));
    return { name, renderer: await frame(), targets: JSON.parse(await attr('data-targets')) };
  };
  await click('[data-action="start"]');
  await freezeAndDrain();
  const initial = await save(`${prefix}-initial`);
  if (!artView) {
    await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now())));
    await shoot(590);
    await advance(3000);
    const gate = JSON.parse(await attr('data-targets')).find((t) => t.ruleX === 590);
    assert.equal(gate.hp, 0);
    // Drain the gate's changed architecture before firing the single, recorded upper-tower event.
    const readyTime = await freezeAndDrain();
    const breached = await save(`${prefix}-breached`);
    await page.clock.setSystemTime(new Date(readyTime));
    await click('[data-action="blast"]');
    const firedAt = (await frame()).frameBattleTime;
    await shoot(680);
    await advance(480);
    const peakTime = await freezeAndDrain();
    const peak = await save(`${prefix}-impact-peak`);
    assert.equal(peak.renderer.impact.ammo, 'blast');
    assert.equal(peak.renderer.impact.x, 680);
    assert(
      peak.renderer.impact.age >= 0.07 && peak.renderer.impact.age <= 0.14,
      `Wrong peak age: ${peak.renderer.impact.age}`,
    );
    assert.equal(peak.renderer.impact.core, true);
    assert.equal(peak.renderer.impact.flyingStone, 18);
    assert.equal(peak.targets.find((t) => t.ruleX === 680).hp, 1);
    await page.clock.setSystemTime(new Date(peakTime));
    await advance(1300);
    await freezeAndDrain();
    const end = await save(`${prefix}-impact-end`);
    assert.equal(end.renderer.impact.core, false);
    assert.equal(end.renderer.impact.halo, false);
    assert.equal(end.renderer.impact.flyingStone, 0);
    assert.equal(end.renderer.impact.smoke, 0);
    assert.equal(end.targets.find((t) => t.ruleX === 680).hp, 1);
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(output, `${prefix}-impact-evidence.json`),
      JSON.stringify(
        {
          shot: { ammo: 'blast', ruleX: 680, ruleY: 160, firedAt },
          clock:
            'Artifact-only Playwright Clock; fixed Date freezes rule time while real GPU drains. Native CDP mouse, no state edits. Not a performance benchmark.',
          sameCamera: true,
          initial,
          breached,
          peak,
          end,
          errors,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'Same real shot: fixed-age impact peak and effect end with persistent breach verified.',
    );
  } else {
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(output, `${prefix}-evidence.json`),
      JSON.stringify({ artView, initial, errors }, null, 2) + '\n',
    );
  }
} finally {
  await browser.close();
  server.close();
}
