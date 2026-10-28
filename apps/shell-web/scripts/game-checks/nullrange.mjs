import { expect } from '@playwright/test';

export const snapshot = (frame) =>
  frame.locator('#GameCanvas').evaluate(() => globalThis.__nullrange?.snapshot());

export function controlPoint(state, control, bounds) {
  const x = (control.x + control.w / 2) * state.scale;
  const y = (control.y + control.h / 2) * state.scale;
  return bounds.width < bounds.height
    ? { x: bounds.x + bounds.width - y, y: bounds.y + x }
    : { x: bounds.x + x, y: bounds.y + y };
}

export async function tapControl(frame, id, mobile = false) {
  let state;
  await expect
    .poll(async () => {
      state = await snapshot(frame);
      return state?.controls.some((c) => c.id === id && !c.disabled);
    })
    .toBe(true);
  const control = state.controls.find((c) => c.id === id);
  expect(Math.min(control.w, control.h) * state.scale).toBeGreaterThanOrEqual(43.9);
  const canvas = frame.locator('#GameCanvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  const point = controlPoint(state, control, bounds);
  expect(point.x).toBeGreaterThanOrEqual(bounds.x);
  expect(point.x).toBeLessThan(bounds.x + bounds.width);
  expect(point.y).toBeGreaterThanOrEqual(bounds.y);
  expect(point.y).toBeLessThan(bounds.y + bounds.height);
  if (mobile) await canvas.page().touchscreen.tap(point.x, point.y);
  else await canvas.page().mouse.click(point.x, point.y);
}

export async function assertNullrangeGameplay(frame, mobile = false) {
  await expect(frame.locator('#GameCanvas')).toBeVisible();
  await expect(frame.locator('#nullrange-loading')).toHaveCount(0, { timeout: 60000 });
  // Production has no debug API; opt in through the public URL before observing gameplay.
  const gameFrame = frame.owner
    ? await (await frame.owner().elementHandle()).contentFrame()
    : frame;
  const url = new URL(gameFrame.url());
  url.searchParams.set('dev', '1');
  await gameFrame.goto(url.href);
  await expect.poll(async () => (await snapshot(frame))?.screen, { timeout: 60000 }).toBe('home');
  expect((await snapshot(frame)).engine).toBe('Cocos Creator 3.8.8');
  expect(await frame.locator('body').evaluate(() => Object.keys(globalThis.__nullrange))).toEqual([
    'snapshot',
  ]);
  const tap = (id) => tapControl(frame, id, mobile);
  const screen = (value) => expect.poll(async () => (await snapshot(frame)).screen).toBe(value);
  await tap('online');
  await screen('online');
  await tap('back');
  await tap('missions');
  await screen('missions');
  await tap('start');
  await screen('playing');
  const running = await snapshot(frame);
  expect(running.controls.every((c) => Math.min(c.w, c.h) * running.scale >= 43.9)).toBe(true);
  await tap('missile');
  await expect
    .poll(async () => (await snapshot(frame)).state.missiles)
    .toBeLessThan(running.state.missiles);
  await tap('pause');
  await screen('paused');
  const tick = (await snapshot(frame)).state.tick;
  await frame.locator('canvas').page().waitForTimeout(180);
  expect((await snapshot(frame)).state.tick).toBe(tick);
  await tap('resume');
  await screen('playing');
  await expect.poll(async () => (await snapshot(frame)).state.tick).toBeGreaterThan(tick);
  await tap('pause');
  await tap('home');
  await screen('home');
  if (mobile) {
    const page = frame.locator('canvas').page();
    const viewport = page.viewportSize();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(async () => {
          const bounds = await frame.locator('#GameCanvas').boundingBox();
          return bounds.height > bounds.width;
        })
        .toBe(true);
      await tap('missions');
      await screen('missions');
      await tap('start');
      await screen('playing');
      const rotated = await snapshot(frame);
      expect(rotated.controls.every((c) => Math.min(c.w, c.h) * rotated.scale >= 43.9)).toBe(true);
      await tap('pause');
      await screen('paused');
      await tap('home');
      await screen('home');
    } finally {
      await page.setViewportSize(viewport);
    }
  }
}
