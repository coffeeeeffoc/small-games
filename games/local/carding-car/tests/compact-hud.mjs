import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isSupply } from '../assets/scripts/RoadItems.ts';
import {
  designPoint, displayGeometry, gameURL, mobileOptions, reportsURL,
  startBrowser, tapDesign, tapHome, verifyBuild, waitForReady, startRace,
} from './browser-utils.mjs';

const url = gameURL();
const build = await verifyBuild(url);
const local = ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
const browser = await startBrowser(url, { args: local ? ['--host-resolver-rules=MAP kart-offline.test 127.0.0.1', '--no-proxy-server'] : [] });
const evidence = { build, environment: 'Chromium with Android UA and CDP touch; physical Android/iOS unverified', cases: [], errors: [], engineWarnings: [] };
const state = (page) => page.evaluate(() => __kart.snapshot());
const screenshot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(`compact-${name}.png`, reportsURL)) });
try {
  for (const [name, viewport] of [
    ['landscape', { width: 844, height: 390 }],
    ['portrait-held', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ ...mobileOptions, viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => evidence.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().startsWith('Ignored attempt to cancel a touchcancel event with cancelable=false'))
        evidence.engineWarnings.push(message.text());
      else evidence.errors.push(message.text());
    });
    await page.goto(url);
    await waitForReady(page);
    const geometry = await displayGeometry(page);
    assert.ok(geometry.visible.width > geometry.visible.height, 'game remains landscape in either physical orientation');
    assert.equal(geometry.rotated, name === 'portrait-held');
    assert.ok(geometry.scrollWidth <= viewport.width + 1, 'landscape fallback cannot add horizontal page scrolling');
    const ready = await page.evaluate(async () => {
      const cc = await System.import('cc');
      const game = cc.director.getScene().getComponentsInChildren(cc.Component).find((c) => c.hud && c.race);
      const hud = game.hud;
      const camera = game.camera.camera;
      const screen = camera.worldToScreen(game.views[0].root.worldPosition);
      const visible = cc.view.getVisibleSize(), viewport = cc.view.getViewportRect();
      return {
        racingHUD: hud.racingHUD.activeInHierarchy,
        controls: hud.drivingControls.activeInHierarchy,
        home: __kart.snapshot().home,
        car: { x: (screen.x - viewport.x) / cc.view.getScaleX() / visible.width * 960 - 480,
          y: (screen.y - viewport.y) / cc.view.getScaleY() / visible.height * 540 - 270 },
        labels: game.home.root.getComponentsInChildren(cc.Label).filter((l) => l.node.activeInHierarchy)
          .map((l) => ({ text: l.string, size: l.fontSize })),
      };
    });
    assert.equal((await state(page)).phase, 'ready');
    assert.equal(ready.racingHUD, false);
    assert.equal(ready.controls, false, 'race controls must not cover the garage');
    assert.equal(ready.home.visible, true);
    assert.equal(ready.home.page, 'home');
    const preview = ready.home.preview;
    assert.ok(preview.width >= 300 && preview.height >= 200, 'the live kart has its own central podium');
    assert.ok(Math.abs(preview.x) + preview.width / 2 <= 480 && Math.abs(preview.y) + preview.height / 2 <= 270);
    assert.ok(Math.abs(ready.car.x - preview.x) < preview.width / 2 && Math.abs(ready.car.y - preview.y) < preview.height / 2,
      'the loaded kart is actually projected inside the home preview region');
    assert.ok(ready.home.buttons.every(button =>
      Math.abs(button.x - preview.x) >= (button.width + preview.width) / 2 ||
      Math.abs(button.y - preview.y) >= (button.height + preview.height) / 2), 'home controls leave the preview unobstructed');
    assert.ok(ready.labels.length <= 12, 'home uses short labels and keeps career details behind its shortcut');
    assert.deepEqual((await state(page)).menuArtwork.loaded, ['plaza'], 'home only loads its own background');
    assert.doesNotMatch(ready.labels.map((l) => l.text).join('\n'), /Enter|Shift|W\s*\/|驾驶教学|好友赛待开放/);
    assert.equal(await page.locator('#kart-accessible-pause').getAttribute('aria-label'), '暂停');
    await screenshot(page, `${name}-ready`);

    const goMotion = async () => page.evaluate(async () => {
      const cc = await System.import('cc'), game = cc.director.getScene().getComponentsInChildren(cc.Component).find(c => c.home && c.race);
      return game.home.root.getChildByName('HomeContent').getChildByName('选择比赛  →').scale.x;
    });
    const scale = await goMotion(); await page.waitForTimeout(250);
    assert.notEqual(await goMotion(), scale, 'the start button breathes while waiting');
    const cancel = await context.newCDPSession(page), point = await designPoint(page, 760, 430);
    await cancel.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 9 }] });
    await cancel.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal((await state(page)).home.page, 'home', 'a cancelled menu touch cannot choose a race');
    const requestedBeforeSetup = (await state(page)).requestedArt;
    await tapHome(page, '选择比赛');
    await page.waitForFunction(() => __kart.snapshot().menuArtwork.background === 'garage');
    const setup = await state(page);
    assert.equal(setup.home.page, 'setup');
    assert.ok(setup.home.sceneryPreview && setup.home.preview.x > 0);
    assert.deepEqual(setup.menuArtwork.loaded, ['plaza', 'garage']);
    assert.deepEqual(setup.requestedArt, requestedBeforeSetup, 'opening setup does not preload unused cars or themes');
    const windows = await page.evaluate(async () => {
      const cc = await System.import('cc'), game = cc.director.getScene().getComponentsInChildren(cc.Component).find(c => c.home && c.race);
      const viewport = cc.view.getViewportRect(), size = cc.screen.windowSize;
      return [game.camera.camera, game.node.getChildByName('DestinationPostcard').getComponent(cc.Camera)].map(camera => ({
        x: (camera.rect.x * size.width - viewport.x) / viewport.width * 960,
        y: 540 - ((camera.rect.y + camera.rect.height) * size.height - viewport.y) / viewport.height * 540,
        width: camera.rect.width * size.width / viewport.width * 960,
        height: camera.rect.height * size.height / viewport.height * 540,
      }));
    });
    for (const [i, expected] of [{ x: 520, y: 155, width: 380, height: 225 }, { x: 52, y: 142, width: 396, height: 208 }].entries())
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(windows[i][key] - expected[key]) < 1,
        `preview ${i} ${key} follows the actual phone UI viewport`);
    await screenshot(page, `${name}-setup`);

    // Every action below is an actual browser touch. No race/player state is changed by the test.
    await startRace(page);
    await page.waitForFunction(() => __kart.snapshot().phase === 'racing' && __kart.snapshot().player.speed > 12, null, { timeout: 120000 });
    const cdp = await context.newCDPSession(page);
    const touches = async (type, positions) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: await Promise.all(positions.map(async ([x, y, id]) => ({ ...await designPoint(page, x, y), id }))),
    });
    const beforeDrive = await state(page);
    await touches('touchStart', [[180, 440, 1], [845, 440, 2]]);
    await page.waitForFunction(() => __kart.snapshot().input.steer > 0.2 && __kart.snapshot().input.drift);
    await page.waitForFunction(() => __kart.snapshot().player.tier >= 1, null, { timeout: 5000 });
    await touches('touchEnd', []);
    await page.waitForFunction((boosts) => __kart.snapshot().input.steer === 0 && !__kart.snapshot().input.drift && __kart.snapshot().boosts > boosts, beforeDrive.boosts);
    assert.notEqual((await state(page)).player.heading, beforeDrive.player.heading, 'steering changes the actual kart heading');
    const drive = await state(page);
    await touches('touchStart', [[95, 440, 3], [845, 440, 4]]);
    await page.waitForFunction(() => __kart.snapshot().input.steer < 0 && __kart.snapshot().input.drift);
    await touches('touchCancel', []);
    await page.waitForFunction(() => __kart.snapshot().input.steer === 0 && !__kart.snapshot().input.drift);

    const rendered = await page.evaluate(async () => {
      const cc = await System.import('cc');
      const game = cc.director.getScene().getComponentsInChildren(cc.Component).find((c) => c.hud && c.race);
      const graphics = game.hud.pauseIcon;
      const meshes = [];
      const bars = graphics.impl.paths.slice(0, graphics.impl.pathLength).map((path) => {
        const x = path.points.map((p) => p.x), y = path.points.map((p) => p.y);
        return { left: Math.min(...x), right: Math.max(...x), bottom: Math.min(...y), top: Math.max(...y), closed: path.closed };
      });
      return { pauseVisible: graphics.node.activeInHierarchy, pauseText: game.hud.pause.string, bars,
        previewActive: __kart.snapshot().menuArtwork.active,
        carVisible: game.views[0].root.layer === cc.Layers.Enum.DEFAULT &&
          game.camera.camera.visibility === cc.Layers.Enum.DEFAULT && game.views[0].root.getChildByName('DriverColor').active,
        cameraRect: { x: game.camera.camera.rect.x, y: game.camera.camera.rect.y,
          width: game.camera.camera.rect.width, height: game.camera.camera.rect.height },
        pickups: game.itemsView.nodes.map((node, i) => {
          const marker = node.children.find((child) => /^(Supply|Hazard)-/.test(child.name));
          const renderer = marker?.getComponent(cc.MeshRenderer);
          const mesh = renderer?.mesh;
          if (mesh && !meshes.includes(mesh)) meshes.push(mesh);
          return { kind: game.race.items[i].kind, marker: marker?.name, mesh: meshes.indexOf(mesh),
            vertices: renderer?.mesh?.readAttribute(0, cc.gfx.AttributeName.ATTR_POSITION)?.length ?? 0,
            material: !!renderer?.getMaterial(0), active: node.activeInHierarchy };
        }) };
    });
    assert.equal(rendered.pauseVisible, true);
    assert.equal(rendered.previewActive, false);
    assert.equal(rendered.carVisible, true, 'race restores the kart layer and driver marker');
    assert.deepEqual(rendered.cameraRect, { x: 0, y: 0, width: 1, height: 1 });
    assert.equal(rendered.pauseText, '', 'pause is drawn geometry, never a fallback font glyph');
    assert.equal(rendered.bars.length, 2);
    const [left, right] = rendered.bars.sort((a, b) => a.left - b.left);
    assert.ok(left.closed && right.closed);
    assert.equal(left.right - left.left, right.right - right.left);
    assert.equal(left.top, right.top);
    assert.equal(left.bottom, right.bottom);
    assert.ok(left.top - left.bottom > left.right - left.left && right.left > left.right);
    assert.equal(rendered.pickups.length, 24);
    for (const item of rendered.pickups) {
      assert.equal(item.marker, isSupply(item.kind) ? 'Supply-Plus' : 'Hazard-Warning', item.kind);
      assert.ok(item.vertices > 0 && item.material, `${item.kind} has actual rendered marker geometry`);
    }
    const supplyMeshes = new Set(rendered.pickups.filter((p) => isSupply(p.kind)).map((p) => p.mesh));
    const hazardMeshes = new Set(rendered.pickups.filter((p) => !isSupply(p.kind)).map((p) => p.mesh));
    assert.equal(supplyMeshes.size, 1);
    assert.equal(hazardMeshes.size, 1);
    assert.notDeepEqual([...supplyMeshes], [...hazardMeshes], 'positive and negative pickups use different silhouettes');
    await screenshot(page, `${name}-racing`);

    await tapDesign(page, 910, 46);
    await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'paused');
    const paused = await state(page);
    await page.waitForTimeout(250);
    assert.equal((await state(page)).time, paused.time);
    assert.equal(paused.input.steer, 0);
    assert.equal(paused.input.drift, false);
    await tapDesign(page, 480, 184);
    await page.waitForFunction(() => __kart.snapshot().muted);
    await tapDesign(page, 480, 304);
    await page.waitForFunction(() => __kart.snapshot().hud.coachingEnabled);
    await screenshot(page, `${name}-settings`);
    await tapDesign(page, 640, 114);
    await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'racing');
    assert.equal((await state(page)).seed, paused.seed);
    await tapDesign(page, 56, 126);
    await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
    await tapDesign(page, 480, 395);
    await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
    await page.reload();
    await waitForReady(page);
    const restored = await state(page);
    assert.equal(restored.phase, 'ready');
    assert.equal(restored.muted, true);
    assert.equal(restored.hud.coachingEnabled, true);
    assert.equal(restored.hud.settingsVisible, false);
    assert.equal(restored.hud.coachingVisible, false, 'persisted teaching does not cover garage scenery');
    evidence.cases.push({ name, viewport, geometry, ready, drive, rendered, paused, restored });
    await context.close();
  }
  if (local && !new URL(url).pathname.startsWith('/play/')) {
    const context = await browser.newContext({ ...mobileOptions, viewport: { width: 844, height: 390 } });
    const page = await context.newPage(), offline = new URL(url); offline.hostname = 'kart-offline.test';
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.goto(offline.href); await waitForReady(page);
    await page.waitForFunction(() => !!__kart.snapshot().multiplayer);
    await tapDesign(page, 320, 450);
    await page.waitForFunction(() => __kart.snapshot().multiplayer.panelOpen);
    assert.match((await state(page)).multiplayer.panelStatus, /暂未开放/);
    assert.equal((await state(page)).phase, 'ready');
    await screenshot(page, 'friends-unconfigured');
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
  await writeFile(new URL('compact-hud.json', reportsURL), JSON.stringify(evidence, null, 2));
  console.log('PASS: landscape and portrait-held home preview, real touch setup/start/driving/drift/release/cancel, settings pause, preferences, drawn pause bars and pickup polarity');
} finally { await browser.close(); }
