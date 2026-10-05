import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

export const reportsURL = new URL('../reports/', import.meta.url);
export const mobileOptions = {
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
};
export function gameURL(value = process.env.KART_URL || 'http://127.0.0.1:4198/') {
  const url = new URL(value);
  if (!url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) url.pathname += '/';
  return url.href;
}
export async function verifyBuild(url) {
  const response = await fetch(new URL('build-info.json', gameURL(url)), { cache: 'no-store' });
  assert.ok(response.ok, `build-info.json: HTTP ${response.status}`);
  const build = await response.json();
  assert.equal(build.creator, '3.8.8');
  assert.equal(build.sourceHash, await sourceHash(), 'browser checks require the current real Creator build');
  await mkdir(reportsURL, { recursive: true });
  return build;
}
export async function startBrowser(url, { args = [] } = {}) {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || [
    '/usr/bin/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  const hostname = new URL(url).hostname;
  const remote = !['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const proxy = process.env.PLAYWRIGHT_PROXY_SERVER || (remote && process.env.HTTPS_PROXY);
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...(proxy ? { proxy: { server: proxy } } : {}),
    args: [...(process.platform === 'linux' ? ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), ...args],
  });
}
export async function waitForReady(page) {
  await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading &&
    __kart.snapshot().modelsLoaded && __kart.snapshot().sceneryLoaded, null, { timeout: 120000 });
  await page.locator('#kart-loading').waitFor({ state: 'detached', timeout: 120000 });
}

// Coordinates are 960 x 540 design-space pixels, measured from the top left.
// Invert Creator's actual UI viewport and canvas transformation instead of
// assuming a viewport aspect ratio or treating a rotated bounding box as upright.
export async function designPoint(page, x, y) {
  return page.evaluate(async ({ x, y }) => {
    const cc = await System.import('cc');
    const canvas = document.getElementById('GameCanvas');
    const frame = document.getElementById('GameDiv');
    const bounds = canvas.getBoundingClientRect();
    const transform = new DOMMatrix(getComputedStyle(frame).transform);
    const rotated = transform.b > 0.5 && Math.abs(transform.a) < 0.01;
    const visible = cc.view.getVisibleSize();
    const viewport = cc.view.getViewportRect();
    const u = (viewport.x + (x / 960) * visible.width * cc.view.getScaleX()) / canvas.width;
    const v = 1 - (viewport.y + (1 - y / 540) * visible.height * cc.view.getScaleY()) / canvas.height;
    return rotated
      ? { x: bounds.right - v * bounds.width, y: bounds.top + u * bounds.height }
      : { x: bounds.left + u * bounds.width, y: bounds.top + v * bounds.height };
  }, { x, y });
}
export async function tapDesign(page, x, y) {
  const point = await designPoint(page, x, y);
  await page.touchscreen.tap(point.x, point.y);
}
export async function tapHome(page, label, index = 0) {
  const buttons = await page.evaluate(() => __kart.snapshot().home.buttons);
  const button = buttons.filter(button => button.label.startsWith(label))[index];
  assert.ok(button?.enabled, `home button ${label} must be available`);
  const point = await designPoint(page, button.x + 480, 270 - button.y);
  try { await page.touchscreen.tap(point.x, point.y); }
  catch (error) {
    if (!String(error).includes('hasTouch')) throw error;
    await page.mouse.click(point.x, point.y);
  }
}
export async function prepareRace(page) {
  await waitForReady(page);
  const state = await page.evaluate(() => __kart.snapshot());
  if (!state.home.visible) return;
  if (state.home.page !== 'setup') {
    if (state.home.page !== 'home') await tapHome(page, '主页');
    await tapHome(page, '选择比赛');
  }
  await tapHome(page, '进入赛道');
  await page.waitForFunction(() => !__kart.snapshot().home.visible && __kart.snapshot().staged);
  await waitForReady(page);
}
export async function startRace(page, touch = true) {
  await prepareRace(page);
  if (touch) await tapDesign(page, 198, 433);
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
}
export async function displayGeometry(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const canvas = document.getElementById('GameCanvas');
    const frame = document.getElementById('GameDiv');
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const matrix = new DOMMatrix(getComputedStyle(frame).transform);
    const visible = cc.view.getVisibleSize();
    return { visible: { width: visible.width, height: visible.height },
      frame: box(frame), canvas: box(canvas), rotated: matrix.b > 0.5 && Math.abs(matrix.a) < 0.01,
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth };
  });
}
