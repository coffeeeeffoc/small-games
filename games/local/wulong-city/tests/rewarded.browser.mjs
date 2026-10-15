import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { browserEvidence } from './browser-evidence.mjs';

const evidence = new URL('../docs/design/rewarded-android-2026-10-14/actual/', import.meta.url);
const env = await browserEvidence({ evidence });
const { page, base, shot } = env;
const checks = [];
try {
  // Simulated SDK callbacks exercise the real bridge. Game actions remain touch input.
  await page.addInitScript(() => {
    if (!localStorage.getItem('wulong-city-v1')) localStorage.setItem('wulong-city-v1', JSON.stringify({
      orderVersion: 2, unlockedLevels: [1, 2, 21], level: 2, records: {}, sound: false,
    }));
    window.__adRequests = [];
    window.WulongAndroidHost = {
      capabilities: () => '{"rewarded":true}',
      showRewarded: (id, placement) => window.__adRequests.push({ id, placement }),
      cancelRewarded() {}, privacy() {}, exit() {}, share() {},
    };
  });
  await page.goto(base + '?dev=1');
  await shot('home-390');
  await page.locator('#home-settings').tap();
  await expect(page.locator('#fullscreen')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('wulong:native-back')));
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'home');
  await page.locator('#home-levels').tap(); await shot('levels-390');
  await page.locator('[data-level="2"]').tap();
  await page.locator('#hint').tap();
  await expect(page.locator('#reward-status')).toHaveText('自愿观看，完整看完后获得指引。');
  for (let i = 0; i < 3; i++) await page.locator('[data-more]').tap();
  await expect(page.locator('.hint-step')).toHaveText('提示 1 / 3');
  assert.equal(await page.evaluate(() => window.__adRequests.length), 0);
  await shot('hint-390');
  await page.locator('#reward-hint').tap();
  await expect(page.locator('#reward-hint')).toBeDisabled();
  await expect(page.locator('#reward-cancel')).toBeVisible();
  const time = await page.evaluate(() => window.__wulong.snapshot().state.t);
  await page.evaluate(() => window.dispatchEvent(new Event('wulong:native-pause')));
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().state.t), time);
  await page.evaluate(() => {
    const { id } = window.__adRequests.at(-1);
    window.WulongNative.deliver(id, 'completed');
    window.WulongNative.deliver(id, 'completed');
    window.dispatchEvent(new Event('wulong:native-resume'));
  });
  await expect(page.locator('#reward-status')).toContainText('指引已开启');
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().guideRemaining), 30);
  await page.locator('[data-close-hint]').tap();
  await expect(page.locator('#stage')).toHaveClass(/guide-active/);
  await shot('guide-390');
  await page.locator('#pause').tap();
  const remaining = await page.evaluate(() => window.__wulong.snapshot().guideRemaining);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().guideRemaining), remaining);
  await shot('pause-390');
  await page.locator('#retry').tap();
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().guideRemaining), 0);
  await expect(page.locator('#stage')).not.toHaveClass(/guide-active/);
  checks.push('all free hints; native fullscreen; duplicate completion; gameplay-only countdown; retry resets');

  for (const outcome of ['dismissed', 'unavailable', 'failed']) {
    await page.locator('#hint').tap(); await page.locator('#reward-hint').tap();
    await page.evaluate(status => window.WulongNative.deliver(window.__adRequests.at(-1).id, status), outcome);
    await expect(page.locator('#reward-status')).toContainText('免费');
    assert.equal(await page.evaluate(() => window.__wulong.snapshot().guideRemaining), 0);
    await page.locator('[data-close-hint]').tap();
  }
  await page.locator('#hint').tap(); await page.locator('#reward-hint').tap();
  const cancelledId = await page.evaluate(() => window.__adRequests.at(-1).id);
  await page.locator('#reward-cancel').tap();
  await expect(page.locator('#reward-status')).toContainText('已取消');
  await page.evaluate(id => window.WulongNative.deliver(id, 'completed'), cancelledId);
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().guideRemaining), 0);
  await page.locator('#reward-hint').tap();
  const oldId = await page.evaluate(() => window.__adRequests.at(-1).id);
  await page.locator('[data-close-hint]').tap(); await page.locator('#pause').tap(); await page.locator('#retry').tap();
  await page.evaluate(id => window.WulongNative.deliver(id, 'completed'), oldId);
  assert.equal(await page.evaluate(() => window.__wulong.snapshot().guideRemaining), 0);
  checks.push('cancel/no-fill/error; explicit cancellation; late completion cannot affect new run');

  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#hint').tap();
  await page.locator('#reward-hint').scrollIntoViewIfNeeded();
  const button = await page.locator('#reward-hint').boundingBox();
  assert(button.height >= 44 && button.width >= 44 && button.x >= 0 && button.x + button.width <= 321);
  await shot('hint-320');
  await page.locator('[data-close-hint]').tap();
  const left = await page.locator('#left').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
  await expect(page.locator('#left')).not.toHaveClass(/pressed/);
  await page.evaluate(() => window.dispatchEvent(new Event('wulong:native-pause')));
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'pause');
  await page.evaluate(() => window.dispatchEvent(new Event('wulong:native-resume')));
  await expect(page.locator('#game')).toHaveAttribute('data-page', 'pause');
  await page.locator('[data-resume]').tap();
  checks.push('320px touch target; gesture cancellation; native background stays paused after resume');

  await page.goto(base + '?dev=1&challenge=21');
  await page.locator('#hint').tap(); await expect(page.locator('#reward-hint')).toHaveCount(0);
  await page.locator('[data-close-hint]').tap();
  await page.locator('[data-zone="fan-power"]').tap(); await page.locator('[data-zone="fan-face"]').tap();
  await page.waitForFunction(() => window.__wulong.snapshot().state.dry === 1);
  const right = await page.locator('#right').boundingBox();
  const input = await page.context().newCDPSession(page);
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right.x + right.width / 2, y: right.y + right.height / 2, id: 1 }] });
  await page.locator('#game[data-page="result"]').waitFor();
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await input.detach();
  await shot('result-320');
  assert.equal(await page.evaluate(() => window.__adRequests.length), 0);
  await page.locator('[data-home]').tap(); await shot('return-320');
  await page.goto(base + '?dev=1&level=100');
  await page.locator('#hint').tap(); await expect(page.locator('#reward-hint')).toHaveCount(0);
  checks.push('touch-only puzzle/result/home; no automatic result ads; challenge and locked-level dev practice excluded');
  assert.deepEqual(env.errors, []);
  await writeFile(new URL('verification.json', evidence), JSON.stringify({ environment: 'Chromium mobile touch emulation, simulated native SDK callbacks', checks, errors: env.errors, physicalDeviceVerified: false, realAdsVerified: false }, null, 2) + '\n');
  console.log('PASS Wulong rewarded Android bridge browser checks: ' + checks.join('; '));
} finally { await env.close(); }
