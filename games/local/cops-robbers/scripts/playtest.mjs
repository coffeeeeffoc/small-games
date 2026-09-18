import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../outputs');
const base = (process.env.BASE_URL || 'http://127.0.0.1:43420').replace(/\/$/, '');
const report = { started: new Date().toISOString(), base, passed: false, checks: [], levels: [], errors: [] };
await mkdir(output, { recursive: true });
let browser;
function observe(page) {
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => report.errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`http ${response.status()}: ${response.url()}`); });
}
async function load(page, id, reduced = true) {
  await page.goto(`${base}/?level=${id}${reduced ? '&motion=reduce' : ''}`, { waitUntil: 'networkidle' });
  assert.match(await page.title(), /围捕小队/, '端口没有返回围捕小队');
  await page.getByTestId('board').waitFor({ state: 'visible' });
  await page.waitForFunction(id => document.body.dataset.level === String(id) && document.body.dataset.phase === 'planning', id);
  assert.equal(await page.getByTestId('execute').count(), 0, '点击即移动，页面不应保留行动确认按钮');
}
async function snapshot(page, id) {
  return page.evaluate(({ cops, robbers }) => ({
    cops: cops.map((_, i) => Number(document.getElementById(`cop-actor-${i}`).dataset.node)),
    robbers: robbers.map((_, i) => {
      const actor = document.getElementById(`robber-actor-${i}`);
      return actor ? Number(actor.dataset.node) : null;
    }),
    turn: Number(document.body.dataset.turn), phase: document.body.dataset.phase,
    remaining: Number(document.body.dataset.remaining), escaped: Number(document.body.dataset.escaped),
  }), levels[id - 1]);
}
async function move(page, id, state, targets, touch = false) {
  const changed = targets.flatMap((node, i) => node !== state.cops[i] ? [i] : []);
  assert.ok(changed.length <= 1, `关卡 ${id} 的每一步最多只能移动一名警察`);
  const cop = changed[0] ?? 0, expected = step(levels[id - 1], state, targets).state;
  await page.getByTestId(`cop-${cop}`)[touch ? 'tap' : 'click']();
  assert.equal((await snapshot(page, id)).turn, state.turn, '选中警察不能消耗回合');
  await page.getByTestId(`node-${targets[cop]}`)[touch ? 'tap' : 'click']();
  await page.waitForFunction(turn => ['planning', 'won', 'lost'].includes(document.body.dataset.phase)
    && Number(document.body.dataset.turn) === turn, expected.turn, { timeout: 12000 });
  const actual = await snapshot(page, id);
  assert.deepEqual(actual.cops, expected.cops, `第 ${id} 关警察位置`);
  assert.deepEqual(actual.robbers, expected.robbers.map(n => n >= 0 ? n : null), `第 ${id} 关小偷必须自动响应`);
  assert.equal(actual.remaining, expected.robbers.filter(n => n >= 0).length);
  assert.equal(actual.escaped, expected.robbers.filter(n => n === -2).length);
  return expected;
}
async function win(page, id, touch = false) {
  let state = initialState(levels[id - 1]);
  assert.ok(solutions[id]?.length, `关卡 ${id} 缺少解法`);
  for (const targets of solutions[id]) state = await move(page, id, state, targets, touch);
  const actual = await snapshot(page, id);
  assert.equal(actual.phase, 'won', `关卡 ${id} 未胜利`);
  assert.equal(actual.remaining, 0); assert.equal(actual.escaped, 0);
  await page.getByTestId('victory').waitFor({ state: 'visible' });
  return actual;
}
async function verifyLayout(page, width) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, page: document.documentElement.scrollWidth }));
  assert.ok(dimensions.body <= dimensions.viewport + 1 && dimensions.page <= dimensions.viewport + 1, `${width}px 横向溢出：${JSON.stringify(dimensions)}`);
  assert.equal(await page.getByTestId('execute').count(), 0);
  for (const id of ['board', 'undo', 'restart', 'hint', 'level-select', 'sound']) {
    const element = page.getByTestId(id), rect = await element.boundingBox(), height = page.viewportSize().height;
    assert.equal(await element.isVisible(), true, `${width}px ${id} 不可见`);
    assert.ok(rect && rect.x >= -1 && rect.x + rect.width <= width + 1 && rect.y >= -1 && rect.y + rect.height <= height + 1,
      `${width}px ${id} 不在首屏内：${JSON.stringify(rect)}`);
  }
}

