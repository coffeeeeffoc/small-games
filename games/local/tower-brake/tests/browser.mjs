import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { chromium } from '@playwright/test';
import { LEVELS, createEndlessLayer } from '../levels.mjs';
import { normalizeAngle, BALL_ANGLE, layerRotationAt } from '../engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../docs/design/cocos-2026-10-22/', import.meta.url);
const screenshots = new URL('../publishing/gameplay/screenshots/', import.meta.url);
const videos = new URL('../publishing/gameplay/videos/', import.meta.url);
for (const dir of [evidence, screenshots, videos]) await mkdir(dir, { recursive: true });
const port = Number(process.env.TOWER_BRAKE_TEST_PORT || 4463),
  origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port)], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (c) => reject(Error('Preview exited ' + c)));
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const report = {
  engine: 'Cocos Creator 3.8.8',
  date: new Date().toISOString(),
  checks: [],
  errors: [],
  screenshots: [],
  sourceHash: JSON.parse(
    await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'),
  ).sourceHash,
};
const check = (name) => {
  report.checks.push(name);
  console.log('PASS ' + name);
};
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  recordVideo: {
    dir: fileURLToPath(new URL('../reports/video/', import.meta.url)),
    size: { width: 390, height: 844 },
  },
});
// Mock the API encoded in the actual artifact, including production Pages builds.
const bootstrap = {};
runInNewContext(
  await readFile(new URL('../dist/competition-config.js', import.meta.url), 'utf8'),
  bootstrap,
);
const apiBase = new URL(
  bootstrap.__COMPETITION_CONFIG__?.apiUrl || '/api/competition/v1',
  origin,
).href.replace(/\/$/, '');
const isCompetitionRequest = (url) => new URL(url).href.startsWith(apiBase + '/');
report.apiBase = apiBase;
let requestDelay = 0,
  delayedRequests = 0;
await context.route(isCompetitionRequest, async (route) => {
  if (requestDelay) delayedRequests++;
  if (requestDelay) await new Promise((resolve) => setTimeout(resolve, requestDelay));
  await route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"SERVICE_UNAVAILABLE"}',
  });
});
const page = await context.newPage(),
  cdp = await context.newCDPSession(page);
const videoStart = performance.now();
report.videoCues = [];
const errors = new Set(),
  engineWarnings = new Set();
page.on('pageerror', (e) => errors.add(e.message));
page.on('console', (m) => {
  if (m.text().startsWith('Ignored attempt to cancel a touchcancel event with cancelable=false'))
    engineWarnings.add(m.text());
  else if (m.type() === 'error' && !m.text().includes('Failed to load resource'))
    errors.add(m.text().split('\n')[0]);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !isCompetitionRequest(r.url()))
    errors.add(r.status() + ' ' + r.url());
});
const snap = async () => {
  const s = await page.evaluate(() => globalThis.__tower?.snapshot());
  if (!s) return s;
  assert.equal(
    new Set(s.controls.map((c) => c.id)).size,
    s.controls.length,
    'each native control owns a unique label and accessibility node',
  );
  assert.ok(!s.labels.some((l) => l.id === 'sighting'), 'scenery must not have floating labels');
  for (const c of s.controls) {
    if (['pause', 'brake'].includes(c.id)) continue;
    const label = s.labels.find((l) => l.id === 'b:' + c.id);
    assert.equal(label?.text, c.label, c.id + ' visible Cocos label');
    assert.ok(
      Math.abs(label.x - c.x - c.w / 2) < 0.1 && Math.abs(label.y - c.y - c.h / 2) < 3,
      c.id + ' label centered on its own button',
    );
    for (const d of s.controls)
      if (c !== d)
        assert.ok(
          Math.min(c.x + c.w, d.x + d.w) - Math.max(c.x, d.x) <= 0.1 ||
            Math.min(c.y + c.h, d.y + d.h) - Math.max(c.y, d.y) <= 0.1,
          c.id + ' and ' + d.id + ' hit areas overlap',
        );
  }
  return s;
};
const waitScreen = (screen) =>
  page.waitForFunction((value) => globalThis.__tower?.snapshot().screen === value, screen);
