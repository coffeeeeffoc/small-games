import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { LEVELS } from '../levels.mjs';
import { FACE_IDS } from '../faces.mjs';
import { STORAGE_KEY } from '../progress.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(gameRoot, 'test-results');
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:4413/';
const mobileOnly = process.argv.includes('--mobile-only');
const smokeOnly = process.argv.includes('--smoke-only');
const reportName = smokeOnly
  ? 'browser-smoke-report.json'
  : mobileOnly
    ? 'browser-mobile-report.json'
    : 'browser-report.json';
const runtimeErrors = [],
  checks = [];
const layouts = [];
const touchSessions = new WeakMap();
let server,
  browser,
  currentPage,
  serverOutput = '';
const snapshot = (page) => page.evaluate(() => window.__twoSidedSnapshot());
const physical = ({ state, ball, historyLength }) => ({
  shafts: state.shafts,
  latches: state.latches,
  released: state.released,
  completed: state.completed,
  checkpoint: state.checkpoint,
  moves: state.moves,
  ball,
  historyLength,
});
const preserved = (current) => ({
  state: current.state,
  ball: current.ball,
  historyLength: current.historyLength,
  progress: current.progress,
});

async function settled(page) {
  await page.waitForFunction(() => {
    const s = window.__twoSidedSnapshot?.();
    return s && !s.ballMoving && !s.revealPending;
  });
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  return snapshot(page);
}
async function touch(page, type, points = []) {
  if (!touchSessions.has(page)) touchSessions.set(page, await page.context().newCDPSession(page));
  await touchSessions.get(page).send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await delay(30);
}
async function tapAt(page, x, y) {
  await touch(page, 'touchStart', [{ x, y, id: 1 }]);
  await touch(page, 'touchEnd');
}
async function activate(locator, mobile = false) {
  if (!mobile) return locator.click();
  await locator.scrollIntoViewIfNeeded();
  assert.equal(await locator.isEnabled(), true, 'Touch target is enabled');
  const r = await locator.boundingBox();
  assert.ok(r, 'Touch target is visible');
  await tapAt(locator.page(), r.x + r.width / 2, r.y + r.height / 2);
}
async function openGame(context, label) {
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => runtimeErrors.push(label + ': ' + error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(label + ': ' + message.text());
  });
  await page.goto(gameUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__twoSidedSnapshot === 'function');
  await activate(page.locator('#start'), await page.evaluate(() => navigator.maxTouchPoints > 0));
  await settled(page);
  return page;
}
async function context(options = {}) {
  const created = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    ...options,
  });
  // A reproducible stream still chooses different legal starting pairs.
  await created.addInitScript(() => {
    let seed = 41023;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  });
  return created;
}
async function dismissCompletion(page, mobile = false) {
  if (await page.locator('#structure-dialog[open]').count())
    await activate(page.locator('#structure-close'), mobile);
  if (await page.locator('#result[open]').count()) await activate(page.locator('#replay'), mobile);
}
async function selectLevel(page, index, mobile = false) {
  await dismissCompletion(page, mobile);
  await activate(page.locator('#levels'), mobile);
  assert.equal(await page.locator('[data-level-index]').count(), 50, 'All 50 boxes are selectable');
  await activate(page.locator('[data-level-index="' + index + '"]'), mobile);
  const s = await settled(page);
  assert.equal(s.levelIndex, index);
  assert.equal(s.state.moves, 0);
  assert.equal(s.state.revealedFaces.length, 2);
  assert.equal(new Set(s.initialFaces).size, 2);
  assert.equal(s.state.structureViewed, false);
  await verifySimultaneous(page, s);
  assert.equal(Object.keys(s.boards).length, 2, 'Exactly two initial face viewers');
  return s;
}
async function reveal(page, face, mobile = false) {
  const before = await snapshot(page);
  if (before.state.revealedFaces.includes(face)) return;
  await activate(page.locator('[data-face="' + face + '"]'), mobile);
  await page.locator('#hint-dialog[open]').waitFor({ state: 'visible' });
  assert.equal(
    await page.locator('#reveal-structure').count(),
    0,
    'Full 3D stays gated until all six faces are revealed',
  );
  await activate(page.locator('[data-reveal-face="' + face + '"]'), mobile);
  await page.locator('#hint-dialog').waitFor({ state: 'hidden' });
  const after = await settled(page);
  assert.ok(after.state.revealedFaces.includes(face));
  assert.equal(after.state.side, before.state.side, 'Revealing does not select a different face');
  assert.equal(after.state.revealedFaces.length, before.state.revealedFaces.length + 1);
  assert.deepEqual(
    physical(after),
    physical(before),
    'Free reveal leaves mechanisms and moves unchanged',
  );
  await verifySimultaneous(page, after);
}
async function verifySimultaneous(page, current = null) {
  const s = current ?? (await settled(page));
  assert.deepEqual(
    Object.keys(s.boards).sort(),
    [...s.state.revealedFaces].sort(),
    'Every known face keeps its own live viewer',
  );
  assert.deepEqual(
    await page
      .locator('canvas[data-face-board]')
      .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.faceBoard).sort()),
    [...s.state.revealedFaces].sort(),
  );
  for (const face of s.state.revealedFaces) {
    assert.equal(
      await page.locator('canvas[data-face-board="' + face + '"]').isVisible(),
      true,
      face + ' stays visible alongside the other faces',
    );
    assert.deepEqual(s.boards[face].faces, [face]);
    assert.equal(s.boards[face].camera.projection, 'orthographic');
    assert.equal(s.boards[face].camera.face, face);
    assert.ok(
      s.boards[face].projected.controls.every((control) => control.face === face),
      'A face viewer renders only its own physical controls',
    );
  }
  assert.equal(
    await page.locator('[role="tab"], [role="tablist"], #flip').count(),
    0,
    'The observation table never switches faces through tabs',
  );
  assert.equal(
    await page.locator('#face-nav button[data-revealed="true"]').count(),
    0,
    'Revealed face labels do not act as view switches',
  );
}
async function view(page, face, mobile = false) {
  // Reviewed solutions retain view steps. Observation is now already available
  // in its own canvas and requires only discovery if the face remains hidden.
  await reveal(page, face, mobile);
  await verifySimultaneous(page);
}
async function openFullStructure(page, mobile = false) {
  for (const face of FACE_IDS) await reveal(page, face, mobile);
  const before = await snapshot(page);
  await activate(page.locator('#hint'), mobile);
  if (!before.state.structureViewed) await activate(page.locator('#reveal-structure'), mobile);
  await page.locator('#structure-dialog[open]').waitFor({ state: 'visible' });
  const after = await settled(page);
  assert.equal(after.state.structureViewed, true);
  assert.deepEqual(
    physical(after),
    physical(before),
    'Final hint changes knowledge, not mechanisms or moves',
  );
  return preserved(after);
}
async function closeStructure(page, before, mobile = false) {
  await activate(page.locator('#structure-close'), mobile);
  await page.locator('#structure-dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(
    preserved(await settled(page)),
    before,
    'Viewing 3D and returning preserve puzzle state',
  );
}
async function pixels(page, selector = '#structure-canvas') {
  await settled(page);
  return page.locator(selector).evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      colors.add(color);
      hash = Math.imul(hash ^ color, 16777619);
    }
    return { hash: hash >>> 0, colors: colors.size };
  });
}
async function visibleChange(page, action, label, selector) {
  const before = await pixels(page, selector);
  await action();
  const after = await pixels(page, selector);
  assert.ok(after.colors > 100, label + ': nonblank scene');
  assert.notEqual(after.hash, before.hash, label + ': actual pixels change');
}
async function verifyModelSync(page, structure = false) {
  const s = await settled(page);
  const models = structure ? [s.structure] : Object.values(s.boards);
  for (const model of models) {
    assert.equal(model.levelId, s.levelId);
    assert.deepEqual(
      model.snapshot,
      JSON.parse(JSON.stringify(s.mechanisms)),
      'Every renderer uses the same live rules',
    );
    assert.deepEqual(model.ball, s.ball, 'Every renderer follows the same world-space ball');
    assert.equal(model.counts.channels, 1, 'One shared ball channel');
  }
  if (structure) {
    assert.deepEqual(s.structure.faces, FACE_IDS);
    const text = await page.locator('#structure-state').innerText();
    for (const gate of s.mechanisms.gates)
      assert.ok(
        text.includes(gate.label + '：' + (gate.open ? '孔口对齐' : '未对齐')),
        '3D hint explains current gate states',
      );
  }
}
async function perform(page, action, mobile = false) {
  const before = await snapshot(page);
  if (action.type === 'reveal') await reveal(page, action.face, mobile);
  else if (action.type === 'view') await view(page, action.face, mobile);
  else if (action.type === 'shaft') {
    const shaft = LEVELS[before.levelIndex].shafts.find((item) => item.id === action.id);
    await activate(
      page.locator(
        '[data-face-card="' +
          shaft.face +
          '"] [data-shaft="' +
          action.id +
          '"][data-value="' +
          action.value +
          '"]',
      ),
      mobile,
    );
    assert.equal(
      (await settled(page)).state.shafts[action.id],
      action.value,
      'Visible shaft reaches requested notch',
    );
  } else if (action.type === 'latch') {
    const latch = LEVELS[before.levelIndex].latches.find((item) => item.id === action.id);
    await activate(
      page.locator('[data-face-card="' + latch.face + '"] [data-latch="' + action.id + '"]'),
      mobile,
    );
    assert.notEqual(
      (await settled(page)).state.latches[action.id],
      before.state.latches[action.id],
      'Visible latch operates',
    );
  } else if (action.type === 'release') await activate(page.locator('#release'), mobile);
  else assert.equal(action.type, 'advance');
  await settled(page);
  await verifyModelSync(page);
}
async function solve(page, index, { mobile = false, finalHint = false } = {}) {
  await selectLevel(page, index, mobile);
  if (finalHint) {
    const observed = await openFullStructure(page, mobile);
    await verifyModelSync(page, true);
    if (!mobile) await page.screenshot({ path: resolve(outputDir, 'structure-desktop.png') });
    await closeStructure(page, observed, mobile);
  }
  for (const action of LEVELS[index].solution) {
    if ((await snapshot(page)).state.completed) break;
    await perform(page, action, mobile);
  }
  const completed = await settled(page);
  assert.equal(
    completed.state.completed,
    true,
    'Box ' + (index + 1) + ' solves through visible controls',
  );
  assert.deepEqual(completed.ball, LEVELS[index].path.at(-1));
  if (!finalHint) {
    await page.locator('#structure-dialog[open]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#result[open]').count(), 0, 'Unseen 3D appears before result');
    assert.match(await page.locator('#structure-close').innerText(), /结算/);
    await verifyModelSync(page, true);
    await activate(page.locator('#structure-close'), mobile);
  } else
    assert.equal(
      await page.locator('#structure-dialog[open]').count(),
      0,
      'Already observed 3D is not forced again',
    );
  await page.locator('#result[open]').waitFor({ state: 'visible' });
  assert.ok((await snapshot(page)).progress.best[LEVELS[index].id] > 0);
  checks.push(
    'Box ' +
      (index + 1) +
      ': ' +
      (mobile ? 'native touch' : 'mouse') +
      ', ' +
      (finalHint ? 'hint → direct result' : 'solve → 3D → result'),
  );
  console.log('PASS box ' + (index + 1) + (mobile ? ' (touch)' : ''));
}
async function verifyStructureControls(page) {
  for (const [selector, label] of [
    ['#structure-xray', 'Opaque exterior'],
    ['#structure-xray', 'X-ray exterior'],
    ['#structure-explode', 'Exploded'],
    ['#structure-explode', 'Assembled'],
    ...FACE_IDS.map((face) => ['[data-structure-view="' + face + '"]', face + ' 3D view']),
    ['#structure-zoom-in', 'Zoom in'],
    ['#structure-zoom-out', 'Zoom out'],
  ])
    await visibleChange(page, () => activate(page.locator(selector)), label);
  const canvas = page.locator('#structure-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const r = await canvas.boundingBox(),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  await visibleChange(
    page,
    async () => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 65, y + 24, { steps: 5 });
      await page.mouse.up();
    },
    'Mouse orbit',
  );
  await visibleChange(page, () => page.mouse.wheel(0, -100), 'Wheel zoom');
  await canvas.focus();
  await visibleChange(page, () => page.keyboard.press('ArrowRight'), 'Keyboard orbit');
  await visibleChange(page, () => page.keyboard.press('+'), 'Keyboard zoom');
  await page.keyboard.press('Home');
  await settled(page);
  await page.screenshot({ path: resolve(outputDir, 'structure-desktop-controls.png') });
}
async function verifyObservation(page) {
  const pairs = new Set();
  for (let i = 0; i < 6; i++)
    pairs.add((await selectLevel(page, 0)).initialFaces.slice().sort().join(','));
  assert.ok(pairs.size >= 2, 'Fresh attempts choose different legal random pairs');
  assert.equal(
    await page.locator('#reward-reveal').isEnabled(),
    false,
    'Standalone play does not pretend that an ad was watched',
  );
  const before = await snapshot(page),
    hidden = FACE_IDS.find((face) => !before.state.revealedFaces.includes(face));
  await activate(page.locator('[data-face="' + hidden + '"]'));
  await activate(page.locator('[data-close="hint-dialog"]'));
  assert.deepEqual(
    preserved(await snapshot(page)),
    preserved(before),
    'Cancelling an ungranted hint reveals nothing',
  );
  const observed = await openFullStructure(page);
  await verifyModelSync(page, true);
  await verifyStructureControls(page);
  await closeStructure(page, observed);
  const projected = {};
  for (const face of FACE_IDS) {
    await view(page, face);
    const s = await snapshot(page),
      r = await page.locator('canvas[data-face-board="' + face + '"]').boundingBox(),
      p = s.boards[face].projected.ball;
    projected[face] = [(p.x - r.width / 2) / p.scale, -(p.y - r.height / 2 - 3) / p.scale];
    assert.ok((await pixels(page, 'canvas[data-face-board="' + face + '"]')).colors > 100);
    await verifyModelSync(page);
  }
  const near = (a, b) =>
    assert.ok(Math.abs(a - b) < 1e-7, 'Opposite face projections mirror the same world point');
  near(projected.front[0], -projected.back[0]);
  near(projected.front[1], projected.back[1]);
  near(projected.top[0], projected.bottom[0]);
  near(projected.top[1], -projected.bottom[1]);
  near(projected.left[0], -projected.right[0]);
  near(projected.left[1], projected.right[1]);
  await view(page, 'back');
  await activate(page.locator('[data-latch="lock-A"]'));
  const unlocked = await snapshot(page);
  await activate(page.locator('#undo'));
  const undone = await settled(page);
  assert.equal(undone.state.latches['lock-A'], true);
  assert.deepEqual(undone.state.revealedFaces, unlocked.state.revealedFaces);
  assert.equal(undone.state.structureViewed, true, 'Undo preserves knowledge');
  await activate(page.locator('#restart'));
  const restarted = await settled(page);
  assert.equal(restarted.state.moves, 0);
  assert.equal(restarted.state.revealedFaces.length, 2, 'Restart samples exactly two faces');
  assert.equal(new Set(restarted.state.revealedFaces).size, 2);
  assert.equal(restarted.state.structureViewed, false, 'Restart resets structure discovery');
  await verifySimultaneous(page, restarted);
  checks.push(
    'Random pairs, simultaneous face discovery, final hint gating, six true projections, undo knowledge and fresh restart',
  );
}
async function boardPoint(page, kind, id, value) {
  const current = await snapshot(page);
  const mechanisms =
    kind === 'latch' ? LEVELS[current.levelIndex].latches : LEVELS[current.levelIndex].shafts;
  const face = mechanisms.find((item) => item.id === id)?.face;
  assert.ok(face, 'The mechanism belongs to a physical face');
  const canvas = page.locator('canvas[data-face-board="' + face + '"]');
  await canvas.scrollIntoViewIfNeeded();
  const s = await settled(page),
    r = await canvas.boundingBox();
  const c = s.boards[face].projected.controls.find((item) => item.type === kind && item.id === id);
  assert.ok(c, 'Canvas target exists: ' + id);
  const p =
    kind === 'latch'
      ? c.point
      : value === undefined
        ? c.handle
        : c.notches.find((n) => n.value === value);
  return { x: r.x + p.x, y: r.y + p.y };
}
async function dragShaft(page, id, value, cancel = false) {
  const before = await snapshot(page),
    start = await boardPoint(page, 'shaft', id),
    end = await boardPoint(page, 'shaft', id, value);
  await touch(page, 'touchStart', [{ ...start, id: 1 }]);
  await touch(page, 'touchMove', [{ ...end, id: 1 }]);
  assert.deepEqual(
    physical(await snapshot(page)),
    physical(before),
    'Drag preview does not commit state',
  );
  const face = LEVELS[before.levelIndex].shafts.find((shaft) => shaft.id === id).face;
  assert.equal(
    (await snapshot(page)).boards[face].preview?.shaft,
    id,
    'Canvas drag creates a preview',
  );
  await touch(page, cancel ? 'touchCancel' : 'touchEnd');
  const after = await settled(page);
  assert.ok(
    Object.values(after.boards).every((board) => board.pointers === 0),
    'Release/cancel clears pointer tracking in every face',
  );
  if (cancel)
    assert.deepEqual(
      physical(after),
      physical(before),
      'Cancellation preserves mechanisms and moves',
    );
  else assert.equal(after.state.shafts[id], value, 'Canvas drag commits target notch');
}
async function verifyLayout(page, label, structure = false) {
  const layout = await page.locator(structure ? '#structure-dialog' : 'main').evaluate((root) => {
    const r = root.getBoundingClientRect();
    return {
      width: innerWidth,
      left: r.left,
      right: r.right,
      overflow: root.scrollWidth - root.clientWidth,
      targets: [...root.querySelectorAll('button')]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { text: b.textContent.trim(), width: r.width, height: r.height };
        }),
    };
  });
  assert.ok(
    layout.left >= -1 && layout.right <= layout.width + 1 && layout.overflow <= 1,
    label + ': no horizontal overflow',
  );
  for (const t of layout.targets)
    assert.ok(
      t.width >= 43.9 && t.height >= 43.9,
      label + ': 44 px touch target: ' + JSON.stringify(t),
    );
  layouts.push({ label, structure, ...layout });
}
async function verifyMobile(viewport, index) {
  const label = viewport.width + 'x' + viewport.height,
    mobile = await context({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    const page = await openGame(mobile, label);
    await selectLevel(page, 0, true);
    await view(page, 'back', true);
    const latch = await boardPoint(page, 'latch', 'lock-A');
    await tapAt(page, latch.x, latch.y);
    assert.equal(
      (await settled(page)).state.latches['lock-A'],
      false,
      'Native canvas tap opens actual latch',
    );
    await view(page, 'front', true);
    await verifyLayout(page, label);
    await dragShaft(page, 'A', 2, true);
    await dragShaft(page, 'A', 2);
    await activate(page.locator('#undo'), true);
    assert.equal(
      (await settled(page)).state.shafts.A,
      0,
      'Touch controls recover after cancellation',
    );
    const observed = await openFullStructure(page, true);
    await verifyModelSync(page, true);
    await verifyLayout(page, label, true);
    await page.locator('#structure-canvas').scrollIntoViewIfNeeded();
    const r = await page.locator('#structure-canvas').boundingBox(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    await visibleChange(
      page,
      async () => {
        await touch(page, 'touchStart', [{ x: x - 35, y, id: 1 }]);
        await touch(page, 'touchMove', [{ x: x + 35, y: y + 15, id: 1 }]);
        await touch(page, 'touchEnd');
      },
      label + ': native orbit',
    );
    await touch(page, 'touchStart', [{ x, y, id: 1 }]);
    await touch(page, 'touchMove', [{ x: x + 15, y, id: 1 }]);
    await touch(page, 'touchCancel');
    assert.equal((await snapshot(page)).structure.pointers, 0);
    await visibleChange(
      page,
      async () => {
        await touch(page, 'touchStart', [
          { x: x - 30, y, id: 1 },
          { x: x + 30, y, id: 2 },
        ]);
        await touch(page, 'touchMove', [
          { x: x - 60, y, id: 1 },
          { x: x + 60, y, id: 2 },
        ]);
        await touch(page, 'touchEnd');
      },
      label + ': native pinch',
    );
    await visibleChange(
      page,
      () => activate(page.locator('#structure-xray'), true),
      label + ': x-ray toggle',
    );
    await visibleChange(
      page,
      () => activate(page.locator('#structure-explode'), true),
      label + ': layer toggle',
    );
    // Restore framing only after all native-input assertions, for evidence images.
    await page.locator('#structure-canvas').focus();
    await page.keyboard.press('Home');
    await activate(page.locator('#structure-xray'), true);
    await activate(page.locator('#structure-explode'), true);
    await settled(page);
    await page.screenshot({ path: resolve(outputDir, 'structure-' + label + '.png') });
    await closeStructure(page, observed, true);
    await solve(page, index, { mobile: true, finalHint: index === 24 });
    await activate(page.locator('#replay'), true);
    await verifyLayout(page, label + ' replay');
    for (const face of FACE_IDS) await reveal(page, face, true);
    await verifyLayout(page, label + ' simultaneous six faces');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: resolve(outputDir, 'six-face-' + label + '.png'),
      fullPage: true,
    });
    checks.push(label + ': canvas latch/drag/cancel, pinch, toggles, layout and return');
  } catch (error) {
    await currentPage
      ?.screenshot({ path: resolve(outputDir, 'acceptance-failure.png') })
      .catch(() => {});
    throw error;
  } finally {
    await mobile.close();
  }
}
async function verifyPersistence(page) {
  await dismissCompletion(page);
  const before = (await snapshot(page)).progress;
  await page.reload({ waitUntil: 'networkidle' });
  await activate(page.locator('#start'));
  assert.deepEqual(
    (await settled(page)).progress,
    before,
    'Collection and best scores survive reload',
  );
  checks.push('Collection progress survives reload');
}
async function verifyOptionalStorage() {
  for (const mode of ['corrupt', 'blocked']) {
    const optional = await context();
    await optional.addInitScript(
      ({ key, mode }) => {
        if (mode === 'corrupt') localStorage.setItem(key, '{invalid');
        else
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('Blocked for test', 'SecurityError');
            },
          });
      },
      { key: STORAGE_KEY, mode },
    );
    try {
      const page = await openGame(optional, mode);
      await solve(page, 0);
      checks.push(mode + ' storage remains playable');
    } finally {
      await optional.close();
    }
  }
}
async function verifyRewardedDiscovery() {
  for (const outcome of ['completed', 'dismissed', 'unavailable', 'failed', 'rejected', 'stale']) {
    const rewarded = await context();
    await rewarded.addInitScript((outcome) => {
      window.__testAdCalls = 0;
      window.twoSidedBoxHost = {
        session: { capabilities: ['advertising'] },
        ads: {
          offer: async () => {
            window.__testAdCalls += 1;
            if (outcome === 'stale')
              return new Promise((resolve) => {
                window.__testCompleteAd = resolve;
              });
            if (outcome === 'rejected') throw new Error('Simulated host failure');
            return { status: outcome };
          },
        },
      };
    }, outcome);
    try {
      const page = await openGame(rewarded, 'ad-' + outcome);
      const before = await snapshot(page);
      const face = FACE_IDS.find((id) => !before.state.revealedFaces.includes(id));
      await activate(page.locator('#face-nav [data-face="' + face + '"]'));
      assert.equal(await page.locator('#reward-reveal').isEnabled(), true);
      await activate(page.locator('#reward-reveal'));
      await page.waitForFunction(() => window.__testAdCalls === 1);
      let expected = before;
      if (outcome === 'stale') {
        await activate(page.locator('[data-close="hint-dialog"]'));
        await activate(page.locator('#restart'));
        expected = await settled(page);
        await page.evaluate(() => window.__testCompleteAd({ status: 'completed' }));
      }
      const after = await settled(page);
      assert.equal(after.state.revealedFaces.length, outcome === 'completed' ? 3 : 2);
      assert.deepEqual(physical(after), physical(expected), 'Ad discovery preserves the mechanism');
      if (outcome === 'completed') {
        assert.ok(
          after.state.revealedFaces.includes(face),
          'Completed reward reveals the selected face',
        );
        assert.equal(
          await page.locator('#hint-dialog[open]').count(),
          0,
          'A successful reward displays the newly discovered face',
        );
      } else {
        assert.deepEqual(
          after.state.revealedFaces,
          expected.state.revealedFaces,
          'Incomplete, failed and stale rewards reveal nothing',
        );
        if (outcome !== 'stale') {
          assert.equal(await page.locator('#hint-dialog[open]').count(), 1);
          assert.match(
            await page.locator('#reward-note').innerText(),
            /未看完|无法|不可|失败|暂时/,
            'The dialog explains why the reward was not granted',
          );
        }
      }
      await verifySimultaneous(page, after);
      assert.equal(await page.evaluate(() => window.__testAdCalls), 1);
      checks.push('Rewarded face discovery: ' + outcome);
    } finally {
      await rewarded.close();
    }
  }
}
async function startServer() {
  if (process.env.GAME_URL) return;
  server = spawn(
    process.execPath,
    [resolve(gameRoot, 'server.mjs'), '--host', '127.0.0.1', '--port', '4413'],
    { cwd: gameRoot, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk).slice(-8000);
    });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Server stopped: ' + serverOutput);
    try {
      if ((await fetch(gameUrl, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Server did not start: ' + serverOutput);
}
try {
  await mkdir(outputDir, { recursive: true });
  await startServer();
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium';
  assert.ok(existsSync(executablePath));
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  if (!mobileOnly) {
    const desktop = await context();
    try {
      const page = await openGame(desktop, 'desktop');
      await verifyObservation(page);
      for (const index of smokeOnly ? [0, 24, 49] : LEVELS.map((_, i) => i))
        await solve(page, index, { finalHint: index === 24 });
      await verifyPersistence(page);
    } catch (error) {
      await currentPage
        ?.screenshot({ path: resolve(outputDir, 'acceptance-failure.png') })
        .catch(() => {});
      throw error;
    } finally {
      await desktop.close();
    }
  }
  if (!smokeOnly) {
    await verifyMobile({ width: 390, height: 844 }, 0);
    await verifyMobile({ width: 320, height: 640 }, 24);
    await verifyMobile({ width: 844, height: 390 }, 49);
    await verifyOptionalStorage();
    await verifyRewardedDiscovery();
  }
  assert.deepEqual(runtimeErrors, [], 'No browser runtime or console errors');
  await writeFile(
    resolve(outputDir, reportName),
    JSON.stringify({ passed: true, checks, layouts, runtimeErrors }, null, 2) + '\n',
  );
  console.log('PASS: ' + checks.length + ' checks. Report: ' + resolve(outputDir, reportName));
} catch (error) {
  await currentPage
    ?.screenshot({ path: resolve(outputDir, 'acceptance-failure.png') })
    .catch(() => {});
  await writeFile(
    resolve(outputDir, reportName),
    JSON.stringify({ passed: false, checks, layouts, runtimeErrors, error: error.stack }, null, 2) +
      '\n',
  ).catch(() => {});
  console.error(error);
  if (runtimeErrors.length) console.error(runtimeErrors);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    const exited = new Promise((done) => server.once('exit', done));
    server.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}
