import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { HEROES, OFFERS } from '../src/content.mjs';

const url = process.env.GAME_URL || 'http://127.0.0.1:4197';
const output = new URL('../artifacts/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    })
  : await chromium
      .launch({ headless: true, channel: 'chrome' })
      .catch(() => chromium.launch({ headless: true }));
const errors = [],
  results = [];
const cell = (page, zone, index) => page.locator(`[data-zone="${zone}"][data-index="${index}"]`);
const snapshot = (page) => page.evaluate(() => window.__mergeFront.getState());
const inventory = (state) =>
  ['board', 'reserve'].map((zone) =>
    state[zone].map(
      (item) =>
        item && {
          id: item.id,
          key: item.key,
          parts: item.parts,
          level: item.level,
          weapon: item.weapon,
        },
    ),
  );

function watch(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED'))
      errors.push(`${request.failure()?.errorText} ${request.url()}`);
  });
}

async function enter(page, mode = 'defense') {
  const response = await page.goto(url);
  assert.equal(response.status(), 200, `Wrong game server at ${url}`);
  await expect(page).toHaveTitle('神机合阵 · 云上工坊');
  await page.locator(`#start-${mode}`).click();
  await expect(page.locator('#board [data-zone="board"][data-index]')).toHaveCount(12);
  await expect.poll(async () => (await snapshot(page)).mode).toBe(mode);
}

async function layout(page) {
  const measured = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll('#game, .board, .reserve, .workshop, dialog[open]')].map(
      (element) => {
        const box = element.getBoundingClientRect();
        return {
          name: element.id || element.className,
          left: box.left,
          right: box.right,
          width: element.clientWidth,
          content: element.scrollWidth,
        };
      },
    ),
  }));
  assert.ok(measured.page <= measured.viewport + 1, `Page overflow: ${JSON.stringify(measured)}`);
  for (const box of measured.boxes)
    assert.ok(
      box.left >= -1 && box.right <= measured.viewport + 1 && box.content <= box.width + 2,
      `Component overflow: ${JSON.stringify(box)}`,
    );
}

async function points(source, target) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const a = await source.boundingBox(),
    b = await target.boundingBox();
  assert.ok(a && b, 'Both drag cells must be visible');
  return [
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  ];
}

async function drag(page, source, target, cancel = false) {
  const [a, b] = await points(source, target);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  if (cancel)
    await source.dispatchEvent('pointercancel', {
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
    });
  await page.mouse.up();
  // The UI suppresses the synthetic click that follows a completed pointer drag.
  await page.waitForTimeout(360);
}

