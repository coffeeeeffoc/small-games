import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGame, act, getRoom, getIntent, getOptions } from '../engine.mjs';

// Start the standalone server first. This script only drives public browser controls.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const output = new URL('./screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { url, date: new Date().toISOString(), cases: [], screenshots: [], errors: [], status: 'running' };
let browser;
const pauseBetweenActions = 220;

function monitor(page, label) {
  page.on('pageerror', error => report.errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(`${label}: ${message.text()}`); });
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) report.errors.push(`${label}: HTTP ${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) report.errors.push(`${label}: ${request.failure()?.errorText} ${request.url()}`); });
}
async function screenshot(page, name, fullPage = true) {
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage, animations: 'disabled' });
  report.screenshots.push(`screenshots/${name}`);
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The mobile page must not overflow horizontally.');
}
async function makeRunner(context, label, mobile = false) {
  const page = await context.newPage();
  monitor(page, label);
  await page.goto(url, { waitUntil: 'networkidle' });
  let state = createGame();
  const click = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
  async function verify() {
    assert.equal(await page.locator('#game-root').getAttribute('data-ink'), String(state.ink));
    assert.equal(await page.locator('#game-root').getAttribute('data-status'), state.status);
    assert.equal(await page.locator('#location-name').textContent(), getRoom(state).name);
    assert.equal(await page.locator('#hearts').getAttribute('aria-label'), `生命 ${state.hp} / ${state.maxHp}`);
    assert.equal(await page.locator('#seal-value').textContent(), String(state.seals));
    assert.match(await page.locator('#turn-label').textContent(), new RegExp(`第 ${String(state.turn).padStart(2, '0')} 笔`));
    if (getRoom(state).enemy?.hp > 0 && state.status === 'playing') {
      assert.equal(await page.locator('.enemy-hp b').textContent(), `${getRoom(state).enemy.hp} / ${getRoom(state).enemy.maxHp}`);
      assert.ok((await page.locator('.enemy-intent').textContent()).includes(getIntent(state).name));
    }
    if (mobile) await noOverflow(page);
  }
  async function command(type, target, key) {
    const result = act(state, { type, ...(target ? { target } : {}) });
    assert.ok(result.ok, `${label}: ${type} ${target || ''}: ${result.message}`);
    if (key) await page.keyboard.press(key);
    else if (['draw', 'trace', 'move'].includes(type)) {
      await click(`[data-room="${target}"]`);
      await click(`[data-action="${type}"][data-target="${target}"]`);
    } else if (type === 'heal' && !getRoom(state).enemy?.hp) await click('[data-card="heal"]');
    else await click(`[data-action="${type}"]${target ? `[data-target="${target}"]` : ''}`);
    state = result.state;
    await page.waitForTimeout(pauseBetweenActions);
    await verify();
  }
  async function travel(target, method = 'draw') { await command(state.rooms[target].revealed ? 'move' : method, target); }
  async function drag(target, cancel = false) {
    const type = state.rooms[target].revealed ? 'move' : 'draw';
    const result = act(state, { type, target });
    assert.ok(result.ok);
    await page.locator('.map-viewport').scrollIntoViewIfNeeded();
    const from = await page.locator(`[data-room="${state.roomId}"]`).boundingBox();
    const to = await page.locator(`[data-room="${target}"]`).boundingBox();
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    if (mobile) {
      const touch = await context.newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, radiusX: 4, radiusY: 4, force: 1 }] });
        for (let i = 1; i <= 12; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 12, y: start.y + (end.y - start.y) * i / 12, radiusX: 4, radiusY: 4, force: 1 }] });
        await touch.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      } finally { await touch.detach(); }
    } else {
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
    }
    if (!cancel) state = result.state;
    await page.waitForTimeout(pauseBetweenActions);
    await verify();
    assert.equal(await page.locator('#brush-trail').getAttribute('points'), '', 'The temporary brush trail must be removed.');
  }

  async function fight(keyboard = false) {
    let budget = 100;
    while (state.status === 'playing' && getRoom(state).enemy?.hp > 0) {
      assert.ok(budget-- > 0);
      const enemy = getRoom(state).enemy, attack = getOptions(state).find(option => option.type === 'attack');
      const attackDamage = state.contracts.includes('fine-nib') ? 6 : 4;
      let type = attack.enabled && (enemy.hp > 1 + state.focus || enemy.hp <= attackDamage) ? 'attack' : 'dry';
      if (getIntent(state).damage > 0 && enemy.hp > (type === 'attack' ? attackDamage : 1 + state.focus)) type = 'guard';
      await command(type, undefined, keyboard ? { attack: '2', dry: 'a', guard: 'd' }[type] : undefined);
    }
    assert.notEqual(state.status, 'lost');
  }
  async function start() { await click('#start-game'); await verify(); }
  async function resetFromResult() {
    await click('#result-restart'); state = createGame(); await verify();
    assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false);
  }
  return { page, click, verify, command, travel, drag, fight, start, resetFromResult, get state() { return state; } };
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 1000 }, deviceScaleFactor: 1 });
  const d = await makeRunner(desktop, 'desktop');
  await screenshot(d.page, 'desktop-opening.png');
  // Check the actual pause artwork, including its equal parallel solid bars.
  const bars = await d.page.locator('#pause svg rect').evaluateAll(nodes => nodes.map(node => ({ x: node.getAttribute('x'), y: node.getAttribute('y'), width: node.getAttribute('width'), height: node.getAttribute('height') })));
  assert.equal(bars.length, 2); assert.equal(bars[0].width, bars[1].width); assert.equal(bars[0].height, bars[1].height); assert.equal(bars[0].y, bars[1].y);
  assert.ok(Number(bars[1].x) > Number(bars[0].x) + Number(bars[0].width));
  await d.start();
  // 1 triggers the preselected first route using a real keyboard event.
  await d.command('draw', 'crossing', '1');
  await d.travel('sentinel');
  await screenshot(d.page, 'desktop-combat.png');
  const beforeModal = await d.page.locator('#game-root').getAttribute('data-ink');
  await d.page.keyboard.press('Escape');
  assert.equal(await d.page.locator('#modal').evaluate(dialog => dialog.open), true);
  for (const key of ['2', 'a', 'd', '3']) await d.page.keyboard.press(key);
  assert.equal(await d.page.locator('#game-root').getAttribute('data-ink'), beforeModal);
  await d.verify();
  await d.page.keyboard.press('Escape');
  await d.click('#help');
  await d.page.keyboard.press('2'); await d.page.keyboard.press('a'); await d.verify();
  await d.click('[data-close]');
  await d.fight(true); await d.command('claim');
  await d.travel('causeway'); await d.travel('warden'); await d.fight(true); await d.command('claim');
  await d.travel('threshold');
  await d.click('[data-room="gate"]'); assert.equal(await d.page.locator('#primary-action').isDisabled(), true);
  await d.click('[data-room="threshold"]'); assert.equal(await d.page.locator('[data-action="unlock"]').isEnabled(), true);
  await d.command('unlock'); await d.travel('gate'); await d.fight(true);
  assert.equal(d.state.status, 'won'); assert.match(await d.page.locator('#modal-title').textContent(), /下一页/);
  assert.equal(await d.page.locator('.result-stats strong').nth(1).textContent(), '7/13');
  assert.equal(await d.page.evaluate(() => localStorage.getItem('ink-is-everything:chapter:v1')), null);
  await screenshot(d.page, 'desktop-victory.png', false);
  report.cases.push({ name: 'Desktop direct route, native keyboard, pause/help input lock, gate selection cancellation, victory and restart', status: 'passed', summary: d.state.summary });
  await d.resetFromResult(); await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const m = await makeRunner(mobile, 'mobile', true);
  await m.start(); await m.travel('crossing', 'trace'); await m.travel('market');
  await m.command('buy', 'fine-nib'); await m.command('buy', 'wayfinder');
  assert.equal(await m.page.locator('[data-action="buy"][data-target="fine-nib"]').isDisabled(), true);
  await m.travel('reliquary'); await m.fight(); await m.command('claim');
  await m.travel('market'); await m.travel('crossing'); await m.travel('archive');
  await m.click('[data-room="spring"]'); assert.equal(await m.page.locator('[data-action="claim"]').count(), 0);
  await m.click('[data-room="archive"]'); assert.equal(await m.page.locator('[data-action="claim"]').isEnabled(), true);
  await m.command('claim'); await m.travel('spring'); await m.command('claim');
  await m.travel('sentinel', 'trace'); await m.command('attack'); await m.command('heal');
  const savedBefore = await m.page.evaluate(() => localStorage.getItem('ink-is-everything:chapter:v1'));
  assert.ok(JSON.parse(savedBefore).actions.length > 10);
  await m.page.reload({ waitUntil: 'networkidle' });
  assert.match(await m.page.locator('#start-game').textContent(), /继续上次旅程/);
  // Cancelling a fresh start must preserve the actual existing save.
  await m.click('#fresh-game'); assert.match(await m.page.locator('#modal-title').textContent(), /重写/);
  await m.click('[data-close]'); assert.equal(await m.page.evaluate(() => localStorage.getItem('ink-is-everything:chapter:v1')), savedBefore);
  await m.click('#restart'); assert.match(await m.page.locator('#modal-title').textContent(), /重写/);
  await m.click('[data-close]'); await m.start();
  await screenshot(m.page, 'mobile-combat.png', true);
  await m.fight(); await m.command('claim');
  await m.travel('garden'); await m.command('claim'); await m.travel('warden'); await m.fight(); await m.command('claim');
  await m.travel('causeway'); await m.travel('lookout'); await m.command('claim'); await m.travel('threshold');
  await m.command('unlock'); await m.travel('gate'); await m.fight();
  assert.equal(m.state.status, 'won'); assert.equal(m.state.stats.roomsRevealed, 13);
  assert.deepEqual(m.state.contracts, ['fine-nib', 'wayfinder']);
  assert.equal(await m.page.locator('.result-stats strong').nth(1).textContent(), '13/13');
  await noOverflow(m.page);
  report.cases.push({ name: '390×844 native touch, both contracts, all 13 rooms, combat healing, mid-fight reload, saved restart confirmation, reward selection cancellation and victory', status: 'passed', summary: m.state.summary });
  await mobile.close();

  const failure = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const f = await makeRunner(failure, 'failure');
  await f.start(); await f.travel('crossing', 'trace'); await f.travel('sentinel', 'trace');
  while (f.state.status === 'playing') await f.command('dry');
  assert.equal(f.state.status, 'lost'); assert.equal(f.state.hp, 0);
  assert.equal(await f.page.locator('#modal').evaluate(dialog => dialog.open), true);
  assert.equal(await f.page.evaluate(() => localStorage.getItem('ink-is-everything:chapter:v1')), null);
  await f.resetFromResult();
  report.cases.push({ name: 'Ignoring enemy intent causes loss; terminal save is removed; result restart restores full resources', status: 'passed' });
  await failure.close();

  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await blocked.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage disabled for test', 'SecurityError'); } });
  });
  const b = await makeRunner(blocked, 'storage-disabled', true);
  await b.start(); await b.travel('crossing'); await b.travel('archive'); await b.command('claim');
  await b.click('#pause'); await b.click('#modal-sound'); await b.click('[data-close]'); await b.verify();
  report.cases.push({ name: 'Unavailable local storage does not block touch exploration, rewards, pause or sound preference', status: 'passed' });
  await blocked.close();
  for (const mobileDrag of [false, true]) {
    const context = await browser.newContext({ viewport: mobileDrag ? { width: 390, height: 844 } : { width: 1512, height: 1000 }, isMobile: mobileDrag, hasTouch: mobileDrag });
    const draw = await makeRunner(context, mobileDrag ? 'touch-drag' : 'mouse-drag', mobileDrag);
    await draw.start();
    if (mobileDrag) { await draw.drag('crossing', true); assert.equal(draw.state.ink, 72); }
    await draw.drag('crossing');
    assert.equal(draw.state.ink, 66);
    await draw.drag('arrival');
    assert.equal(draw.state.ink, 66, 'Dragging along an existing route must remain free.');
    report.cases.push({ name: `${mobileDrag ? 'Native touch (including cancellation)' : 'Native mouse'} drag draws an adjacent room and returns along a free existing route`, status: 'passed' });
    await context.close();
  }
  assert.deepEqual(report.errors, [], 'No console errors, page exceptions or failed requests.');
  report.status = 'passed';
  console.log(`Passed ${report.cases.length} browser scenarios; saved ${report.screenshots.length} screenshots.`);
} catch (error) {
  report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; throw error;
} finally {
  await browser?.close();
  await writeFile(new URL('./playtest-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
}
