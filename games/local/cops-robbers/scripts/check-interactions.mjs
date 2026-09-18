import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, stateKey, step, legalPlans } from '../src/engine.js';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../outputs');
const base = (process.env.BASE_URL || 'http://127.0.0.1:43420').replace(/\/$/, '');
const report = { started: new Date().toISOString(), base, passed: false, checks: [] };
await mkdir(output, { recursive: true });
let browser;
async function load(page, id, reduced = true) {
  await page.goto(`${base}/?level=${id}${reduced ? '&motion=reduce' : ''}`);
  assert.match(await page.title(), /围捕小队/, 'Wrong application on the test port');
  await page.waitForFunction(id => document.body.dataset.level === String(id) && document.body.dataset.phase === 'planning', id);
  assert.equal(await page.getByTestId('execute').count(), 0, 'No action confirmation button');
}
async function snapshot(page, id) {
  return page.evaluate(({ cops, robbers }) => ({
    cops: cops.map((_, i) => Number(document.getElementById(`cop-actor-${i}`).dataset.node)),
    robbers: robbers.map((_, i) => {
      const actor = document.getElementById(`robber-actor-${i}`);
      return actor ? Number(actor.dataset.node) : null;
    }),
    turn: Number(document.body.dataset.turn), phase: document.body.dataset.phase,
    remaining: Number(document.body.dataset.remaining), escaped: Number(document.body.dataset.escaped),
  }), { cops: levels[id - 1].cops, robbers: levels[id - 1].robbers });
}
function expectedView(state) {
  return { cops: state.cops, robbers: state.robbers.map(n => n < 0 ? null : n), turn: state.turn,
    phase: state.robbers.includes(-2) ? 'lost' : state.robbers.every(n => n === -1) ? 'won' : 'planning',
    remaining: state.robbers.filter(n => n >= 0).length, escaped: state.robbers.filter(n => n === -2).length };
}
async function finished(page, turn) {
  await page.waitForFunction(turn => Number(document.body.dataset.turn) === turn
    && ['planning', 'won', 'lost'].includes(document.body.dataset.phase), turn, { timeout: 12000 });
}
function movedCop(state, targets) {
  assert.ok(targets.filter((n, i) => n !== state.cops[i]).length <= 1);
  return Math.max(0, targets.findIndex((n, i) => n !== state.cops[i]));
}
async function select(page, state, targets) {
  const index = movedCop(state, targets);
  await page.getByTestId(`cop-${index}`).click();
  return page.getByTestId(`node-${targets[index]}`);
}
async function move(page, id, state, targets) {
  const expected = step(levels[id - 1], state, targets).state;
  await (await select(page, state, targets)).click();
  await finished(page, expected.turn);
  assert.deepEqual(await snapshot(page, id), expectedView(expected));
  return expected;
}
async function replay(page, id, path) {
  let state = initialState(levels[id - 1]);
  for (const targets of path) state = await move(page, id, state, targets);
  return state;
}
function recordedCase(predicate) {
  for (const map of levels) {
    let state = initialState(map), path = [];
    for (const plan of solutions[map.id]) {
      const next = step(map, state, plan).state; path.push(plan);
      if (predicate(state, next)) return { id: map.id, path, before: state, state: next };
      state = next;
    }
  }
  assert.fail('The level catalogue lacks the required interaction scenario');
}
function lossCase() {
  // Look for an actual missed escape, then replay the inputs through the UI.
  for (const map of levels) {
    let state = initialState(map), path = [];
    for (let i = 0; i < 16; i++) {
      path.push([...state.cops]); state = step(map, state, state.cops).state;
      if (state.robbers.includes(-2)) return { id: map.id, path, state };
      if (state.robbers.every(n => n === -1)) break;
    }
  }
  for (const map of levels) {
    const queue = [{ state: initialState(map), path: [] }], visited = new Set();
    for (let i = 0; i < queue.length && i < 3000; i++) {
      const current = queue[i];
      if (current.path.length >= 6) continue;
      for (const plan of legalPlans(map, current.state)) {
        const state = step(map, current.state, plan).state, path = [...current.path, plan], key = stateKey(state);
        if (state.robbers.includes(-2)) return { id: map.id, path, state };
        if (state.robbers.every(n => n === -1) || visited.has(key)) continue;
        visited.add(key); queue.push({ state, path });
      }
    }
  }
  assert.fail('No real route lets a robber escape');
}
async function point(page, x, y) {
  return page.getByTestId('board').evaluate((svg, { x, y }) => {
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y };
  }, { x, y });
}
async function drag(page, cop, destination, cancel = false, hold = 0) {
  const box = await page.getByTestId(`cop-${cop}`).boundingBox();
  await page.evaluate(() => document.getElementById('board').addEventListener('pointerdown', event => { window.testPointerId = event.pointerId; }, { once: true }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  assert.equal(await page.locator('.drag-line').count(), 1, 'Real drag must show its guide');
  if (hold) await page.waitForTimeout(hold);
  if (cancel) await page.getByTestId('board').dispatchEvent('pointercancel', {
    pointerId: await page.evaluate(() => window.testPointerId), pointerType: 'mouse', bubbles: true,
  });
  await page.mouse.up();
  assert.equal(await page.locator('.drag-line').count(), 0, 'Drag guide must clear');
}
async function tabTo(page, testId) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(id => document.activeElement?.dataset.testid === id, testId)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`Keyboard could not reach ${testId}`);
}
async function check(name, run, { init, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion });
  if (init) await context.addInitScript(init);
  const page = await context.newPage(), entry = { name, passed: false, errors: [] };
  page.on('pageerror', error => entry.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') entry.errors.push(message.text()); });
  try {
    entry.details = await run(page); assert.deepEqual(entry.errors, []); entry.passed = true;
    console.log(`PASS ${name}`);
  } catch (error) {
    entry.failure = error.stack || String(error);
    await page.screenshot({ path: resolve(output, `escape-interactions-failure-${report.checks.length + 1}.png`), fullPage: true }).catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { report.checks.push(entry); await context.close(); }
}

try {
  let launchError;
  for (const channel of process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ['chrome', 'msedge']) {
    try { browser = await chromium.launch({ channel, headless: true }); report.channel = channel; break; }
    catch (error) { launchError = error; }
  }
  if (!browser) throw launchError;
  const moving = recordedCase((before, after) => after.robbers.some((n, i) => n >= 0 && before.robbers[i] !== n));
  const partial = recordedCase((_, after) => after.robbers.includes(-1) && after.robbers.some(n => n >= 0));
  const losing = lossCase();
  report.scenarios = { robberResponse: moving, partialCapture: partial, escape: losing };

  await check('one destination click moves a cop and all robbers without confirmation', async page => {
    await load(page, moving.id); await replay(page, moving.id, moving.path);
    assert.equal((await snapshot(page, moving.id)).turn, moving.path.length);
    return { level: moving.id, before: moving.before, after: moving.state };
  });

  await check('a real exit causes defeat; undo and retry recover the correct patrol', async page => {
    await load(page, losing.id);
    const before = await replay(page, losing.id, losing.path.slice(0, -1));
    await move(page, losing.id, before, losing.path.at(-1));
    await page.getByTestId('defeat').waitFor({ state: 'visible' });
    assert.equal(await page.getByTestId('victory').isVisible(), false, 'Escaped robbers are not captured robbers');
    await page.screenshot({ path: resolve(output, 'escape-defeat.png'), fullPage: true });
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')));
    assert.equal(save.completed?.[losing.id], undefined, 'Defeat must not save a completion');
    await page.getByTestId('undo-loss').click();
    assert.deepEqual(await snapshot(page, losing.id), expectedView(before));
    assert.equal(await page.getByTestId('defeat').isVisible(), false);
    await move(page, losing.id, before, losing.path.at(-1));
    await page.getByTestId('retry').click();
    assert.deepEqual(await snapshot(page, losing.id), expectedView(initialState(levels[losing.id - 1])));
    return { level: losing.id, inputs: losing.path, escaped: losing.state.robbers.filter(n => n === -2).length };
  });

  await check('a partial capture keeps the remaining robbers active and does not win', async page => {
    await load(page, partial.id); await replay(page, partial.id, partial.path);
    assert.equal(await page.getByTestId('victory').isVisible(), false);
    assert.equal((await snapshot(page, partial.id)).phase, 'planning');
    return { level: partial.id, state: partial.state };
  });

  await check('hints highlight a suggestion without consuming any move', async page => {
    await load(page, 1); const before = await snapshot(page, 1);
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('hint').click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="hint"]').disabled, null, { timeout: 13000 });
      assert.deepEqual(await snapshot(page, 1), before);
    }
    assert.equal(await page.locator('.hint-circle').count(), 1);
    const cop = movedCop(initialState(levels[0]), solutions[1][0]);
    await page.getByTestId(`node-${solutions[1][0][cop]}`).click();
    await finished(page, 1);
    assert.deepEqual(await snapshot(page, 1), expectedView(step(levels[0], initialState(levels[0]), solutions[1][0]).state));
  });

  await check('a pending hint cannot change the police officer selected or dragged by the player', async page => {
    await page.route('**/src/hint-worker.js', async route => {
      await new Promise(resolve => setTimeout(resolve, 900));
      await route.continue().catch(() => {}); // Selecting an officer may cancel the request while it is held.
    });
    const map = levels[5], before = initialState(map), suggested = movedCop(before, solutions[6][0]);
    const targets = legalPlans(map, before).find(plan => plan.some((node, i) => i !== suggested && node !== before.cops[i]) && !step(map, before, plan).escaped.length);
    assert.ok(targets, 'Race scenario needs a legal move by a different officer');
    const cop = movedCop(before, targets);
    await load(page, 6); await page.getByTestId('hint').click();
    await page.getByTestId(`cop-${cop}`).click(); await page.waitForTimeout(1300);
    assert.equal(await page.getByTestId(`cop-${cop}`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.hint-circle').count(), 0);
    assert.deepEqual(await snapshot(page, 6), expectedView(before), 'Manual selection must not consume a move');

    await load(page, 6); await page.getByTestId('hint').click();
    const destination = map.nodes[targets[cop]];
    await drag(page, cop, await point(page, destination.x, destination.y), false, 1300);
    await finished(page, 1);
    assert.deepEqual(await snapshot(page, 6), expectedView(step(map, before, targets).state), 'The held drag must move the manually selected officer');
    return { intendedCops: targets, suggestedOfficer: suggested, selectedOfficer: cop, delayedWorkerMs: 900, heldDragMs: 1300 };
  });

  await check('rapid double click consumes exactly one move during animation', async page => {
    await load(page, moving.id, false);
    let state = await replay(page, moving.id, moving.path.slice(0, -1));
    const targets = moving.path.at(-1), node = await select(page, state, targets);
    await node.dblclick({ delay: 25 });
    state = step(levels[moving.id - 1], state, targets).state;
    await finished(page, state.turn); await page.waitForTimeout(800);
    assert.deepEqual(await snapshot(page, moving.id), expectedView(state));
  });

  await check('real drag moves immediately; empty drop and pointercancel do not move', async page => {
    const id = moving.id, map = levels[id - 1], before = initialState(map), targets = solutions[id][0], cop = movedCop(before, targets), destination = map.nodes[targets[cop]];
    await load(page, id); const initial = await snapshot(page, id);
    await drag(page, cop, await point(page, 25, 25));
    assert.deepEqual(await snapshot(page, id), initial);
    await drag(page, cop, await point(page, destination.x, destination.y), true);
    assert.deepEqual(await snapshot(page, id), initial);
    await drag(page, cop, await point(page, destination.x, destination.y));
    await finished(page, 1);
    assert.deepEqual(await snapshot(page, id), expectedView(step(map, before, targets).state));
  });

  await check('restart and change level invalidate unfinished animations', async page => {
    for (const action of ['restart', 'change-level']) {
      await load(page, 1, false);
      await (await select(page, initialState(levels[0]), solutions[1][0])).click();
      assert.ok(['police', 'caught', 'robbers'].includes(await page.locator('body').getAttribute('data-phase')));
      if (action === 'restart') await page.getByTestId('restart').click();
      else { await page.getByTestId('level-select').click(); await page.getByTestId('level-button-2').click(); }
      const id = action === 'restart' ? 1 : 2;
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('body').getAttribute('data-level'), String(id));
      assert.deepEqual(await snapshot(page, id), expectedView(initialState(levels[id - 1])));
      assert.equal(await page.getByTestId('victory').isVisible(), false);
      assert.equal(await page.getByTestId('defeat').isVisible(), false);
    }
  });

  await check('old victories and old patrols do not restore as new-version progress', async page => {
    await page.goto(base); await page.waitForFunction(() => document.body.dataset.phase === 'planning');
    assert.equal(await page.locator('body').getAttribute('data-level'), '1');
    assert.deepEqual(await snapshot(page, 1), expectedView(initialState(levels[0])));
    assert.match(await page.locator('#completed-count').textContent(), /^0\s*\/\s*60$/);
    assert.equal(await page.getByTestId('sound').getAttribute('aria-pressed'), 'false', 'old sound preferences survive the map revision');
    assert.ok(await page.evaluate(() => localStorage.getItem('cops-robbers-v2')), 'the old save remains intact');
    await page.getByTestId('level-select').click();
    assert.equal(await page.getByTestId('level-button-1').getAttribute('data-completed'), 'false');
  }, { init: () => localStorage.setItem('cops-robbers-v2', JSON.stringify({ version: 2,
    completed: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i + 1, { turns: 1, stars: 3 }])),
    current: { levelId: 1, state: { cops: [1], robbers: [-1], turn: 1 }, history: [] }, settings: { sound: false } })) });

  await check('malformed new save recovers and unavailable storage still permits play', async page => {
    await page.goto(base); await page.waitForFunction(() => document.body.dataset.phase === 'planning');
    assert.deepEqual(await snapshot(page, 1), expectedView(initialState(levels[0])));
    await replay(page, 1, solutions[1]);
  }, { init: () => localStorage.setItem('cops-robbers-v3', '{broken-save') });
  await check('storage denial keeps capture, defeat and replay available', async page => {
    await load(page, 1); assert.match(await page.locator('#save-indicator').textContent(), /无法保存/);
    await replay(page, 1, solutions[1]); assert.equal(await page.getByTestId('victory').isVisible(), true);
    await load(page, losing.id); await replay(page, losing.id, losing.path);
    assert.equal(await page.getByTestId('defeat').isVisible(), true);
    await page.getByTestId('retry').click();
    assert.deepEqual(await snapshot(page, losing.id), expectedView(initialState(levels[losing.id - 1])));
  }, { init: () => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
  } });

  await check('real WebAudio sounds on movement and capture and remains silent after muting', async page => {
    await load(page, 1);
    if (await page.getByTestId('sound').getAttribute('aria-pressed') !== 'true') await page.getByTestId('sound').click();
    await replay(page, 1, solutions[1]);
    await page.waitForFunction(() => window.testAudioStates.some(context => context.state === 'running'));
    const sounded = await page.evaluate(() => window.testOscillatorStarts);
    assert.ok(sounded >= 7, 'Movement, capture and victory must start real oscillator notes');
    await page.keyboard.press('Escape'); await page.getByTestId('sound').click();
    assert.equal(await page.getByTestId('sound').getAttribute('aria-pressed'), 'false');
    const muted = await page.evaluate(() => window.testOscillatorStarts);
    await page.getByTestId('restart').click(); await replay(page, 1, solutions[1]);
    assert.equal(await page.evaluate(() => window.testOscillatorStarts), muted);
    return { soundedNotes: sounded, mutedNewNotes: 0 };
  }, { init: () => {
    window.testOscillatorStarts = 0; window.testAudioStates = [];
    const prototype = (window.AudioContext || window.webkitAudioContext).prototype, create = prototype.createOscillator;
    prototype.createOscillator = function (...args) {
      if (!window.testAudioStates.includes(this)) window.testAudioStates.push(this);
      const oscillator = Reflect.apply(create, this, args), start = oscillator.start;
      oscillator.start = function (...startArgs) { window.testOscillatorStarts++; return Reflect.apply(start, this, startArgs); };
      return oscillator;
    };
  } });

  await check('keyboard selects and immediately moves; next level survives reload', async page => {
    await load(page, 1); let state = initialState(levels[0]);
    for (const targets of solutions[1]) {
      const cop = movedCop(state, targets);
      await tabTo(page, `cop-${cop}`); await page.keyboard.press('Enter');
      assert.equal(await page.getByTestId(`cop-${cop}`).getAttribute('aria-pressed'), 'true');
      await tabTo(page, `node-${targets[cop]}`); await page.keyboard.press('Enter');
      state = step(levels[0], state, targets).state; await finished(page, state.turn);
      assert.deepEqual(await snapshot(page, 1), expectedView(state));
    }
    await page.getByTestId('next-level').click(); await page.reload();
    await page.waitForFunction(() => document.body.dataset.phase === 'planning');
    assert.equal(await page.locator('body').getAttribute('data-level'), '2');
    assert.deepEqual(await snapshot(page, 2), expectedView(initialState(levels[1])));
  });

  await check('explicit normal motion overrides system reduced motion and settings persist', async page => {
    await load(page, 2, false);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('reduced')), false);
    await page.locator('#settings').click(); await page.locator('#motion-setting').check();
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('reduced')), true);
    await page.locator('#motion-setting').uncheck();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')).settings.reduced), false);
  }, { reducedMotion: 'reduce', init: () => localStorage.setItem('cops-robbers-v3', JSON.stringify({ version: 3, settings: { reduced: false } })) });

  report.passed = report.checks.every(check => check.passed);
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  report.failure = error.stack || String(error); console.error(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(resolve(output, 'escape-interactions.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
}
