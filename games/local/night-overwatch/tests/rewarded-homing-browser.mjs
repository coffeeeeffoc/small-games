import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, navigateMap, aimAt, assertLayout } from './flight-browser.mjs';

async function guidedImpact(page, shot) {
  assert.equal(shot.guidance?.kind, 'consumable');
  const airborne = await snapshot(page), position = airborne.shotPositions.find(p => p.id === shot.id);
  assert(position && Math.hypot(position.x - shot.origin.x, position.y - shot.origin.y, position.z - shot.origin.z) > 0,
    'guided missile travels from its muzzle before impact');
  await page.waitForFunction(id => !__night.snapshot().shots.some(s => s.id === id), shot.id, { timeout: 15000 });
  const impact = (await snapshot(page)).impacts.find(event => event.shot === shot.id);
  assert(impact, 'guided missile produces a real impact event');
  // Moving targets can approach the missile before the launch-time arrival estimate.
  assert(impact.time > airborne.time && impact.time > shot.born + 1 / 60, 'impact follows observed flight, never instant damage');
  return impact;
}

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = new URL('../reports/combat-supply/regression-homing/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], results = [];
try {
  for (const [width, height, touch] of [[1366, 768, false], [844, 390, true], [568, 320, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    page.on('pageerror', e => errors.push(e.message));
    const capture = async name => page.screenshot({ path: fileURLToPath(new URL(`${width}-${name}.png`, dir)) });
    const countdown = async () => {
      const before = await snapshot(page);
      assert(before.resumeCountdown > 2 && before.resumeCountdown <= 3);
      await page.waitForTimeout(250);
      assert.equal((await snapshot(page)).time, before.time);
      await page.waitForFunction(() => __night.snapshot().resumeCountdown === 0 && !__night.snapshot().pauses.length);
    };
    const supply = async () => {
      const ammo = (await snapshot(page)).homingAmmo;
      await press(page, 'supply', touch); await press(page, 'supplyWatch', touch);
      await press(page, 'adClose', touch);
      assert.equal((await snapshot(page)).homingAmmo, ammo);
      assert.equal((await snapshot(page)).pendingSupply, true);
      await press(page, 'reward:ammo', touch);
      assert.equal((await snapshot(page)).homingAmmo, ammo + 2);
      assert.equal((await snapshot(page)).pendingSupply, false);
      assert.equal((await snapshot(page)).homingSelected, true);
      await countdown();
    };
    await page.goto(base);
    await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).modal, 'home');
    await press(page, 'training', touch); await press(page, 'start', touch);
    assertLayout(await snapshot(page), width, height);
    await press(page, 'supply', touch); await press(page, 'supplyWatch', touch);
    let s = await snapshot(page);
    assert(s.advert.mock && s.pauses.includes('advert'));
    assert.equal(s.homingAmmo, 0);
    assert(s.buttons.some(b => b.id === 'adClose') && s.buttons.some(b => b.id === 'adCancel'));
    assertLayout(s, width, height);
    const frozen = s.time; await page.waitForTimeout(200);
    assert.equal((await snapshot(page)).time, frozen);
    await capture('mock-homing'); await press(page, 'adClose', touch);
    assert.equal((await snapshot(page)).homingAmmo, 0);
    assert.equal((await snapshot(page)).pendingSupply, true);
    await press(page, 'reward:ammo', touch);
    assert.equal((await snapshot(page)).homingAmmo, 2);
    assert.equal((await snapshot(page)).pendingSupply, false);
    assert.equal((await snapshot(page)).homingSelected, true);
    await countdown();
    assert.deepEqual((await snapshot(page)).held, []);
    await press(page, 'zoomControls', touch);
    for (const limit of [10, 20, 40, 80, 160]) {
      assertLayout(await snapshot(page), width, height);
      await press(page, 'zoomUpgrade', touch);
      assert.equal((await snapshot(page)).zoomLimit, limit / 2);
      if (limit === 10) await capture('mock-zoom-10');
      await press(page, 'adClose', touch);
      assert.equal((await snapshot(page)).zoomLimit, limit);
      await countdown();
    }
    await press(page, 'zoomUpgrade', touch);
    assert(!(await snapshot(page)).advert, 'maximum tier never offers another ad');
    await press(page, 'zoomControls', touch);
    const staticTarget = (await snapshot(page)).units.find(u => !u.friendly && u.kind === 'turret');
    await navigateMap(page, staticTarget, touch);
    // Real keyboard scaling uses the same cap as touch and wheel. No game-state injection.
    for (let i = 0; i < 35; i++) await page.keyboard.press('Equal');
    s = await snapshot(page); assert.equal(s.zoom, 160); assert(s.camera.fov < 1);
    await capture('160x');
    for (let i = 0; i < 35; i++) await page.keyboard.press('Minus');
    for (let i = 0; i < 2; i++) await page.keyboard.press('Equal');
    if (touch) {
      const cdp = await page.context().newCDPSession(page), x = width / 2, y = height * .56;
      const points = gap => [{ x: x - gap, y, id: 1 }, { x: x + gap, y, id: 2 }];
      const before = (await snapshot(page)).zoom;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(25) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(48) });
      await page.waitForTimeout(80);
      assert((await snapshot(page)).zoom > before * 1.5);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.deepEqual((await snapshot(page)).held, []);
      await cdp.detach();
    }
    s = await snapshot(page);
    const target = s.units.find(u => !u.friendly && u.kind === 'light');
    await navigateMap(page, target, touch);
    await aimAt(page, (await snapshot(page)).units.find(u => u.id === target.id), touch);
    await press(page, 'fire', touch);
    s = await snapshot(page);
    const shot = s.shots.find(a => a.guidance);
    assert(shot && shot.guidance.target === target.id); assert.equal(s.homingAmmo, 1);
    await page.waitForFunction(id => __night.snapshot().locks.some(lock => lock.id === id), target.id);
    await page.waitForFunction(id => __night.snapshot().effects.projectiles.some(p => p.id === id), shot.id, { timeout: 10000 });
    await capture('tracking-lock');
    await press(page, 'pause', touch);
    const position = (await snapshot(page)).shotPositions.find(p => p.id === shot.id);
    await page.waitForTimeout(200);
    assert.deepEqual((await snapshot(page)).shotPositions.find(p => p.id === shot.id), position);
    await press(page, 'resume', touch);
    const impact = await guidedImpact(page, shot);
    assert.equal(impact.outcome, 'destroyed');
    assert.equal((await snapshot(page)).units.find(u => u.id === target.id).hp, 0);
    assert.equal((await snapshot(page)).locks.length, 0);
    await capture('hit');
    // Spend the remaining round, then earn two more: light/turret take one, heavy takes two.
    for (const kind of ['turret', 'heavy']) {
      const enemy = (await snapshot(page)).units.find(u => !u.friendly && u.kind === kind);
      assert(enemy && enemy.hp > 0);
      for (let round = 0; round < (kind === 'heavy' ? 2 : 1); round++) {
        if (!(await snapshot(page)).homingAmmo) await supply();
        const before = await snapshot(page), hp = before.units.find(u => u.id === enemy.id).hp;
        await navigateMap(page, enemy, touch);
        await aimAt(page, (await snapshot(page)).units.find(u => u.id === enemy.id), touch);
        await press(page, 'fire', touch);
        const missile = (await snapshot(page)).shots.find(a => a.guidance?.target === enemy.id);
        assert(missile); await guidedImpact(page, missile);
        const after = await snapshot(page), remainingHp = after.units.find(u => u.id === enemy.id).hp;
        assert.equal(after.homingAmmo, before.homingAmmo - 1);
        assert(remainingHp < hp);
        if (kind === 'heavy' && round === 0) {
          assert(remainingHp > 0, 'heavy survives one consumable missile');
          assert.equal(hp - remainingHp, 120, 'consumable missile deals the confirmed 120 damage');
        }
        else assert.equal(remainingHp, 0);
      }
    }
    await page.waitForFunction(() => __night.snapshot().phase === 'success');
    await capture('settlement'); await press(page, 'retry', touch);
    assert.equal((await snapshot(page)).homingAmmo, 0); assert.equal((await snapshot(page)).zoomLimit, 160);
    await press(page, 'pause', touch); await press(page, 'home', touch);
    assert.equal((await snapshot(page)).modal, 'home');
    await page.reload(); await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).zoomLimit, 160); assert.equal((await snapshot(page)).homingAmmo, 0);
    results.push({ width, height, touch, trackingHit: target.id, zoomLimit: 160, persistence: true,
      settlement: true, supplyAmmo: 2, homingDamage: 120, heavyShots: 2 });
    await page.close();
  }
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(new URL('verification.json', dir), JSON.stringify({ build, results, errors, physicalDevice: false, realAdSdk: false }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
