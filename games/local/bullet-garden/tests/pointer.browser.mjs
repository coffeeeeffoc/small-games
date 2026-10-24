import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, snapshot, point, output } from './cocos-harness.mjs';
import { sourceHash } from '../scripts/artifact.mjs';
const build = JSON.parse(await readFile(new URL('../dist/build-info.json',import.meta.url),'utf8'));
assert.equal(build.sourceHash, await sourceHash(), 'test the current production build');
const h = await harness(), observations = [];
try {
  for (const touchEnabled of [false, true]) {
    const s = await h.open({ width:390, height:844, touchEnabled }), p = s.page;
    let button = await point(p, 'start');
    if (touchEnabled) await p.touchscreen.tap(button.x, button.y);
    else await p.mouse.click(button.x, button.y);
    await p.waitForTimeout(100);
    const j = await point(p, 'move'), before = await snapshot(p);
    assert(before.controls.pointerInput, 'Web routes mouse and touch through captured pointer events');
    assert.equal(before.state.stats.shots,0,'the empty opening does not fire');
    await p.mouse.move(j.x + 32, j.y);
    await p.mouse.down();
    await p.waitForTimeout(350);
    let a = await snapshot(p);
    observations.push({ touchEnabled, kind:'mouse-hold', dx:a.state.player.x-before.state.player.x, controls:a.controls });
    assert(a.state.player.x > before.state.player.x + 15, 'mouse hold on joystick rim must move immediately');
    await p.mouse.move(j.x - 35, j.y);
    const x = (await snapshot(p)).state.player.x;
    await p.waitForTimeout(250);
    assert((await snapshot(p)).state.player.x < x - 15, 'mouse drag reverses movement');
    await p.mouse.up();
    await p.waitForTimeout(50);
    assert.deepEqual((await snapshot(p)).controls.move, { x:0, y:0 });
    await p.mouse.move(j.x,j.y); await p.mouse.down();
    await p.mouse.move(j.x+34,j.y,{steps:5});
    await p.waitForTimeout(100);
    assert((await snapshot(p)).controls.move.x>0.5,'dragging the knob from its center moves');
    await p.mouse.move(-20,j.y); await p.mouse.up();
    await p.waitForTimeout(50);
    assert.deepEqual((await snapshot(p)).controls.move,{x:0,y:0},'release outside the canvas clears movement');
    if (touchEnabled) {
      await p.touchscreen.tap(j.x,j.y);
      await p.mouse.move(j.x+32,j.y); await p.mouse.down();
      await p.waitForTimeout(80);
      assert((await snapshot(p)).controls.move.x > 0.4, 'a real mouse works immediately after a touch');
      await p.mouse.up();
    }
    await p.mouse.move(j.x+32,j.y); await p.mouse.down();
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    a = await snapshot(p);
    assert.equal(a.screen, 'paused');
    assert.deepEqual(a.controls.move, { x:0,y:0 });
    await p.mouse.up();
    await s.close();
  }
  for (const touchEnabled of [false, true]) {
    const embed = await h.browser.newPage({ viewport:{width:390,height:844}, hasTouch:touchEnabled });
    await embed.goto(h.url + '/fixture-host');
    const frame = embed.frames().find(f => f.parentFrame());
    await frame.waitForFunction(() => window.__bulletGarden?.snapshot().art.ready);
    const b = await point(frame, 'start');
    if (touchEnabled) await embed.touchscreen.tap(b.x,b.y);
    else await embed.mouse.click(b.x,b.y);
    await frame.waitForFunction(() => window.__bulletGarden.snapshot().screen === 'playing');
    observations.push({touchEnabled,kind:'iframe-first-press',screen:(await snapshot(frame)).screen});
    await embed.close();
  }
  assert.deepEqual(h.errors, []);
  console.log('Desktop and touch-capable browser mouse joystick checks passed.');
} finally {
  await writeFile(path.join(output,'pointer-report.json'), JSON.stringify({sourceHash:build.sourceHash,observations,errors:h.errors},null,2));
  await h.close();
}
