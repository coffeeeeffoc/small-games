import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, snapshot, point, tap, output } from './cocos-harness.mjs';

const h = await harness();
const observations = [];
try {
  for (const [width, height] of [[330, 717], [320, 568], [844, 390]]) {
    const s = await h.open({ width, height }), p = s.page;
    // Busy hosts may render fewer than 350 ms of gameplay during a wall-clock sleep.
    const advance = async (seconds = 0.35) => {
      const t = (await snapshot(p)).state.time;
      await p.waitForFunction(({t,seconds}) => window.__bulletGarden.snapshot().state.time >= t + seconds,
        {t,seconds}, {timeout:10000});
    };
    await tap(p, 'start');
    const j = await point(p, 'move');
    let before = (await snapshot(p)).state.player;
    // Hold the right side of the visible stick, without a dash masking movement.
    await s.touch('touchStart', 1, { x: j.x + 30, y: j.y });
    assert((await snapshot(p)).controls.move.x > 0.5, 'touch input is set immediately');
    await advance();
    let a = await snapshot(p);
    observations.push({ width, kind: 'touch-hold', dx: a.state.player.x - before.x });
    assert(a.state.player.x > before.x + 15, 'holding the stick rim moves immediately');
    await s.touch('touchMove', 1, { x: j.x - 36, y: j.y });
    before = (await snapshot(p)).state.player;
    await advance();
    a = await snapshot(p);
    assert(a.state.player.x < before.x - 15, 'drag can reverse direction');
    await s.touch('touchCancel', 1);
    assert.deepEqual((await snapshot(p)).controls.move, { x: 0, y: 0 });
    before = (await snapshot(p)).state.player;
    await p.keyboard.down('KeyD');
    await advance();
    a = await snapshot(p);
    assert(a.state.player.x > before.x + 20, 'D moves without touching or dashing');
    await p.keyboard.up('KeyD');
    await p.keyboard.down('ArrowUp');
    await advance(0.15);
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    a = await snapshot(p);
    assert.equal(a.screen, 'paused');
    assert.deepEqual(a.controls.move, { x: 0, y: 0 });
    await p.keyboard.up('ArrowUp');
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await tap(p, 'resume');
    before = (await snapshot(p)).state.player;
    await advance(0.2);
    a = await snapshot(p);
    assert.equal(a.state.player.x, before.x);
    assert.equal(a.state.player.y, before.y);
    await tap(p, 'pause');
    a = await snapshot(p);
    observations.push({ width, kind:'pause-before-exit', screen:a.screen, controls:a.controls });
    assert.equal(a.screen, 'paused', 'pause responds before leaving the run');
    await tap(p, 'abandon');
    await s.close();
  }
  assert.deepEqual(h.errors, []);
  console.log('Touch rim, drag, keyboard and blur movement checks passed.');
} finally {
  await writeFile(path.join(output, 'movement-report.json'), JSON.stringify({ observations, errors: h.errors }, null, 2));
  await h.close();
}
