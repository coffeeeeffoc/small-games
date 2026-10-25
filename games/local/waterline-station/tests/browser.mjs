import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../levels.mjs';
import { createState, toggleGate } from '../engine.mjs';
import { STORAGE_KEY } from '../progress.mjs';
import {
  fixture,
  snap,
  ready,
  tap,
  settled,
  cancelTouch,
  stable,
  moveDevButton,
} from './browser-support.mjs';
const f = await fixture(),
  out = new URL(
    process.env.CAPTURE_GAME_EVIDENCE === '1'
      ? '../docs/design/mobile-cocos-2026-10-25/actual/'
      : '../test-results/mobile-cocos/',
    import.meta.url,
  );
await mkdir(out, { recursive: true });
const checks = [],
  errors = [],
  diagnostics = [];
const context = await f.browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
let activePage = page;
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') {
      const text = m.text();
      if (
        text ===
        'Ignored attempt to cancel a touchcancel event with cancelable=false, for example because scrolling is in progress and cannot be interrupted.'
      )
        diagnostics.push(text);
      else errors.push(text);
    }
  });
  p.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(f.base)) errors.push(`${r.status()} ${r.url()}`);
  });
};
watch(page);
const shot = (name) => page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) });
try {
  await page.goto(f.base);
  await ready(page);
  const engine = await page.evaluate(async () => {
    const { cc } = await import('./vendor/cocos/bootstrap.mjs');
    const scene = cc.director.getScene();
    return {
      version: cc.VERSION,
      scene: scene instanceof cc.Scene,
      graphics: scene.getComponentsInChildren(cc.Graphics).length,
      labels: scene.getComponentsInChildren(cc.Label).length,
      webgl: document.querySelector('canvas').getContext('2d') === null,
    };
  });
  assert.equal(engine.version, '3.8.8');
  assert.ok(engine.scene && engine.graphics > 0 && engine.labels > 0 && engine.webgl);
  assert.equal((await snap(page)).screen, 'home');
  await shot('home-390');
  await tap(page, 'levels-button');
  assert.equal((await snap(page)).screen, 'levels');
  assert.equal(await page.locator('#level-1').isDisabled(), true);
  await shot('levels-390');
  await tap(page, 'back-home');
  await tap(page, 'start');
  await shot('play-390');
  await cancelTouch(page, 'gate-AB');
  assert.equal((await snap(page)).state.moves, 0);
  await tap(page, 'gate-BC');
  await settled(page);
  assert.equal((await snap(page)).state.moves, 1);
  await tap(page, 'gate-BC');
  await settled(page);
  assert.equal((await snap(page)).state.moves, 2);
  await tap(page, 'undo');
  assert.equal((await snap(page)).state.moves, 1);
  await tap(page, 'pause');
  await shot('pause-390');
  const paused = stable((await snap(page)).state);
  await page.waitForTimeout(150);
  assert.deepEqual(stable((await snap(page)).state), paused);
  await tap(page, 'restart');
  await tap(page, 'predict');
  await tap(page, 'gate-AB');
  assert.equal((await snap(page)).state.moves, 0);
  assert.deepEqual((await snap(page)).preview.volumes, [4, 4, 4]);
  await shot('prediction-390');
  await tap(page, 'gate-AB');
  await settled(page);
  assert.equal((await snap(page)).state.won, true);
  assert.equal((await snap(page)).screen, 'result');
  await shot('success-390');
  assert.equal((await snap(page)).unlocked, 1);
  await tap(page, 'result-undo');
  assert.equal((await snap(page)).state.won, false);
  assert.equal((await snap(page)).state.moves, 0);
  await tap(page, 'gate-AB');
  await settled(page);
  await tap(page, 'next-level');
  assert.equal((await snap(page)).levelIndex, 1);
  await tap(page, 'gate-BC');
  assert.equal((await snap(page)).state.moves, 0);
  assert.match((await snap(page)).message, /先点亮/);
  await tap(page, 'gate-AB');
  await settled(page);
  await tap(page, 'gate-BC');
  await settled(page);
  assert.equal((await snap(page)).state.won, true);
  checks.push(
    'home/locked levels/touch cancel/open-close/undo/pause/restart/prediction confirmation/result undo/next unlock/locked gate',
  );
  await page.reload();
  await ready(page);
  assert.equal((await snap(page)).progress.best[LEVELS[1].id], 2);
  await tap(page, 'levels-button');
  await tap(page, 'level-0');
  for (let i = 0; i < 3; i++) {
    await tap(page, 'gate-BC');
    await settled(page);
  }
  assert.equal((await snap(page)).state.lost, true);
  await shot('failure-390');
  await tap(page, 'extra-move');
  assert.equal((await snap(page)).state.bonusMoves, 1);
  await tap(page, 'undo');
  assert.equal((await snap(page)).extraClaimed, true);
  assert.equal((await snap(page)).state.bonusMoves, 1);
  await tap(page, 'pause');
  await tap(page, 'pause-home');
  await tap(page, 'settings');
  await tap(page, 'sound');
  assert.equal((await snap(page)).progress.sound, true);
  await tap(page, 'back-home');
  await tap(page, 'help');
  await shot('help-390');
  await tap(page, 'back-home');
  checks.push(
    'storage roundtrip/failure/free extra move cannot be reclaimed after undo/sound/help',
  );
  // Existing v1 records selected at any station remain playable after the migration.
  await page.evaluate(
    ({ key, last }) =>
      localStorage.setItem(key, JSON.stringify({ selected: last, sound: false, best: {} })),
    { key: STORAGE_KEY, last: 49 },
  );
  await page.reload();
  await ready(page);
  assert.equal((await snap(page)).unlocked, 49);
  await tap(page, 'levels-button');
  for (let i = 0; i < 4; i++) await tap(page, 'chapter-prev');
  await tap(page, 'level-0');
  for (let i = 0; i < LEVELS.length; i++) {
    let expected = createState(LEVELS[i]);
    assert.equal((await snap(page)).levelIndex, i);
    for (const gate of LEVELS[i].solution) {
      expected = toggleGate(LEVELS[i], expected, gate);
      await tap(page, 'gate-' + gate);
      await settled(page);
      assert.deepEqual(
        stable((await snap(page)).state),
        stable(expected),
        `station ${i + 1} gate ${gate}`,
      );
    }
    assert.equal((await snap(page)).state.won, true, LEVELS[i].id);
    if (i === 7) await shot('complex-result-390');
    if (i < LEVELS.length - 1) await tap(page, 'next-level');
  }
  checks.push(
    'all 50 authored stations solved by real Cocos touch input and compared to pure engine after every move; legacy v1 selected migration',
  );
  await tap(page, 'result-retry');
  for (const [w, h] of [
    [320, 568],
    [568, 320],
    [844, 390],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const before = stable((await snap(page)).state);
    const data = await snap(page);
    assert.deepEqual(
      await page.evaluate(async () => {
        const { cc } = await import('./vendor/cocos/bootstrap.mjs');
        const c = cc.director.getScene().getChildByName('Camera').getComponent(cc.Camera).camera,
          canvas = document.querySelector('canvas');
        return [c.width, c.height];
      }),
      await page.evaluate(() => [
        document.querySelector('canvas').width,
        document.querySelector('canvas').height,
      ]),
    );
    for (const hit of data.hits) {
      assert.ok(hit.width >= 44 && hit.height >= 44, hit.id);
      assert.ok(
        hit.x >= 0 &&
          hit.y >= 0 &&
          hit.x + hit.width <= data.viewport.width + 0.1 &&
          hit.y + hit.height <= data.viewport.height + 0.1,
        `${w}x${h} ${hit.id}`,
      );
    }
    await shot(`five-tanks-${w}`);
    await tap(page, 'pause');
    await shot(`pause-${w}`);
    await tap(page, 'resume');
    assert.deepEqual(stable((await snap(page)).state), before);
    await tap(page, 'gate-' + LEVELS[49].solution[0]);
    await settled(page);
    assert.equal((await snap(page)).state.moves, 1);
    await tap(page, 'pause');
    await tap(page, 'restart');
  }
  checks.push(
    '320/390 portrait and 568/844 landscape preserve state, valid touch targets and complex five-tank input',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await snap(page)).screen, 'paused');
  await tap(page, 'resume');
  checks.push('window blur pauses without advancing turns');
  const denied = await f.browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  await denied.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw Error('denied');
      },
    }),
  );
  const p = await denied.newPage();
  activePage = p;
  watch(p);
  await p.goto(f.base + '?dev=0');
  await ready(p);
  await tap(p, 'start');
  await tap(p, 'gate-AB');
  await settled(p);
  assert.equal((await snap(p)).state.won, true);
  await denied.close();
  checks.push('storage unavailable remains playable');
  const devContext = await f.browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const d = await devContext.newPage();
  activePage = d;
  watch(d);
  await d.goto(f.base + '?dev=1');
  await ready(d);
  await moveDevButton(d);
  await tap(d, 'levels-button');
  await tap(d, 'chapter-next');
  await tap(d, 'level-10');
  assert.equal((await snap(d)).practice, true);
  for (const gate of LEVELS[10].solution) {
    await tap(d, 'gate-' + gate);
    await settled(d);
  }
  assert.deepEqual((await snap(d)).progress.best, {});
  await devContext.close();
  checks.push('dev-only level skip isolates practice progress');
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('browser-report.json', out),
    JSON.stringify(
      {
        browser: await f.browser.version(),
        environment:
          'Linux Chromium mobile viewport and real browser touch simulation, not physical-device certification',
        engine: 'Cocos Engine 3.8.8 official source runtime',
        checks,
        errors,
        diagnostics,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors, diagnostics }, null, 2));
} catch (e) {
  await activePage
    .screenshot({ path: fileURLToPath(new URL('test-failure.png', out)) })
    .catch(() => {});
  throw e;
} finally {
  await f.close();
}
