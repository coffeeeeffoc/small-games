import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const output = new URL('../../../../.scratch/night-merge-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const server = process.env.GAME_URL
  ? null
  : await preview({
      root: fileURLToPath(new URL('../', import.meta.url)),
      preview: { host: '127.0.0.1', port: 0 },
    });
const url = process.env.GAME_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const results = [];
function watch(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
}
const slot = (page, area, index) => page.locator(`[data-area="${area}"][data-slot="${index}"]`);
const locate = (page, location) => slot(page, location.area, location.index);
async function enter(page) {
  await page.goto(url);
  await expect(page).toHaveTitle('合成守夜人 · 守到天明');
  await page.locator('#start-night').click();
  await expect(page.locator('.board .slot')).toHaveCount(12);
}
async function layout(page, controlsInView = true) {
  const measure = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.game, .board, .controls, dialog[open]')].map(
      (e) => {
        const r = e.getBoundingClientRect();
        return {
          name: e.className || e.tagName,
          left: r.left,
          right: r.right,
          width: e.clientWidth,
          content: e.scrollWidth,
        };
      },
    );
    const controls = document.querySelector('.controls').getBoundingClientRect();
    return {
      viewport: innerWidth,
      height: innerHeight,
      page: document.documentElement.scrollWidth,
      boxes,
      controlsBottom: controls.bottom,
    };
  });
  assert.ok(measure.page <= measure.viewport + 1, JSON.stringify(measure));
  for (const b of measure.boxes)
    assert.ok(
      b.left >= -1 && b.right <= measure.viewport + 1 && b.content <= b.width + 2,
      JSON.stringify(b),
    );
  if (controlsInView)
    assert.ok(
      measure.controlsBottom <= measure.height + 1,
      `controls below viewport: ${JSON.stringify(measure)}`,
    );
}
async function drag(page, from, to) {
  const a = await locate(page, from).boundingBox();
  const b = await locate(page, to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}
async function advance(page, ms) {
  await page.clock.fastForward(ms);
  await page.clock.runFor(100);
}
async function units(page) {
  return page.locator('.slot').evaluateAll((slots) =>
    slots.map((s) => {
      const [id, kind, level] = (s.dataset.signature || '').split('-');
      return {
        area: s.dataset.area,
        index: Number(s.dataset.slot),
        unit: id ? { id: Number(id), kind, level: Number(level) } : null,
      };
    }),
  );
}
async function move(page, from, to) {
  await locate(page, from).click();
  await locate(page, to).click();
}
async function manage(page) {
  for (let n = 0; n < 25; n++) {
    const all = await units(page);
    let pair;
    for (let i = 0; i < all.length && !pair; i++) {
      if (!all[i].unit || all[i].unit.level >= 3) continue;
      const other = all
        .slice(i + 1)
        .find((b) => b.unit?.kind === all[i].unit.kind && b.unit.level === all[i].unit.level);
      if (other) pair = [all[i], other];
    }
    if (!pair) break;
    await move(page, ...pair);
  }
  const strength = (u) =>
    u ? 2.5 ** u.level * { archer: 1.1, mage: 1.15, frost: 0.85, shield: 0.5 }[u.kind] : 0;
  for (let i = 0; i < 4; i++) {
    const all = await units(page);
    const target = all.find((s) => s.area === 'field' && s.index === i);
    const best = all
      .filter((s) => s.area === 'board' && strength(s.unit) > strength(target.unit))
      .sort((a, b) => strength(b.unit) - strength(a.unit))[0];
    if (best) await move(page, best, target);
  }
  for (let i = 0; i < 12 && (await page.locator('#summon').isEnabled()); i++)
    await page.locator('#summon').click();
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  watch(page);
  await enter(page);
  await layout(page);
  await drag(page, { area: 'board', index: 0 }, { area: 'board', index: 1 });
  await expect(page.locator('.board .occupied')).toHaveCount(1);
  await expect(slot(page, 'board', 1)).toHaveAttribute('aria-label', /2 阶/);
  await page.waitForTimeout(330);
  await move(page, { area: 'board', index: 1 }, { area: 'field', index: 0 });
  await expect(page.locator('.field .occupied')).toHaveCount(1);
  // Pointer cancellation and window blur never remove a held guard.
  const source = slot(page, 'field', 0);
  const box = await source.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y - 40);
  await expect(page.locator('#drag-ghost')).toHaveClass('visible');
  await source.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(page.locator('#drag-ghost')).not.toHaveClass('visible');
  await expect(source).toHaveClass(/occupied/);
  await page.locator('#begin-wave').click();
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'playing');
  await page.waitForTimeout(4200);
  assert.notEqual(await page.locator('#clock').innerText(), '00:00');
  await page.locator('#skill').click();
  await expect(page.locator('#skill-time')).toContainText('秒');
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await expect(page.getByRole('button', { name: '开启声音', exact: true })).toBeVisible();
  await page.clock.install();
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  const frozen = await page.locator('#clock').innerText();
  const hp = await page.locator('#hp-text').innerText();
  await advance(page, 15000);
  assert.equal(await page.locator('#clock').innerText(), frozen);
  assert.equal(await page.locator('#hp-text').innerText(), hp);
  await page.getByRole('button', { name: '继续守夜', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('dialog')).toBeVisible();
  await page.getByRole('button', { name: '继续守夜', exact: true }).click();
  // Actual UI controls, accelerated foreground clock, no direct state manipulation.
  let blessings = 0;
  for (let i = 0; i < 155; i++) {
    const phase = await page.locator('.game').getAttribute('data-phase');
    if (phase === 'won' || phase === 'lost') break;
    if (phase === 'buff') {
      const choices = await page
        .locator('[data-buff]')
        .evaluateAll((els) => els.map((e) => e.dataset.buff));
      assert.equal(choices.length, 3);
      const id = [
        'pierce',
        'quickshot',
        'arcane',
        'bounty',
        'renewal',
        'lucky',
        'frostbite',
        'thorns',
      ].find((b) => choices.includes(b));
      await page.locator(`[data-buff="${id}"]`).click();
      blessings++;
      await expect(page.locator('dialog')).not.toBeVisible();
    }
    await manage(page);
    if (await page.locator('#skill').isEnabled()) await page.locator('#skill').click();
    await advance(page, 2000);
    if (i === 25)
      await page.screenshot({ path: fileURLToPath(new URL('desktop-battle.png', output)) });
  }
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'won');
  assert.equal(blessings, 2);
  await expect(page.locator('#panel-title')).toHaveText('天亮了，守夜人。');
  await page.screenshot({ path: fileURLToPath(new URL('victory.png', output)) });
  await page.getByRole('button', { name: '收下余烬 · 回到手记', exact: true }).click();
  await page.locator('[data-action="talent"]').click();
  await page.getByRole('button', { name: '开启下一夜', exact: true }).click();
  await expect(page.locator('#hp-text')).toHaveText('110 / 110');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('night-merge.profile.v1')),
  );
  assert.equal(saved.wins, 1);
  assert.equal(saved.talent, 1);
  assert.equal(saved.runs, 1);
  await page.reload();
  await page.locator('#start-night').click();
  await expect(page.locator('#hp-text')).toHaveText('110 / 110');
  await expect(page.getByRole('button', { name: '开启声音', exact: true })).toBeVisible();
  results.push(
    'desktop drag merge, deploy, cancel, skill/audio, pause/blur, 10-wave victory, two buffs, talent and reload',
  );

  // Leave gate undefended using real sell controls, then exercise one revive and retry.
  await move(page, { area: 'board', index: 0 }, { area: 'field', index: 0 });
  await page.locator('#begin-wave').click();
  await slot(page, 'field', 0).click();
  const goldBefore = Number(await page.locator('#gold').innerText());
  await page.locator('#sell').click();
  assert.equal(Number(await page.locator('#gold').innerText()), goldBefore + 6);
  for (
    let i = 0;
    i < 15 && (await page.locator('.game').getAttribute('data-phase')) !== 'lost';
    i++
  )
    await advance(page, 10000);
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'lost');
  await page.locator('[data-action="revive"]').click();
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'playing');
  for (
    let i = 0;
    i < 15 && (await page.locator('.game').getAttribute('data-phase')) !== 'lost';
    i++
  )
    await advance(page, 10000);
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'lost');
  await expect(page.locator('[data-action="revive"]')).toHaveCount(0);
  const finalLossSave = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('night-merge.profile.v1')),
  );
  assert.equal(finalLossSave.runs, 2, 'a final defeat is saved before leaving its result screen');
  await page.getByRole('button', { name: '收下余烬 · 再守一夜', exact: true }).click();
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.board .occupied')).toHaveCount(2);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('night-merge.profile.v1')).embers),
    finalLossSave.embers,
    'restarting must not pay the result twice',
  );
  const events = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('night-merge.metrics.v1')),
  );
  for (const name of [
    'summon',
    'merge',
    'board_occupancy',
    'buff_choice',
    'boss_reached',
    'run_end',
    'revive',
    'visit',
  ])
    assert.ok(
      events.some((e) => e.type === name),
      `missing telemetry ${name}`,
    );
  assert.ok(events.some((e) => e.type === 'revive' && e.source === 'free'));
  results.push(
    'defeat, exact sell reward, single free revive, second defeat, restart and telemetry',
  );
  await context.close();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const mobile = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const p = await mobile.newPage();
    watch(p);
    await enter(p);
    await layout(p, viewport.height > viewport.width);
    await slot(p, 'board', 0).tap();
    await slot(p, 'board', 1).tap();
    await expect(slot(p, 'board', 1)).toHaveAttribute('aria-label', /2 阶/);
    await slot(p, 'board', 1).tap();
    await slot(p, 'field', 1).tap();
    await expect(p.locator('.field .occupied')).toHaveCount(1);
    await p.locator('#summon').tap();
    const cdp = await mobile.newCDPSession(p);
    const a = await slot(p, 'board', 0).boundingBox();
    const b = await slot(p, 'board', 4).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
    });
    // A zero-duration CDP jump makes Chrome suppress the following tap as a gesture.
    // Model a short real finger drag; no delay is needed after touchEnd.
    for (let step = 1; step <= 4; step++) {
      await p.waitForTimeout(45);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: a.x + a.width / 2 + ((b.x + b.width / 2 - a.x - a.width / 2) * step) / 4,
            y: a.y + a.height / 2 + ((b.y + b.height / 2 - a.y - a.height / 2) * step) / 4,
          },
        ],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(slot(p, 'board', 4)).toHaveClass(/occupied/);
    await expect(slot(p, 'board', 0)).not.toHaveClass(/occupied/);
    await p.screenshot({
      path: fileURLToPath(new URL(`mobile-${viewport.width}x${viewport.height}.png`, output)),
      fullPage: true,
    });
    await p.locator('#help').tap();
    await layout(p, false);
    await p.getByRole('button', { name: '继续守夜', exact: true }).tap();
    await p.evaluate(() => localStorage.setItem('night-merge.profile.v1', '{broken'));
    await p.reload();
    await p.locator('#start-night').click();
    await expect(p.locator('#hp-text')).toHaveText('100 / 100');
    results.push(
      `${viewport.width}x${viewport.height}: layout, touch merge/deploy/drag, help, corrupt-save recovery`,
    );
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        url,
        results,
        errors,
        note: 'Chromium desktop/mobile emulation. Full campaign uses accelerated foreground clock and UI input; not a physical-device or long-running performance test.',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { results, errors, report: fileURLToPath(new URL('report.json', output)) },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => (server ? server.httpServer.close(resolve) : resolve()));
}
