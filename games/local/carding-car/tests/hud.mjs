import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { mobileOptions, reportsURL, startBrowser, tapDesign, verifyBuild, waitForReady, startRace, tapHome } from './browser-utils.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
await verifyBuild(url);
await mkdir(reportsURL, { recursive: true });
const browser = await startBrowser(url);
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      hasTouch: true,
      ...(mobile ? mobileOptions : {}),
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await waitForReady(page);
    const sky = await page.evaluate(async () => {
      const cc = await System.import('cc');
      const skybox = cc.director.getScene().globals.skybox;
      const pixels = skybox.envmap.image.front.data;
      let blue = 0, white = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] >= 140 && pixels[i + 2] > pixels[i] + 30) blue++;
        if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245) white++;
      }
      return { enabled: skybox.enabled, blue, white };
    });
    assert.ok(sky.enabled && sky.blue > 100 && sky.white > 10, JSON.stringify(sky));
    const labels = () => page.evaluate(async () => {
      const cc = await System.import('cc');
      return cc.director.getScene().getComponentsInChildren(cc.Label)
        .filter((l) => l.node.activeInHierarchy).map((l) => l.string).join('\n');
    });
    assert.doesNotMatch(await labels(), /Enter|Shift|W\s*\/|驾驶小贴士|自动加速/);
    await tapHome(page, '设置');
    await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible);
    assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingEnabled), false);
    await tapDesign(page, 480, 304);
    await page.waitForFunction(() => __kart.snapshot().hud.coachingEnabled);
    const helpText = await labels();
    if (mobile) {
      assert.doesNotMatch(helpText, /Enter|Shift|W\s*\//);
      assert.match(helpText, /自动加速/);
    } else assert.match(helpText, /W\s*\/.*加速[\s\S]*Shift/);
    await tapDesign(page, 480, 304);
    await page.waitForFunction(() => !__kart.snapshot().hud.coachingEnabled);
    await tapDesign(page, 640, 114);
    await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible);
    for (const phase of ['ready', 'paused', 'finished']) {
      if (phase === 'paused') {
        await startRace(page);
        await page.waitForFunction(() => __kart.snapshot().time > 0);
        assert.equal(await page.evaluate(() => __kart.snapshot().phase), 'racing');
        assert.doesNotMatch(await labels(), /Enter|Shift|W\s*\/|驾驶小贴士|自动加速/);
        assert.equal(await page.evaluate(() => __kart.snapshot().muted), false);
        await tapDesign(page, 910, 46);
        await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'paused');
        await tapDesign(page, 480, 184);
        await page.waitForFunction(() => __kart.snapshot().muted);
        await tapDesign(page, 640, 114);
        await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'racing');
        await tapDesign(page, 56, 126);
        await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
        await tapDesign(page, 910, 46);
        await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible);
        await tapDesign(page, 480, 184);
        await page.waitForFunction(() => !__kart.snapshot().muted);
        await tapDesign(page, 640, 114);
        await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible);
        assert.equal(await page.evaluate(() => __kart.snapshot().phase), 'paused');
      }
      if (phase === 'finished') {
        await tapDesign(page, 480, 395);
        await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
        // Synthetic phase is only a result-layout check, not evidence of completing a race.
        await page.evaluate(async () => {
          const cc = await System.import('cc');
          const game = cc.director.getScene().getComponentsInChildren(cc.Component).find((c) => c.hud && c.race);
          game.race.phase = 'finished';
        });
      }
      await page.waitForTimeout(100);
      const text = await labels();
      if (mobile) assert.doesNotMatch(text, /Enter|Shift|W\s*\/|R 再|R 重新|P 继续/);
      else if (phase === 'ready') assert.doesNotMatch(text, /Enter|Shift|W\s*\//);
      await page.screenshot({ path: fileURLToPath(new URL(`hud-${mobile ? 'mobile' : 'desktop'}-${phase}.png`, reportsURL)) });
    }
    if (!mobile) {
      await page.keyboard.press('KeyG');
      await waitForReady(page);
      await tapHome(page, '选择比赛');
      for (let i = 0; i < 9; i++) {
        const before = await page.evaluate(() => __kart.snapshot().selection.theme);
        await tapHome(page, '›', 0);
        await page.waitForFunction((theme) => __kart.snapshot().selection.theme !== theme && !__kart.snapshot().loading, before);
        const state = await page.evaluate(async () => {
          const cc = await System.import('cc');
          const globals = cc.director.getScene().globals;
          return { theme: __kart.snapshot().selection.theme, sky: globals.skybox.enabled, reflection: globals.skybox.useIBL, fog: globals.fog.enabled };
        });
        assert.equal(state.sky, true);
        assert.equal(state.reflection, state.theme === 'glacier');
        assert.equal(state.fog, state.theme === 'glacier');
        if (state.theme === 'glacier') {
          await page.evaluate(async () => {
            const cc = await System.import('cc');
            cc.director.getScene().getChildByName('KartGame').getChildByName('HUD').active = false;
            const game = cc.director.getScene().getComponentsInChildren(cc.Component).find((c) => c.hud && c.race);
            game.camera.lookHeight = 12;
          });
          await page.waitForTimeout(150);
          await page.screenshot({ path: fileURLToPath(new URL('sky-glacier.png', reportsURL)) });
          await page.evaluate(async () => {
            const cc = await System.import('cc');
            cc.director.getScene().getChildByName('KartGame').getChildByName('HUD').active = true;
            const game = cc.director.getScene().getComponentsInChildren(cc.Component).find((c) => c.hud && c.race);
            game.camera.lookHeight = 1.5;
          });
        }
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: desktop/mobile opt-in teaching, settings mute, pause/resume, synthetic result layout, theme skies');
} finally {
  await browser.close();
}
