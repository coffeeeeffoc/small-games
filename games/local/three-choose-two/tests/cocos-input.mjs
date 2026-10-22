import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { SHAPE_BY_ID } from '../src/shapes.mjs';
export function inputFor(page, mobile = true) {
  const canvas = page.locator('#GameCanvas'),
    snapshot = () => page.evaluate(() => globalThis.getThreeChooseTwoSnapshot?.());
  const point = async (p) => {
    const s = await snapshot(),
      b = await canvas.boundingBox(),
      scale = Math.min(b.width / s.viewport.width, b.height / s.viewport.height);
    return {
      x: b.x + (b.width - s.viewport.width * scale) / 2 + p.x * scale,
      y: b.y + (b.height - s.viewport.height * scale) / 2 + p.y * scale,
    };
  };
  let cdp;
  const touch = async (type, points = []) => {
    cdp ||= await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ id: i + 1, ...p })),
    });
  };
  const scroll = async (delta) => {
    const s = await snapshot(),
      x = 8,
      from = await point({
        x,
        y: delta > 0 ? s.viewport.height * 0.8 : s.viewport.height * 0.25,
      }),
      to = await point({
        x,
        y: delta > 0 ? s.viewport.height * 0.25 : s.viewport.height * 0.8,
      });
    await touch('touchStart', [from]);
    for (let i = 1; i <= 5; i++)
      await touch('touchMove', [{ x: from.x, y: from.y + ((to.y - from.y) * i) / 5 }]);
    await touch('touchEnd');
    await page.waitForTimeout(100);
  };
  const control = async (id) => {
    await expect
      .poll(async () => (await snapshot())?.controls.some((c) => c.id === id && !c.disabled))
      .toBe(true);
    let c;
    for (let i = 0; i < 12; i++) {
      const s = await snapshot();
      c = s.controls.find((c) => c.id === id && !c.disabled);
      if (c.y >= 0 && c.y + c.h <= s.viewport.height) break;
      await scroll(c.y < 0 ? -1 : 1);
    }
    assert(c, 'Missing ' + id);
    const p = await point({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
  };
  const drag = async (move, cancel = false) => {
    const s = await snapshot(),
      b = s.layout.board,
      c = s.layout.candidates[move.slot],
      shape = SHAPE_BY_ID[s.state.candidates[move.slot].shapeId],
      from = await point({ x: c.x + c.w / 2, y: c.y + c.h / 2 }),
      to = await point({
        x: b.x + b.inset + (move.x + shape.width / 2) * b.pitch,
        y:
          b.y +
          b.inset +
          (move.y + (mobile ? shape.height : shape.height / 2)) * b.pitch +
          (mobile ? 46 : 0),
      });
    if (mobile) {
      await touch('touchStart', [from]);
      for (let i = 1; i <= 6; i++)
        await touch('touchMove', [
          { x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6 },
        ]);
      await touch(cancel ? 'touchCancel' : 'touchEnd');
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(cancel ? 2 : to.x, cancel ? 2 : to.y, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(350);
  };
  const cell = async (move) => {
    await control('slot:' + move.slot);
    const b = (await snapshot()).layout.board,
      p = await point({
        x: b.x + b.inset + (move.x + 0.5) * b.pitch,
        y: b.y + b.inset + (move.y + 0.5) * b.pitch,
      });
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(350);
  };
  return {
    snapshot,
    point,
    control,
    drag,
    cell,
    scroll,
    touch,
    ready: () =>
      expect.poll(async () => (await snapshot())?.ready, { timeout: 60000 }).toBe(true),
    screen: (name) => expect.poll(async () => (await snapshot()).screen).toBe(name),
  };
}
