import path from 'node:path';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
export async function playCampaign({ page, game, tap, state, screen, touch, point, fire, out }) {
  // Shots use the same visible controls as a player: drag aim, hold charge, release.
  let overshoot = 0;
  for (let shot = 0; shot < 18 && (await game.getAttribute('data-screen')) === 'playing'; shot++) {
    const player = (await state()).fighters[0];
    if (player.hp < 55 && player.medicines > 0) {
      await tap('retreat');
      await expect
        .poll(async () => (await state()).fighters[0].node, { timeout: 30000 })
        .toBe('shelter');
      await expect
        .poll(async () => (await state()).fighters[0].healing, { timeout: 15000 })
        .toBeNull();
    }
    if (!(await state()).fighters[0].station) {
      const p = (await state()).fighters[0],
        station = p.guns[0].hp > 0 ? 'ground' : 'wall';
      await tap(`station:${station}`);
      await expect
        .poll(async () => (await state()).fighters[0].station, { timeout: 30000 })
        .toBe(station);
    }
    await expect
      .poll(
        async () => {
          const p = (await state()).fighters[0];
          return p.guns.find((g) => g.id === p.station)?.reload;
        },
        { timeout: 15000 },
      )
      .toBe(1);
    const snapshot = await state(),
      gun = snapshot.fighters[0].guns.find((g) => g.id === snapshot.fighters[0].station),
      enemy = snapshot.fighters[1],
      pitch = 38,
      yaw =
        (-Math.atan2(enemy.position.z - gun.position.z, enemy.position.x - gun.position.x) * 180) /
        Math.PI,
      start = await point(460, 315),
      end = await point(460 - (yaw - gun.yaw) / 0.09, 315 - (pitch - gun.pitch) / 0.15);
    await touch('touchStart', [start]);
    await touch('touchMove', [end]);
    await touch('touchEnd', []);
    const a = (pitch * Math.PI) / 180,
      y = (yaw * Math.PI) / 180,
      origin = {
        x: gun.position.x + Math.cos(a) * Math.cos(y) * 3,
        y: gun.position.y + 2.05 + Math.sin(a) * 3,
        z: gun.position.z - Math.cos(a) * Math.sin(y) * 3,
      },
      range = Math.hypot(enemy.position.x - origin.x, enemy.position.z - origin.z),
      dy = enemy.position.y + 0.8 - origin.y,
      speed = Math.sqrt((18 * range ** 2) / (2 * Math.cos(a) ** 2 * (range * Math.tan(a) - dy))),
      power = Math.max(0, Math.min(1, (speed - 31) / 27));
    // Dispatch release independently of the compositor's touch-start acknowledgement.
    const down = touch('touchStart', [fire]);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0.05, power - overshoot) * 1800));
    await Promise.all([down, touch('touchEnd', [])]);
    await expect
      .poll(async () => {
        const p = (await state()).fighters[0];
        return p.guns.find((g) => g.id === p.station)?.charge ?? null;
      })
      .toBeNull();
    const fired = (await state()).fighters[0].lastShot;
    overshoot = Math.max(0, (fired?.power ?? power) - (power - overshoot));
    await page.waitForTimeout(2200);
    console.log(
      'Touch shot:',
      shot + 1,
      JSON.stringify({
        desired: power,
        actual: fired?.power,
        pitch: fired?.pitch,
        yaw: fired?.yaw,
        impact: (await state()).fighters[0].lastShot?.impact,
        hp: (await state()).fighters.map((p) => p.hp),
      }),
    );
  }
  await screen('result');
  assert.equal((await state()).result.winner, 0);
  assert.equal((await state()).unlocked, 1);
  await page.screenshot({ path: path.join(out, 'portrait-canvas-victory.png') });
  await tap('campaign-next');
  await screen('playing');
  assert.equal((await state()).campaignLevel, 1);
  await tap('pause');
}
