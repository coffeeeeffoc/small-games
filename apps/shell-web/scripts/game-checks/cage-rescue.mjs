import { expect } from '@playwright/test';

/** Public UI/input contract, shared by desktop iframe and standalone touch checks. */
export async function assertCageRescueGameplay(frame, mobile = false) {
  const click = (locator) => (mobile ? locator.tap() : locator.click());
  const snapshot = () => frame.locator('body').evaluate(() => globalThis.__cageRescue.snapshot());
  const page = frame.locator('#scene').page();
  const shell = page.locator('.standalone-page[data-game-id="cage-rescue"]');
  const embeddedInShell = (await shell.count()) === 1;
  await expect(frame.locator('body')).toHaveAttribute('data-screen', 'play');
  await expect(frame.locator('#scene')).toBeVisible();
  if (embeddedInShell) {
    await expect(shell).toHaveAttribute('data-immersive', 'true');
    await expect(shell).toHaveAttribute('data-screen', 'playing');
    await expect(shell.locator('nav')).toBeHidden();
  }
  await click(frame.locator('#launch'));
  await expect.poll(async () => (await snapshot()).game.phase).toBe('playing');
  const scene = frame.locator('#scene');
  const bounds = await scene.boundingBox();
  const start = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.85 };
  const end = { x: bounds.x + bounds.width * 0.7, y: start.y };
  const initialX = (await snapshot()).game.paddle.x;
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      await expect
        .poll(async () => (await snapshot()).game.paddle.x)
        .toBeGreaterThan(initialX + 20);
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    try {
      await page.mouse.move(end.x, end.y, { steps: 4 });
      await expect
        .poll(async () => (await snapshot()).game.paddle.x)
        .toBeGreaterThan(initialX + 20);
    } finally {
      await page.mouse.up();
    }
  }
  await expect.poll(async () => (await snapshot()).activePointer).toBe(null);
  // Let Chromium finish the native drag before tapping a control in the iframe.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
      ),
  );
  await click(frame.locator('#pause'));
  await expect(frame.locator('body')).toHaveAttribute('data-screen', 'pause');
  if (embeddedInShell) await expect(shell.locator('nav')).toBeHidden();
  await click(frame.locator('#resume'));
  await expect(frame.locator('body')).toHaveAttribute('data-screen', 'play');
  await click(frame.locator('#pause'));
  await click(frame.locator('#home'));
  await expect(frame.locator('body')).toHaveAttribute('data-screen', 'home');
  await expect(frame.locator('#start')).toBeVisible();
  if (embeddedInShell) {
    await expect(shell).toHaveAttribute('data-screen', 'home');
    await expect(shell.locator('nav')).toBeVisible();
    await expect(shell.getByRole('button', { name: '返回目录', exact: true })).toBeVisible();
  }
}
