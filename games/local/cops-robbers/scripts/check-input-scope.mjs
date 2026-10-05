import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { getDuelLevel } from '../src/duel-levels.js';
import { initialDuel, legalDuelTargets } from '../src/duel.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: process.env.BROWSER_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?level=1&motion=reduce`);
  await page.getByTestId('node-1').click();
  await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
  await page.locator('#focus-toggle').click();
  const challenge = await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current);
  await page.keyboard.press('Control+z');
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current), challenge, 'Lobby shortcuts must preserve the paused challenge');

  for (const role of ['pursuer', 'runner']) {
    await page.locator('#mode-settings').click();
    await page.selectOption('#solo-mode', 'survival');
    await page.selectOption('#solo-role', role);
    await page.selectOption('#solo-initiative', 'first');
    await page.selectOption('#solo-level', '100');
    await page.locator('#start-mode').click();
    const actor = page.locator(`#duel-board [data-side="${role}"][data-actor="0"]`);
    await actor.focus();
    await page.keyboard.press('Enter');
    assert.ok(await actor.evaluate(element => element === document.activeElement), 'Keyboard selection must retain focus through repaint');
    await page.keyboard.press('Control+z');
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current), challenge, 'Duel shortcuts must not change the hidden challenge');

    const level = getDuelLevel('survival', 100), initial = initialDuel(level, role);
    const origin = (role === 'pursuer' ? initial.cops : initial.robbers)[0];
    const target = legalDuelTargets(level, initial, 0).find(node => node !== origin);
    assert.ok(Number.isInteger(target));
    const road = page.locator(`#duel-board [data-target="${target}"]`);
    await road.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => Number(document.body.dataset.duelTurn) >= 2 || !!document.body.dataset.duelWinner);
    assert.ok(await road.evaluate(element => element === document.activeElement), 'Player and AI turns must retain the focused junction');
    if (!await page.locator('body').getAttribute('data-duel-winner')) {
      const turn = Number(await page.locator('body').getAttribute('data-duel-turn'));
      await page.keyboard.down('Enter');
      await page.waitForFunction(turn => Number(document.body.dataset.duelTurn) >= turn + 2 || !!document.body.dataset.duelWinner, turn);
      const afterPress = await page.locator('body').getAttribute('data-duel-turn');
      await page.keyboard.down('Enter');
      await page.waitForTimeout(500);
      assert.equal(await page.locator('body').getAttribute('data-duel-turn'), afterPress, 'A held activation key must not spend another turn after the AI responds');
      await page.keyboard.up('Enter');
    }
    await page.keyboard.press('Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY', 'Tab must continue from the current map control');
    await page.locator('#focus-toggle').click();
  }
  await page.locator('#home-start').click();
  await page.selectOption('#solo-mode', 'challenge');
  await page.locator('#start-mode').click();
  await page.getByTestId(`level-button-${challenge.levelId}`).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).current), challenge, 'Selecting the paused challenge preserves its state after a duel');
  assert.equal(await page.locator('body').getAttribute('data-turn'), '1');
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('body').getAttribute('data-turn'), '0', 'Undo remains available in the active challenge');
  assert.deepEqual(errors, []);
  console.log('PASS lobby/duel shortcut isolation, both-role keyboard focus, player/AI repaint, held-key protection, active challenge undo');
} finally { await browser.close(); }
