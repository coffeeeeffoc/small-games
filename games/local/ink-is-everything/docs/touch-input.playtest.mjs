import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Targeted regression for the non-primary-finger healing and pause bugs.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const report = {
  date: new Date().toISOString(),
  url,
  viewport: '390×844',
  input: 'Native four-finger touch events; snapshot reads only',
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
  const session = await context.newCDPSession(page),
    points = new Map();
  const snapshot = () => page.evaluate(() => window.__inkGame.snapshot());
  await page.locator('#pause').tap();
  assert.equal(
    await page.locator('#modal').evaluate((dialog) => dialog.open),
    true,
    'A single-finger pause tap must leave the dialog open after its compatibility click',
  );
  const singlePaused = await snapshot();
  assert.equal(singlePaused.paused, true);
  await page.locator('#modal-close').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  assert.equal((await snapshot()).paused, true);
  assert.equal((await snapshot()).time, singlePaused.time);
  await page.locator('#resume').tap();
  await page.waitForFunction(() => !window.__inkGame.snapshot().paused, null, { timeout: 2000 });
  assert.equal((await snapshot()).paused, false);
  report.cases.push({
    name: 'Single-finger pause survives the compatibility click, Space on a focused close button remains paused, and explicit resume works',
    status: 'passed',
  });
  const center = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const dispatch = (type) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...points].map(([id, point]) => ({
        id,
        ...point,
        radiusX: 5,
        radiusY: 5,
        force: 1,
      })),
    });
  const down = async (id, point) => {
    points.set(id, point);
    await dispatch('touchStart');
  };
  const up = async (id) => {
    const point = points.get(id);
    points.delete(id);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ id, ...point, radiusX: 5, radiusY: 5, force: 1 }],
    });
  };
  const cancel = async () => {
    if (points.size) {
      points.clear();
      await dispatch('touchCancel');
    }
  };
  const stick = await center('#joystick');
  await down(1, stick);
  points.set(1, { x: stick.x + 37, y: stick.y });
  await dispatch('touchMove');
  await page.waitForTimeout(900);
  await cancel();
  await page.waitForFunction(() => window.__inkGame.snapshot().player.hp <= 3, null, {
    timeout: 35000,
  });
  assert.equal((await snapshot()).status, 'playing');
  await down(1, stick);
  await down(2, await center('#fire'));
  await down(3, await center('#melee'));
  const wounded = await snapshot();
  await down(4, await center('#heal'));
  await up(4);
  const healed = await snapshot();
  assert.equal(
    healed.stats.heals,
    wounded.stats.heals + 1,
    'The fourth finger must activate healing while three other controls are held',
  );
  assert.equal(healed.stats.spent.heal, wounded.stats.spent.heal + 10);
  assert.ok(healed.player.hp > wounded.player.hp);
  report.cases.push({
    name: 'Fourth finger heals during simultaneous joystick, ranged and melee input; shared ink pool pays 10',
    status: 'passed',
    hpBefore: wounded.player.hp,
    hpAfter: healed.player.hp,
  });

  await down(4, await center('#pause'));
  const paused = await snapshot();
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.input, {
    moveX: 0,
    moveY: 0,
    shoot: false,
    melee: false,
    drawing: false,
  });
  await page.locator('#modal-close').focus();
  for (const key of ['Space', 'f', 'q', 'e']) await page.keyboard.press(key);
  await page.waitForTimeout(350);
  assert.equal(
    (await snapshot()).paused,
    true,
    'Gameplay keys must not activate focused dialog controls',
  );
  assert.equal((await snapshot()).time, paused.time);
  await cancel();
  await page.locator('#resume').tap();
  const resumed = await snapshot();
  await page.waitForTimeout(200);
  const after = await snapshot();
  assert.equal(after.stats.shots, resumed.stats.shots);
  assert.equal(after.stats.freeAttacks, resumed.stats.freeAttacks);
  assert.ok(Math.hypot(after.player.x - resumed.player.x, after.player.y - resumed.player.y) < 2);
  report.cases.push({
    name: 'Fourth finger pauses, cancels all captures and held controls, freezes simulation even with Space on a focused button, then resumes without stale movement or attacks',
    status: 'passed',
  });
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