try {
  const home = await fetch(base), module = await fetch(`${base}/src/engine.js`);
  assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/);
  assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /(?:text|application)\/javascript/);
  for (const path of ['/package.json', '/scripts/serve.mjs', '/node_modules/@playwright/test/package.json', '/docs/plans/2026-09-12-cops-robbers-design.md', '/src/%2e%2e%2fpackage.json']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, `${path} 不应被静态服务公开`);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  report.checks.push('静态服务 HTML/JS MIME、私有路径和越界请求隔离');
  let launchError;
  for (const channel of process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); report.channel = channel; break; }
    catch (error) { launchError = error; }
  }
  if (!browser) throw launchError;
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } }), page = await desktop.newPage();
  observe(page);
  await load(page, 1, false); await win(page, 1);
  assert.ok(await page.evaluate(() => localStorage.getItem('cops-robbers-v3')), '胜利后应保存新版本地记录');
  await page.getByTestId('next-level').click();
  await page.waitForFunction(() => document.body.dataset.level === '2' && document.body.dataset.phase === 'planning');
  report.checks.push('首关正常动画、点击立即行动、小偷自动响应、胜利和下一关');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('level-select').click();
  const tabs = page.locator('#chapter-tabs button'), reachable = new Set();
  assert.equal(await tabs.count(), 5);
  for (let chapter = 0; chapter < 5; chapter++) {
    await tabs.nth(chapter).click();
    for (const button of await page.locator('#level-dialog [data-testid^="level-button-"]:visible').all()) {
      assert.equal(await button.isEnabled(), true); reachable.add(await button.getAttribute('data-testid'));
    }
  }
  assert.equal(reachable.size, 60);
  await tabs.nth(0).click();
  assert.equal(await page.getByTestId('level-button-1').getAttribute('data-completed'), 'true');
  await page.getByTestId('level-button-2').click();
  report.checks.push('全部 60 关可选，刷新后新版胜利记录保留');

  const initial = await snapshot(page, 2);
  await move(page, 2, initialState(levels[1]), solutions[2][0]);
  await page.getByTestId('undo').click();
  assert.deepEqual(await snapshot(page, 2), initial, '撤销一步应恢复双方位置与回合');
  await move(page, 2, initialState(levels[1]), solutions[2][0]);
  await page.getByTestId('restart').click();
  assert.deepEqual(await snapshot(page, 2), initial, '重开应恢复初始局面');
  await page.getByTestId('hint').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="hint"]').disabled, null, { timeout: 13000 });
  assert.deepEqual(await snapshot(page, 2), initial, '提示不能自动执行');
  assert.equal(await page.locator('.hint-circle').count(), 1);
  const hintedCop = Math.max(0, solutions[2][0].findIndex((node, i) => node !== levels[1].cops[i]));
  await page.getByTestId(`node-${solutions[2][0][hintedCop]}`).click();
  await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
  assert.deepEqual((await snapshot(page, 2)).cops, solutions[2][0]);
  await page.getByTestId('restart').click();
  const sound = page.getByTestId('sound'), beforeSound = await sound.getAttribute('aria-pressed');
  await sound.click(); assert.notEqual(await sound.getAttribute('aria-pressed'), beforeSound);
  await sound.click(); assert.equal(await sound.getAttribute('aria-pressed'), beforeSound);
  report.checks.push('撤销整步、重开、提示不走棋且高亮不挡点击、音效开关');

  await load(page, 28);
  await page.getByTestId('cop-0').click();
  await page.screenshot({ path: resolve(output, 'escape-desktop.png'), fullPage: true });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const phone = await mobile.newPage(); observe(phone);
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await phone.setViewportSize(size); await load(phone, 1); await verifyLayout(phone, size.width); await win(phone, 1, true);
    await phone.getByTestId('next-level').tap(); await verifyLayout(phone, size.width);
    await load(phone, 60); await verifyLayout(phone, size.width); await win(phone, 60, true);
    report.checks.push(`${size.width}×${size.height} 首屏按钮、无行动确认、无横向溢出、首关及密集末关触屏点击通关`);
  }
  await phone.setViewportSize({ width: 390, height: 844 }); await load(phone, 28); await verifyLayout(phone, 390);
  await phone.screenshot({ path: resolve(output, 'escape-mobile.png'), fullPage: true });
  const ids = process.env.LEVEL_IDS ? process.env.LEVEL_IDS.split(',').map(Number) : levels.map(level => level.id);
  for (const id of ids) {
    assert.ok(levels[id - 1].exits.length > 0, `第 ${id} 关必须有真正的逃生出口`);
    await load(page, id); const state = await win(page, id);
    report.levels.push({ id, turns: state.turn, exits: levels[id - 1].exits.length, passed: true });
    console.log(`关卡 ${id}/60：${state.turn} 步，浏览器点击通关`);
  }
  report.checks.push(`真实点击按记录解法通关 ${ids.length} 关，所有警察和小偷位置逐步匹配规则引擎`);
  assert.deepEqual(report.errors, [], '浏览器不应有脚本、控制台或资源错误');
  report.passed = true;
  console.log('新版浏览器检查全部通过。');
} catch (error) {
  report.failure = error.stack || String(error);
  const failedPage = browser?.contexts().at(-1)?.pages().at(-1);
  if (failedPage) await failedPage.screenshot({ path: resolve(output, 'escape-failure.png'), fullPage: true }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(resolve(output, process.env.LEVEL_IDS ? 'escape-smoke.json' : 'escape-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
}
