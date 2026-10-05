import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const report = { base, checks: [] };
const homeOnly = '#home-start, #level-select, #mobile-level-select, #settings, #sound, #help, #appearance-settings, #mode-settings, [data-game-fullscreen], .map-expand-button';
const visibleHomeOnly = `${homeOnly.split(', ').join(':visible, ')}:visible`;
const stateView = state => ({ cops: state.cops, robbers: state.robbers.map(node => node < 0 ? null : node), turn: state.turn });
async function snapshot(page) {
  return page.evaluate(() => ({
    cops: [...document.querySelectorAll('#board [id^="cop-actor-"]')]
      .sort((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1))).map(actor => Number(actor.dataset.node)),
    robbers: [0, 1, 2].map(index => document.getElementById(`robber-actor-${index}`)).filter(Boolean).map(actor => Number(actor.dataset.node)),
    turn: Number(document.body.dataset.turn),
  }));
}
async function check(name, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(`${base}/?motion=reduce`);
    await page.locator('#home-start').waitFor({ state: 'visible' });
    await run(page);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: `outputs/game-shell-failure-${report.checks.length + 1}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
async function choose(page, id) {
  await page.locator('#home-start').tap();
  const chapter = levels[id - 1].chapter;
  await page.locator(`#chapter-tab-${chapter}`).tap();
  await page.getByTestId(`level-button-${id}`).tap();
  await page.waitForFunction(id => document.body.classList.contains('focus-play') && document.body.dataset.level === String(id), id);
  await page.waitForSelector('#cop-actor-0');
}
async function point(page, x, y) {
  return page.getByTestId('board').evaluate((svg, { x, y }) => {
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, { x, y });
}
try {
  await mkdir('outputs', { recursive: true });
  await check('home owns all levels and global game entries', async page => {
    assert.equal(await page.locator('#board:visible').count(), 0, 'The home does not expose an inactive game board');
    for (const selector of ['#settings', '#help', '#appearance-settings', '#mode-settings', '#friend-duel']) {
      assert.ok(await page.locator(selector).isVisible(), `${selector} must be available on home`);
    }
    assert.ok(await page.locator('.home-scene').isVisible(), 'The illustrated street scene leads the home');
    assert.notEqual(await page.locator('.home-scene').evaluate(scene => getComputedStyle(scene).backgroundImage), 'none',
      'The home scene loads its cartoon art');
    await page.locator('#home-start').tap();
    assert.ok(await page.locator('#level-dialog').isVisible());
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-play')), false, 'Choosing levels happens outside play');
    const reachable = new Set();
    for (const tab of await page.locator('#chapter-tabs [data-chapter]').all()) {
      await tab.tap();
      for (const button of await page.locator('#level-grid [data-level]').all()) {
        assert.ok(await button.isEnabled(), 'Every challenge is available');
        reachable.add(Number(await button.getAttribute('data-level')));
      }
    }
    assert.equal(reachable.size, levels.length, 'All 100 challenges remain reachable');
    await page.getByTestId('level-button-100').tap();
    await page.waitForSelector('#cop-actor-0');
    assert.equal(await page.locator('body').getAttribute('data-level'), '100');
    assert.equal(await page.locator(visibleHomeOnly).count(), 0, 'Play contains no home configuration or level controls');
    await page.locator('#focus-toggle').tap();
    await page.locator('#settings').tap();
    await page.locator('#settings-dialog').waitFor({ state: 'visible' });
    await page.locator('#settings-dialog .dialog-close').tap();
    await page.locator('#help').tap();
    await page.locator('#help-dialog').waitFor({ state: 'visible' });
    await page.locator('#help-dialog .dialog-close').tap();
    await page.screenshot({ path: 'outputs/game-shell-home-mobile.png' });
  });

  await check('both appearances default to police and robber and persist globally', async page => {
    await page.locator('#appearance-settings').tap();
    const dialog = page.locator('[data-role-appearance]');
    await dialog.waitFor({ state: 'visible' });
    const police = dialog.getByRole('combobox', { name: '警察样式', exact: true });
    const robber = dialog.getByRole('combobox', { name: '小偷样式', exact: true });
    assert.equal(await police.inputValue(), 'team');
    assert.equal(await robber.inputValue(), 'team');
    await police.selectOption('animals');
    await robber.selectOption('cosmic');
    await dialog.locator('[data-close-appearance]').tap();
    await choose(page, 6);
    const customized = await page.locator('#board .role-avatar').evaluateAll(nodes => nodes.map(node => node.innerHTML));
    assert.ok(customized.length >= 4, 'Both teams use the configured portraits in the scene');
    await page.locator('#focus-toggle').tap();
    await page.reload();
    await page.locator('#appearance-settings').tap();
    assert.equal(await page.getByRole('combobox', { name: '警察样式', exact: true }).inputValue(), 'animals');
    assert.equal(await page.getByRole('combobox', { name: '小偷样式', exact: true }).inputValue(), 'cosmic');
    await page.locator('[data-close-appearance]').tap();
    await page.locator('#resume-patrol').tap();
    assert.deepEqual(await page.locator('#board .role-avatar').evaluateAll(nodes => nodes.map(node => node.innerHTML)), customized,
      'Saved appearance is rendered after reload and resume');
    await page.locator('#focus-toggle').tap();
    await page.locator('#appearance-settings').tap();
    await page.getByLabel('警察本地头像', { exact: true }).setInputFiles({
      name: 'avatar.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=', 'base64'),
    });
    await page.locator('[data-role-appearance] fieldset').first().locator('svg image').waitFor({ state: 'attached' });
    await page.locator('[data-close-appearance]').tap();
    await page.locator('#resume-patrol').tap();
    assert.equal(await page.locator('#board [id^="cop-actor-"] .role-avatar image').count(), 3,
      'A local police avatar is rendered on every officer');
    await page.locator('#focus-toggle').tap();
    await page.reload();
    await page.locator('#appearance-settings').tap();
    assert.equal(await page.locator('[data-role-appearance] fieldset').first().locator('svg image').count(), 1,
      'The uploaded local avatar persists after reload');
    for (const field of await page.locator('[data-role-appearance] fieldset').all()) {
      await field.getByRole('button', { name: '恢复默认形象', exact: true }).tap();
      assert.equal(await field.locator('select').inputValue(), 'team');
    }
    await page.locator('[data-close-appearance]').tap();
    await page.locator('#resume-patrol').tap();
    assert.notDeepEqual(await page.locator('#board .role-avatar').evaluateAll(nodes => nodes.map(node => node.innerHTML)), customized,
      'Restoring default portraits updates the current game');
  });

  await check('touch gestures cancel safely and drop directly on the board', async page => {
    await choose(page, 1);
    const map = levels[0], before = initialState(map), targets = solutions[1][0];
    const cop = targets.findIndex((node, index) => node !== before.cops[index]);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const touch = (type, position) => session.send('Input.dispatchTouchEvent', { type, touchPoints: position ? [{ ...position, id: 1 }] : [] });
    const start = async destination => {
      const bounds = await page.getByTestId(`cop-${cop}`).boundingBox();
      await touch('touchStart', { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
      await touch('touchMove', await point(page, destination.x, destination.y));
      assert.equal(await page.locator('.drag-line').count(), 1, 'Touch drag gives immediate visual feedback');
    };
    await start(map.nodes[targets[cop]]);
    assert.deepEqual(await snapshot(page), stateView(before), 'Dragging only previews a move');
    await touch('touchCancel');
    assert.equal(await page.locator('.drag-line').count(), 0, 'Cancellation clears the drag feedback');
    assert.deepEqual(await snapshot(page), stateView(before), 'Cancellation preserves the patrol');
    await start({ x: 25, y: 25 });
    await touch('touchEnd');
    assert.equal(await page.locator('.drag-line').count(), 0);
    assert.deepEqual(await snapshot(page), stateView(before), 'Dropping outside a target preserves the patrol');
    await start(map.nodes[targets[cop]]);
    await touch('touchEnd');
    await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
    assert.deepEqual(await snapshot(page), stateView(step(map, before, targets).state), 'A legal touch drop performs one complete turn');
    await session.detach();
    await page.screenshot({ path: 'outputs/game-shell-play-mobile.png' });
  });

  await check('quick trial and duel stay behind home entries', async page => {
    await page.locator('#quick-start').tap();
    await page.waitForFunction(() => document.body.dataset.mode === 'quick' && document.body.classList.contains('focus-play'));
    assert.equal(await page.locator(visibleHomeOnly).count(), 0);
    await page.locator('#focus-toggle').tap();
    await page.locator('#mode-settings').tap();
    await page.locator('#mode-dialog').waitFor({ state: 'visible' });
    await page.locator('#solo-mode').selectOption('escape');
    await page.locator('#solo-role').selectOption('pursuer');
    await page.locator('#solo-initiative').selectOption('first');
    await page.locator('#start-mode').tap();
    await page.waitForSelector('#duel-board [data-actor]');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-play')), true);
    assert.equal(await page.locator(visibleHomeOnly).count(), 0, 'Duel play also omits home tools');
    assert.equal(await page.locator('#mode-dialog:visible').count(), 0, 'The setup modal closes when the duel starts');
    await page.locator('#focus-toggle').tap();
    assert.ok(await page.locator('#mode-settings').isVisible());
  });
  await check('returning home cancels a pending hint and keeps the next hint available', async page => {
    await choose(page, 6);
    const before = await snapshot(page);
    await page.evaluate(() => {
      window.Worker = class PendingHintWorker {
        postMessage() {}
        terminate() {}
      };
    });
    await page.getByTestId('hint').tap();
    assert.ok(await page.getByTestId('hint').isDisabled(), 'The hint is waiting for its worker response');
    await page.locator('#focus-toggle').tap();
    await page.locator('#resume-patrol').tap();
    assert.ok(await page.getByTestId('hint').isEnabled(), 'A cancelled request never leaves hint disabled');
    assert.equal((await page.getByTestId('hint').textContent()).trim(), '提示');
    assert.deepEqual(await snapshot(page), before, 'Cancelling and resuming a hint preserves the patrol');
  });
  await check('occupied road feedback stays visible in the compact game prompt', async page => {
    await choose(page, 1);
    const before = await snapshot(page), map = levels[0];
    await page.getByTestId('cop-0').tap();
    await page.getByTestId(`node-${map.robbers[0]}`).tap();
    await page.waitForFunction(() => document.getElementById('play-prompt').textContent.includes('小偷'));
    assert.ok(await page.locator('#play-prompt').isVisible());
    await page.getByTestId(`node-${map.cops[1]}`).tap();
    await page.waitForFunction(() => document.getElementById('play-prompt').textContent.includes('队友'));
    assert.ok(await page.locator('#play-prompt').isVisible());
    assert.deepEqual(await snapshot(page), before, 'Occupied road attempts do not consume a turn');
  });
  await writeFile('outputs/game-shell-report.json', JSON.stringify(report, null, 2));
  console.log(`PASS ${report.checks.length} game shell scenarios`);
} finally { await browser.close(); }
