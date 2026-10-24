import { expect } from '@playwright/test';

export const snapshot = (frame) => frame.locator('body').evaluate(() => window.Ashfall?.snapshot());
export async function ashfallInput(frame, mobile = false) {
  const page = frame.locator('canvas').page();
  const cdp = mobile ? await page.context().newCDPSession(page) : null;
  let active = false;
  async function point(id) {
    const s = await snapshot(frame),
      b = s.controls.find((c) => c.id === id && !c.disabled);
    expect(b, `available Creator control ${id}`).toBeTruthy();
    const bounds = await frame.locator('body').boundingBox();
    return { x: bounds.x + b.x + b.w / 2, y: bounds.y + b.y + b.h / 2 };
  }
  async function press(ids) {
    active = true;
    const points = await Promise.all(ids.map(point));
    if (cdp)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: points.map((p, i) => ({ ...p, id: i + 1 })),
      });
    else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
    }
  }
  async function release(cancel = false) {
    if (!active) return;
    active = false;
    if (cdp)
      await cdp.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
    else await page.mouse.up();
  }
  return {
    page,
    point,
    press,
    release,
    async tap(id) {
      await press([id]);
      await release();
    },
    async dispose() {
      await release(true);
      await cdp?.detach();
    },
  };
}

export async function assertAshfallGameplay(frame, mobile = false) {
  await expect.poll(async () => (await snapshot(frame))?.ready, { timeout: 60000 }).toBe(true);
  expect((await snapshot(frame)).creator).toBe('3.8.8');
  await expect(frame.locator('#GameCanvas')).toBeVisible();
  const input = await ashfallInput(frame, mobile);
  try {
    if ((await snapshot(frame)).screen === 'home') await input.tap('start');
    await expect.poll(async () => (await snapshot(frame)).screen).toBe('playing');
    const before = (await snapshot(frame)).run.player.x;
    await input.press(['right']);
    await expect
      .poll(async () => (await snapshot(frame)).run.player.x)
      .toBeGreaterThan(before + 20);
    await input.release();
    await input.tap('pause');
    await expect.poll(async () => (await snapshot(frame)).screen).toBe('paused');
    const time = (await snapshot(frame)).run.time;
    await input.page.waitForTimeout(180);
    expect((await snapshot(frame)).run.time).toBe(time);
    await input.tap('resume');
    await expect.poll(async () => (await snapshot(frame)).screen).toBe('playing');
    await input.tap('pause');
    await input.tap('home');
    await expect.poll(async () => (await snapshot(frame)).screen).toBe('home');
  } finally {
    await input.dispose();
  }
}
