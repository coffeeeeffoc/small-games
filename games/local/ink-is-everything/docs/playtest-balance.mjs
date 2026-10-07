import { writeFile } from 'node:fs/promises';
import { Player, snapshot, sleep } from './playtest-driver.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const report = {
  version: 3,
  date: new Date().toISOString(),
  url,
  purpose: 'Observational balance probe, not a player study or a substitute for input regression',
  input:
    'Native touch: hold attack controls without movement/dash/nova; choose earned rewards through visible buttons',
  probes: [],
  errors: [],
};
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  for (const melee of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    const driver = new Player(page, context, true);
    await driver.init();
    await driver.tap('#start-game');
    const start = await snapshot(page),
      deadline = Date.now() + 30000,
      samples = [];
    while (Date.now() < deadline) {
      const state = await snapshot(page);
      samples.push(state.player.ink);
      if (state.status !== 'playing' || state.rooms[state.roomId].cleared) break;
      if (state.pendingRewards.length) {
        await driver.release();
        await driver.tap('#reward');
        await page.waitForSelector('[data-reward]');
        const reward = state.pendingRewards[0];
        const item =
          reward.choices.find(
            (id) => state.definition.equipment[id]?.modifiers?.attackDamage > 0,
          ) || reward.choices[0];
        await driver.tap(`[data-reward="${item}"]`);
        await sleep(page, 100);
        continue;
      }
      await driver.controls(0, 0, null, !melee, melee);
      await sleep(page, 150);
    }
    await driver.release();
    const state = await snapshot(page);
    report.probes.push({
      name: melee
        ? 'Opening room: stand still and hold dry melee only'
        : 'Opening room: stand still and hold ranged attack only',
      cleared: state.rooms.arrival.cleared,
      status: state.status,
      elapsedGameSeconds: state.time - start.time,
      minimumInk: Math.min(...samples),
      finalInk: state.player.ink,
      maxInk: state.player.maxInk,
      equipment: state.equipment,
      stats: state.stats,
    });
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(
    new URL('./playtest-balance-report.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
