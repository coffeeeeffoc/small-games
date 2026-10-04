import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = fileURLToPath(new URL('../../../../test-results/surprise-kept/', import.meta.url));
const chapter = JSON.parse(
  await readFile(new URL('../content/chapters/birthday.json', import.meta.url), 'utf8'),
);
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, PORT: '4459' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(Error('server exit ' + code)));
});
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const base = 'http://127.0.0.1:4459/';
const errors = [];
const results = [];
await mkdir(evidence, { recursive: true });
const snapshot = (page) => page.evaluate(() => globalThis.__surprise.snapshot());
const center = async (locator) => {
  const b = await locator.boundingBox();
  assert(b);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function tap(page, selector) {
  await page.locator(selector).tap();
}
async function drag(page, source, target, cancel = false) {
  const a = await center(page.locator(source)),
    b = await center(page.locator(target));
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, ...a }],
    });
    for (let i = 1; i <= 5; i++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: a.x + ((b.x - a.x) * i) / 5, y: a.y + ((b.y - a.y) * i) / 5 }],
      });
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}
async function open(page, index) {
  await page.goto(base + '?level=' + (index + 1));
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
}
async function action(page, a) {
  if (a.type === 'move') {
    const s = await snapshot(page);
    if (s.selected !== a.item) await tap(page, `[data-select-item="${a.item}"]`);
    await tap(page, '#box-' + a.to);
  } else {
    if (a.type === 'screen') await tap(page, '#screen');
    await tap(page, '#character-' + a.character);
  }
}
async function checkScreen(page, width) {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    width + ' overflow',
  );
  for (const selector of [
    '#box-red',
    '#box-blue',
    '#box-green',
    '#character-blue',
    '#character-orange',
    '#pause',
    '#reveal',
  ]) {
    const b = await page.locator(selector).boundingBox();
    assert(b.x >= 0 && b.x + b.width <= width + 1, selector + ' outside viewport');
    const c = await center(page.locator(selector));
    assert(
      await page.evaluate(
        ({ x, y, selector }) => Boolean(document.elementFromPoint(x, y)?.closest(selector)),
        { ...c, selector },
      ),
      selector + ' covered',
    );
  }
}
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  for (let index = 0; index < chapter.levels.length; index++) {
    await open(page, index);
    const level = chapter.levels[index];
    for (const a of level.solution) await action(page, a);
    let s = await snapshot(page);
    assert.equal(s.state.steps, level.solution.length);
    assert.deepEqual(s.state.locations, level.goals.locations);
    for (const c of ['blue', 'orange'])
      assert.deepEqual(s.state.characters[c].beliefs, level.goals.beliefs[c]);
    if (index === 2 || index === 7) {
      await page.screenshot({ path: evidence + `/level-${index + 1}-arranged.png` });
    }
    await tap(page, '#reveal');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'success');
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('.check-list .fail')).toHaveCount(0);
    if (index === 7) await page.screenshot({ path: evidence + '/chapter-complete.png' });
    await tap(page, '[data-action="close"]');
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    results.push(`level ${index + 1}: touch solution + actual/belief goals + reveal`);
  }
  await open(page, 2);
  // The exact requested reference solution, using physical touch drags.
  await drag(page, '#item-gift', '#box-blue', true);
  assert.equal((await snapshot(page)).state.steps, 0);
  await tap(page, '#character-blue');
  await drag(page, '#item-gift', '#box-blue');
  assert.equal((await snapshot(page)).state.locations.gift, 'blue');
  await drag(page, '#screen-prop', '#character-orange');
  assert.equal((await snapshot(page)).state.screenTarget, 'orange');
  await drag(page, '#item-gift', '#box-green');
  await tap(page, '#character-blue');
  assert.deepEqual((await snapshot(page)).state.characters.orange.beliefs, { gift: 'blue' });
  await tap(page, '#undo');
  await tap(page, '#undo');
  let s = await snapshot(page);
  assert.equal(s.state.locations.gift, 'blue');
  assert.equal(s.state.screenTarget, 'orange');
  assert.equal(s.state.characters.blue.present, false);
  await tap(page, '#box-green');
  await tap(page, '#character-blue');
  const beforeReplay = await snapshot(page);
  await tap(page, '#timeline');
  await expect(page.locator('.timeline-list li')).toHaveCount(5);
  await tap(page, '[data-action="replay"]');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  assert.deepEqual((await snapshot(page)).state, beforeReplay.state);
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  // Explicit level query intentionally restarts; remove it to test saved continuation.
  await tap(page, '#character-blue');
  await page.goto(base);
  await expect(page.locator('#game')).toHaveAttribute('data-steps', '1');
  await tap(page, '#pause');
  await expect(page.locator('#resume')).toBeVisible();
  await tap(page, '#resume');
  results.push(
    'native touch drag, pointercancel, one-use screen, full undo, replay, resume and pause',
  );

  // Losing checks explain the exact wrong records, then allow correction.
  await open(page, 1);
  await tap(page, '#box-blue');
  await tap(page, '#reveal');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'failure');
  await expect(page.locator('.check-list .fail')).toHaveCount(1);
  await tap(page, '[data-action="close"]');
  await tap(page, '#undo');
  await expect(page.locator('#game')).toHaveAttribute('data-steps', '0');
  await tap(page, '#memory-blue');
  await expect(page.locator('#modal-body')).toContainText('开场前');
  await tap(page, '#modal-close');
  await tap(page, '#hint');
  await tap(page, '[data-action="hint-more"]');
  await expect(page.locator('.step-badge')).toContainText('2 / 3');
  await tap(page, '#modal-close');
  results.push('failure explanation, memory inspection, free hints and correction');

  // Future chapter loaded through actual file input, then played through.
  await tap(page, '#level-menu');
  const extra = structuredClone(chapter.levels[0]);
  extra.id = 'custom-09';
  extra.title = '<新故事>';
  delete extra.solution;
  await page.locator('#chapter-file').setInputFiles({
    name: 'chapter.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ id: 'custom', title: '我的章节', levels: [extra] })),
  });
  await expect(page.locator('#import-message')).toContainText('已加入 1 关');
  await tap(page, '[data-level="8"]');
  await expect(page.locator('#level-title')).toHaveText('<新故事>');
  await tap(page, '#box-blue');
  await tap(page, '#reveal');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'success');
  results.push(
    'ninth JSON level imported and played without runtime edits; title rendered as text',
  );
  await context.close();

  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
    [1280, 900],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await open(p, 2);
    // Short landscape view scrolls vertically; core touch targets stay reachable.
    if (height < 500) await p.locator('#reveal').scrollIntoViewIfNeeded();
    else await checkScreen(p, width);
    await p.screenshot({ path: evidence + `/layout-${width}.png`, fullPage: true });
    await tap(p, '#pause');
    await expect(p.locator('#modal')).toBeVisible();
    await tap(p, '#resume');
    await ctx.close();
    results.push(`${width}x${height}: layout and pause`);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    evidence + '/report.json',
    JSON.stringify({ results, errors, physicalDeviceTested: false }, null, 2),
  );
  console.log('PASS ' + results.join('\nPASS '));
} finally {
  await browser.close();
  server.kill();
}
