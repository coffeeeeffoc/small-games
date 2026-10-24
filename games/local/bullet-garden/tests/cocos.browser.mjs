import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, snapshot, point, tap, upgrade, collideUntil, output } from './cocos-harness.mjs';
import { createProfile } from '../src/progression.mjs';
import { LEVEL_ORDER } from '../src/config.mjs';
const h = await harness();
const report = {
  runtime: 'real Creator production dist; desktop Chromium touch emulation',
  checks: [],
  errors: h.errors,
};
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
  ]) {
    const s = await h.open({ width, height }),
      p = s.page;
    const a = await snapshot(p);
    assert.equal(a.engine, 'Cocos Creator 3.8.8');
    assert.equal(a.screen, 'home');
    assert.equal(a.art.loaded.length, 7);
    assert.equal(a.controls.developerMode, false);
    assert(!a.ads.configured);
    assert(!a.buttons.some((b) => /fullscreen|全屏/.test(b.id + b.label)));
    for (const b of a.buttons) {
      assert(b.clientRect.w >= 44 && b.clientRect.h >= 44);
      assert(b.clientRect.y + b.clientRect.h <= height + 1);
    }
    await p.screenshot({ path: path.join(output, `home-${width}.png`) });
    await tap(p, 'levels');
    let levels = [];
    for (let page = 0; page < 3; page++) {
      const x = await snapshot(p);
      levels.push(...x.buttons.filter((b) => b.id.startsWith('level:')));
      if (page < 2) await tap(p, 'more');
    }
    assert.equal(levels.length, 14);
    assert.equal(levels.filter((b) => !b.disabled).length, 1);
    await tap(p, 'back');
    await tap(p, 'camp');
    await tap(p, 'plants');
    await tap(p, 'back');
    await tap(p, 'back');
    await tap(p, 'settings');
    await tap(p, 'setting:sound');
    await tap(p, 'back');
    await tap(p, 'help');
    await tap(p, 'back');
    await tap(p, 'start');
    let before = (await snapshot(p)).state.player;
    const j = await point(p, 'move');
    await s.touch('touchStart', 1, j);
    await s.touch('touchMove', 1, { x: j.x + 35, y: j.y - 10 });
    const d = await point(p, 'dash');
    await s.touch('touchStart', 2, d);
    await p.waitForTimeout(250);
    let x = await snapshot(p);
    assert(x.state.player.dashCooldown > 0);
    assert(x.controls.joystickActive);
    assert(Math.hypot(x.state.player.x - before.x, x.state.player.y - before.y) > 5);
    await s.touch('touchCancel', 1);
    assert.equal((await snapshot(p)).controls.joystickActive, false);
    await tap(p, 'pause');
    const t = (await snapshot(p)).state.time;
    await p.waitForTimeout(250);
    assert.equal((await snapshot(p)).state.time, t);
    await tap(p, 'resume');
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await snapshot(p)).screen, 'paused');
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await tap(p, 'resume');
    await p.setViewportSize({ width: height, height: width });
    await p.waitForTimeout(200);
    await tap(p, 'pause');
    await tap(p, 'abandon');
    assert.equal((await snapshot(p)).screen, 'home');
    report.checks.push({
      viewport: [width, height],
      menus: true,
      multitouch: true,
      cancel: true,
      resize: true,
      pause: true,
    });
    await s.close();
  }
  // New profile, normal speed, no state setters or clock acceleration.
  const s = await h.open(),
    p = s.page;
  await tap(p, 'start');
  const observation = [];
  let firstFight = false;
  const start = Date.now();
  while (Date.now() - start < 100000) {
    let a = await snapshot(p);
    if (a.screen === 'upgrade') {
      await upgrade(p);
      continue;
    }
    const c = a.viewport.camera,
      b = a.viewport.battle;
    const visible = a.state.enemies.filter(
      (e) => Math.abs(e.x - c.x) * c.zoom < b.w / 2 && Math.abs(e.y - c.y) * c.zoom < b.h / 2,
    ).length;
    observation.push({ time: a.state.time, hp: a.state.player.hp, kills: a.state.kills, visible });
    if (visible && a.state.time < 10 && !firstFight) {
      firstFight = true;
      await p.screenshot({ path: path.join(output, 'battle-first10-390.png') });
    }
    if (a.screen === 'result') break;
    assert.equal(a.screen, 'playing');
    // A short real joystick gesture early in the run proves movement in the normal clear.
    if (a.state.time > 9 && a.state.time < 10) {
      const j = await point(p, 'move');
      await s.touch('touchStart', 1, j);
      await s.touch('touchMove', 1, { x: j.x + 24, y: j.y + 25 });
      await p.waitForTimeout(250);
      await s.touch('touchEnd', 1);
    }
    await p.waitForTimeout(250);
  }
  let a = await snapshot(p);
  assert.equal(a.screen, 'result');
  assert.equal(a.phase, 'won');
  assert(firstFight, 'visible enemy before ten seconds');
  assert(a.state.time >= 60);
  assert(a.profile.completed.includes('ruins'));
  assert(a.profile.settledRuns.every((x) => typeof x === 'string'));
  const saved = JSON.stringify(a.profile);
  await p.screenshot({ path: path.join(output, 'victory-390.png') });
  await p.reload();
  await p.waitForFunction(() => window.__bulletGarden?.snapshot().art.ready);
  a = await snapshot(p);
  assert.equal(JSON.stringify(a.profile), saved);
  await tap(p, 'levels');
  assert(!(await snapshot(p)).buttons.find((b) => b.id === 'level:meadow').disabled);
  report.checks.push({ naturalFirstClear: true, unlockReload: true, observation });
  await s.close();
  // Explicit persisted advanced-save fixture; all combat remains normal, driven by touch.
  const advanced = createProfile({
    xp: 10000,
    completed: LEVEL_ORDER.slice(0, -1),
    selectedLevelId: 'skyreach',
  });
  const f = await h.open({ profile: advanced }),
    q = f.page;
  await tap(q, 'start');
  const initial = await snapshot(q);
  assert.equal(initial.state.skills.length, 2);
  for (let i = 0; i < 240 && (await snapshot(q)).state.skills[0].energy < 100; i++) {
    await upgrade(q);
    await q.waitForTimeout(200);
  }
  await upgrade(q);
  const skill = await point(q, 'skill:0'),
    target = { x: 190, y: 260 };
  await f.touch('touchStart', 1, skill);
  await f.touch('touchMove', 1, target);
  assert((await snapshot(q)).controls.skillAiming);
  await f.touch('touchCancel', 1);
  assert.equal((await snapshot(q)).state.stats.skillCasts, 0);
  await f.touch('touchStart', 1, skill);
  await f.touch('touchMove', 1, target);
  await f.touch('touchEnd', 1);
  assert.equal((await snapshot(q)).state.stats.skillCasts, 1);
  const lost = await collideUntil(f, (x) => x.screen === 'failed');
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.profile.settledRuns.length, 0);
  await q.screenshot({ path: path.join(output, 'failed-390.png') });
  await tap(q, 'finish');
  const settled = await snapshot(q);
  assert.equal(settled.screen, 'result');
  assert.equal(settled.profile.settledRuns.length, 1);
  await tap(q, 'next');
  assert.equal((await snapshot(q)).screen, 'playing');
  await tap(q, 'pause');
  await tap(q, 'abandon');
  report.checks.push({
    advancedSaveFixture: true,
    naturalCollisionFailure: true,
    explicitFailureSettlement: true,
    retry: true,
    skillDragCancel: true,
  });
  await f.close();
  for (const options of [
    { query: '?dev=1' },
    { storageDev: '1' },
    { query: '?dev=0', storageDev: '1' },
  ]) {
    const f = await h.open(options);
    const a = await snapshot(f.page);
    assert.equal(a.controls.developerMode, options.query !== '?dev=0');
    await f.close();
  }
  const embed = await h.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await embed.goto(h.url + '/fixture-host');
  const frame = embed.frames().find((f) => f.parentFrame());
  await frame.waitForFunction(() => window.__bulletGarden?.snapshot().art.ready);
  await tap(frame, 'start');
  await tap(frame, 'pause');
  await tap(frame, 'abandon');
  const messages = await embed.evaluate(() =>
    window.messages.filter((x) => x.gameId === 'bullet-garden').map((x) => x.screen),
  );
  assert.deepEqual(messages, ['home', 'playing', 'home']);
  await embed.close();
  report.checks.push({ developerSwitches: true, sameOriginHostMessages: messages });
  assert.deepEqual(h.errors, []);
  report.passed = true;
} finally {
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  await h.close();
}
console.log('Creator production touch acceptance passed.');
await import('./movement.browser.mjs');
await import('./cocos-audio.browser.mjs');
