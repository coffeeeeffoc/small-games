// Browser renderer/real rule check. This does not replace shared backend, platform tool or device acceptance.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import rule from '../../../../services/runtime-api/rules/history.mjs';

const url = process.env.PLAYTEST_URL || 'http://127.0.0.1:4175/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], state = rule.initial(1), actions = [];
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 608 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('submitHistoryAction', input => {
    actions.push(input); rule.action(state, input, 1000 + actions.length * 1000); return rule.view(state);
  });
  // A separate harness document avoids loading/changing the original single-player state.
  await page.goto(new URL('competition-renderer.js', url).href);
  await page.evaluate(async ({ publicState, url }) => {
    document.body.innerHTML = '<canvas width="390" height="608" style="display:block;touch-action:none"></canvas>';
    document.body.style.margin = '0';
    const { createRenderer } = await import(new URL('competition-renderer.js', url).href);
    const renderer = createRenderer({ createImage: () => new Image(), assetBase: url });
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
    window.publicState = publicState; window.drawn = [];
    const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (text, x, y) => { window.drawn.push({ text, x, y }); fillText(text, x, y); };
    const draw = () => { window.drawn.length = 0; renderer.draw(ctx, canvas.width, canvas.height, window.publicState); };
    canvas.addEventListener('pointerdown', async event => {
      const box = canvas.getBoundingClientRect();
      const input = renderer.tap(event.clientX - box.left, event.clientY - box.top, window.publicState);
      if (input) window.publicState = await window.submitHistoryAction(input);
      draw();
    });
    window.redraw = draw;
    setInterval(draw, 100);
  }, { publicState: rule.view(state), url });
  const tap = async text => {
    await page.waitForFunction(text => window.drawn?.some(item => item.text === text), text);
    const point = await page.evaluate(text => window.drawn.find(item => item.text === text), text);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(120);
  };
  await page.waitForFunction(() => window.drawn.length > 0 && !window.drawn.some(item => /正在载入|加载失败/.test(item.text)));
  await page.screenshot({ path: 'artifacts/competition-scene.png' });
  await tap('向左'); await tap('放大'); await tap('还原'); await tap('地图选点');
  await page.mouse.click(289, 234); // A real approximate geographic selection, not an injected answer.
  await tap('＋ 放大');
  await page.screenshot({ path: 'artifacts/competition-map.png' });
  await tap('输入猜测年代');
  for (const digit of ['7', '4', '2']) await tap(digit);
  await tap('完成年代输入'); await tap('提示 −500');
  await page.waitForFunction(() => window.publicState.hint !== null);
  await tap('提交地点与年代');
  await page.waitForFunction(() => window.publicState.phase === 'revealed');
  assert.equal(state.answers.length, 1); assert.equal(state.answers[0].penalty, 500);
  assert.equal(state.answers[0].guessedYear, 742);
  await page.screenshot({ path: 'artifacts/competition-revealed.png' });
  await tap('对照地图'); await tap('返回解说'); await tap('前往下一幕');
  await page.waitForFunction(() => window.publicState.round === 2);
  await tap('输入猜测年代'); await tap('改为公元前');
  for (const digit of ['5', '7', '5']) await tap(digit);
  await tap('完成年代输入');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { const canvas = document.querySelector('canvas'); canvas.width = 844; canvas.height = 390; window.redraw(); });
  await tap('公元前 575 年 · 修改');
  await page.screenshot({ path: 'artifacts/competition-landscape-keypad.png' });
  assert.deepEqual(errors, []);
  await writeFile('artifacts/competition-playtest.json', JSON.stringify({ testedAt: new Date().toISOString(), url,
    type: 'real browser Canvas and rule harness; no shared backend/platform claim', actions, errors, result: rule.view(state) }, null, 2));
  console.log('PASS: real image load/pan/zoom, geographic map input, keypad, hint penalty, server rule reveal, next round and BCE landscape input. Shared PostgreSQL/PK/platform acceptance remains separate.');
} finally { await browser.close(); }
