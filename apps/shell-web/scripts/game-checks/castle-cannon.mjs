import { expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 20000 });

export async function assertCastleDuelEntry(frame, mobile = false) {
  const canvas = frame.locator('#GameCanvas');
  const page = canvas.page();
  const snapshot = () => frame.locator('body').evaluate(() => globalThis.__castle?.snapshot());
  await expect.poll(async () => (await snapshot())?.ready, { timeout: 90000 }).toBe(true);
  expect((await snapshot()).renderer).toBe('cocos');
  await expect.poll(async () => (await snapshot()).screen).toBe('home');
  let battleBox;
  const battleControls = new Map();
  const position = async (id) => {
    if (battleControls.has(id)) return battleControls.get(id);
    const s = await snapshot(),
      c = s.controls.find((c) => c.id === id);
    expect(c, `Missing control: ${id} on ${s.screen}`).toBeTruthy();
    expect(c.disabled, 'Disabled control: ' + id).toBe(false);
    const box = ['playing', 'confirm'].includes(s.screen)
      ? (battleBox ??= await canvas.boundingBox())
      : await canvas.boundingBox();
    expect(box).toBeTruthy();
    const scale = Math.min(box.width / s.width, box.height / s.height);
    return {
      x: box.x + (box.width - s.width * scale) / 2 + (c.x + c.w / 2) * scale,
      y: box.y + (box.height - s.height * scale) / 2 + (c.y + c.h / 2) * scale,
    };
  };
  const click = async (id) => {
    const p = await position(id);
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  expect((await snapshot()).controls.some((c) => ['pause', 'fullscreen'].includes(c.id))).toBe(
    false,
  );
  const originalLowPower = (await snapshot()).progress.lowPower;
  if (!originalLowPower) {
    await click('settings');
    await click('lowPower');
    await click('home');
  }
  await click('campaign');
  await expect.poll(async () => (await snapshot()).screen).toBe('campaign');
  await click('selected-start');
  await expect.poll(async () => (await snapshot()).screen).toBe('playing');
  await expect.poll(async () => (await snapshot()).trajectory.points.length).toBeGreaterThan(3);
  const beforeAim = await snapshot();
  const box = await canvas.boundingBox();
  battleBox = box;
  const scale = Math.min(box.width / beforeAim.width, box.height / beforeAim.height);
  // Query fixed viewport geometry once so software rendering cannot consume battle time in CDP reads.
  for (const c of beforeAim.controls)
    battleControls.set(c.id, {
      x: box.x + (box.width - beforeAim.width * scale) / 2 + (c.x + c.w / 2) * scale,
      y: box.y + (box.height - beforeAim.height * scale) / 2 + (c.y + c.h / 2) * scale,
    });
  const aim = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = { x: aim.x + 12 * scale, y: aim.y - 30 * scale };
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [aim] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }
  } else {
    await page.mouse.move(aim.x, aim.y);
    await page.mouse.down();
    try {
      await page.mouse.move(end.x, end.y, { steps: 4 });
    } finally {
      await page.mouse.up();
    }
  }
  await expect
    .poll(async () => {
      const s = await snapshot();
      return (
        s.fighters[beforeAim.side].guns[0].pitch >
          beforeAim.fighters[beforeAim.side].guns[0].pitch &&
        JSON.stringify(s.trajectory.points) !== JSON.stringify(beforeAim.trajectory.points)
      );
    })
    .toBe(true);
  await click('blast');
  const first = beforeAim;
  const p = await position('fire');
  const charged = () =>
    expect
      .poll(
        async () => {
          const s = await snapshot(),
            gun = s.fighters[s.side].guns.find((g) => g.id === s.fighters[s.side].station);
          return gun?.charge == null ? 0 : (s.duelTime - gun.charge) / 1.8;
        },
        { timeout: 90000 },
      )
      .toBeGreaterThan(0.3);
  if (mobile) {
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
      await charged();
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }
  } else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    try {
      await charged();
    } finally {
      await page.mouse.up();
    }
  }
  await expect
    .poll(async () => (await snapshot()).fighters[first.side].lastShot?.power ?? 0)
    .toBeGreaterThan(0.15);
  const pitch = (await snapshot()).fighters[first.side].guns[0].pitch;
  await click('scope');
  await expect.poll(async () => (await snapshot()).scope).toBe(true);
  expect((await snapshot()).fighters[first.side].guns[0].pitch).toBe(pitch);
  await click('scope');
  await click('leave');
  await expect.poll(async () => (await snapshot()).screen).toBe('confirm');
  const stoppedAt = (await snapshot()).duelTime;
  await page.waitForTimeout(350);
  expect((await snapshot()).duelTime).toBe(stoppedAt);
  await click('resume');
  await expect
    .poll(async () => {
      const s = await snapshot();
      return s.screen === 'playing' && s.duelTime > stoppedAt;
    })
    .toBe(true);
  await click('leave');
  await click('leave-confirm');
  await expect.poll(async () => (await snapshot()).screen).toBe('home');
  battleBox = undefined;
  battleControls.clear();
  await click('practice');
  await expect.poll(async () => (await snapshot()).screen).toBe('maps');
  await click('map-ravine');
  await expect.poll(async () => (await snapshot()).screen).toBe('playing');
  await click('leave');
  await click('leave-confirm');
  await expect.poll(async () => (await snapshot()).screen).toBe('home');
  if (!originalLowPower) {
    await click('settings');
    await click('lowPower');
    await click('home');
  }
  await position('start');
}
