import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { canDispatch } from '../assets/scripts/core/simulation.ts';
import { sourceHash } from '../scripts/artifact.mjs';
const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const out = fileURLToPath(
  new URL(
    process.env.CAPTURE_GAME_EVIDENCE === '1'
      ? '../docs/design/screen-flow-2026-10-23/runtime/'
      : '../test-results/cocos/',
    import.meta.url,
  ),
);
if (!existsSync(path.join(root, 'build-info.json')))
  throw Error(
    'No genuine Creator output. Run build on Creator 3.8.8 first; browser checks are not skipped.',
  );
const info = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
assert.equal(info.creator, '3.8.8');
assert.equal(
  info.sourceHash,
  await sourceHash(),
  'Browser verification requires the current Creator source fingerprint.',
);
await mkdir(out, { recursive: true });
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname,
      file = path.resolve(
        root,
        '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname),
      );
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    res
      .writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ||
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  }),
  page = await context.newPage(),
  errors = [],
  checks = [];
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        window.__sharedUrl = text;
      },
    },
  });
});
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(60000);
const screen = () => page.evaluate(() => window.homeboundView());
const snap = () => page.evaluate(() => window.homeboundSnapshot());
const mode = async (name) => {
  await page.waitForFunction((name) => window.homeboundView?.().page === name, name);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
};
const tap = async (id) => {
  if (id.startsWith('speed:') && !(await screen()).speedExpanded) await tap('speed-menu');
  await page.waitForFunction(
    (id) => window.homeboundView?.().buttons.some((b) => b.id === id && !b.disabled),
    id,
  );
  const b = (await screen()).buttons.find((b) => b.id === id);
  await page.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
};
const shot = async (name) => page.screenshot({ path: path.join(out, name + '.png') });
const viewportEvidence = { dispatches: [], pan: null };
const insideButton = (point, button) =>
  point.x >= button.x &&
  point.x <= button.x + button.w &&
  point.y >= button.y &&
  point.y <= button.y + button.h;
const assertButtonsFit = (view, width, height) => {
  for (const button of view.buttons) {
    assert.ok(button.w >= 44 && button.h >= 44, `${button.id} needs a 44px touch target`);
    assert.ok(
      button.x >= 0 &&
        button.y >= 0 &&
        button.x + button.w <= width + 1 &&
        button.y + button.h <= height + 1,
      `${button.id} must fit ${width}×${height}`,
    );
  }
};
const touchVisibleCar = async (width, height) => {
  const view = await screen(),
    before = await snap();
  assert.equal(before.level, 100);
  assert.equal(view.speed, 1);
  assert.equal(before.services.length, 0);
  const car = view.cars.find(
    (car) => car.available && !view.buttons.some((button) => insideButton(car, button)),
  );
  assert.ok(car, `${width}×${height} must expose a legally dispatchable car`);
  await page.touchscreen.tap(car.x, car.y);
  await page.waitForFunction(
    (id) => window.homeboundSnapshot().services.some((job) => job.vehicleId === id),
    car.id,
  );
  const after = await snap();
  assert.equal(after.services.length, 1, 'One real touch must dispatch exactly one car');
  viewportEvidence.dispatches.push({
    width,
    height,
    touch: car,
    before: { time: before.time, scroll: view.scroll, services: before.services },
    after: { time: after.time, services: after.services },
  });
  await shot(`level100-dispatched-${width}`);
};
const dragBoardUp = async () => {
  const view = await screen();
  // Start on an actual holding car: a drag must cancel this otherwise valid car press.
  const start = view.cars
    .filter(
      (car) =>
        car.y > 190 &&
        car.y < 548 &&
        car.x > 24 &&
        car.x < 296 &&
        !view.buttons.some((button) => insideButton(car, button)),
    )
    .sort((a, b) => b.y - a.y)[0];
  assert.ok(start, 'The small board needs a visible car from which to drag');
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: start.x, y: start.y }],
    });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: start.x, y: start.y + ((100 - start.y) * step) / 10 }],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return { from: { x: start.x, y: start.y, vehicleId: start.id }, to: { x: start.x, y: 100 } };
};
// Level 1: two unobstructed cars must move concurrently before the first boarding.
const parallelEvidence = { clickOrder: ['巡02', '巡01'], snapshots: {} };
const parallelFrame = async (label) => {
  const frame = await page.evaluate(() => {
    const view = window.homeboundView();
    return {
      wallTimeMs: performance.now(),
      state: window.homeboundSnapshot(),
      view: {
        page: view.page,
        speed: view.speed,
        unlockedSpeeds: view.unlockedSpeeds,
        practice: view.practice,
        adPending: view.adPending,
        cars: view.cars,
      },
    };
  });
  parallelEvidence.snapshots[label] = frame;
  return frame;
};
const expectedAssignments = [
  {
    vehicleId: '巡02',
    groupId: 'T01',
    bayId: 'T1',
    assignmentOrder: 0,
    pickupPoint: { x: -6, z: -6 },
  },
  {
    vehicleId: '巡01',
    groupId: 'T02',
    bayId: 'T2',
    assignmentOrder: 1,
    pickupPoint: { x: -2, z: -6 },
  },
];
const assertParallelAssignments = (state, count = 2) => {
  for (const expected of expectedAssignments.slice(0, count)) {
    const job = state.services.find((job) => job.vehicleId === expected.vehicleId);
    assert.ok(job, `Touch must dispatch ${expected.vehicleId}.`);
    for (const key of Object.keys(expected)) assert.deepEqual(job[key], expected[key]);
    assert.deepEqual(job.walkFrom, expected.pickupPoint);
    assert.equal(state.vehicles.find((v) => v.id === expected.vehicleId).groupId, expected.groupId);
    assert.equal(state.groups.find((g) => g.id === expected.groupId).vehicleId, expected.vehicleId);
  }
};
const touchParallelCar = async (frame, id) => {
  const car = frame.view.cars.find((car) => car.id === id);
  assert.equal(car?.available, true, `${id} must be legally dispatchable in the real level.`);
  await page.touchscreen.tap(car.x, car.y);
  await page.waitForFunction(
    (id) => window.homeboundSnapshot().services.some((job) => job.vehicleId === id),
    id,
  );
};
const fixture = async (status) =>
  page.evaluate((status) => {
    window.SmallGamesPublishingConfig = { adsEnabled: true };
    window.SmallGamesRewardAds = {
      available: true,
      offer: async () => ({ status }),
      cancel: () => {},
    };
  }, status);
