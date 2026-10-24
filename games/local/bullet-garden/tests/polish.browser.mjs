import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, snapshot, tap, point, upgrade, output } from './cocos-harness.mjs';
import { createProfile } from '../src/progression.mjs';
import { LEVEL_ORDER } from '../src/config.mjs';
import { sourceHash } from '../scripts/artifact.mjs';
const buildInfo = JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'));
assert.equal(buildInfo.sourceHash, await sourceHash(), 'rebuild the current source before capturing evidence');
const h = await harness();
const report = { runtime: 'Creator 3.8.8 production; Chromium touch emulation', sourceHash: buildInfo.sourceHash, views: [], choices: [], errors: h.errors };
const shot = (p, name) => p.screenshot({ path: path.join(output, name + '.png') });
function disjoint(buttons, label) {
  for (let i = 0; i < buttons.length; i++) for (const other of buttons.slice(i + 1)) {
    const a = buttons[i].clientRect, b = other.clientRect;
    const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert(dx <= 1 || dy <= 1, `${label}: ${buttons[i].id} overlaps ${other.id}`);
  }
}
try {
  for (const [width, height] of [[320, 480], [640, 360], [320, 568], [330, 717], [390, 844], [430, 932], [844, 390]]) {
    const s = await h.open({ width, height, profile: createProfile({ xp: 450, coins: 1047, completed: LEVEL_ORDER.slice(0, 3), selectedLevelId: LEVEL_ORDER[3] }) });
    const p = s.page;
    await shot(p, `home-${width}`);
    for (const id of ['levels', 'camp', 'settings', 'help']) {
      await tap(p, id);
      const a = await snapshot(p);
      disjoint(a.buttons, `${width}x${height}/${id}`);
      for (const b of a.buttons) {
        const r = b.clientRect;
        assert(r.w >= 44 && r.h >= 44, `${id}/${b.id} target`);
        assert(r.x >= -1 && r.y >= -1 && r.x + r.w <= width + 1 && r.y + r.h <= height + 1, `${width}/${id}/${b.id} bounds`);
      }
      await shot(p, `${id}-${height < 500 ? `${width}x${height}` : width}`);
      await tap(p, 'back');
    }
    await tap(p, 'start');
    disjoint((await snapshot(p)).buttons, `${width}x${height}/battle`);
    await shot(p, `battle-${height < 500 ? `${width}x${height}` : width}`);
    await tap(p, 'pause');
    await shot(p, `pause-${width}`);
    await tap(p, 'abandon');
    report.views.push({ width, height });
    await s.close();
  }
  const s = await h.open({ recordVideo: true }), p = s.page;
  await p.waitForTimeout(800);
  await tap(p, 'levels');
  await p.waitForTimeout(1000);
  await tap(p, 'depart');
  const started = Date.now();
  let moved = false, paused = false;
  while (Date.now() - started < 100000) {
    const a = await snapshot(p);
    if (a.screen === 'upgrade') {
      report.choices.push({ time: a.state.time, kills: a.state.kills });
      await shot(p, `upgrade-${report.choices.length}-390`);
      await p.waitForTimeout(1200);
      await upgrade(p);
      continue;
    }
    if (a.screen === 'result') break;
    assert.equal(a.screen, 'playing');
    if (a.state.time > 6 && !moved) {
      const j = await point(p, 'move');
      await s.touch('touchStart', 1, j);
      await s.touch('touchMove', 1, { x: j.x + 24, y: j.y - 24 });
      await p.waitForTimeout(500);
      await s.touch('touchCancel', 1);
      await shot(p, 'battle-moving-390');
      moved = true;
    }
    if (a.state.time > 12 && !paused) {
      await tap(p, 'pause');
      await p.waitForTimeout(700);
      await tap(p, 'resume');
      paused = true;
    }
    await p.waitForTimeout(200);
  }
  const end = await snapshot(p);
  assert.equal(end.phase, 'won');
  assert(report.choices[0].time >= 20);
  for (let i = 1; i < report.choices.length; i++) assert(report.choices[i].time - report.choices[i - 1].time >= 15);
  await shot(p, 'victory-390');
  await p.waitForTimeout(1000);
  await tap(p, 'home');
  report.victory = { time: end.state.time, hp: end.state.player.hp, kills: end.state.kills };
  const saved = end.profile;
  await p.reload();
  await p.waitForFunction(() => window.__bulletGarden?.snapshot().art.ready);
  assert.deepEqual((await snapshot(p)).profile, saved);
  const video = p.video();
  await s.close();
  report.video = await video.path();
  assert.deepEqual(h.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  await writeFile(path.join(output, 'polish-report.json'), JSON.stringify(report, null, 2));
  await h.close();
}
