import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { Game } from '../src/engine.mjs';
const publish = process.env.TETRACUBE_CAPTURE === '1';
const captureOnly = publish && process.env.TETRACUBE_CAPTURE_ONLY === '1';
const realClockPages = new WeakSet();
const root = fileURLToPath(new URL('../', import.meta.url)),
  out = root + (publish ? 'docs/design/clarity-2026-10-31/actual/' : 'reports/browser/');
await mkdir(out, { recursive: true });
if (publish) await mkdir(root + 'publishing/gameplay/screenshots', { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4189'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((ok, no) => {
  server.once('error', no);
  server.once('exit', (c) => no(Error('server ' + c)));
  server.stdout.once('data', ok);
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});
const report = {
  environment:
    process.platform + ' Chromium real mouse/CDP touch; no physical device or live ad fill',
  browser: browser.version(),
  checks: [],
  errors: [],
  recordings: {},
};
const snap = (p) => p.evaluate(() => globalThis.__tetracube?.snapshot());
const phase = (p, s) =>
  p.waitForFunction((s) => globalThis.__tetracube?.snapshot().screen === s, s);
const idle = (p) => p.waitForFunction(() => !globalThis.__tetracube?.snapshot().animating);
async function press(p, id, mobile = true) {
  const initial = await snap(p);
  if (
    initial.screen === 'playing' &&
    (id.startsWith('view-') ||
      ['left', 'right', 'invert', 'layer-slice', 'layer-auto', 'pan'].includes(id)) &&
    !initial.controls.some((c) => c.id === id)
  ) {
    await press(p, 'tools', mobile);
    if (realClockPages.has(p)) await p.waitForTimeout(50);
    else await p.clock.runFor(34);
  }
  if (id.startsWith('rotate-') && !initial.controls.some((c) => c.id === id)) {
    await press(p, 'reverse', mobile);
    if (realClockPages.has(p)) await p.waitForTimeout(50);
    else await p.clock.runFor(34);
  }
  await p.waitForFunction(
    (id) => globalThis.__tetracube?.snapshot().controls.some((c) => c.id === id && !c.disabled),
    id,
  );
  const s = await snap(p),
    c = s.controls.find((c) => c.id === id),
    canvas = p.locator('#GameCanvas'),
    b = await canvas.boundingBox();
  const position = {
    x: ((c.x + c.w / 2) * b.width) / s.viewport.width,
    y: ((c.y + c.h / 2) * b.height) / s.viewport.height,
  };
  // Coordinates come from the rendered control and real canvas bounds. Dispatch directly so
  // locator stability waits do not consume the brief physical-turn animation under test.
  await (mobile
    ? p.touchscreen.tap(b.x + position.x, b.y + position.y)
    : p.mouse.click(b.x + position.x, b.y + position.y));
  if (
    (id.startsWith('view-') || ['layer-slice', 'layer-auto'].includes(id)) &&
    (await snap(p)).screen === 'tools'
  )
    await press(p, 'tool-back', mobile);
}
async function capture(p, name) {
  await p.screenshot({ path: out + name + '.png' });
}
async function dragScene(p, context, mobile, dx, dy, cancel = false, duringAnimation = false) {
  const s = await snap(p),
    r = s.scene,
    b = await p.locator('#GameCanvas').boundingBox(),
    scaleX = b.width / s.viewport.width,
    scaleY = b.height / s.viewport.height,
    x = b.x + (r.x + r.w / 2 - dx / 2) * scaleX,
    y = b.y + (r.y + r.h / 2 - dy / 2) * scaleY;
  let observedDuringAnimation = false;
  const checkAnimation = async () => {
    if (!duringAnimation) return;
    const current = await snap(p);
    observedDuringAnimation ||= current.animating && current.camera.yaw !== s.camera.yaw;
  };
  if (mobile) {
    const cdp = await context.newCDPSession(p);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 4; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x + (dx * scaleX * i) / 4, y: y + (dy * scaleY * i) / 4 }],
        });
        await checkAnimation();
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await cdp.detach();
    }
  } else {
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x + dx * scaleX, y + dy * scaleY, { steps: 4 });
    await checkAnimation();
    await p.mouse.up();
  }
  if (duringAnimation)
    assert(observedDuringAnimation, 'camera rotates while physical animation is still running');
  // Wait for actual geometry to be drawn; camera state alone is insufficient.
  if (duringAnimation) await p.clock.runFor(32);
  else
    await p.evaluate(
      () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))),
    );
}
function assertOrbit(before, after) {
  assert.equal(after.view, 'free');
  assert.notEqual(after.camera.yaw, before.camera.yaw, 'horizontal drag rotates the camera');
  assert.notEqual(after.camera.pitch, before.camera.pitch, 'vertical drag rotates the camera');
  assert.notDeepEqual(
    after.containerCorners,
    before.containerCorners,
    'rendered container changes',
  );
  assert.deepEqual(
    after.game.active.pos.slice(0, 2),
    before.game.active.pos.slice(0, 2),
    'observing does not move the piece',
  );
  assert.deepEqual(
    after.game.active.cells,
    before.game.active.cells,
    'observing does not rotate the piece',
  );
  assert.deepEqual(after.game.board, before.game.board, 'observing does not rearrange the board');
}
async function fits(p) {
  const s = await snap(p);
  for (const c of s.controls) {
    assert(c.w >= 43 && c.h >= 43, c.id + ' target');
    assert(
      c.x >= 0 &&
        c.y >= 0 &&
        c.x + c.w <= s.viewport.width + 1 &&
        c.y + c.h <= s.viewport.height + 1,
      c.id + ' fits',
    );
  }
  assert.equal(
    await p.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight + 1,
    ),
    false,
  );
}
function blocked(used = 0) {
  const g = new Game({ seed: 42 }),
    s = g.getSnapshot();
  s.active = null;
  s.pending = structuredClone(s.next[0]);
  s.status = 'danger';
  s.board = [];
  for (let x = 0; x < 8; x++)
    for (let y = 0; y < 8; y++)
      s.board.push({ id: s.board.length + 1, x, y, z: 17, color: '#86ddbe' });
  s.serial = s.board.length;
  return { version: 1, game: s, revivesUsed: used, tutorialStep: 4 };
}
async function open({ width = 390, height = 844, mobile = true, save, ad, video = false, dev = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    ...(video ? { recordVideo: { dir: root + 'reports/video', size: { width, height } } } : {}),
  });
  await context.addInitScript(
    ({ save, ad }) => {
      if (save && !sessionStorage.getItem('qa-initialized')) {
        localStorage.setItem('tetracube.save.v1', JSON.stringify(save));
        sessionStorage.setItem('qa-initialized', '1');
      }
      if (ad) {
        globalThis.__adStatus = ad;
        globalThis.__adCalls = 0;
        globalThis.TetracubeHost = {
          ads: {
            available: true,
            offer: async () => {
              globalThis.__adCalls++;
              return new Promise((resolve) =>
                setTimeout(() => resolve({ status: globalThis.__adStatus }), 800),
              );
            },
          },
        };
      }
    },
    { save, ad },
  );
  const page = await context.newPage();
  if (video) realClockPages.add(page);
  if (!video) await page.clock.install();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:4189/' + (dev ? '?dev=1' : ''));
  await page.locator('body[data-tetracube-ready="true"]').waitFor({ timeout: 60000 });
  assert.equal((await snap(page)).engine, '3.8.8');
  return { page, context };
}
try {
  if (!captureOnly) {
    for (const [width, height, mobile] of [
      [320, 640, true],
      [390, 844, true],
      [844, 390, true],
      [1280, 800, false],
    ]) {
      const { page: p, context } = await open({
        width,
        height,
        mobile,
        video: false,
      });
      try {
        await fits(p);
        await capture(p, 'home-' + width);
        await press(p, 'help', mobile);
        await phase(p, 'help');
        await fits(p);
        await capture(p, 'help-' + width);
        await press(p, 'back', mobile);
        await press(p, 'levels', mobile);
        await phase(p, 'levels');
        await fits(p);
        await capture(p, 'levels-' + width);
        assert(
          (await snap(p)).controls.find((c) => c.id === 'level-space-02').disabled,
          'next level is locked',
        );
        await press(p, 'level-space-01', mobile);
        await phase(p, 'playing');
        await fits(p);
        await capture(p, 'challenge-' + width);
        await press(p, 'drop', mobile);
        await phase(p, 'result');
        await fits(p);
        await capture(p, 'challenge-result-' + width);
        assert.equal((await snap(p)).runStatus, 'won');
        assert.equal((await snap(p)).progress['space-01'].stars, 3);
        await press(p, 'next-level', mobile);
        await phase(p, 'playing');
        assert.equal((await snap(p)).levelId, 'space-02');
        await press(p, 'pause', mobile);
        await press(p, 'home', mobile);
        await press(p, 'ranking', mobile);
        await phase(p, 'ranking');
        await fits(p);
        await capture(p, 'ranking-' + width);
        assert.equal((await snap(p)).rankState, 'offline');
        await press(p, 'rank-endless', mobile);
        await press(p, 'home', mobile);
        await press(p, 'settings', mobile);
        await phase(p, 'settings');
        await fits(p);
        await capture(p, 'settings-' + width);
        await press(p, 'back', mobile);
        await press(p, 'start', mobile);
        await phase(p, 'playing');
        await fits(p);
        await capture(p, 'play-' + width);
        const before = await snap(p);
        await p.clock.pauseAt(new Date(await p.evaluate(() => Date.now() + 50)));
        await press(p, 'rotate-XY-plus', mobile);
        await p.clock.runFor(80);
        assert.notDeepEqual(
          (await snap(p)).game.active.cells,
          before.game.active.cells,
          'rotation',
        );
        const rotating = await snap(p);
        assert(
          rotating.visualPiece.rotation?.angle > 0,
          'quarter turn is visible between endpoints: ' +
            JSON.stringify({
              motions: rotating.motions,
              pose: rotating.visualPiece,
              screen: rotating.screen,
            }),
        );
        assert(rotating.visualPiece.rotation.angle < Math.PI / 2, 'rotation has not snapped');
        await press(p, 'rotate-XZ-plus', mobile);
        await press(p, 'rotate-YZ-minus', mobile);
        assert((await snap(p)).motions >= 2, 'rapid axes keep ordered visual turns');
        const holdBefore = (await snap(p)).game.active.id;
        await press(p, 'hold', mobile);
        assert.equal((await snap(p)).game.held.id, holdBefore);
        assert.equal((await snap(p)).motions, 0, 'hold discards outgoing piece animation');
        await press(p, 'rotate-XY-plus', mobile);
        await press(p, 'rotate-XY-plus', mobile);
        await press(p, 'rotate-XY-plus', mobile);
        await p.clock.runFor(650);
        assert.equal((await snap(p)).motions, 0, 'rapid turns catch up without blocking input');
        assert.deepEqual(
          (await snap(p)).visualPiece.cells,
          new Game().restore((await snap(p)).game).cells(),
        );
        await p.clock.resume();
        await press(p, 'observe', mobile);
        for (const preset of ['iso', 'top', 'front', 'side']) {
          await press(p, 'view-' + preset, mobile);
          await p.evaluate(() => new Promise(requestAnimationFrame));
          const beforeOrbit = await snap(p);
          assert.equal(beforeOrbit.view, preset);
          await dragScene(p, context, mobile, 56, 56);
          const afterOrbit = await snap(p);
          assertOrbit(beforeOrbit, afterOrbit);
          if (preset === 'top')
            assert.notDeepEqual(
              afterOrbit.containerCorners,
              beforeOrbit.containerCorners,
              'top view keeps rotating through the pole',
            );
        }
        await capture(p, 'observe-' + width);
        const unzoomed = await snap(p);
        await press(p, 'zoom-in', mobile);
        await press(p, 'zoom-in', mobile);
        assert((await snap(p)).zoom > 1.4);
        assert.deepEqual((await snap(p)).game.board, unzoomed.game.board);
        await fits(p);
        await capture(p, 'zoom-' + width);
        await press(p, 'fit', mobile);
        assert.equal((await snap(p)).zoom, 1);
        await press(p, 'layer-up', mobile);
        await press(p, 'layer-open', mobile);
        await phase(p, 'layer');
        await fits(p);
        await capture(p, 'layer-inspector-' + width);
        await press(p, 'tool-back', mobile);
        await press(p, 'layer-slice', mobile);
        await capture(p, 'layer-' + width);
        assert((await snap(p)).layerSlice);
        await press(p, 'layer-auto', mobile);
        const released = await snap(p);
        await p.mouse.move(20, 200);
        await p.waitForTimeout(650);
        const stopped = await snap(p);
        assert.deepEqual(stopped.orbitVelocity, { x: 0, y: 0 }, 'release coasts to a bounded stop');
        assert(Math.abs(stopped.camera.yaw - released.camera.yaw) < 0.3, 'coast remains short');
        await p.mouse.move(30, 200);
        await p.waitForTimeout(60);
        assert.deepEqual((await snap(p)).camera, stopped.camera, 'unpressed pointer cannot drag');
        if (mobile) {
          await dragScene(p, context, true, -40, -32, true);
          const cancelled = await snap(p);
          await p.waitForTimeout(60);
          assert.deepEqual(
            (await snap(p)).camera,
            cancelled.camera,
            'touch cancellation stops dragging',
          );
          await dragScene(p, context, true, 32, 24);
          assertOrbit(cancelled, await snap(p));
        }
        if (width === 390) {
          let camera;
          const cdp = await context.newCDPSession(p);
          try {
            const first = { id: 1, x: 130, y: 300 },
              second = { id: 2, x: 230, y: 320 };
            for (const [type, touchPoints] of [
              ['touchStart', [first]],
              ['touchStart', [first, second]],
              [
                'touchMove',
                [
                  { ...first, x: 110 },
                  { ...second, x: 250 },
                ],
              ],
              ['touchEnd', [{ ...first, x: 150 }]],
              ['touchMove', [{ ...first, x: 180 }]],
              ['touchEnd', []],
            ]) {
              await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
              if (!camera) camera = (await snap(p)).camera;
            }
            assert((await snap(p)).zoom > 1, 'two-finger pinch enlarges the board');
            assert.deepEqual(
              (await snap(p)).camera,
              camera,
              'second finger cancels orbit until all touches end',
            );
            const third = { id: 3, x: 190, y: 380 },
              replacement = { id: 4, x: 240, y: 320 };
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [first],
            });
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [first, second],
            });
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [first, second, third],
            });
            const cancelledZoom = (await snap(p)).zoom;
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchEnd',
              touchPoints: [first, second],
            });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [first] });
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [first, replacement],
            });
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [
                { ...first, x: 100 },
                { ...replacement, x: 280 },
              ],
            });
            assert.equal(
              (await snap(p)).zoom,
              cancelledZoom,
              'third-finger cancellation blocks replacement pinch until all-up',
            );
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } finally {
            await cdp.detach();
          }
          const fresh = await snap(p);
          await dragScene(p, context, true, 32, 24);
          assertOrbit(fresh, await snap(p));
        }
        await press(p, 'view-iso', mobile);
        await press(p, 'move', mobile);
        const s = await snap(p),
          r = s.scene,
          b = await p.locator('#GameCanvas').boundingBox(),
          x = b.x + r.x + r.w * 0.5,
          y = b.y + r.y + r.h * 0.5;
        if (mobile) {
          const cdp = await context.newCDPSession(p);
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y }],
          });
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + 65, y: y - 10 }],
          });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        } else {
          await p.mouse.move(x, y);
          await p.mouse.down();
          await p.mouse.move(x + 65, y - 10, { steps: 6 });
          await p.mouse.up();
        }
        assert.notDeepEqual(
          (await snap(p)).game.active.pos.slice(0, 2),
          s.game.active.pos.slice(0, 2),
          'drag',
        );
        await press(p, 'drop', mobile);
        await idle(p);
        assert.equal((await snap(p)).game.placed, 1);
        // Keep the real engine's animation clock within its first frames while dispatching
        // real input. Slow software WebGL must not turn this into an after-animation test.
        await p.clock.pauseAt(new Date(await p.evaluate(() => Date.now() + 100)));
        await press(p, 'invert', mobile);
        await p.clock.runFor(16);
        const flipping = await snap(p);
        assert(flipping.animating, 'physical inversion animates');
        assert.equal(
          flipping.controls.find((c) => c.id === 'observe').disabled,
          false,
          'observation remains available during inversion',
        );
        await press(p, 'observe', mobile);
        await p.clock.runFor(16);
        const duringFlip = await snap(p);
        await dragScene(p, context, mobile, 36, 28, false, true);
        assertOrbit(duringFlip, await snap(p));
        await p.clock.resume();
        await idle(p);
        assert.equal((await snap(p)).game.flipCount, 1);
        assert.equal((await snap(p)).screen, 'playing');
        await press(p, 'pause', mobile);
        await phase(p, 'paused');
        const pausedCamera = (await snap(p)).camera;
        assert.deepEqual((await snap(p)).orbitVelocity, { x: 0, y: 0 }, 'pause cancels inertia');
        // Use an unobstructed scene point; a stale drag must not survive the menu.
        await p.mouse.move(12, 150);
        await p.mouse.down();
        await p.mouse.move(30, 170);
        await p.mouse.up();
        assert.deepEqual((await snap(p)).camera, pausedCamera, 'paused input cannot orbit');
        await fits(p);
        await capture(p, 'paused-' + width);
        await press(p, 'resume', mobile);
        await phase(p, 'playing');
        assert.deepEqual(
          (await snap(p)).camera,
          pausedCamera,
          'resume keeps the observation angle',
        );
        const resumed = await snap(p);
        await dragScene(p, context, mobile, 24, 20);
        assertOrbit(resumed, await snap(p));
        await press(p, 'move', mobile);
        if (width === 390) {
          for (let i = 0; i < 9; i++) {
            await press(p, 'rotate-XZ-plus');
            await press(p, 'drop');
            await idle(p);
            if ((await snap(p)).screen !== 'playing') break;
            await p.waitForTimeout(500);
          }
          await capture(p, 'stack-390');
        }
        if ((await snap(p)).screen === 'playing') await press(p, 'pause', mobile);
        await press(p, 'home', mobile);
        await phase(p, 'home');
        const saved = (await snap(p)).game;
        await p.reload();
        await p.locator('body[data-tetracube-ready="true"]').waitFor();
        assert.deepEqual((await snap(p)).game, saved, 'reload');
        report.checks.push(
          'flow/spatial-icons/rotation/hold/presets/free-orbit/cancel/drag/drop/orbit-during-invert/save ' +
            width +
            'x' +
            height,
        );
      } finally {
        await context.close();
      }
    }
    {
      const { page: p, context } = await open();
      try {
        await p.evaluate(() => {
          globalThis.__rankRequests = [];
          globalThis.SmallGamesServices = {
            status: 'ready',
            refresh: async () => {},
            // The Runtime metadata contract uses leaderboards, never capabilities.ranked.
            metadata: {
              versions: { ranked: 'tetracube-20261031-1', multiplayer: null },
              capabilities: { identity: true, leaderboards: true, multiplayer: false },
            },
            services: {
              leaderboard: async ({ boardId }) => {
                globalThis.__rankRequests.push(boardId);
                const me = { rank: 1, nickname: '契约测试', score: boardId === 'campaign' ? 3 : 1200, secondary: 12 };
                return { top: [me], me };
              },
            },
          };
        });
        await press(p, 'ranking');
        await p.waitForFunction(() => globalThis.__tetracube.snapshot().rankState === 'ready');
        await capture(p, 'ranking-contract-campaign');
        await press(p, 'rank-endless');
        await p.waitForFunction(() => globalThis.__tetracube.snapshot().rankState === 'ready');
        assert.deepEqual(await p.evaluate(() => globalThis.__rankRequests), ['campaign', 'endless']);
        await capture(p, 'ranking-contract-endless');
        report.checks.push('both leaderboards consume the real Runtime metadata shape (fixture, not live service)');
      } finally { await context.close(); }
    }
    {
      const { page: p, context } = await open({ dev: true });
      try {
        await p.getByRole('button', { name: '开发者调试', exact: true }).click();
        await p.locator('[data-dev-action="tetracube-chain"]').click();
        await p.locator('[data-close]').click();
        await phase(p, 'playing');
        await idle(p);
        assert.equal((await snap(p)).practice, true);
        await press(p, 'pause');
        await press(p, 'home');
        const stored = () => p.evaluate(() => [localStorage.getItem('tetracube.save.v1'), localStorage.getItem('tetracube.best.v1')]);
        const before = await stored();
        await p.evaluate(() => {
          globalThis.SmallGamesServices = {
            createRecorder: () => ({
              start: () => new Promise((resolve) => { globalThis.__resolveRankStart = resolve; }),
              invalidate: () => {}, record: () => {}, finish: async () => null,
            }),
          };
        });
        await press(p, 'start');
        await phase(p, 'connecting');
        await p.evaluate(() => window.dispatchEvent(new Event('blur')));
        assert.deepEqual(await stored(), before, 'connecting blur preserves formal saves');
        await press(p, 'home');
        await p.evaluate(() => globalThis.__resolveRankStart({ seed: 7 }));
        await p.clock.runFor(100);
        assert.equal((await snap(p)).screen, 'home');
        assert.equal((await snap(p)).practice, true, 'cancel retains the previous practice run');
        assert.deepEqual(await stored(), before);
        await press(p, 'start');
        await phase(p, 'connecting');
        await p.evaluate(() => {
          window.dispatchEvent(new Event('blur'));
          globalThis.__resolveRankStart({ seed: 8 });
        });
        await phase(p, 'paused');
        const stopped = await snap(p);
        assert.equal(stopped.practice, false);
        await p.clock.runFor(3000);
        assert.equal((await snap(p)).elapsedMs, stopped.elapsedMs, 'blurred connection does not start falling');
        await press(p, 'resume');
        await phase(p, 'playing');
        report.checks.push('delayed online start cancellation preserves practice saves and blur pauses new run');
      } finally { await context.close(); }
    }
    for (const status of ['completed', 'dismissed', 'unavailable', 'failed']) {
      const { page: p, context } = await open({ ad: status });
      try {
        await press(p, 'start');
        const before = (await snap(p)).game;
        await press(p, 'invert');
        await phase(p, 'reward');
        await press(p, 'watch');
        await phase(p, status === 'completed' ? 'paused' : 'playing');
        assert.equal((await snap(p)).game.flipCount, status === 'completed' ? 1 : 0);
        if (status !== 'completed') assert.deepEqual((await snap(p)).game, before);
        assert.equal(await p.evaluate(() => globalThis.__adCalls), 1);
        report.checks.push('inversion ' + status);
      } finally {
        await context.close();
      }
    }
    for (const used of [0, 1, 2]) {
      const { page: p, context } = await open({ save: blocked(used), ad: 'completed' });
      try {
        await press(p, 'continue');
        await phase(p, 'result');
        await fits(p);
        await capture(p, 'result-' + used);
        const s = await snap(p);
        assert.equal(
          s.controls.some((c) => c.id === 'revive'),
          used < 2,
        );
        if (used < 2) {
          const pending = s.game.pending;
          await press(p, 'revive');
          await phase(p, 'reward');
          await fits(p);
          await capture(p, 'revive-' + used);
          await press(p, 'watch');
          await phase(p, 'paused');
          assert.equal((await snap(p)).revivesUsed, used + 1);
          assert.equal((await snap(p)).game.active.id, pending.id);
          assert.equal((await snap(p)).game.board.length, 0);
          await p.reload();
          await p.locator('body[data-tetracube-ready="true"]').waitFor();
          assert.equal((await snap(p)).revivesUsed, used + 1);
        }
        report.checks.push('persisted revive quota ' + used);
      } finally {
        await context.close();
      }
    }
    {
      const { page: p, context } = await open({ save: blocked() });
      try {
        await press(p, 'continue');
        await phase(p, 'result');
        assert.equal(
          (await snap(p)).controls.some((c) => c.id === 'revive'),
          false,
        );
        await press(p, 'restart');
        await phase(p, 'playing');
        assert.equal((await snap(p)).revivesUsed, 0);
        report.checks.push('unconfigured result and restart');
      } finally {
        await context.close();
      }
    }
    {
      const { page: p, context } = await open({ ad: 'completed' });
      try {
        await press(p, 'start');
        await press(p, 'invert');
        await press(p, 'watch');
        await press(p, 'cancel');
        await p.waitForTimeout(1000);
        assert.equal((await snap(p)).game.flipCount, 0);
        assert.equal((await snap(p)).screen, 'playing');
        report.checks.push('late completion after cancellation');
      } finally {
        await context.close();
      }
    }
    for (const status of ['completed', 'failed']) {
      const { page: p, context } = await open({ ad: status });
      try {
        await press(p, 'start');
        await press(p, 'invert');
        await press(p, 'watch');
        await p.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await p.waitForTimeout(1000);
        assert.equal((await snap(p)).game.flipCount, 0);
        await p.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await phase(p, 'paused');
        assert.equal((await snap(p)).game.flipCount, status === 'completed' ? 1 : 0);
        report.checks.push('simulated visibility during advertisement ' + status);
      } finally {
        await context.close();
      }
    }
  }
  if (publish) {
    for (const [width, height] of [
      [720, 1280],
      [1280, 720],
    ]) {
      const { page: p, context } = await open({ width, height, video: true });
      const size = width + 'x' + height;
      try {
        await p.screenshot({
          path: out + 'home-' + size + '.png',
        });
        await p.waitForTimeout(1800);
        if (width === 1280) {
          await press(p, 'levels');
          await p.waitForTimeout(1600);
          await press(p, 'level-space-01');
          await p.waitForTimeout(1200);
          await press(p, 'observe');
          await dragScene(p, context, true, 54, 28);
          await p.waitForTimeout(1600);
          await press(p, 'zoom-in');
          await p.waitForTimeout(1200);
          await press(p, 'fit');
          await press(p, 'drop');
          await phase(p, 'result');
          await p.waitForTimeout(1800);
          await press(p, 'next-level');
          await p.waitForTimeout(1600);
          await press(p, 'layer-open');
          await p.waitForTimeout(2400);
          await press(p, 'tool-back');
          await press(p, 'observe');
          await dragScene(p, context, true, -80, 30);
          await p.waitForTimeout(2500);
          assert.equal((await snap(p)).levelId, 'space-02');
          report.checks.push('separate landscape trailer: level selection, challenge clear, zoom and layer inspection');
          continue;
        }
        await press(p, 'start');
        await p.waitForTimeout(1500);
        for (let i = 0; i < 16; i++) {
          const plane = ['XY', 'XZ', 'YZ', 'XY'][i % 4];
          for (let n = 0; n < (i % 3) + 1; n++)
            await p.keyboard.press(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'][i % 4]);
          await press(p, 'rotate-' + plane + '-plus');
          await p.waitForTimeout(250);
          await press(p, 'drop');
          await idle(p);
          await p.waitForTimeout(450);
          if ((await snap(p)).screen !== 'playing') break;
        }
        await p.screenshot({
          path: out + 'play-' + size + '.png',
        });
        if (width === 720)
          await p.screenshot({
            path: root + 'publishing/gameplay/screenshots/taptap/01-play-720x1280.png',
          });
        await press(p, 'observe');
        await dragScene(p, context, true, 65, 36);
        await p.waitForTimeout(1200);
        if (width === 720)
          await p.screenshot({
            path: root + 'publishing/gameplay/screenshots/taptap/02-observe-720x1280.png',
          });
        await press(p, 'view-iso');
        await press(p, 'layer-open');
        await p.waitForTimeout(1600);
        if (width === 720)
          await p.screenshot({
            path: root + 'publishing/gameplay/screenshots/taptap/03-layer-720x1280.png',
          });
        await p.screenshot({ path: out + 'layer-' + size + '.png' });
        await press(p, 'tool-back');
        if (width !== 720) {
          await dragScene(p, context, true, -140, 60);
          await p.waitForTimeout(1000);
          await press(p, 'invert');
          await idle(p);
          await p.waitForTimeout(1500);
          await press(p, 'view-top');
          await p.waitForTimeout(1500);
        }
        await press(p, 'pause');
        await p.screenshot({
          path: out + 'paused-' + size + '.png',
        });
        await p.waitForTimeout(1600);
        await press(p, 'resume');
        await p.waitForTimeout(1800);
        const ending = await snap(p);
        assert(ending.game.placed >= 12, 'recording contains actual multi-piece play');
        report.checks.push('publishing real-input recording ' + size);
      } finally {
        const video = p.video();
        await context.close();
        const recording = 'reports/video/taptap-' + size + '-' + Date.now() + '.webm';
        await video.saveAs(root + recording);
        report.recordings[size] = recording;
      }
    }
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(out + 'browser-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.kill();
}
