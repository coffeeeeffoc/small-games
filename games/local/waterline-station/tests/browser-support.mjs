import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
export async function fixture() {
  const root = new URL('../dist/', import.meta.url);
  const server = http.createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://localhost').pathname;
      const file = new URL('.' + (p === '/' ? '/index.html' : p), root);
      if (!file.href.startsWith(root.href)) return res.writeHead(403).end();
      const data = await readFile(file);
      res
        .writeHead(200, {
          'Content-Type': /\.m?js$/.test(p)
            ? 'text/javascript'
            : p.endsWith('.css')
              ? 'text/css'
              : p.endsWith('.wav')
                ? 'audio/wav'
                : p.endsWith('.svg')
                  ? 'image/svg+xml'
                  : p.endsWith('.json')
                    ? 'application/json'
                    : 'text/html',
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE ||
    process.env.CHROMIUM_PATH ||
    process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath:
            process.env.BROWSER_EXECUTABLE ||
            process.env.CHROMIUM_PATH ||
            process.env.PLAYWRIGHT_EXECUTABLE_PATH,
        }
      : { channel: 'chromium' }),
    headless: true,
    args: ['--no-sandbox'],
  });
  return {
    browser,
    base: `http://127.0.0.1:${server.address().port}/`,
    close: async () => {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}
export const snap = (page) => page.evaluate(() => window.__waterlineSnapshot());
export async function ready(page) {
  await page.waitForFunction(() => window.__waterlineSnapshot?.().ready);
}
export async function tap(page, id) {
  const el = page.locator(id.startsWith('#') ? id : '#' + id);
  const b = await el.boundingBox();
  if (!b) throw new Error('Missing control ' + id);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
export async function settled(page) {
  await page.waitForFunction(() => !window.__waterlineSnapshot?.().animating);
  return snap(page);
}
export async function cancelTouch(page, id) {
  const b = await page.locator('#' + id).boundingBox(),
    cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
}
export const stable = (s) =>
  Object.fromEntries(
    ['volumes', 'gates', 'latched', 'wheelPower', 'moves', 'won', 'lost', 'bonusMoves'].map((k) => [
      k,
      s[k],
    ]),
  );

export async function moveDevButton(page) {
  const b = await page.locator('small-games-devtools [data-toggle]').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: b.x + 24, y: b.y + 22 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: b.x + 24, y: page.viewportSize().height - 26 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
