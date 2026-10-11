import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

execFileSync(process.execPath, [fileURLToPath(new URL('../build.mjs', import.meta.url))]);
const out = new URL('../docs/design/expansion-2026-10-11/', import.meta.url);
await mkdir(out, { recursive: true });
const root = new URL('../dist/', import.meta.url);
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = new URL(pathname === '/' ? 'index.html' : pathname.slice(1), root);
    if (!file.href.startsWith(root.href)) return res.writeHead(403).end();
    const mime = file.pathname.endsWith('.html')
      ? 'text/html'
      : /\.(js|mjs)$/.test(file.pathname)
        ? 'text/javascript'
        : file.pathname.endsWith('.css')
          ? 'text/css'
          : file.pathname.endsWith('.webp')
            ? 'image/webp'
            : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
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
const snapshot = () => p.evaluate(() => window.RetreatRally.snapshot());
const tap = (selector) => p.locator(selector).filter({ visible: true }).first().tap();
const cdp = await context.newCDPSession(p);
async function point(selector, id = 1) {
  const b = await p.locator(selector).boundingBox();
  return { id, x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function smartWin() {
  let recovering = false,
    held = false,
    sawWarning = false,
    sawCounterattack = false;
  const touch = await point('#retreat-blue');
  for (let i = 0; i < 1000; i++) {
    const { battle: s, screen } = await snapshot();
    if (screen === 'result') {
      assert.equal(s.status, 'won');
      return { sawWarning, sawCounterattack };
    }
    const blue = s.units.filter((u) => u.side === 'blue' && u.hp > 0);
    const stamina = blue.reduce((sum, u) => sum + u.stamina, 0) / blue.length;
    if (stamina < 35) recovering = true;
    if (stamina > 93) recovering = false;
    const danger = ['warning', 'gap', 'impact'].includes(s.volley.phase);
    const inZone = s.volley.zones.some((z) =>
      blue.some((u) => u.x > z.x - 30 && u.x < z.x + z.width + 10),
    );
    const next = recovering || (danger && inZone);
    if (next !== held) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: next ? 'touchStart' : 'touchEnd',
        touchPoints: next ? [touch] : [],
      });
      held = next;
    }
    if (!sawWarning && s.volley.phase === 'warning') {
      await shot('arrow-beat');
      sawWarning = true;
    }
    if (
      !sawCounterattack &&
      (await p.locator('#volley-notice').evaluate((e) => e.classList.contains('counterattack')))
    ) {
      await shot('counterattack');
      sawCounterattack = true;
    }
    await p.clock.runFor(100);
  }
  throw new Error('Campaign did not finish');
}
try {
  await p.clock.install({ time: new Date('2026-10-11T00:00:00Z') });
  await p.goto(`${base}/`);
  await p.waitForFunction(() => Boolean(window.RetreatRally));
  await p.clock.pauseAt(new Date((await p.evaluate(() => Date.now())) + 1000));
  await shot('home');
  await tap('#levels-open');
  assert(await p.locator('[data-level=crossbow]').isDisabled());
  await tap('#levels [data-go=home]');
  await tap('#start');
  await shot('play');
  await tap('#pause');
  const paused = (await snapshot()).battle.time;
  await p.clock.runFor(10000);
  assert.equal((await snapshot()).battle.time, paused);
  await shot('pause');
  await tap('#resume');
  const beats = await smartWin();
  assert(beats.sawWarning && beats.sawCounterattack);
  await shot('result');
  await tap('#share-result');
  const shared = await p.evaluate(() => window.lastSharedUrl);
  assert(shared && !shared.includes('dev='));
  assert.equal(new URL(shared).searchParams.get('rallyChallenge'), '1');
  const saved = await p.evaluate(() => localStorage.getItem('retreat-rally:progress:v1'));
  checks.push(
    'Landscape touch play reaches a normal victory; pause freezes clock; arrow progress and final-arrow counterattack cue visible; share copies bounded same-level challenge',
  );
  const invite = new URL(shared);
  invite.searchParams.set('level', 'crossbow');
  await p.goto(invite.href);
  await p.waitForFunction(() => Boolean(window.RetreatRally));
  await shot('challenge-home');
  await tap('#start');
  assert.equal((await snapshot()).battle.level.id, 'crossbow');
  await smartWin();
  assert.equal(await p.evaluate(() => localStorage.getItem('retreat-rally:progress:v1')), saved);
  assert.equal(await p.locator('#next').isVisible(), false);
  await shot('challenge-result');
  checks.push(
    'Locked two-volley level can be challenged and won without granting campaign medals or unlocks',
  );
  for (let i = 0; i < 2; i++) {
    await tap('#retry');
    for (let tick = 0; tick < 181 && (await snapshot()).screen === 'battle'; tick++)
      await p.clock.runFor(1000);
  }
  assert(await p.locator('[data-game-ad=mock]').isVisible());
  await shot('result-ad');
  await p.getByRole('button', { name: '关闭并继续' }).tap();
  await tap('#result [data-go=home]');
  await tap('#leave-challenge');
  await tap('#levels-open');
  assert(await p.locator('[data-level=crossbow]').isDisabled());
  await tap('#levels [data-go=home]');
  checks.push(
    'Third natural result shows dismissible mock ad; challenge exit restores own campaign',
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await p.clock.runFor(100);
  assert.equal(await p.locator('#game').getAttribute('data-rotated'), 'true');
  await tap('#friend-open');
  await tap('#prepare-start');
  const blue = await point('#retreat-blue', 1),
    red = await point('#retreat-red', 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [blue, red] });
  assert.equal((await snapshot()).battle.retreat.blue, true);
  assert.equal((await snapshot()).battle.retreat.red, true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [blue] });
  assert.equal((await snapshot()).battle.retreat.blue, false);
  assert.equal((await snapshot()).battle.retreat.red, true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal((await snapshot()).battle.retreat.red, false);
  await shot('portrait-dual-touch');
  await tap('#pause');
  await tap('#paused [data-go=home]');
  checks.push(
    'Portrait fallback rotates full interface; two real CDP touches hold independently, release one and cancel other; pause and return remain usable',
  );
  await p.addInitScript(() => {
    globalThis.SmallGamesPublishingConfig = { adMode: 'off' };
  });
  await p.goto(`${base}/`);
  await p.waitForFunction(() => Boolean(window.RetreatRally));
  for (let round = 0; round < 3; round++) {
    await tap(round === 0 ? '#start' : '#retry');
    for (let tick = 0; tick < 181 && (await snapshot()).screen === 'battle'; tick++)
      await p.clock.runFor(1000);
    assert.equal((await snapshot()).screen, 'result');
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
        environment: 'Chromium 844x390 / 390x844 mobile touch emulation, not a physical device',
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
