import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Touches, snapshot, center, logicalPoint, distance, fitsViewport } from './playtest-driver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const report = {
  version: 3,
  date: new Date().toISOString(),
  url,
  viewport: '390×844',
  input: 'Native four-finger touch events; snapshots read-only',
  cases: [],
  errors: [],
  status: 'running',
};
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#start-game').tap();
  await fitsViewport(page);
  const initial = await snapshot(page);
  assert.equal(initial.version, 3);
  assert.equal(Object.hasOwn(initial.player, 'hp'), false);
  await page.locator('#pause').tap();
  assert.equal(
    await page.locator('#modal').evaluate((dialog) => dialog.open),
    true,
    'The compatibility click must not close a pause opened by touch',
  );
  const frozen = await snapshot(page);
  assert.equal(frozen.paused, true);
  await page.locator('#modal-close').focus();
  for (const key of ['Space', 'q', 'f', 'e']) await page.keyboard.press(key);
  await page.waitForTimeout(250);
  assert.equal((await snapshot(page)).paused, true);
  assert.equal((await snapshot(page)).time, frozen.time);
  await page.locator('#resume').tap();
  await page.waitForFunction(() => !window.__inkGame.snapshot().paused);
  report.cases.push({
    name: 'Single-finger pause remains open after the compatibility click and gameplay keys cannot activate its focused close button',
    status: 'passed',
  });

  const touch = new Touches(await context.newCDPSession(page));
  const stick = await center(page, '#joystick');
  await touch.down(1, stick);
  await touch.move(1, await logicalPoint(page, '#joystick', 37, 0));
  await touch.down(2, await center(page, '#fire'));
  await touch.down(3, await center(page, '#melee'));
  await page.waitForTimeout(240);
  const beforeNova = await snapshot(page);
  assert.ok(beforeNova.player.x > initial.player.x + 25);
  assert.ok(beforeNova.stats.shots > 0);
  assert.ok(beforeNova.stats.freeAttacks > 0);
  await touch.down(4, await center(page, '#nova'));
  await touch.up(4);
  await page.waitForFunction(
    (count) => window.__inkGame.snapshot().stats.spent.nova > count,
    beforeNova.stats.spent.nova || 0,
  );
  const nova = await snapshot(page);
  assert.equal(
    nova.stats.spent.nova - (beforeNova.stats.spent.nova || 0),
    initial.definition.rules.novaCost,
  );
  assert.ok(
    nova.player.ink < beforeNova.player.ink,
    'Nova spends the same survival ink during multi-touch combat',
  );
  assert.equal(
    nova.pickups.filter((pickup) => pickup.kind === 'reclaim' && pickup.skillId === 'nova').length,
    2,
  );
  report.cases.push({
    name: 'Three held fingers move, shoot and dry-attack while the fourth casts nova, pays life ink and scatters two physical recovery drops',
    status: 'passed',
    novaCost: nova.stats.spent.nova - (beforeNova.stats.spent.nova || 0),
  });
  await touch.cancel();
  const cancelled = await snapshot(page);
  await page.waitForTimeout(180);
  const stopped = await snapshot(page);
  assert.deepEqual(stopped.input, {
    moveX: 0,
    moveY: 0,
    shoot: false,
    melee: false,
    drawing: false,
  });
  assert.ok(distance(cancelled.player, stopped.player) < 2);
  assert.equal(stopped.stats.shots, cancelled.stats.shots);
  assert.equal(stopped.stats.freeAttacks, cancelled.stats.freeAttacks);
  report.cases.push({
    name: 'Native touch cancellation releases movement and all held attacks without sticky input',
    status: 'passed',
  });

  await touch.down(1, stick);
  await touch.move(1, await logicalPoint(page, '#joystick', -36, 0));
  await touch.down(2, await center(page, '#fire'));
  await touch.down(3, await center(page, '#melee'));
  await touch.down(4, await center(page, '#pause'));
  const paused = await snapshot(page);
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.input, {
    moveX: 0,
    moveY: 0,
    shoot: false,
    melee: false,
    drawing: false,
  });
  await page.waitForTimeout(250);
  assert.equal((await snapshot(page)).time, paused.time);
  await touch.cancel();
  await page.locator('#resume').tap();
  await page.waitForFunction(() => !window.__inkGame.snapshot().paused);
  const resumed = await snapshot(page);
  await page.waitForTimeout(180);
  const after = await snapshot(page);
  assert.ok(distance(resumed.player, after.player) < 2);
  assert.equal(after.stats.shots, resumed.stats.shots);
  assert.equal(after.stats.freeAttacks, resumed.stats.freeAttacks);
  report.cases.push({
    name: 'Fourth finger pauses and clears every capture; explicit resume restores play without ghost movement, shots or melee',
    status: 'passed',
  });
  await touch.close();
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    new URL('./touch-input-report.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
