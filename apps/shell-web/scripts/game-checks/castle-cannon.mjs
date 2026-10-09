import { expect as baseExpect } from '@playwright/test';
// Software-rendered Chromium can take over 5s to publish the fired-shot frame.
const expect = baseExpect.configure({ timeout: 15000 });
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
  const waitForCharge = () =>
    expect
      .poll(
        async () => {
          const label = await frame.locator('[data-action="fire"]').textContent();
          return Number(label.match(/松手发射 (\d+)%/)?.[1] ?? 0);
        },
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(25);
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await waitForCharge();
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    try {
      await waitForCharge();
    } finally {
      await page.mouse.up();
    }
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
