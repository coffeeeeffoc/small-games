import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [],
  errors = [];
const milestones = [
  [33, 'rifle', 0],
  [52, 'death', 0],
  [260, 'supply', 1],
  [535, 'grenade', 0],
  [555, 'blast', 0],
  [766, 'runners', 0],
  [1090, 'choice', 2],
  [1400, 'shields', 0],
  [1635, 'shotgun', 0],
  [1705, 'tiers', 1],
  [2170, 'boss', 0],
];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  page.on('pageerror', (e) => errors.push(e.message));
  // Browser-side DOM input scheduling avoids missing supply windows during slow screenshots.
  // No direct simulation writes, clock acceleration or synthetic rewards.
  await page.addInitScript((milestones) => {
    let held = '',
      cleared = false,
      index = 0;
    const key = (code, type) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    window.visualCheckpoint = null;
    const timer = setInterval(() => {
      const s = window.urbanSnapshot?.();
      if (!s?.started || s.paused) return;
      if (s.phase !== 'playing') {
        window.visualCheckpoint = 'failed';
        clearInterval(timer);
        return;
      }
      if (index < milestones.length && s.tick >= milestones[index][0]) {
        if (held) key(held, 'keyup');
        held = '';
        key('Escape', 'keydown');
        key('Escape', 'keyup');
        window.visualCheckpoint = milestones[index++][1];
        return;
      }
      let target = 0;
      if (s.tick < 420) target = -3.5;
      if (s.tick >= 1080 && s.tick < 1350) target = 3.5;
      if (s.bossWarning) target = s.bossWarning.x >= 0 ? -3 : 3;
      if (s.tick > 820 && !cleared) {
        key('Space', 'keydown');
        key('Space', 'keyup');
        cleared = true;
      }
      const next = s.x < target - 0.18 ? 'KeyD' : s.x > target + 0.18 ? 'KeyA' : '';
      if (next !== held) {
        if (held) key(held, 'keyup');
        if (next) key(next, 'keydown');
        held = next;
      }
    }, 50);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }, milestones);
  await page.goto(process.env.URBAN_URL || 'http://127.0.0.1:4330');
  await page.locator('#start').click();
  // Actual offline-paused frames; hide only the menu to inspect the scene below it.
  const capture = (name) =>
    page.screenshot({
      path: `${out}/visual-${name}.png`,
      style: '.modal { visibility: hidden !important; }',
      animations: 'disabled',
    });
  const intersects = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const [, name, expectedCards] of milestones) {
    await page.waitForFunction(() => window.visualCheckpoint !== null, null, { timeout: 40000 });
    assert.equal(await page.evaluate(() => window.visualCheckpoint), name);
    const frozen = await page.evaluate(() => window.urbanSnapshot());
    assert.equal(frozen.paused, true);
    if (name === 'rifle') {
      assert.equal(await page.locator('#pause svg rect').count(), 2);
      assert.equal((await page.locator('#pause').innerText()).trim(), '');
    }
    if (expectedCards) {
      for (const [width, height] of [
        [390, 844],
        [360, 640],
        [844, 390],
        [1440, 960],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
        const layout = await page.evaluate(() => {
          const rect = (el) => {
            const b = el.getBoundingClientRect();
            return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
          };
          const stage = rect(document.querySelector('.stage'));
          return [...document.querySelectorAll('.supply-card')].map((card) => ({
            card: rect(card),
            reward: rect(card.querySelector('.box-reward')),
            count: rect(card.querySelector('.box-count')),
            track: rect(card.querySelector('.box-track')),
            stage,
            anchor: stage.top + parseFloat(card.style.top),
            hud: rect(document.querySelector('.hud')),
            status: rect(document.querySelector('.focus-status')),
            controls: rect(document.querySelector('.battle-bottom')),
            overflow: card.scrollWidth > card.clientWidth,
          }));
        });
        assert.equal(layout.length, expectedCards, `${name}: active cards`);
        for (const x of layout) {
          assert.ok(
            x.reward.bottom <= x.count.top && x.count.bottom <= x.track.top,
            'separate reward and progress rows',
          );
          assert.ok(
            x.card.left >= x.stage.left && x.card.right <= x.stage.right && !x.overflow,
            'card fits width',
          );
          assert.ok(
            !intersects(x.card, x.hud) &&
              !intersects(x.card, x.controls) &&
              !intersects(x.card, x.status),
            `${name} ${width}x${height}: card avoids HUD`,
          );
          assert.ok(
            height < 550 && width > height
              ? x.card.top >= x.anchor + 30
              : x.card.bottom <= x.anchor - 15,
            'leave room for the 3D reward',
          );
        }
        if (layout.length === 2)
          assert.ok(!intersects(layout[0].card, layout[1].card), 'choice cards stay separate');
        await capture(`${name}-${width}x${height}`);
        checks.push({ check: `${name} ${width}x${height}`, passed: true, layout });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    } else await capture(name);
    assert.equal(
      await page.evaluate(() => window.urbanSnapshot().tick),
      frozen.tick,
      'pause freezes simulation during screenshots',
    );
    assert.ok(frozen.render.effectParts <= 280, 'bounded effect parts');
    checks.push({
      check: name,
      tick: frozen.tick,
      passed: true,
      effects: frozen.render.effectParts,
      events: frozen.feedbackEvents,
      audio: frozen.audio,
    });
    if (name === 'boss') break;
    await page.evaluate(() => {
      window.visualCheckpoint = null;
    });
    await page.locator('#resume').click();
  }
  const state = await page.evaluate(() => window.urbanSnapshot());
  assert.ok(
    state.grants.some((g) => g.id === 'safe-weapon:0'),
    'earn grenade',
  );
  assert.ok(
    state.grants.some((g) => g.id === 'bus-weapon:0'),
    'earn shotgun',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/visual.json`,
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        note: 'DOM KeyboardEvent play; no simulation state edits or clock acceleration. Captures use real offline pause with its menu hidden via screenshot style.',
        checks,
        state,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks: checks.length, state }, null, 2));
} finally {
  await browser.close();
}