try {
  await page.goto(base + '?dev=0', { waitUntil: 'domcontentloaded' });
  await shot('loading-390');
  await mode('home');
  await shot('home-390');
  assert.equal((await screen()).demoTime, 0, 'Reduced motion keeps the home demonstration still');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await mode('home');
  await page.waitForFunction(() => window.homeboundView().demoTime > 2);
  assert.equal((await snap()).time, 0, 'Home demonstration must not advance the real run');
  assert.equal((await snap()).services.length, 0);
  checks.push('home has an independent moving arrow-puzzle demonstration; respects reduced motion');
  await tap('settings');
  await mode('settings');
  const sound = (await screen()).progress.sound;
  await tap('sound');
  assert.equal((await screen()).progress.sound, !sound);
  await tap('sound');
  await shot('settings-390');
  await tap('help');
  await mode('help');
  await shot('help-390');
  await tap('back');
  await mode('settings');
  assert.equal(
    (await screen()).buttons.some((button) => button.id === 'fullscreen'),
    false,
  );
  await tap('home');
  checks.push('settings, sound persistence and help return; no fullscreen control');
  await tap('levels');
  await mode('levels');
  assert.equal((await screen()).buttons.find((b) => b.id === 'level:1').disabled, true);
  await shot('levels-390');
  await tap('home');
  await tap('continue');
  await mode('playing');
  await shot('playing-390');
  assert.equal((await screen()).buttons.filter((b) => b.id.startsWith('speed:')).length, 0);
  await tap('speed-menu');
  assert.equal((await screen()).buttons.filter((b) => b.id.startsWith('speed:')).length, 4);
  await shot('speed-menu-390');
  const menuView = await screen();
  const carBehindMenu = menuView.cars.find(
    (car) => car.available && !menuView.buttons.some((button) => insideButton(car, button)),
  );
  assert.ok(carBehindMenu, 'Menu dismissal must be tested over a real available car');
  await page.touchscreen.tap(carBehindMenu.x, carBehindMenu.y);
  assert.equal((await screen()).speedExpanded, false);
  assert.equal(
    (await snap()).services.length,
    0,
    'Dismissing speed menu must not dispatch a car behind it',
  );
  const car = (await screen()).cars[0],
    before = (await snap()).services.length,
    cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: car.x, y: car.y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await cdp.detach();
  assert.equal((await snap()).services.length, before);
  checks.push('touch cancellation');
  // Run before any ad fixture: genuine level 1, real touches and ordinary 1× time.
  const initialParallel = await parallelFrame('before');
  assert.equal(initialParallel.state.level, 1);
  assert.equal(initialParallel.state.services.length, 0);
  assert.equal(initialParallel.view.practice, false);
  assert.equal(initialParallel.view.speed, 1);
  assert.deepEqual(initialParallel.view.unlockedSpeeds, [1]);
  await touchParallelCar(initialParallel, '巡02');
  const afterFirst = await parallelFrame('afterFirst');
  assertParallelAssignments(afterFirst.state, 1);
  // Observe the real clock; do not inject simulation steps or alter time scale.
  await page.waitForFunction(
    (time) => window.homeboundSnapshot().time >= time,
    afterFirst.state.time + 0.5,
  );
  const beforeSecond = await parallelFrame('beforeSecond');
  await touchParallelCar(beforeSecond, '巡01');
  const afterSecond = await parallelFrame('afterSecond');
  assertParallelAssignments(afterSecond.state);
  await page.waitForFunction(
    (time) => window.homeboundSnapshot().time >= time,
    afterSecond.state.time + 0.5,
  );
  const movedTogether = await parallelFrame('movedTogether');
  parallelEvidence.clickIntervalSeconds = afterSecond.state.time - afterFirst.state.time;
  parallelEvidence.sharedWindowSeconds = movedTogether.state.time - afterSecond.state.time;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  parallelEvidence.movement = parallelEvidence.clickOrder.map((id) => {
    const position = (frame) => frame.state.vehicles.find((v) => v.id === id).position;
    return {
      vehicleId: id,
      fromParking: distance(position(initialParallel), position(movedTogether)),
      duringSharedWindow: distance(position(afterSecond), position(movedTogether)),
    };
  });
  // Preserve diagnostics even if the old implementation fails the displacement check.
  await writeFile(
    path.join(out, 'parallel-departure.json'),
    JSON.stringify(parallelEvidence, null, 2),
  );
  assert.equal(movedTogether.view.speed, 1);
  assert.deepEqual(movedTogether.view.unlockedSpeeds, [1]);
  assert.equal(movedTogether.state.delivered.length, 0);
  assert.ok(movedTogether.state.groups.every((group) => group.boarded === 0));
  assertParallelAssignments(movedTogether.state);
  for (const movement of parallelEvidence.movement) {
    assert.ok(
      movement.fromParking >= 3,
      `${movement.vehicleId} must leave its parking position by at least one car length before anyone boards.`,
    );
    assert.ok(
      movement.duringSharedWindow >= 1,
      `${movement.vehicleId} must physically move while the other taxi is also en route.`,
    );
  }
  checks.push(
    'level 1 at 1×: two real touches about 0.5 simulated seconds apart; both leave parking before first boarding; fixed passenger/pickup bindings',
  );
  await tap('pause');
  await mode('pause');
  assert.equal(
    (await screen()).buttons.some((button) => button.id === 'fullscreen'),
    false,
  );
  const pausedView = await screen(),
    pausedState = await snap();
  const frozen = pausedState.time;
  assert.equal(pausedView.speedExpanded, false);
  assert.equal(
    pausedView.buttons.some(
      (button) => button.id === 'speed-menu' || button.id.startsWith('speed:'),
    ),
    false,
  );
  const carBehindPause = pausedView.cars.find(
    (car) => !pausedView.buttons.some((button) => insideButton(car, button)),
  );
  assert.ok(carBehindPause, 'Pause input blocking must be tested over a real holding car');
  await page.touchscreen.tap(carBehindPause.x, carBehindPause.y);
  await page.waitForTimeout(250);
  assert.equal((await screen()).page, 'pause');
  assert.equal((await snap()).time, frozen);
  assert.deepEqual((await snap()).services, pausedState.services);
  checks.push('pause modal blocks real car touches and keeps the simulation clock frozen');
  await shot('pause-390');
  await tap('resume');
  // A genuine pointer focus transfer triggers browser blur without synthetic lifecycle events.
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'host-focus-probe';
    frame.srcdoc = '<button style="width:100%;height:100%">Host control</button>';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:140px;height:50px;z-index:99999';
    document.body.appendChild(frame);
  });
  await page.frameLocator('#host-focus-probe').getByRole('button').tap();
  await mode('pause');
  const backgroundTime = (await snap()).time;
  await page.waitForTimeout(200);
  assert.equal((await snap()).time, backgroundTime);
  await page.evaluate(() => document.querySelector('#host-focus-probe').remove());
  await tap('resume');
  checks.push('browser focus loss pauses; explicit resume restores play');
  await fixture('dismissed');
  await tap('speed:2');
  await mode('playing');
  assert.equal((await screen()).speed, 1);
  await fixture('failed');
  await tap('speed:3');
  await mode('playing');
  assert.equal((await screen()).speed, 1);
  await fixture('completed');
  await tap('speed:2');
  await mode('playing');
  assert.equal((await screen()).speed, 2);
  assert.deepEqual((await screen()).unlockedSpeeds, [1, 2]);
  await tap('speed:5');
  await mode('playing');
  assert.equal((await screen()).speed, 5);
  checks.push('rewarded speed completion/cancellation/failure; no premature grant');
  const deadline = Date.now() + 180000;
  while (!(await snap()).won && Date.now() < deadline) {
    const raw = await snap(),
      s = { ...raw, delivered: new Set(raw.delivered) };
    assertParallelAssignments(raw);
    const next = (await screen()).cars.find((car) => car.available && canDispatch(s, car.id).ok);
    if (next) await page.touchscreen.tap(next.x, next.y);
    await page.waitForTimeout(65);
  }
  assert.equal((await snap()).won, true);
  assertParallelAssignments((await parallelFrame('completed')).state);
  await mode('result');
  await shot('result-390');
  assert.ok((await screen()).progress.stars[0] > 0);
  checks.push('real touch solve with concurrent taxis; settlement and unlock');
  await tap('share');
  const shared = new URL(await page.evaluate(() => window.__sharedUrl));
  assert.equal(shared.searchParams.get('station'), '1');
  assert.equal(shared.searchParams.has('dev'), false);
  checks.push('public invitation sharing removes developer mode');
  await tap('next');
  await mode('playing');
  assert.deepEqual((await screen()).unlockedSpeeds, [1]);
  await tap('pause');
  await tap('home');
  await page.reload();
  await mode('home');
  assert.ok((await screen()).progress.stars[0] > 0);
  const saved = await page.evaluate(() => localStorage.getItem('homebound-station.progress.v2'));
  await page.goto(base + '?dev=1&level=100');
  await mode('playing');
  assert.equal((await snap()).level, 100);
  assert.equal((await screen()).practice, true);
  assert.ok((await snap()).vehicles.length >= 48);
  assert.equal((await screen()).layout.columns, 6);
  assert.ok((await screen()).layout.rows >= 8);
  await shot('level100-390');
  await touchVisibleCar(390, 844);
  // A new practice run keeps the pan probe independent of any travelling vehicle.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(base + '?dev=1&level=100');
  await mode('playing');
  await page.waitForFunction(() => window.homeboundView().scroll.max > 0);
  const beforePanView = await screen(),
    beforePanState = await snap();
  assert.equal(beforePanState.services.length, 0);
  assert.equal(beforePanView.scroll.y, 0);
  assertButtonsFit(beforePanView, 320, 568);
  const bottomRow = Math.max(...beforePanState.vehicles.map((car) => car.row));
  const bottomIds = beforePanState.vehicles
    .filter((car) => car.row === bottomRow)
    .map((car) => car.id);
  assert.ok(
    bottomIds.some((id) => !beforePanView.cars.some((car) => car.id === id)),
    'At least part of the bottom row must initially be clipped on 320×568',
  );
  const gestures = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const view = await screen();
    if (view.scroll.y >= view.scroll.max - 1) break;
    gestures.push(await dragBoardUp());
    assert.equal((await snap()).services.length, 0, 'Dragging must never dispatch the pressed car');
  }
  const afterPanView = await screen(),
    afterPanState = await snap();
  viewportEvidence.pan = {
    width: 320,
    height: 568,
    bottomRow,
    bottomIds,
    gestures,
    before: {
      time: beforePanState.time,
      scroll: beforePanView.scroll,
      cars: beforePanView.cars,
      services: beforePanState.services,
    },
    after: {
      time: afterPanState.time,
      scroll: afterPanView.scroll,
      cars: afterPanView.cars,
      services: afterPanState.services,
    },
  };
  await writeFile(path.join(out, 'viewport-input.json'), JSON.stringify(viewportEvidence, null, 2));
  assert.ok(afterPanView.scroll.y > 0, 'Real touch dragging must move the board upward');
  assert.ok(
    afterPanView.scroll.y >= afterPanView.scroll.max - 1,
    'Repeated drags must reach the bottom',
  );
  assert.ok(
    bottomIds.every((id) => afterPanView.cars.some((car) => car.id === id)),
    'Every bottom-row car must become visible after scrolling',
  );
  assert.deepEqual(
    afterPanState.vehicles.map((car) => ({ id: car.id, position: car.position, state: car.state })),
    beforePanState.vehicles.map((car) => ({
      id: car.id,
      position: car.position,
      state: car.state,
    })),
    'Dragging moves the viewport, not parked vehicles',
  );
  assert.deepEqual(
    afterPanView.buttons,
    beforePanView.buttons,
    'The HUD stays fixed while the board pans',
  );
  await shot('level100-scrolled-320');
  await tap('pause');
  await tap('home');
  assertButtonsFit(await screen(), 320, 568);
  await shot('home-320');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(base + '?dev=1&level=100');
  await mode('playing');
  assert.equal((await screen()).scroll.max, 0, 'The landscape board fits without vertical panning');
  assertButtonsFit(await screen(), 844, 390);
  await shot('level100-844');
  await touchVisibleCar(844, 390);
  await writeFile(path.join(out, 'viewport-input.json'), JSON.stringify(viewportEvidence, null, 2));
  checks.push(
    'level 100: genuine 320×568 touch pan reveals the bottom row without dispatch; fixed HUD; real available-car touches dispatch on 390×844 and 844×390',
  );
  await tap('pause');
  await tap('home');
  assertButtonsFit(await screen(), 844, 390);
  await shot('home-844');
  // Chapter buttons differ on short screens; return to portrait before selecting chapter ten.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await tap('levels');
  await tap('chapter:9');
  assert.equal((await screen()).buttons.find((b) => b.id === 'level:99').disabled, false);
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const b = (await screen()).buttons;
    for (const x of b) {
      assert.ok(x.w >= 44 && x.h >= 44);
      assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= width + 1 && x.y + x.h <= height + 1);
    }
    if (width === 320) {
      await tap('chapter:4');
      assert.equal(
        (await screen()).chapter,
        4,
        'The developer launcher must not cover chapter five.',
      );
      await tap('chapter:9');
    }
    await shot(`levels-${width}`);
  }
  assert.equal(
    await page.evaluate(() => localStorage.getItem('homebound-station.progress.v2')),
    saved,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('dev', '1'));
  await page.goto(base + '?dev=0&level=100');
  await mode('home');
  await tap('levels');
  await tap('chapter:9');
  assert.equal((await screen()).buttons.find((b) => b.id === 'level:99').disabled, true);
  checks.push(
    'URL dev free selection, explicit-off precedence, saved progress, portrait/landscape',
  );
  await page.goto(base + '?station=100&dev=0');
  await mode('home');
  await tap('continue');
  await mode('playing');
  assert.equal((await snap()).level, 100);
  assert.equal((await screen()).practice, true);
  await tap('pause');
  await tap('home');
  await tap('levels');
  assert.equal((await screen()).buttons.find((b) => b.id === 'level:99').disabled, true);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('homebound-station.progress.v2')),
    saved,
  );
  checks.push('invited level 100 is practice and does not bypass normal progression');
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        browser: await browser.version(),
        creator: info,
        checks,
        parallelDeparture: parallelEvidence,
        viewportInput: viewportEvidence,
        errors,
        environment:
          'Chromium touch emulation of real Creator web build, not physical-device certification',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  await shot('failure');
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
