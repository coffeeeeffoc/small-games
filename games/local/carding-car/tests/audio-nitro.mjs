import assert from 'node:assert/strict';
import { designPoint, gameURL, startBrowser, tapDesign, verifyBuild } from './browser-utils.mjs';

const url = gameURL();
await verifyBuild(url);
const browser = await startBrowser(url, {
  args: ['--autoplay-policy=document-user-activation-required'],
});
try {
  for (const mode of ['ShiftLeft', 'ShiftRight', 'touch']) {
    const touch = mode === 'touch';
    const page = await browser.newPage({
      viewport: { width: 960, height: 540 },
      hasTouch: touch,
      userAgent: touch
        ? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
        : undefined,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      // Observe real audio output without resuming contexts or changing audio policy.
      const connect = AudioNode.prototype.connect;
      const probes = [];
      AudioNode.prototype.connect = function (...args) {
        const result = connect.apply(this, args);
        if (args[0] === this.context.destination) {
          const analyser = this.context.createAnalyser();
          connect.call(this, analyser);
          probes.push(analyser);
        }
        return result;
      };
      globalThis.audioLevel = () =>
        Math.max(
          0,
          ...probes.map((analyser) => {
            const samples = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(samples);
            return Math.sqrt(
              samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
            );
          }),
        );
    });
    await page.goto(url);
    await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading);
    await page.keyboard.press('Shift');
    await page.waitForFunction(() => __kart.snapshot().audioClips === 7);
    if (touch) await tapDesign(page, 198, 433);
    else await page.keyboard.press('Enter');
    await page.waitForFunction(() => audioLevel() > 0.01);
    await page.waitForFunction(() => __kart.snapshot().time > 1);
    await page.waitForFunction(() => __kart.snapshot().audioPlaying && audioLevel() > 0.01);
    const before = await page.evaluate(() => __kart.snapshot());
    const cdp = touch ? await page.context().newCDPSession(page) : null;
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { ...await designPoint(page, 845, 280), id: 1 },
          { ...await designPoint(page, 110, 440), id: 2 },
        ],
      });
    } else await page.keyboard.down(mode);
    await page.waitForFunction(() => __kart.snapshot().player.nitroCooldown > 5);
    let state = await page.evaluate(() => __kart.snapshot());
    assert.equal(state.input.nitro, true);
    assert.equal(state.input.drift, false, 'Shift / nitro button must not trigger drift');
    if (touch) assert.ok(state.input.steer < 0, 'steering and nitro support simultaneous fingers');
    assert.ok(state.player.boost > 1);
    await page.waitForFunction((time) => __kart.snapshot().time > time + 0.5, state.time);
    state = await page.evaluate(() => __kart.snapshot());
    assert.ok(state.player.speed > before.player.speed + 3, 'nitro produces real acceleration');
    assert.match(state.hud.nitro, /s$/);
    await page.screenshot({
      path: new URL(
        `../reports/nitro-${touch ? 'touch' : 'keyboard'}.png`,
        import.meta.url,
      ).pathname.replace(/^\/(?=[A-Za-z]:)/, ''),
    });
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else await page.keyboard.up(mode);
    assert.equal((await page.evaluate(() => __kart.snapshot())).input.nitro, false);
    await page.waitForFunction(() => __kart.snapshot().player.boost === 0);
    if (touch) {
      await tapDesign(page, 910, 46);
      await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'paused');
      await tapDesign(page, 480, 184);
      await tapDesign(page, 640, 114);
      await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'racing');
    }
    else await page.keyboard.press('m');
    await page.waitForFunction(() => __kart.snapshot().muted && !__kart.snapshot().audioPlaying);
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => audioLevel() < 0.001), 'mute silences audio output');
    if (touch) {
      await tapDesign(page, 910, 46);
      await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible);
      await tapDesign(page, 480, 184);
      await tapDesign(page, 640, 114);
      await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible && __kart.snapshot().phase === 'racing');
    }
    else await page.keyboard.press('m');
    await page.waitForFunction(() => !__kart.snapshot().muted && audioLevel() > 0.01);
    assert.deepEqual(errors, []);
    console.log(`${mode}: audible engine, mute/unmute, nitro acceleration and release passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
