import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const url = process.env.URBAN_URL || 'http://127.0.0.1:4330';
const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  errors = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const results = [];
  // Separate local playthroughs, deliberately NOT presented as a multiplayer test.
  for (const branch of ['greedy', 'shotgun']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.locator('#start').click();
    let held = '',
      cleared = false,
      captured = false;
    const deadline = Date.now() + 55000;
    while (Date.now() < deadline) {
      const s = await page.evaluate(() => window.urbanSnapshot());
      if (s.phase !== 'playing' || (branch === 'shotgun' && s.tick >= 1320)) break;
      let target = 0;
      if (s.tick >= 180 && s.tick < 420) target = -3.5;
      if (branch === 'greedy' && s.tick >= 750 && s.tick < 990) target = 3.5;
      if (branch === 'shotgun' && s.tick >= 1080 && s.tick < 1350) target = 3.5;
      if (branch === 'shotgun' && s.tick > 820 && !cleared) {
        await page.keyboard.press('Space');
        cleared = true;
      }
      const next = s.x < target - 0.18 ? 'd' : s.x > target + 0.18 ? 'a' : '';
      if (held !== next) {
        if (held) await page.keyboard.up(held);
        if (next) await page.keyboard.down(next);
        held = next;
      }
      if (branch === 'greedy' && s.tick > 805 && !captured) {
        await page.screenshot({ path: `${out}/mobile-greedy-pressure.png` });
        captured = true;
      }
      await sleep(80);
    }
    if (held) await page.keyboard.up(held);
    const state = await page.evaluate(() => window.urbanSnapshot());
    if (branch === 'greedy') {
      assert.equal(state.phase, 'lost', JSON.stringify(state));
      assert.ok(state.stats.lost >= 3);
    } else {
      assert.ok(state.grants.some((g) => g.id === 'bus-weapon:0'));
      assert.equal(state.supplies.find((s) => s.id === 'rescue-lock').status, 'excluded');
      assert.match(await page.locator('.weapon-readout').innerText(), /霰弹枪 ×3/);
    }
    await page.screenshot({ path: `${out}/mobile-${branch}-result.png` });
    results.push({ branch, state });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/branches.json`,
    JSON.stringify(
      {
        passed: true,
        note: 'Two independent offline playthroughs with native keyboard input; no time acceleration or state edits; not multiplayer.',
        errors,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        results: results.map((r) => ({
          branch: r.branch,
          phase: r.state.phase,
          tick: r.state.tick,
          grants: r.state.grants,
          lost: r.state.stats.lost,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
