import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { Game } from '../src/engine.mjs';
const publish = process.env.TETRACUBE_CAPTURE === '1';
const root = fileURLToPath(new URL('../', import.meta.url)),
  out = root + (publish ? 'docs/design/cocos-2026-10-23/actual/' : 'reports/browser/');
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
};
const snap = (p) => p.evaluate(() => globalThis.__tetracube?.snapshot());
const phase = (p, s) =>
  p.waitForFunction((s) => globalThis.__tetracube?.snapshot().screen === s, s);
const idle = (p) => p.waitForFunction(() => !globalThis.__tetracube?.snapshot().animating);
async function press(p, id, mobile = true) {
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
  await (mobile ? canvas.tap({ position }) : canvas.click({ position }));
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
async function open({ width = 390, height = 844, mobile = true, save, ad, video = false } = {}) {
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
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:4189/');
  await page.locator('body[data-tetracube-ready="true"]').waitFor({ timeout: 60000 });
  assert.equal((await snap(page)).engine, '3.8.8');
  return { page, context };
}
try {
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
      video: publish && width === 390,
    });
    try {
      await fits(p);
      await capture(p, 'home-' + width);
      await press(p, 'help', mobile);
      await phase(p, 'help');
      await fits(p);
      await capture(p, 'help-' + width);
      await press(p, 'back', mobile);
      await press(p, 'start', mobile);
      await phase(p, 'playing');
      await fits(p);
      await capture(p, 'play-' + width);
      const before = await snap(p);
      await press(p, 'rotate-XY-plus', mobile);
      assert.notDeepEqual((await snap(p)).game.active.cells, before.game.active.cells, 'rotation');
      const holdBefore = (await snap(p)).game.active.id;
      await press(p, 'hold', mobile);
      assert.equal((await snap(p)).game.held.id, holdBefore);
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
          assert(afterOrbit.camera.pitch > Math.PI / 2, 'drag crosses top view');
      }
      await capture(p, 'observe-' + width);
      const released = await snap(p);
      await p.mouse.move(20, 200);
      assert.deepEqual((await snap(p)).camera, released.camera, 'release stops dragging');
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
      await press(p, 'view-iso', mobile);
      await press(p, 'move', mobile);
      const s = await snap(p),
        r = s.scene,
        b = await p.locator('#GameCanvas').boundingBox(),
        x = b.x + r.x + r.w * 0.5,
        y = b.y + r.y + r.h * 0.5;
      if (mobile) {
        const cdp = await context.newCDPSession(p);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
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
      await press(p, 'invert', mobile);
      const flipping = await snap(p);
      assert(flipping.animating, 'physical inversion animates');
      assert.equal(
        flipping.controls.find((c) => c.id === 'observe').disabled,
        false,
        'observation remains available during inversion',
      );
      await press(p, 'observe', mobile);
      const duringFlip = await snap(p);
      await dragScene(p, context, mobile, 36, 28, false, true);
      assertOrbit(duringFlip, await snap(p));
      await idle(p);
      assert.equal((await snap(p)).game.flipCount, 1);
      assert.equal((await snap(p)).screen, 'playing');
      await press(p, 'pause', mobile);
      await phase(p, 'paused');
      await fits(p);
      await capture(p, 'paused-' + width);
      await press(p, 'resume', mobile);
      await phase(p, 'playing');
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
        if (publish)
          await p.screenshot({ path: root + 'publishing/gameplay/screenshots/play-390x844.png' });
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
      const video = p.video();
      await context.close();
      if (width === 390 && video) {
        await mkdir(root + 'publishing/gameplay/videos', { recursive: true });
        await video.saveAs(root + 'publishing/gameplay/videos/real-play-390x844.webm');
      }
    }
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
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(out + 'browser-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.kill();
}
