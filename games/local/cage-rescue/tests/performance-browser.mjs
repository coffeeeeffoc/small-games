import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { steerWithPointer } from './pointer-play.mjs';

async function instrument(page) {
  await page.addInitScript(() => {
    window.__paint = { frames: 0, gradients: 0 };
    window.__canvasRefs = [];
    const create = document.createElement.bind(document);
    document.createElement = (...args) => {
      const element = create(...args);
      if (element instanceof HTMLCanvasElement) window.__canvasRefs.push(new WeakRef(element));
      return element;
    };
    for (const method of [
      'drawImage',
      'clearRect',
      'createLinearGradient',
      'createRadialGradient',
    ]) {
      const original = CanvasRenderingContext2D.prototype[method];
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        if (method.startsWith('create')) window.__paint.gradients++;
        else if (this.canvas.id === 'scene') window.__paint.frames++;
        return original.apply(this, args);
      };
    }
  });
}
const paints = (page) => page.evaluate(() => ({ ...window.__paint }));

export async function runPerformanceChecks({ check, fresh, ready, snapshot }) {
  await check('cached field, idle screens, background return and disposal', async () => {
    const { context, page } = await fresh(undefined, 'render lifecycle');
    try {
      await instrument(page);
      await page.route('**/src/main.mjs', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: (await response.text()).replace(
            'mountCageRescue().catch',
            'mountCageRescue().then(instance => { window.__mountedCage = instance; }).catch',
          ),
        });
      });
      await page.clock.install();
      await ready(page);
      await page.locator('#start').tap();
      await page.clock.runFor(250);
      const before = await paints(page);
      await page.clock.runFor(1000);
      const live = await paints(page);
      const frames = live.frames - before.frames;
      const gradients = live.gradients - before.gradients;
      assert(frames >= 30, 'ready game continues to accept continuous movement');
      assert(
        gradients <= frames * 4,
        'static scenery and cages do not recreate gradients each frame',
      );
      await page.locator('#pause').tap();
      await page.clock.runFor(250);
      const paused = await paints(page);
      const time = (await snapshot(page)).game.realTime;
      await page.clock.runFor(3000);
      assert.deepEqual(await paints(page), paused, 'paused scene has no repeated Canvas work');
      assert.equal((await snapshot(page)).game.realTime, time);
      await page.setViewportSize({ width: 320, height: 568 });
      // ResizeObserver is delivered by Chromium's layout cycle, outside the mocked clock.
      await page.waitForTimeout(100);
      await page.clock.runFor(250);
      const resized = await paints(page);
      assert(resized.frames > paused.frames, 'paused scene repaints after resizing');
      assert.equal((await snapshot(page)).game.realTime, time, 'resize preserves simulation');
      await page.clock.runFor(1000);
      assert.deepEqual(await paints(page), resized);
      await page.locator('#resume').tap();
      await page.clock.runFor(1000);
      assert(
        (await snapshot(page)).game.realTime > time + 0.8,
        'resume restarts one simulation loop',
      );
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      const hidden = await paints(page);
      const hiddenTime = (await snapshot(page)).game.realTime;
      await page.clock.runFor(10000);
      assert.deepEqual(await paints(page), hidden, 'pagehide cancels the animation loop');
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      await page.clock.runFor(250);
      assert.equal((await snapshot(page)).screen, 'pause', 'return waits for explicit resume');
      assert.equal((await snapshot(page)).game.realTime, hiddenTime);
      await page.locator('#resume').tap();
      await page.clock.runFor(1000);
      assert(
        (await snapshot(page)).game.realTime > hiddenTime + 0.8,
        'return does not freeze the next run',
      );
      await page.locator('#pause').tap();
      await page.locator('#home').tap();
      for (const menu of ['levels', 'help', 'settings', 'outfits']) {
        await page.locator(`#${menu}`).tap();
        await page.clock.runFor(250);
        const idle = await paints(page);
        await page.clock.runFor(3000);
        assert.deepEqual(await paints(page), idle, `${menu} does not animate behind the menu`);
        await page.locator('.screen:not([hidden]) [data-back]').tap();
      }
      await page.locator('#start').tap();
      await page.clock.runFor(250);
      await page.evaluate(() => window.__mountedCage.dispose());
      const disposed = await paints(page);
      await page.clock.runFor(3000);
      assert.deepEqual(await paints(page), disposed, 'dispose stops all rendering');
      assert.equal(await page.evaluate(() => !!window.__cageRescue), false);
      assert(
        await page.evaluate(() => window.__canvasRefs.some((ref) => ref.deref()?.width === 0)),
        'dispose releases the backing bitmap',
      );
      return {
        framesPerSimulatedSecond: frames,
        gradientsPerFrame: gradients / frames,
        idleFrames: 0,
      };
    } finally {
      await context.close();
    }
  });

  // Keep normal UI/candidate checks bounded; run the long session explicitly.
  if (
    process.env.CAGE_RESCUE_STRESS !== '1' &&
    !process.env.CAGE_RESCUE_TEST_MATCH?.includes('continuous')
  )
    return;

  for (const mobile of [true, false]) {
    await check(
      `continuous two campaigns ${mobile ? 'touch phone viewport' : 'desktop mouse'}`,
      async () => {
        const { context, page } = await fresh(
          mobile ? undefined : { width: 1280, height: 900 },
          'continuous campaign',
          mobile,
        );
        try {
          await instrument(page);
          await page.clock.install();
          await ready(page);
          const cdp = await context.newCDPSession(page);
          const rounds = [],
            samples = [];
          await page.locator('#start')[mobile ? 'tap' : 'click']();
          for (let round = 0; round < 12; round++) {
            await page.locator('#launch')[mobile ? 'tap' : 'click']();
            const stop = await steerWithPointer(page, context, { touch: mobile });
            let result;
            for (let elapsed = 0; elapsed < 120000; elapsed += 5000) {
              await page.clock.runFor(5000);
              result = await snapshot(page);
              if (result.screen === 'result') break;
            }
            await stop();
            assert.equal(result.screen, 'result', `round ${round + 1} remains responsive`);
            assert.equal(
              result.game.phase,
              'won',
              `round ${round + 1} is reachable through normal input`,
            );
            assert.equal(result.game.rescued, 6);
            assert.equal(result.game.usedRevive, false);
            assert.equal(result.trial, false);
            rounds.push({
              level: result.game.levelIndex + 1,
              seconds: result.game.realTime,
              rescued: result.game.rescued,
            });
            console.log(
              `PASS ${mobile ? 'touch' : 'mouse'} campaign round ${round + 1}/12 (level ${result.game.levelIndex + 1})`,
            );
            await page.clock.runFor(250);
            const settled = await paints(page);
            await page.clock.runFor(2000);
            assert.deepEqual(await paints(page), settled, 'result screen does not keep painting');
            await cdp.send('HeapProfiler.collectGarbage');
            const { usedSize } = await cdp.send('Runtime.getHeapUsage');
            const liveCanvases = await page.evaluate(
              () => __canvasRefs.filter((ref) => ref.deref()?.width > 0).length,
            );
            assert(liveCanvases <= 7, 'cache and current level previews have bounded bitmap count');
            samples.push({ round: round + 1, heapBytes: usedSize, liveCanvases });
            if (round === 11) break;
            if (round === 5) {
              await page.locator('#next')[mobile ? 'tap' : 'click']();
              await page.locator('[data-level="0"]')[mobile ? 'tap' : 'click']();
            } else await page.locator('#next')[mobile ? 'tap' : 'click']();
          }
          assert.equal(Object.keys((await snapshot(page)).progress.completed).length, 6);
          assert(
            samples.at(-1).heapBytes < samples[5].heapBytes + 4 * 1024 * 1024,
            'second campaign does not accumulate game states or bitmaps',
          );
          await page.locator('#result-home')[mobile ? 'tap' : 'click']();
          await expect(page.locator('#start')).toBeVisible();
          return {
            rounds,
            garbageCollectedSamples: samples,
            clock: 'accelerated requestAnimationFrame; no game state edits',
          };
        } finally {
          await context.close();
        }
      },
    );
  }
}