async function touchDrag(page, cdp, source, target, cancel = false) {
  const [a, b] = await points(source, target);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  for (let step = 1; step <= 5; step++) {
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: a.x + ((b.x - a.x) * step) / 5, y: a.y + ((b.y - a.y) * step) / 5, id: 1 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
}

async function move(page, fromZone, fromIndex, toZone, toIndex, touch = false) {
  const action = touch ? 'tap' : 'click';
  const source = cell(page, fromZone, fromIndex);
  if ((await source.getAttribute('aria-pressed')) !== 'true') {
    const selected = page.locator('.cell[aria-pressed="true"]');
    if (await selected.count()) await selected[action]();
    await source[action]();
  }
  await cell(page, toZone, toIndex)[action]();
}

async function advance(page, milliseconds) {
  // Resume/navigation resets the RAF baseline; establish it before skipping time.
  await page.clock.runFor(60);
  await page.clock.fastForward(milliseconds);
  await page.clock.runFor(60);
}

async function buy(page, offerId, target) {
  const index = (await snapshot(page)).reserve.indexOf(null);
  assert.ok(index >= 0, 'Recruitment requires a free reserve cell');
  const tab = offerId.startsWith('weapon:') ? 'weapon' : 'hero';
  if ((await page.locator(`[data-tab="${tab}"]`).getAttribute('aria-selected')) !== 'true')
    await page.locator(`[data-tab="${tab}"]`).click();
  await page.locator(`[data-offer="${offerId}"]`).click();
  assert.ok((await snapshot(page)).reserve[index], `Recruitment failed: ${offerId}`);
  await move(page, 'reserve', index, 'board', target);
}

async function assemble(page, key, target, equipped = true) {
  for (const part of HEROES[key].parts) await buy(page, `${key}:${part}`, target);
  if (equipped) await buy(page, `weapon:${HEROES[key].synergy}`, target);
}

async function winCampaign(page, mode) {
  await enter(page, mode);
  await move(page, 'reserve', 0, 'board', 4);
  await move(page, 'reserve', 1, 'board', 4);
  await move(page, 'reserve', 2, 'board', 1);
  await buy(page, 'wukong:悟', 1);
  await buy(page, 'wukong:空', 1);
  await buy(page, 'weapon:cannon', 1);
  await assemble(page, 'erlang', 9, false);
  await page.locator('#launch').click();
  const additions = [
    ['drone', 9],
    ['nezha', 6],
    ['erlang', 2],
    ['wukong', 10],
    ['nezha', 8],
    ['erlang', 0],
    ['wukong', 7],
    ['nezha', 11],
    ['erlang', 3],
    ['wukong', 5],
  ];
  let next = 0;
  for (let step = 0; step < 160 && (await snapshot(page)).phase === 'running'; step++) {
    let current = await snapshot(page);
    if (current.cooldowns.surge <= 0) await page.locator('#surge').click();
    if (current.coreHp < 650 && current.coins >= 45) await page.locator('#repair').click();
    current = await snapshot(page);
    if (next < additions.length) {
      const [key, index] = additions[next];
      const cost =
        key === 'drone'
          ? 52
          : OFFERS.filter(
              (offer) => offer.key === key || offer.id === `weapon:${HEROES[key].synergy}`,
            ).reduce((sum, offer) => sum + offer.cost, 0);
      if (current.coins >= cost) {
        if (key === 'drone') await buy(page, 'weapon:drone', index);
        else await assemble(page, key, index);
        next++;
      }
    }
    await advance(page, 3000);
  }
  const won = await snapshot(page);
  assert.equal(
    won.phase,
    'won',
    `${mode} legal deployment must win: ${JSON.stringify({ time: won.time, wave: won.wave, hp: won.coreHp, enemy: won.enemyCoreHp, additions: next })}`,
  );
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result-title')).toHaveText(
    mode === 'attack' ? '敌晶破，远征捷' : '八阵过，云关安',
  );
  if (mode === 'attack') assert.equal(won.enemyCoreHp, 0);
  else assert.equal(won.wave, won.maxWaves);
  assert.ok(won.coreHp > 0);
  await page.screenshot({
    path: fileURLToPath(new URL(`${mode}-victory.png`, output)),
    fullPage: true,
  });
  await page.locator('#result-home').click();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.locator(`#start-${mode === 'attack' ? 'defense' : 'attack'}`).click();
  const fresh = await snapshot(page);
  assert.equal(fresh.phase, 'setup');
  assert.notEqual(fresh.mode, mode);
  assert.equal(fresh.coreHp, fresh.coreMax);
  results.push(
    `${mode}: complete legal UI campaign victory at ${Math.round(won.time)}s, ${won.kills} kills, ${Math.ceil((won.coreHp / won.coreMax) * 100)}% core; result and other-mode transition`,
  );
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  watch(page);
  await page.clock.install();
  await enter(page);
  await expect.poll(async () => (await snapshot(page)).reserve[1].animTime).toBeGreaterThan(0);
  await page.clock.runFor(800);
  assert.equal(
    (await snapshot(page)).reserve[1].anim,
    'idle',
    'Entry animation must finish during setup',
  );
  assert.equal((await snapshot(page)).time, 0);
  assert.equal((await snapshot(page)).coins, 180);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#pause-dialog')).toBeVisible();
  assert.equal((await snapshot(page)).phase, 'setup');
  assert.equal((await snapshot(page)).paused, true);
  await page.locator('#resume').click();
  assert.equal((await snapshot(page)).paused, false);
  await layout(page);
  const initialSound = await page.locator('#sound-button').getAttribute('aria-pressed');
  await page.locator('#sound-button').click();
  const savedSound = await page.locator('#sound-button').getAttribute('aria-pressed');
  assert.notEqual(savedSound, initialSound);
  await page.reload();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', savedSound);
  await page.locator('#start-defense').click();

  const beforeCancel = inventory(await snapshot(page));
  await drag(page, cell(page, 'reserve', 0), cell(page, 'board', 4), true);
  assert.deepEqual(
    inventory(await snapshot(page)),
    beforeCancel,
    'Cancelled mouse drag must preserve every component',
  );
  await drag(page, cell(page, 'reserve', 0), cell(page, 'board', 4));
  assert.deepEqual((await snapshot(page)).board[4].parts, ['哪', '吒']);
  assert.equal((await snapshot(page)).reserve[0], null);
  await drag(page, cell(page, 'reserve', 1), cell(page, 'board', 4));
  assert.equal((await snapshot(page)).board[4].weapon, 'fire');

  const coins = (await snapshot(page)).coins;
  await page.locator('[data-offer="nezha:哪"]').click();
  await page.locator('[data-offer="nezha:吒"]').click();
  assert.equal((await snapshot(page)).coins, coins - 48);
  await move(page, 'reserve', 1, 'reserve', 0);
  await move(page, 'reserve', 0, 'board', 4);
  assert.equal((await snapshot(page)).board[4].level, 2);
  assert.equal(
    (await snapshot(page)).board[4].weapon,
    'fire',
    'Upgrading must retain the equipped weapon',
  );

  await page.locator('[data-offer="wukong:悟"]').click();
  await page.locator('[data-offer="wukong:空"]').click();
  await move(page, 'reserve', 0, 'reserve', 2);
  assert.deepEqual((await snapshot(page)).reserve[2].parts, ['孙', '悟']);
  await move(page, 'reserve', 1, 'reserve', 2);
  await move(page, 'reserve', 2, 'board', 7);
  assert.deepEqual((await snapshot(page)).board[7].parts, ['孙', '悟', '空']);
  await page.locator('[data-tab="weapon"]').click();
  await expect(page.locator('[data-offer="weapon:cannon"]')).toBeVisible();
  await page.locator('[data-tab="hero"]').click();

  // Pause the mock clock's automatic realtime sync before controlled time jumps.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.locator('#launch').click();
  assert.equal((await snapshot(page)).phase, 'running');
  await advance(page, 2500);
  assert.ok((await snapshot(page)).units.some((unit) => unit.side === 'enemy'));
  await page.locator('#pause-button').click();
  const paused = await snapshot(page);
  assert.equal(paused.paused, true);
  await advance(page, 15000);
  const stillPaused = await snapshot(page);
  assert.equal(stillPaused.time, paused.time);
  assert.equal(stillPaused.coreHp, paused.coreHp);
  assert.deepEqual(stillPaused.units, paused.units);
  await page.locator('#resume').click();
  await advance(page, 1000);
  const resumed = await snapshot(page);
  assert.ok(
    resumed.time > paused.time,
    `Resume failed: ${JSON.stringify({ before: paused.time, after: resumed.time, phase: resumed.phase, paused: resumed.paused, hidden: await page.evaluate(() => document.hidden) })}`,
  );
  await page.locator('#speed-button').click();
  await expect(page.locator('#speed-button')).toHaveAttribute('aria-label', '切换速度，当前2倍');
  await page.locator('#speed-button').click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause-dialog')).toBeVisible();
  assert.equal((await snapshot(page)).paused, true);
  await page.locator('#resume').click();
  await advance(page, 24000);
  assert.ok((await snapshot(page)).units.some((unit) => unit.side === 'ally'));
  await page.screenshot({
    path: fileURLToPath(new URL('desktop-defense.png', output)),
    fullPage: true,
  });
  results.push(
    'Desktop: setup entry-to-idle animation, BFCache restore, recruit, mouse cancellation/drag, two/three-character assembly, weapon fusion, upgrade, combat, pause/resume/blur, speed and sound reload',
  );

  // The same UI controls create an undefended game; no state or outcome is injected.
  await enter(page);
  for (const zone of ['board', 'reserve']) {
    const slots = (await snapshot(page))[zone];
    for (let index = 0; index < slots.length; index++) {
      if (!slots[index]) continue;
      await cell(page, zone, index).click();
      await page.locator('#recycle').click();
    }
  }
  assert.ok((await snapshot(page)).board.every((item) => item === null));
  await page.locator('#launch').click();
  for (let step = 0; step < 12 && (await snapshot(page)).phase === 'running'; step++)
    await advance(page, 30000);
  assert.equal((await snapshot(page)).phase, 'lost');
  assert.equal((await snapshot(page)).coreHp, 0);
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#retry').click();
  const retry = await snapshot(page);
  assert.equal(retry.phase, 'setup');
  assert.equal(retry.coreHp, retry.coreMax);
  assert.deepEqual(retry.board[4].parts, ['哪']);
  results.push(
    'Natural undefended defeat through accelerated foreground time, visible result, clean retry',
  );

  await enter(page, 'attack');
  await move(page, 'reserve', 0, 'board', 4);
  await move(page, 'reserve', 1, 'board', 5);
  await move(page, 'reserve', 2, 'board', 8);
  const sleepingId = (await snapshot(page)).board[8].id;
  await page.locator('#launch').click();
  await advance(page, 10000);
  const producing = await snapshot(page);
  assert.equal(
    producing.units.filter((unit) => unit.side === 'ally').length,
    0,
    'Fused production must take longer than a solo recipe',
  );
  assert.ok(producing.board[4].progress > 0 && producing.board[4].progress < 1);
  assert.equal(producing.board[8].progress, 0, 'Incomplete names must not produce');
  await page.locator('#pause-button').click();
  const progress = (await snapshot(page)).board[4].progress;
  await advance(page, 12000);
  assert.equal((await snapshot(page)).board[4].progress, progress);
  await page.locator('#resume').click();
  await advance(page, 10000);
  const produced = (await snapshot(page)).units.filter((unit) => unit.side === 'ally');
  assert.equal(
    produced.length,
    1,
    `Adjacent weapon must join one output instead of spawning twice: ${JSON.stringify({ time: (await snapshot(page)).time, progress: (await snapshot(page)).board[4].progress, paused: (await snapshot(page)).paused })}`,
  );
  assert.equal(produced[0].key, 'nezha');
  assert.equal(produced[0].weapon, 'fire');
  assert.ok(produced.every((unit) => unit.recipeId !== sleepingId));
  await page.screenshot({
    path: fileURLToPath(new URL('desktop-attack.png', output)),
    fullPage: true,
  });
  results.push(
    'Attack: adjacent recipe fusion, slower production, sleeping parts, paused factory and a combined troop output',
  );
  await winCampaign(page, 'attack');
  await winCampaign(page, 'defense');
  await desktop.close();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const mobile = await context.newPage();
    watch(mobile);
    await enter(mobile);
    await layout(mobile);
    if (viewport.width === 390) {
      const cdp = await context.newCDPSession(mobile);
      const before = inventory(await snapshot(mobile));
      await touchDrag(mobile, cdp, cell(mobile, 'reserve', 0), cell(mobile, 'board', 4), true);
      assert.deepEqual(
        inventory(await snapshot(mobile)),
        before,
        'Cancelled touch must preserve inventory',
      );
      await touchDrag(mobile, cdp, cell(mobile, 'reserve', 0), cell(mobile, 'board', 4));
      await touchDrag(mobile, cdp, cell(mobile, 'reserve', 1), cell(mobile, 'board', 4));
      await cdp.detach();
    } else {
      await move(mobile, 'reserve', 0, 'board', 4, true);
      await move(mobile, 'reserve', 1, 'board', 4, true);
    }
    assert.deepEqual((await snapshot(mobile)).board[4].parts, ['哪', '吒']);
    assert.equal((await snapshot(mobile)).board[4].weapon, 'fire');
    await mobile.locator('#guide-button').tap();
    await expect(mobile.locator('#guide')).toBeVisible();
    await layout(mobile);
    await mobile.locator('#close-guide').tap();
    await mobile.locator('#launch').tap();
    assert.equal((await snapshot(mobile)).phase, 'running');
    await mobile.screenshot({
      path: fileURLToPath(new URL(`mobile-${viewport.width}x${viewport.height}.png`, output)),
      fullPage: true,
    });
    results.push(
      `${viewport.width}×${viewport.height}: layout and guide overflow, touch assembly/equipment, launch${viewport.width === 390 ? ', actual CDP touch drag and cancellation' : ', tap-select placement'}`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    new URL('browser-report.json', output),
    JSON.stringify(
      {
        url,
        results,
        errors,
        note: 'Chromium desktop and touch emulation. State snapshots are read-only; battle time is accelerated. Physical devices and WeChat client performance are not tested.',
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(
  JSON.stringify(
    { results, errors, report: fileURLToPath(new URL('browser-report.json', output)) },
    null,
    2,
  ),
);
