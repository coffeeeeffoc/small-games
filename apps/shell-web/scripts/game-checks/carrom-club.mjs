import { expect } from '@playwright/test';

export async function assertCarromGameplay(frame, mobile) {
  const click = (locator) => (mobile ? locator.tap() : locator.click());
  const board = frame.locator('#board');
  await expect(board).toBeVisible();
  await click(frame.locator('#pause'));
  await expect(frame.locator('#pause-screen')).toBeVisible();
  await click(frame.locator('#resume'));
  const box = await board.boundingBox(),
    page = board.page();
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.79 };
  const end = { x: start.x, y: start.y + box.height * 0.16 };
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect(board).toHaveAttribute('data-shots', '0');
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await touch.detach();
    }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(board).toHaveAttribute('data-shots', '1');
  await expect(board).toHaveAttribute('data-phase', 'moving');
}
