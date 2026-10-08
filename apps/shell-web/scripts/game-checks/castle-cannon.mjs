import { expect } from '@playwright/test';
export async function assertCastleDuelEntry(frame, mobile = false) {
  const root = frame.locator('.castle-root');
  const click = (id) =>
    mobile
      ? frame.locator(`[data-action="${id}"]`).tap()
      : frame.locator(`[data-action="${id}"]`).click();
  await expect(root).toHaveAttribute('data-screen', 'playing', { timeout: 15000 });
  const snapshot = async () =>
    JSON.parse(await frame.locator('#battle').getAttribute('data-renderer'));
  await click('blast');
  const first = await snapshot();
  const fire = await frame.locator('[data-action="fire"]').boundingBox();
  const point = { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
  const page = root.page();
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(450);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await touch.detach();
    }
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.up();
  }
  await expect
    .poll(async () => (await snapshot()).fighters[first.side].lastShot?.power ?? 0)
    .toBeGreaterThan(0.15);
  const angle = (await snapshot()).fighters[first.side].guns[0].pitch;
  await click('scope');
  await expect.poll(async () => (await snapshot()).scope).toBe(true);
  expect((await snapshot()).fighters[first.side].guns[0].pitch).toBe(angle);
  await click('scope');
  await click('pause');
  await expect(root).toHaveAttribute('data-screen', 'paused');
  await click('resume');
  await expect(root).toHaveAttribute('data-screen', 'playing');
  await click('pause');
  await click('leave');
  await click('leave-confirm');
  await expect(root).toHaveAttribute('data-screen', 'home');
  await expect(frame.locator('[data-action="start"]')).toBeVisible();
}
