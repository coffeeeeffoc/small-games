import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createStaticServer } from '../server.mjs';

execFileSync(process.execPath, [fileURLToPath(new URL('../build.mjs', import.meta.url))]);
const out = new URL('../docs/design/expansion-2026-10-11/', import.meta.url);
await mkdir(out, { recursive: true });
const server = createStaticServer({ dist: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: async (text) => {
        window.lastSharedUrl = text;
      },
    },
    configurable: true,
  });
});
const p = await context.newPage(),
  errors = [],
  checks = [];
p.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => {
  await p.clock.runFor(32);
  await p.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)), animations: 'disabled' });
};
const state = () => p.evaluate(() => window.__chaseDev.snapshot());
const tap = (selector) => p.locator(selector).filter({ visible: true }).first().tap();
async function win() {
  for (let i = 0; i < 40; i++) {
    let s = await state();
    if (s.phase === 'won') {
      await p.clock.runFor(900);
      return;
    }
    assert.equal(s.phase, 'running');
    const wave = s.level.waves.find((w) => !s.clearedWaveIds.includes(w.id));
    assert(wave);
    const safe = [0, 1, 2].find((lane) => !wave.obstacles.some((o) => o.lane === lane));
    while ((s = await state()).lane !== safe)
      await tap(`[data-action=${s.lane < safe ? 'right' : 'left'}]`);
    while ((s = await state()).phase === 'running' && s.world <= wave.at + 0.05)
      await p.clock.runFor(100);
  }
  throw new Error('Route never finished');
}
try {
  await p.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
  await p.goto(`${base}/?dev=1`);
  await p.waitForFunction(() => document.querySelector('#game').dataset.ready === 'true');
  await p.clock.pauseAt(new Date((await p.evaluate(() => Date.now())) + 1000));
  await shot('home');
  await tap('#choose-levels');
  assert(await p.locator('[data-level=market]').isDisabled());
  await tap('[data-back]');
  await tap('#start');
  await shot('play');
  const cdp = await context.newCDPSession(p);
  const point = { x: 190, y: 450, id: 1 };
  const lane = (await state()).lane;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point, { x: 230, y: 450, id: 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [point, { x: 310, y: 450, id: 2 }],
  });
  assert.equal((await state()).lane, lane, 'Second touch cannot issue a lane change');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await tap('[data-action=left]');
  assert.equal((await state()).lane, 0);
  await tap('#pause');
  const paused = (await state()).elapsed;
  await p.clock.runFor(10000);
  assert.equal((await state()).elapsed, paused);
  await shot('pause');
  await tap('#resume');
  await win();
  await shot('result');
  assert.equal((await state()).practice, false);
  await tap('#share-result');
  const shared = await p.evaluate(() => window.lastSharedUrl);
  assert(shared && !shared.includes('dev='));
  assert.equal(new URL(shared).searchParams.get('chaseChallenge'), '1');
  const saved = await p.evaluate(() => localStorage.getItem('chase-thief.progress.v1'));
  checks.push(
    'Real touch home/levels/play/pause/result; second touch ignored; cancel releases gesture; normal win persists; share copies clean same-route URL',
  );
  const invite = new URL(shared);
  invite.searchParams.set('dev', '1');
  invite.searchParams.set('level', 'canal');
  await p.goto(invite.href);
  await p.waitForFunction(() => document.querySelector('#game').dataset.ready === 'true');
  assert(await p.locator('#challenge-invite').isVisible());
  await shot('challenge-home');
  await tap('#start');
  assert.equal((await state()).levelId, 'canal');
  await win();
  assert.equal(await p.evaluate(() => localStorage.getItem('chase-thief.progress.v1')), saved);
  assert.equal(await p.locator('#next').isVisible(), false);
  await shot('challenge-result');
  checks.push(
    'Locked street can be challenged without changing normal selection, best times or unlocks; challenge retry has no next-street unlock',
  );
  // Real result boundaries exercise the shared frequency limiter, without injecting scores.
  for (let i = 0; i < 2; i++) {
    await tap('#retry');
    for (let tick = 0; tick < 61 && (await state()).phase === 'running'; tick++)
      await p.clock.runFor(1000);
  }
  assert(await p.locator('[data-game-ad=mock]').isVisible());
  await shot('result-ad');
  await p.getByRole('button', { name: '关闭并继续' }).tap();
  assert.equal(await p.locator('[data-game-ad=mock]').count(), 0);
  await tap('#result-home');
  await tap('#leave-challenge');
  assert.equal(await p.locator('#challenge-invite').isVisible(), false);
  await tap('#choose-levels');
  assert(await p.locator('[data-level=canal]').isDisabled());
  checks.push(
    'Third natural result shows dismissible mock ad; closing returns to result; leaving challenge restores normal locked campaign',
  );
  await tap('[data-back]');
  await p.evaluate(() => {
    window.__chaseDev.start();
    window.__chaseDev.manual();
    window.__chaseDev.set({ distance: 1 });
    window.__chaseDev.step(0.01);
  });
  await p.clock.runFor(900);
  assert.equal(await p.locator('#share-result').isVisible(), false);
  checks.push('Developer-manipulated victories cannot generate shared scores');
  await p.addInitScript(() => {
    globalThis.SmallGamesPublishingConfig = { adMode: 'off' };
  });
  await p.goto(`${base}/?dev=1`);
  await p.waitForFunction(() => document.querySelector('#game').dataset.ready === 'true');
  for (let round = 0; round < 3; round++) {
    await tap(round === 0 ? '#start' : '#retry');
    for (let tick = 0; tick < 61 && (await state()).phase === 'running'; tick++)
      await p.clock.runFor(1000);
    assert.equal((await state()).phase, 'lost');
    assert.equal(await p.locator('[data-game-ad=mock]').count(), 0);
  }
  checks.push('Deployment adMode=off suppresses every popup, including the third natural result');
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('browser-report.json', out),
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        environment: 'Chromium 390x844 mobile touch emulation, not a physical device',
        checks,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(checks.join('\n'));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
