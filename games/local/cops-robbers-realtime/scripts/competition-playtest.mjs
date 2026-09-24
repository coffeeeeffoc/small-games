import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import rule from '../../../../services/runtime-api/rules/realtime.mjs';

// This is a Canvas/real-engine input test. PostgreSQL, HTTP rooms and platform SDKs are tested by the shared integration suite.
const base = process.env.GAME_URL || 'http://127.0.0.1:43690';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL === 'bundled' ? undefined : 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts', { recursive: true });
try {
  await page.route('**/competition-canvas-check.html', route => route.fulfill({ contentType: 'text/html',
    body: '<meta name="viewport" content="width=device-width"><body style="margin:0"><canvas style="touch-action:none" width="390" height="720"></canvas></body>' }));
  await page.goto(`${base}/competition-canvas-check.html`);
  await page.evaluate(async () => {
    const { createRenderer } = await import('./src/competition-renderer.js');
    window.renderer = createRenderer(); window.actions = [];
    document.querySelector('canvas').addEventListener('pointerup', event => {
      const action = renderer.tap(event.clientX, event.clientY, window.state);
      if (action) actions.push(action);
      window.hits = renderer.draw(document.querySelector('canvas').getContext('2d'), 390, 720, window.state);
    });
  });
  const state = rule.initial(0, 'classic', 'pursuer'), level = state.game.level;
  const draw = (seat = 0) => page.evaluate(state => {
    window.state = state;
    window.hits = renderer.draw(document.querySelector('canvas').getContext('2d'), 390, 720, state);
  }, rule.view(state, seat));
  async function tapLabel(label) {
    const hit = await page.evaluate(label => [...hits].reverse().find(hit => hit.label === label), label);
    assert.ok(hit, label);
    await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
  }
  async function order(actor, point, elapsed, seat = 0) {
    await draw(seat); await tapLabel(`选择 ${actor + 1} 号${seat === 0 ? '追逐' : '突围'}队员`);
    const exact = level.nodes.findIndex(node => node.x === point.x && node.y === point.y);
    if (exact >= 0) await tapLabel(`道路 ${exact + 1}`);
    else {
      // Public road-node hitboxes establish the screen/world mapping without inspecting renderer internals.
      const [a, b] = await page.evaluate(() => [hits.find(hit => hit.label === '道路 1'), hits.find(hit => hit.label === '道路 2')]);
      const n1 = level.nodes[0], n2 = level.nodes[1];
      const scale = Math.abs(n2.x - n1.x) > 0 ? (b.x - a.x) / (n2.x - n1.x) : (b.y - a.y) / (n2.y - n1.y);
      await page.touchscreen.tap(a.x + a.w / 2 + (point.x - n1.x) * scale, a.y + a.h / 2 + (point.y - n1.y) * scale);
    }
    const input = await page.evaluate(() => actions.shift());
    assert.ok(input, 'touch produces an actual server command');
    assert.equal(input.actor, actor);
    assert.equal(input.type, 'move');
    rule.action(state, input, elapsed, seat);
  }
  await draw(1);
  await tapLabel('原地留守');
  assert.equal(await page.evaluate(() => actions.length), 0, 'the second side cannot order during the opening lead');
  for (let actor = 0; actor < state.game.cops.length; actor++) await order(actor, state.game.robbers[0], 0);
  rule.advance(state, 2000);
  await draw(1);
  await tapLabel('原地留守');
  const runnerInput = await page.evaluate(() => actions.shift());
  assert.deepEqual(runnerInput, { type: 'hold', actor: 0 });
  rule.action(state, runnerInput, 2000, 1);
  for (let elapsed = 2050; elapsed <= rule.durationMs && !rule.result(state).finished; elapsed += 50) {
    rule.advance(state, elapsed);
  }
  assert.equal(state.game.phase, 'won', 'real touch commands must physically surround the stationary opposing runner');
  assert.deepEqual(rule.result(state, 0), { finished: true, eligible: true, score: 3, secondary: 0 });
  assert.deepEqual(rule.result(state, 1), { finished: true, eligible: true, score: 0, secondary: 0 });
  await draw();
  assert.equal(await page.evaluate(() => renderer.tap(10, 100, state)), null, 'finished board ignores input');
  checks.push('390px pure Canvas accepts both teams through current actor/seat commands, gates the two-second opening, and physically settles 3/0; no position/score injection');
  await page.screenshot({ path: 'artifacts/competition-canvas-390.png' });
  await page.goto(base);
  for (const [width, height] of [[320, 740], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.reload(); await page.locator('#start-button').tap();
    const layout = await page.evaluate(() => ({ brand: getComputedStyle(document.querySelector('.brand')).display,
      board: document.querySelector('canvas').getBoundingClientRect().toJSON(),
      buttons: [...document.querySelectorAll('.cop-card,#hold-button,#pause-button,#fullscreen-button')].map(element => element.getBoundingClientRect().toJSON()),
      scroll: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(layout.brand, 'none'); assert.equal(layout.overflow, false); assert.ok(layout.scroll <= height + 1);
    assert.ok(layout.board.height > 200);
    for (const button of layout.buttons) assert.ok(button.height >= 44 && button.y >= 0 && button.bottom <= height, JSON.stringify(button));
    await page.locator('#pause-button').tap();
    assert.equal(await page.getAttribute('body', 'data-phase'), 'paused');
    await page.locator('#resume-button').tap();
    checks.push(`${width}x${height} focused single-player layout fits controls, hides branding and preserves pause/resume`);
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('competition-visibility', { detail: { open: true } })));
  const paused = await page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
  assert.equal(paused.phase, 'paused');
  assert.equal(await page.locator('dialog[open]').count(), 0, 'the single-player pause dialog must not cover the PK surface');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(async () => (await import('./src/main.js')).getSnapshot().time), paused.time);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('competition-visibility', { detail: { open: false } })));
  assert.equal(await page.locator('#pause-dialog').getAttribute('open'), '');
  await page.locator('#resume-button').tap();
  assert.equal(await page.getAttribute('body', 'data-phase'), 'playing');
  checks.push('opening PK pauses single player without a covering dialog; closing PK retains the round and requires explicit resume');
  assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  const report = { testedAt: new Date().toISOString(), type: 'browser-input-and-real-rule; not HTTP/DB/native SDK validation', checks, result: rule.result(state), errors };
  await writeFile('artifacts/competition-canvas-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
