import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// A test-only registered chapter proves that content changes need no engine/UI edits.
// The production registry still contains only the requested first chapter.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const fixtureId = 'extension-fixture';
const fixtureTitle = '扩展验证 · 远纸庭';
const report = {
  date: new Date().toISOString(),
  url,
  input: 'Native chapter selection, keyboard movement, pause and reload; read-only snapshots',
  fixture:
    'Only the chapter-registry HTTP response adds a data fixture; no simulation state is injected.',
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.route('**/content/chapters/index.mjs', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const registry = 'const definitions = [chapterOne];';
    assert.ok(
      original.includes(registry),
      'Update this fixture if the chapter registry declaration changes',
    );
    const fixture = `
      const fixtureChapter = structuredClone(chapterOne);
      fixtureChapter.id = '${fixtureId}';
      fixtureChapter.title = '${fixtureTitle}';
      fixtureChapter.shortTitle = '远纸庭';
      fixtureChapter.description = '新增章节只需要一份数据与注册。';
      fixtureChapter.initial = { ink: 73, maxInk: 125 };
      fixtureChapter.requiredSeals = 3;
      fixtureChapter.rooms = [{
        ...chapterOne.rooms[0],
        name: '扩展试验厅', width: 1200, height: 720,
        subtitle: '来自新关卡的提示', objective: '来自新关卡的目标',
        clearedObjective: '来自新关卡的目标',
        portals: [], bridges: [], obstacles: [], objects: [], enemySpawns: [], waves: [],
        clearReward: null, isFinal: false,
      }];
      const definitions = [chapterOne, fixtureChapter];
    `;
    await route.fulfill({ response, body: original.replace(registry, fixture) });
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#choose-chapter').click();
  assert.equal(await page.locator('[data-chapter]').count(), 2);
  await page.locator(`[data-chapter="${fixtureId}"]`).click();
  await page.locator(`[data-play-chapter="${fixtureId}"]`).click();
  await page.waitForFunction((id) => window.__inkGame.snapshot().levelId === id, fixtureId);
  const snapshot = () => page.evaluate(() => window.__inkGame.snapshot());
  let state = await snapshot();
  assert.equal(state.player.ink, 73);
  assert.equal(state.player.maxInk, 125);
  assert.equal(state.definition.requiredSeals, 3);
  assert.equal(await page.locator('#seal-total').textContent(), '3');
  assert.equal(await page.locator('#chapter-name').textContent(), '远纸庭');
  assert.equal(await page.locator('#room-name').textContent(), '扩展试验厅');
  assert.equal(await page.locator('#objective').textContent(), '来自新关卡的目标');
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas').getBoundingClientRect();
    const state = window.__inkGame.snapshot(), p = state.player;
    return {
      canvas: { x: canvas.x, y: canvas.y, right: canvas.right, bottom: canvas.bottom },
      room: { width: state.rooms[state.roomId].width, height: state.rooms[state.roomId].height },
      player: window.__inkGame.worldToScreen(p.x, p.y),
      right: window.__inkGame.worldToScreen(p.x + 40, p.y),
      lower: window.__inkGame.worldToScreen(p.x, p.y + 40),
    };
  });
  assert.deepEqual(geometry.room, { width: 1200, height: 720 });
  assert.ok(
    geometry.player.x >= geometry.canvas.x && geometry.player.x <= geometry.canvas.right &&
    geometry.player.y >= geometry.canvas.y && geometry.player.y <= geometry.canvas.bottom,
  );
  assert.ok(geometry.right.x > geometry.player.x && geometry.lower.y > geometry.player.y);
  assert.ok(Math.abs((geometry.right.x - geometry.player.x) -
    (geometry.lower.y - geometry.player.y)) < 1e-6, 'The camera preserves the chapter coordinate scale');
  report.cases.push({
    name: 'Registering chapter data automatically supplies selection, metadata, objectives, resources, seal count and 1200×720 rendering',
    status: 'passed',
  });

  const before = state.player.x;
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  state = await snapshot();
  assert.ok(state.player.x > before + 20);
  await page.locator('#pause').click();
  await page.waitForFunction(() => window.__inkGame.snapshot().paused);
  const savedX = (await snapshot()).player.x;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#start-game').click();
  await page.waitForFunction((id) => window.__inkGame.snapshot().levelId === id, fixtureId);
  state = await snapshot();
  assert.equal(state.status, 'playing');
  assert.equal(state.player.x, savedX);
  assert.equal(state.player.ink, 73);
  report.cases.push({
    name: 'The same movement, pause and save adapters resume the new registered chapter without code changes',
    status: 'passed',
  });
  await mkdir(new URL('./screenshots/', import.meta.url), { recursive: true });
  await page.screenshot({
    path: new URL('./screenshots/chapter-extension.png', import.meta.url).pathname,
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
    new URL('./chapter-extension-report.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