async function ready(query = '') {
  await page.goto(origin + '/' + query);
  await page.waitForFunction(() => globalThis.__tower?.snapshot().assetReady);
  await page.waitForTimeout(120);
}
async function point(x, y) {
  const s = await snap(),
    b = await page.locator('#GameCanvas').boundingBox(),
    scale = Math.min(b.width / s.width, b.height / s.height);
  return {
    x: b.x + (b.width - s.width * scale) / 2 + x * scale,
    y: b.y + (b.height - s.height * scale) / 2 + y * scale,
  };
}
async function tap(id) {
  const s = await snap(),
    c = s.controls.find((v) => v.id === id && !v.disabled);
  assert.ok(c, 'enabled ' + id);
  const p = await point(c.x + c.w / 2, c.y + c.h / 2);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(40);
}
async function turn(angle, cancel = false) {
  if (Math.abs(angle) < 0.003) return;
  const dx = (-angle / (Math.PI * 1.7)) * 360,
    x = dx < 0 ? 300 : 60;
  const a = await point(x, 350),
    b = await point(x + dx, 350);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(20);
}
async function shot(name) {
  const path = fileURLToPath(new URL(name + '.png', screenshots));
  await page.screenshot({ path });
  report.screenshots.push(name + '.png');
  report.videoCues.push({ name, timeSeconds: (performance.now() - videoStart) / 1000 });
}
async function win() {
  for (let i = 0; i < 500; i++) {
    const s = await snap();
    if (s.screen === 'result') break;
    await turn(s.landing?.rotationToGap || 0);
    await page.waitForTimeout(40);
  }
  assert.equal((await snap()).state.status, 'won');
}
async function lose() {
  const s = await snap(),
    l =
      s.state.mode === 'endless'
        ? createEndlessLayer(s.state.totalFloors, 0)
        : LEVELS[s.selected].layers[s.state.nextLayer],
    d = l.danger[0];
  const angle =
    normalizeAngle(
      BALL_ANGLE -
        d.start -
        normalizeAngle(d.end - d.start) / 2 -
        s.state.rotation -
        layerRotationAt(l, s.state.elapsed) +
        Math.PI,
    ) - Math.PI;
  await turn(angle);
  await waitScreen('result');
  assert.equal((await snap()).state.status, 'lost');
}
async function challenge(index) {
  await ready('?challenge=tower-v1&level=' + LEVELS[index].id + '&targetScore=1800');
  await tap('challenge');
  await waitScreen('playing');
}
let video;
try {
  await ready();
  assert.equal((await snap()).engine, 'Cocos Creator 3.8.8');
  await shot('01-home-390x844');
  assert.ok(!(await snap()).controls.some((c) => c.id === 'boards'), 'offline leaderboard hidden');
  await tap('levels');
  assert.equal((await snap()).controls.filter((c) => c.id.startsWith('level-')).length, 8);
  assert.ok((await snap()).controls.find((c) => c.id === 'level-7').disabled);
  await shot('02-chapters-390x844');
  await tap('home');
  await tap('settings');
  await tap('sound');
  await tap('motion');
  await tap('skin-ice');
  assert.equal((await snap()).reducedMotion, true);
  await tap('motion');
  await tap('sound');
  await tap('skin-mint');
  await tap('home');
  await tap('help');
  await shot('03-guide-390x844');
  await tap('home');
  check(
    'Native Cocos home, locked chapter grid, help and persisted settings; offline play has no leaderboard button',
  );
  await tap('start');
  await waitScreen('playing');
  await shot('04-space-390x844');
  const before = await snap();
  assert.ok(
    before.ringMeshes.some((n) => n >= 4),
    'Creator rendered the ring body and hazards, not just the central collar',
  );
  await tap('brake');
  assert.equal((await snap()).state.charge, 0);
  await turn(0.28, true);
  assert.equal((await snap()).pointerActive, false);
  assert.notEqual((await snap()).state.rotation, before.state.rotation);
  await tap('pause');
  const frozen = (await snap()).state;
  await page.waitForTimeout(350);
  assert.deepEqual((await snap()).state, frozen);
  await shot('05-pause-390x844');
  await tap('resume');
  await waitScreen('playing');
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await waitScreen('paused');
  await tap('resume');
  check(
    'Touch brake, drag, touchcancel, pause freeze and simulated browser blur preserve input and timer boundaries',
  );
  await win();
  const moved = await snap();
  assert.equal(
    moved.environment.from,
    before.environment.from,
    'campaign remains in its chosen environment',
  );
  assert.ok(moved.sceneryDistance > 9);
  assert.ok(
    Math.abs(moved.sky[0].y - before.sky[0].y) > 5,
    'sky visibly moves during one short route',
  );
  assert.ok(
    Math.abs(moved.sky[1].alpha - before.sky[1].alpha) > 40,
    'same-climate views crossfade while descending',
  );
  await shot('06-result-390x844');
  assert.equal((await snap()).unlocked, 2);
  assert.equal(
    JSON.parse(await page.evaluate(() => localStorage.getItem('tower-brake-v1'))).unlocked,
    2,
  );
  check('First route completed through real touch input, result and second-route unlock saved');
  await tap('home');
  assert.ok((await snap()).cameraReference <= 121, 'home resets the camera after a full descent');
  await tap('levels');
  await tap('level-0');
  await waitScreen('playing');
  assert.ok((await snap()).cameraReference <= 121, 'restarting the same route resets the camera');
  await lose();
  assert.ok((await snap()).controls.some((c) => c.id === 'continue'));
  await tap('continue');
  await waitScreen('playing');
  assert.ok((await snap()).cameraReference <= 121, 'continue frames the checkpoint');
  await lose();
  assert.ok(!(await snap()).controls.some((c) => c.id === 'continue'));
  await tap('retry');
  await waitScreen('playing');
  await tap('pause');
  await tap('home');
  check('Failure, one free continue, second failure and retry form a complete loop');
  for (const [index, name] of [
    [8, '07-thin-air'],
    [18, '08-middle-clouds'],
    [23, '09-low-snow'],
    [26, '09b-low-rain'],
  ]) {
    await challenge(index);
    await page.waitForTimeout(500);
    await shot(name + '-390x844');
    assert.equal((await snap()).environment.from, index === 8 ? 1 : index === 18 ? 2 : 3);
    await win();
    await tap('home');
    const restored = await snap();
    assert.equal(restored.selected, 0, 'challenge must not replace the selected normal route');
    assert.equal(restored.challenge, false);
    assert.ok(restored.cameraReference <= 121, 'challenge home restores the initial camera');
  }
  await tap('start');
  assert.equal((await snap()).selected, 0, 'normal start cannot inherit a locked challenge route');
  await tap('pause');
  await tap('home');
  assert.equal(
    JSON.parse(await page.evaluate(() => localStorage.getItem('tower-brake-v1'))).unlocked,
    2,
  );
  check(
    'Thin, middle, snow and rain routes completed through shared-challenge touch input; returning home restores camera and normal progress',
  );
  requestDelay = 500;
  const delayedBeforeStart = delayedRequests;
  await ready();
  await tap('start');
  await waitScreen('connecting');
  assert.ok(delayedRequests > delayedBeforeStart, 'start must wait on a request intercepted by the delayed API mock');
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await waitScreen('paused');
  assert.equal((await snap()).state.elapsed, 0, 'blur during connection must not start the clock');
  await page.waitForTimeout(250);
  assert.equal((await snap()).state.elapsed, 0);
  await tap('resume');
  await waitScreen('playing');
  await tap('pause');
  await tap('home');
  requestDelay = 0;
  check(
    'Blur while a delayed start request is pending requires explicit resume and preserves zero elapsed time',
  );
  await ready();
  await tap('endless');
  await waitScreen('playing');
  const endlessStart = await snap();
  for (let i = 0; i < 1400 && (await snap()).state.totalFloors < 80; i++) {
    await turn((await snap()).landing.rotationToGap);
    await page.waitForTimeout(40);
  }
  assert.ok((await snap()).state.totalFloors >= 80);
  assert.equal((await snap()).environment.from, 1);
  assert.equal((await snap()).environment.blend, 0);
  assert.notDeepEqual((await snap()).sky, endlessStart.sky);
  await shot('10-endless-first-transition-390x844');
  await lose();
  assert.deepEqual(
    (await snap()).controls.map((c) => c.id),
    ['retry', 'home'],
  );
  await shot('10b-endless-result-390x844');
  await tap('retry');
  await waitScreen('playing');
  await tap('pause');
  await tap('home');
  check(
    'Endless passes 80 floors through the first natural atmosphere transition; failed-run buttons have unique, visible labels and retry works',
  );
  await ready('?dev=1');
  const action = page.locator('[data-dev-action="tower-atmosphere"]');
  // Shared developer UI uses a shadow root; open its existing toggle through normal clicks.
  await page.locator('small-games-devtools [data-toggle]').click();
  await action.click();
  await page.locator('small-games-devtools [data-close]').click();
  await waitScreen('playing');
  assert.equal((await snap()).practice, true);
  assert.ok((await snap()).environment.blend > 0);
  await shot('11-endless-transition-fixture-390x844');
  for (const [from, to] of [
    [1, 2],
    [2, 3],
    [3, 2],
    [2, 1],
    [1, 0],
  ]) {
    await page.locator('small-games-devtools [data-toggle]').click();
    await action.click();
    await page.locator('small-games-devtools [data-close]').click();
    await waitScreen('playing');
    const s = await snap();
    assert.equal(s.environment.from, from);
    assert.equal(s.environment.to, to);
    assert.ok(s.environment.blend > 0 && s.environment.blend < 1);
    assert.ok(
      s.sky.some((p) => p.frame % 4 === from && p.alpha > 0) &&
        s.sky.some((p) => p.frame % 4 === to && p.alpha > 0),
    );
    await shot(`cycle-${from}-to-${to}-fixture-390x844`);
  }
  await tap('pause');
  await tap('home');
  check(
    'Development mode snapshot remains read-only; developer actions are isolated from saved progress',
  );
  const recorded = await snap();
  assert.equal(recorded.engine, 'Cocos Creator 3.8.8');
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await ready();
    const s = await snap(),
      b = await page.locator('#GameCanvas').boundingBox(),
      scale = Math.min(b.width / s.width, b.height / s.height);
    for (const c of s.controls) {
      assert.ok(c.w * scale >= 43.9 && c.h * scale >= 43.9, c.id + ' minimum hit area');
      assert.ok(
        c.x >= 0 && c.y >= 0 && c.x + c.w <= s.width + 0.1 && c.y + c.h <= s.height + 0.1,
        c.id + ' inside viewport',
      );
    }
    await tap('start');
    await waitScreen('playing');
    await tap('pause');
    await tap('home');
    await tap('settings');
    await snap();
    await tap('home');
    await tap('levels');
    await snap();
    await tap('home');
    await shot('responsive-' + size.width + 'x' + size.height);
  }
  check(
    '320px narrow screen and landscape letterbox retain playable native controls with at least 44px hit areas',
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  report.errors = [...errors];
  assert.deepEqual(report.errors, []);
  video = page.video();
  await context.close();
  const raw = await video.path();
  await copyFile(raw, new URL('tower-brake-cocos-touch-390x844.webm', videos));
  report.video = 'publishing/gameplay/videos/tower-brake-cocos-touch-390x844.webm';
} finally {
  report.errors = [...errors];
  report.engineWarnings = [...engineWarnings];
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.kill();
}
