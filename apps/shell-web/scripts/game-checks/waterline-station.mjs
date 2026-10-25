import { expect } from '@playwright/test';

// Mirrors provide names and bounds only: pointer input goes to the real Cocos canvas.
export async function waterlineControl(frame, id, mobile = false) {
  const locator = frame.locator(`#${id}`);
  await expect(locator).toBeAttached();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const page = locator.page();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

export async function assertWaterlineGameplay(frame, mobile = false) {
  const snapshot = () => frame.locator('body').evaluate(() => globalThis.__waterlineSnapshot?.());
  const control = (id) => waterlineControl(frame, id, mobile);
  const screen = (value) => expect.poll(async () => (await snapshot())?.screen).toBe(value);
  const idle = () => expect.poll(async () => (await snapshot()).animating).toBe(false);
  await screen('home');
  const engine = await frame.locator('body').evaluate(async () => {
    const { cc } = await import('./vendor/cocos/bootstrap.mjs');
    return { version: cc.VERSION, scene: Boolean(cc.director.getScene()) };
  });
  expect(engine).toEqual({ version: '3.8.8', scene: true });
  await control('levels-button');
  while ((await snapshot()).chapter > 0) await control('chapter-prev');
  if ((await snapshot()).unlocked === 0) await expect(frame.locator('#level-1')).toBeDisabled();
  await control('level-0');
  await screen('playing');
  const initial = (await snapshot()).state;
  const pipe = await frame.locator('body').evaluate(async () => {
    const { getBoardLayout } = await import('./layout.mjs');
    const { LEVELS } = await import('./levels.mjs');
    const { viewport } = globalThis.__waterlineSnapshot();
    const valve = getBoardLayout(LEVELS[0], viewport.width, viewport.height).valves[0];
    return { x: valve.fromX + 1, y: valve.railY };
  });
  const stage = await frame.locator('#stage').boundingBox();
  const page = frame.locator('#stage').page();
  if (mobile) await page.touchscreen.tap(stage.x + pipe.x, stage.y + pipe.y);
  else await page.mouse.click(stage.x + pipe.x, stage.y + pipe.y);
  expect((await snapshot()).selectedGate).toBe('AB');
  expect((await snapshot()).state.moves).toBe(0);
  await control('gate-BC');
  await idle();
  expect((await snapshot()).state.moves).toBe(1);
  expect((await snapshot()).state.volumes).not.toEqual(initial.volumes);
  await control('gate-BC');
  await idle();
  expect((await snapshot()).state.gates[1]).toBe(false);
  expect((await snapshot()).state.moves).toBe(2);
  await control('undo');
  expect((await snapshot()).state.moves).toBe(1);
  expect((await snapshot()).state.gates[1]).toBe(true);
  await control('pause');
  await screen('paused');
  const paused = (await snapshot()).state;
  await control('resume');
  expect((await snapshot()).state).toEqual(paused);
  await control('pause');
  await control('restart');
  expect((await snapshot()).state.volumes).toEqual(initial.volumes);
  await control('predict');
  await control('gate-AB');
  expect((await snapshot()).state.moves).toBe(0);
  expect((await snapshot()).preview.volumes).toEqual([4, 4, 4]);
  await control('gate-AB');
  await idle();
  await screen('result');
  expect((await snapshot()).state.won).toBe(true);
  await control('result-undo');
  await screen('playing');
  expect((await snapshot()).state.volumes).toEqual(initial.volumes);
  await control('gate-AB');
  await idle();
  await control('next-level');
  expect((await snapshot()).levelIndex).toBe(1);
  await control('gate-BC');
  expect((await snapshot()).state.moves).toBe(0);
  expect((await snapshot()).message).toContain('先点亮');
  await control('back-home');
  await screen('home');
}
