import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
assert.equal(
  (await fetch(new URL('build-info.json', url)).then((r) => r.json())).sourceHash,
  await sourceHash(),
);
const reports = new URL('../reports/glacier/', import.meta.url);
await mkdir(reports, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [],
  evidence = [];
const snapshot = (page) => page.evaluate(() => __kart.snapshot());
const loaded = (page) =>
  page.waitForFunction(
    () => globalThis.__kart && !__kart.snapshot().loading && __kart.snapshot().sceneryLoaded,
    {},
    { timeout: 60000 },
  );
async function nextWorld(page) {
  const before = (await snapshot(page)).selection.world;
  await page.keyboard.press('Digit1');
  await page.waitForFunction((before) => __kart.snapshot().selection.world !== before, before);
  await loaded(page);
}
async function sceneInfo(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc'),
      scene = cc.director.getScene();
    const world = scene.getChildByName('KartGame').getChildByName('SelectedWorld');
    const glacier = world.getChildByName('GlacierScenery');
    const items = world.children.filter((n) => n.name.startsWith('Item-'));
    return {
      glacier: !!glacier,
      sun: !!world.getChildByName('GlacierSun'),
      wallSections: glacier?.children.filter((n) => n.name.startsWith('IceWalls-')).length,
      arches: glacier?.children.filter((n) => n.name.startsWith('IceArch-')).length,
      lit: glacier
        ?.getComponentsInChildren(cc.MeshRenderer)
        .every((r) => r.sharedMaterials[0].effectName === 'builtin-standard'),
      itemsEnlarged:
        items.length === 24 &&
        items.every(
          (n) =>
            Math.abs(n.scale.x - 1.3) < 0.001 && n.scale.x === n.scale.y && n.scale.y === n.scale.z,
        ),
      sky: scene.globals.skybox.enabled,
      reflection: scene.globals.skybox.useIBL,
      shadows: scene.globals.shadows.enabled,
      fog: scene.globals.fog.enabled,
      draws: cc.director.root.device.numDrawCalls,
      triangles: cc.director.root.device.numTris,
    };
  });
}
try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 };
    const page = await browser.newPage({
      viewport,
      hasTouch: mobile,
      isMobile: mobile,
      userAgent: mobile
        ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
        : undefined,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.text().startsWith('Ignored attempt to cancel a touchcancel')
      )
        errors.push(message.text());
    });
    await page.goto(url);
    assert.equal(await page.title(), '浪湾卡丁车');
    await loaded(page);
    while ((await snapshot(page)).selection.world !== 'glacier') {
      await nextWorld(page);
    }
    const info = await sceneInfo(page);
    assert.ok(
      info.glacier && info.sun && info.lit && info.sky && info.reflection && info.shadows,
      JSON.stringify(info),
    );
    assert.ok(
      info.wallSections >= 12 && info.arches === 3 && info.itemsEnlarged,
      JSON.stringify(info),
    );
    const prefix = mobile ? 'mobile' : 'desktop';
    await page.screenshot({ path: fileURLToPath(new URL(`${prefix}-menu.png`, reports)) });
    const cdp = mobile ? await page.context().newCDPSession(page) : null;
    // HUD fits a centred 960x540 landscape canvas, including wide phones.
    const scale = Math.min(viewport.width / 960, viewport.height / 540);
    const touch = (x, y) => ({
      x: (viewport.width - 960 * scale) / 2 + x * scale,
      y: (viewport.height - 540 * scale) / 2 + y * scale,
    });
    if (mobile) {
      const p = touch(480, 395);
      await page.touchscreen.tap(p.x, p.y);
    } else {
      await page.keyboard.press('Enter');
      await page.keyboard.down('ArrowUp');
    }
    await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
    let held = '',
      braking = false,
      drifting = false,
      previous = [],
      lastLog = 0;
    const length = (await snapshot(page)).world.length;
    const fps = [],
      shots = [
        20,
        42,
        185,
        Math.round(length * 0.4 - 30),
        650,
        Math.round(length * 0.74 - 30),
        Math.round(length - 30),
        Math.round(length + 20),
      ],
      views = [];
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const state = await snapshot(page);
      if (state.time > 1) fps.push(state.fps);
      if (state.time > lastLog + 20) {
        lastLog = state.time;
        console.log(
          `${prefix}: ${Math.round(state.progress.distance)} / ${Math.round(length)}m, ${state.fps} FPS`,
        );
      }
      if (shots.length && state.progress.distance >= shots[0]) {
        const car = await page.evaluate(async () => {
          const cc = await System.import('cc'),
            root = cc.director.getScene().getChildByName('KartGame');
          const camera = root.getChildByName('ChaseCamera').getComponent(cc.Camera),
            k = __kart.snapshot().player;
          const screen = camera.worldToScreen(new cc.Vec3(k.x, k.y + 0.8, k.z));
          return { x: screen.x, y: screen.y, height: k.y };
        });
        assert.ok(
          car.x > 0 && car.x < viewport.width && car.y > 0 && car.y < viewport.height,
          'the player must stay in the chase camera view',
        );
        views.push({ distance: state.progress.distance, car });
        await page.screenshot({
          path: fileURLToPath(new URL(`${prefix}-${shots.shift()}m.png`, reports)),
        });
      }
      if (state.progress.distance > length + 25) break;
      const { steer, brake, drift } = state.suggestedInput;
      if (mobile) {
        const p = touch(960 * (0.16 + steer * 0.095), 440);
        const points = [{ ...p, id: 1 }];
        if (drift) points.push({ ...touch(844, 440), id: 2 });
        if (brake) points.push({ ...touch(674, 440), id: 3 });
        if (previous.some((p) => !points.some((q) => p.id === q.id))) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          previous = [];
        }
        await cdp.send('Input.dispatchTouchEvent', {
          type: points.length > previous.length ? 'touchStart' : 'touchMove',
          touchPoints: points,
        });
        previous = points;
      } else {
        for (const [key, value, before] of [
          ['ArrowDown', brake, braking],
          ['Space', drift, drifting],
        ])
          if (value !== before) await page.keyboard[value ? 'down' : 'up'](key);
        braking = brake;
        drifting = drift;
        const key = steer < -0.12 ? 'ArrowLeft' : steer > 0.12 ? 'ArrowRight' : '';
        if (key !== held) {
          if (held) await page.keyboard.up(held);
          if (key) await page.keyboard.down(key);
          held = key;
        }
      }
      await page.waitForTimeout(45);
    }
    const finish = await snapshot(page);
    assert.ok(
      finish.progress.distance > length + 25 && finish.progress.laps >= 1,
      `full glacier lap must be drivable: ${finish.progress.distance}`,
    );
    assert.equal(shots.length, 0, 'capture every section and the start/finish seam');
    assert.equal(finish.resets, 0);
    if (mobile)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else {
      for (const key of ['ArrowUp', 'ArrowDown', 'Space', held].filter(Boolean))
        await page.keyboard.up(key);
    }
    await page.keyboard.press('KeyP');
    const paused = await snapshot(page);
    await page.waitForTimeout(150);
    assert.equal((await snapshot(page)).time, paused.time);
    assert.equal((await snapshot(page)).input.steer, 0);
    fps.sort((a, b) => a - b);
    evidence.push({
      viewport,
      ...(await sceneInfo(page)),
      distance: finish.progress.distance,
      collisions: finish.collisions,
      views,
      medianFps: fps[Math.floor(fps.length / 2)],
      p10Fps: fps[Math.floor(fps.length * 0.1)],
    });
    await page.keyboard.press('KeyG');
    await loaded(page);
    await page.reload();
    await loaded(page);
    assert.equal((await snapshot(page)).selection.world, 'glacier');
    // Repeated selection must dispose the glacier and restore other worlds' render state.
    for (let i = 0; i < 3; i++) {
      await nextWorld(page);
      const other = await sceneInfo(page);
      assert.ok(
        !other.sun &&
          !other.glacier &&
          !other.sky &&
          !other.shadows &&
          !other.reflection &&
          !other.fog &&
          other.itemsEnlarged,
      );
      while ((await snapshot(page)).selection.world !== 'glacier') await nextWorld(page);
      assert.ok((await sceneInfo(page)).glacier);
    }
    if (mobile) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: fileURLToPath(new URL('mobile-portrait.png', reports)) });
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('validation.json', reports),
    JSON.stringify({ evidence, errors }, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
