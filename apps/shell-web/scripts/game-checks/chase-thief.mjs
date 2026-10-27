import { expect } from '@playwright/test';
export const snapshot = (frame) =>
  frame.locator('#GameCanvas').evaluate(() => globalThis.__chase?.snapshot());
export async function tapControl(frame, id, mobile = false) {
  let state;
  await expect
    .poll(async () => {
      state = await snapshot(frame);
      return state?.controls.some((c) => c.id === id && !c.disabled);
    })
    .toBe(true);
  const control = state.controls.find((c) => c.id === id);
  const canvas = frame.locator('#GameCanvas'),
    bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  const x = bounds.x + ((control.x + control.w / 2) / state.width) * bounds.width;
  const y = bounds.y + ((control.y + control.h / 2) / state.height) * bounds.height;
  if (mobile) await canvas.page().touchscreen.tap(x, y);
  else await canvas.page().mouse.click(x, y);
}
export async function assertChaseGameplay(frame, mobile = false) {
  await expect.poll(async () => (await snapshot(frame))?.ready, { timeout: 60000 }).toBe(true);
  await tapControl(frame, 'settings', mobile);
  await expect
    .poll(async () => (await snapshot(frame))?.controls.some((c) => c.id === 'toggle:touchButtons'))
    .toBe(true);
  if (
    (await snapshot(frame)).controls
      .find((c) => c.id === 'toggle:touchButtons')
      .label.endsWith('关')
  )
    await tapControl(frame, 'toggle:touchButtons', mobile);
  await tapControl(frame, 'back', mobile);
  // Each input gets a fresh run; slower CI must not lose while testing a later control.
  for (const [id, key, value] of [
    ['left', 'lane', 0],
    ['right', 'lane', 2],
    ['jump', 'action', 'jump'],
    ['slide', 'action', 'slide'],
  ]) {
    await tapControl(frame, 'start', mobile);
    await expect.poll(async () => (await snapshot(frame))?.distance).toBeGreaterThan(0);
    const observed = await frame.locator('#GameCanvas').evaluateHandle(
      (_, { key, value }) => {
        const before = globalThis.__chase.snapshot().inputCount;
        const result = { seen: false, frame: 0 };
        const sample = () => {
          const state = globalThis.__chase.snapshot();
          result.seen ||= state.inputCount > before && state[key] === value;
          if (!result.seen) result.frame = requestAnimationFrame(sample);
        };
        result.frame = requestAnimationFrame(sample);
        return result;
      },
      { key, value },
    );
    try {
      await tapControl(frame, id, mobile);
      await expect.poll(() => observed.evaluate((state) => state.seen)).toBe(true);
    } finally {
      await observed.evaluate((state) => cancelAnimationFrame(state.frame));
      await observed.dispose();
    }
    if (id === 'jump') await expect.poll(async () => (await snapshot(frame))?.action).toBe('run');
    await tapControl(frame, 'pause', mobile);
    await expect.poll(async () => (await snapshot(frame))?.screen).toBe('paused');
    if (id === 'slide') {
      await tapControl(frame, 'resume', mobile);
      await expect.poll(async () => (await snapshot(frame))?.screen).toBe('running');
      await expect
        .poll(async () => (await snapshot(frame))?.screen, { timeout: 90000 })
        .toBe('result');
      const endedDistance = (await snapshot(frame)).distance;
      await tapControl(frame, 'retry', mobile);
      await expect.poll(async () => (await snapshot(frame))?.distance).toBeLessThan(endedDistance);
      await tapControl(frame, 'pause', mobile);
      await expect.poll(async () => (await snapshot(frame))?.screen).toBe('paused');
    }
    await tapControl(frame, 'home', mobile);
    await expect.poll(async () => (await snapshot(frame))?.screen).toBe('home');
  }
}
