import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
assert.equal((await fetch(new URL('build-info.json', url)).then((r) => r.json())).sourceHash, await sourceHash());
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      hasTouch: true,
      userAgent: mobile ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' : undefined,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.__kart && __kart.snapshot().modelsLoaded && !__kart.snapshot().loading);
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
    for (const phase of ['ready', 'paused', 'finished']) {
      if (phase === 'paused') {
        await page.touchscreen.tap(480, 395);
        await page.waitForFunction(() => __kart.snapshot().time > 0);
        await page.touchscreen.tap(787, 50);
        await page.touchscreen.tap(893, 50);
        assert.equal(await page.evaluate(() => __kart.snapshot().phase), 'racing');
        assert.equal(await page.evaluate(() => __kart.snapshot().muted), false);
        await page.touchscreen.tap(70, 180);
        await page.waitForFunction(() => __kart.snapshot().muted);
        await page.touchscreen.tap(70, 240);
        await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
        await page.touchscreen.tap(70, 180);
        await page.waitForFunction(() => !__kart.snapshot().muted);
      }
      if (phase === 'finished') {
        await page.touchscreen.tap(70, 240);
        await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
        // Exercise the result UI without waiting for a full race.
        await page.evaluate(async () => {
          const cc = await System.import('cc');
          const game = cc.director.getScene().getComponentsInChildren(cc.Component).find((c) => c.hud && c.race);
          game.race.phase = 'finished';
        });
      }
      await page.waitForTimeout(100);
      const text = await labels();
      if (mobile) assert.doesNotMatch(text, /Enter|Shift|W\s*\/|R 再|R 重新|P 继续/);
      else assert.match(text, /Enter/);
      await page.screenshot({ path: new URL(`../reports/hud-${mobile ? 'mobile' : 'desktop'}-${phase}.png`, import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '') });
    }
    if (!mobile) {
      await page.keyboard.press('KeyG');
      await page.waitForFunction(() => !__kart.snapshot().loading);
      for (let i = 0; i < 9; i++) {
        const before = await page.evaluate(() => __kart.snapshot().selection.theme);
        await page.keyboard.press('Digit1');
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
          await page.screenshot({ path: new URL('../reports/sky-glacier.png', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '') });
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
  console.log('PASS: desktop/mobile hints, relocated mute/pause/resume, old capsule area inactive');
} finally {
  await browser.close();
}
