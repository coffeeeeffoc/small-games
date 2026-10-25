import assert from 'node:assert/strict';
import { ready } from './ready.mjs';
import { W, H, arena } from '../src/render.mjs';
import { shotDistance } from '../src/core.mjs';

export async function verifyDisplayAndAim(browser, origin, out) {
  const records = [];
  for (const [width, height, dpr] of [
    [330, 717, 1],
    [330, 717, 2],
    [330, 717, 3],
    [390, 844, 2],
    [320, 568, 2],
    [844, 390, 2],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: dpr,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      await page.goto(origin + '?dev=1');
      await ready(page);
      await page.evaluate(() => {
        SmallGamesDev.setPanelHidden(true);
        // Reproduce the half-height grid regression and a host node before the game.
        const before = document.createElement('div');
        before.style.height = '36px';
        document.body.prepend(before);
        document.body.append(document.createElement('div'));
      });
      const checkViewport = async (w, h) => {
        await page.clock.runFor(150);
        for (const selector of ['#stage', '#GameDiv', '#Cocos3dGameContainer', '#game']) {
          const box = await page.locator(selector).boundingBox();
          assert(
            Math.abs(box.x) < 1 && Math.abs(box.y) < 1,
            `${selector} stays at viewport origin`,
          );
          assert(
            Math.abs(box.width - w) < 1 && Math.abs(box.height - h) < 1,
            `${selector} fills ${w}×${h}, despite auxiliary body nodes`,
          );
        }
        // Check the real Cocos camera projection, not just transparent button positions.
        const projection = await page.evaluate(async () => {
          const cc = await import('./vendor/cocos/cc.js');
          const scene = cc.director.getScene();
          const originNode = scene.getChildByName('Flick UI').getChildByName('Top left');
          const camera = scene.getChildByName('Camera').getComponent(cc.Camera);
          const button = __flickArena.app.buttons.find((item) => item.id === 'start');
          const world = cc.Vec3.transformMat4(
            new cc.Vec3(),
            new cc.Vec3(button.x + button.w / 2, -(button.y + button.h / 2), 0),
            originNode.worldMatrix,
          );
          const screen = camera.worldToScreen(world, new cc.Vec3());
          const canvas = document.querySelector('#game'),
            box = canvas.getBoundingClientRect();
          const target = document.querySelector('#start').getBoundingClientRect();
          return {
            x: box.x + (screen.x * box.width) / canvas.width,
            y: box.y + ((canvas.height - screen.y) * box.height) / canvas.height,
            targetX: target.x + target.width / 2,
            targetY: target.y + target.height / 2,
          };
        });
        assert(Math.abs(projection.x - projection.targetX) < 1);
        assert(Math.abs(projection.y - projection.targetY) < 1);
      };
      await checkViewport(width, height);
      await page.setViewportSize({ width: height, height: width });
      await checkViewport(height, width);
      await page.setViewportSize({ width, height });
      await checkViewport(width, height);
      if (width === 330 && dpr === 2)
        await page.screenshot({
          path: new URL('fixed-home-330x717.png', out).pathname,
          scale: 'css',
        });
      const session = await context.newCDPSession(page);
      const touch = (type, point) =>
        session.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: point ? [{ x: point.x, y: point.y, id: 0 }] : [],
        });
      const attempts = [];
      for (const power of [0.25, 0.6, 1]) {
        await page.locator('#layouts').tap();
        await page.locator('#layout-0').tap();
        await page.clock.runFor(1400);
        const mapping = await page.evaluate(
          ({ W, H, arena }) => {
            const disc = __flickArena.app.state.discs[0];
            const box = document.querySelector('#game').getBoundingClientRect();
            const scale = Math.min(box.width / W, box.height / H);
            return {
              x: box.x + (box.width - W * scale) / 2 + (arena.x + disc.x * arena.scale) * scale,
              y: box.y + (box.height - H * scale) / 2 + (arena.y + disc.y * arena.scale) * scale,
              scale,
              discY: disc.y,
            };
          },
          { W, H, arena },
        );
        const end = { x: mapping.x, y: mapping.y + 115 * power * mapping.scale };
        await touch('touchStart', mapping);
        await touch('touchMove', end);
        await page.clock.runFor(32);
        const drag = await page.evaluate(() => __flickArena.app.drag);
        assert(drag, 'touch the displayed disc to aim');
        assert(Math.abs(Math.hypot(drag.dx, drag.dy) / 115 - power) < 0.002);
        if (width === 330 && dpr === 2)
          await page.screenshot({
            path: new URL(`aim-${Math.round(power * 100)}.png`, out).pathname,
            scale: 'css',
          });
        await touch('touchEnd');
        const shot = await page.evaluate(() => __flickArena.app.state.lastShot);
        assert(Math.abs(shot.power - power) < 0.002);
        assert(Math.abs(shot.x) < 0.001 && shot.y < -0.999, 'release follows the dashed direction');
        await page.clock.runFor(1200);
        const disc = await page.evaluate(() => __flickArena.app.state.discs[0]);
        const travel = mapping.discY - disc.y;
        assert(
          Math.abs(travel - shotDistance(shot.power)) < 0.01,
          'actual travel follows the preview force',
        );
        if (attempts.length) assert(travel > attempts.at(-1).travel);
        attempts.push({ power: shot.power, travel });
        await page.locator('#pause').tap();
        await page.locator('#home').tap();
      }
      assert.deepEqual(errors, []);
      records.push({
        width,
        height,
        dpr,
        attempts,
        auxiliaryNodes: true,
        cameraAndTouchAligned: true,
      });
    } finally {
      await context.close();
    }
  }
  return records;
}
