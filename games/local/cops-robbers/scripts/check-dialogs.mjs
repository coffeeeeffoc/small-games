import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';

// Without BASE_URL, serve the actual game source on an ephemeral port for CI.
const server = process.env.BASE_URL ? null : createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!/^(index\.html|favicon\.svg|dev-mode\.js|src\/[a-z0-9-]+\.(js|css)|assets\/[a-z0-9-]+\.webp)$/.test(file)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.webp') ? 'image/webp' : 'text/html; charset=utf-8');
    response.end(await readFile(new URL(`../${file}`, import.meta.url)));
  } catch { response.writeHead(404).end(); }
});
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}`;
let browser;

const checks = [];
let loss;
for (const map of levels) {
  let state = initialState(map), path = [];
  for (let turn = 0; turn < 20; turn++) {
    path.push([...state.cops]); state = step(map, state, state.cops).state;
    if (state.robbers.includes(-2)) { loss = { id: map.id, path }; break; }
    if (state.robbers.every(node => node === -1)) break;
  }
  if (loss) break;
}
assert.ok(loss);
try {
  const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch(executablePath ? { executablePath } : { channel: process.env.BROWSER_CHANNEL || 'msedge' });
  await mkdir('outputs', { recursive: true });
  for (const [width, height, touch] of [[1440, 900, false], [390, 844, true], [320, 568, true], [844, 390, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const activate = locator => locator[touch ? 'tap' : 'click']();
    async function load(id) {
      await page.goto(`${base}/?level=${id}&motion=reduce`);
      await page.waitForFunction(id => document.body.dataset.level === String(id) && document.body.dataset.phase === 'planning', id);
    }
    async function cleanDialog(selector) {
      const dialog = page.locator(selector);
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-game-fullscreen]')).toHaveCount(0);
      assert.equal(await dialog.locator('button').evaluateAll(buttons => buttons.some(button => /^(×|✕|✖|✗|x)$/i.test(button.textContent.trim()))), false);
      checks.push({ width, height, touch, dialog: selector });
    }
    async function replay(id, path) {
      await load(id);
      let state = initialState(levels[id - 1]);
      for (const targets of path) {
        const cop = Math.max(0, targets.findIndex((node, i) => node !== state.cops[i]));
        await activate(page.locator(`#squad [data-cop="${cop}"]`));
        await activate(page.getByTestId(`node-${targets[cop]}`));
        state = step(levels[id - 1], state, targets).state;
        await page.waitForFunction(turn => Number(document.body.dataset.turn) === turn && ['planning','won','lost'].includes(document.body.dataset.phase), state.turn);
      }
    }
    await load(100);
    await expect(page.locator('#help')).not.toBeVisible();
    await expect(page.locator('#settings')).not.toBeVisible();
    await expect(page.locator('[data-game-fullscreen]')).not.toBeVisible();
    await activate(page.locator('#focus-toggle'));
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const [trigger, dialog, close] of [['#help','#help-dialog','明白，开始拦截！'], ['#settings','#settings-dialog','完成'], ['#home-start','#level-dialog','返回首页'], ['#share-challenge','#share-dialog','返回游戏']]) {
        await activate(page.locator(trigger));
        await cleanDialog(dialog);
        await activate(page.locator(dialog).getByRole('button', { name: close, exact: true }));
        await expect(page.locator(dialog)).not.toBeVisible();
        assert.equal(await page.locator('body').getAttribute('data-level'), '100');
      }
    }
    await activate(page.locator('#settings'));
    await page.locator('#help-dialog').evaluate(dialog => dialog.showModal());
    await cleanDialog('#help-dialog');
    await activate(page.locator('#help-dialog').getByRole('button', { name: '明白，开始拦截！' }));
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await activate(page.locator('#settings-dialog').getByRole('button', { name: '完成', exact: true }));
    for (let repeat = 0; repeat < 2; repeat++) {
      await activate(page.locator('#appearance-settings'));
      await cleanDialog('[data-role-appearance]');
      await activate(page.locator('[data-close-appearance]'));
      await expect(page.locator('[data-role-appearance]')).toHaveCount(0);
    }
    await activate(page.locator('[data-game-fullscreen]'));
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await activate(page.locator('#settings'));
    await cleanDialog('#settings-dialog');
    await page.screenshot({ path: `outputs/dialogs-${width}.png` });
    await activate(page.locator('#settings-dialog').getByRole('button', { name: '完成', exact: true }));
    await activate(page.locator('#resume-patrol'));
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.locator('[data-game-fullscreen]')).not.toBeVisible();
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), true, 'The patrol keeps the fullscreen selected from home');
    await activate(page.locator('#focus-toggle'));
    await activate(page.locator('[data-game-fullscreen]'));
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await replay(1, solutions[1]);
    await cleanDialog('#win-dialog');
    await activate(page.locator('#replay'));
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'planning');
    await replay(1, solutions[1]);
    await activate(page.locator('#win-dialog').getByRole('button', { name: '查看完成局面', exact: true }));
    await activate(page.locator('#undo'));
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'planning');
    await replay(loss.id, loss.path);
    await cleanDialog('#loss-dialog');
    await activate(page.locator('#undo-loss'));
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'planning');
    await replay(loss.id, loss.path);
    await activate(page.locator('#loss-dialog').getByRole('button', { name: '查看失守局面', exact: true }));
    await activate(page.locator('#restart'));
    await expect(page.locator('body')).toHaveAttribute('data-turn', '0');
    await activate(page.locator('#focus-toggle'));
    await expect(page.locator('.briefing')).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile('outputs/dialogs.json', JSON.stringify({ passed: true, physicalMobile: false, checks }, null, 2));
  console.log(`PASS ${checks.length} dialog checks across desktop, touch portrait/landscape, repeated and nested dialogs, results, resume and fullscreen`);
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
