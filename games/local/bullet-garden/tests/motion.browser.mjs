import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, snapshot, point, tap, output } from './cocos-harness.mjs';
import { sourceHash } from '../scripts/artifact.mjs';

const build = JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'));
assert.equal(build.sourceHash, await sourceHash(), 'capture the current production build');
const h = await harness(), observations = [];
try {
  for (const [width, height] of [[330,717], [320,568], [844,390]]) {
    const s = await h.open({ width, height, recordVideo: width === 330 }), p = s.page;
    await tap(p, 'start');
    const start = await snapshot(p), camera = start.viewport.camera;
    assert(start.art.loaded.includes('hero-motion'));
    await p.evaluate(() => {
      window.motionSamples = [];
      window.motionTimer = setInterval(() => {
        const s = window.__bulletGarden.snapshot();
        if (s.screen === 'playing') window.motionSamples.push({ time:s.state.time, player:s.state.player, hero:s.viewport.hero, camera:s.viewport.camera, shots:s.state.stats.shots });
      }, 16);
    });
    const j = await point(p, 'move');
    for (const [label, dx, dy, duration] of [['right',38,0,1800], ['left',-38,0,3000], ['top',0,-38,2500], ['bottom',0,38,4000]]) {
      await s.touch('touchStart', 1, { x:j.x+dx, y:j.y+dy });
      await p.waitForTimeout(duration);
      await s.touch('touchCancel', 1);
      await p.waitForTimeout(100);
      const a = await snapshot(p), hero = a.viewport.hero, battle = a.viewport.battle;
      assert.equal(a.screen, 'playing');
      assert.deepEqual(a.viewport.camera, camera, `moving ${label} cannot move the camera`);
      assert(hero.screen.x > 20 && hero.screen.x < width - 20);
      assert(hero.screen.y - hero.height >= battle.y - 1 && hero.screen.y <= battle.y + battle.h);
      assert.equal(hero.moving, false);
      await p.screenshot({ path: path.join(output, `motion-${width}-${label}.png`) });
      observations.push({ width, label, player: a.state.player, hero, camera });
    }
    await p.keyboard.down('KeyD');
    await p.waitForTimeout(250);
    await p.keyboard.up('KeyD');
    await tap(p, 'pause');
    const paused = (await snapshot(p)).viewport.hero;
    await p.waitForTimeout(250);
    assert.deepEqual((await snapshot(p)).viewport.hero, paused, 'pause freezes stride and recoil');
    await tap(p, 'resume');
    const samples = await p.evaluate(() => { clearInterval(window.motionTimer); return window.motionSamples; });
    assert(new Set(samples.filter(x=>x.hero.moving).map(x=>x.hero.frame)).size === 4, 'all four walking phases reached');
    assert(new Set(samples.map(x=>x.hero.direction)).size >= 3, 'real encounters change facing');
    assert(samples.some(x=>x.hero.flash && x.hero.recoil > 0), 'real volleys produce muzzle flash and recoil');
    for (const a of samples) {
      assert.deepEqual(a.camera, camera);
      assert(Math.abs(a.hero.screen.x - (width/2 + (a.player.x-camera.x)*camera.zoom)) < 0.01);
    }
    assert(Math.max(...samples.map(x=>x.hero.screen.x))-Math.min(...samples.map(x=>x.hero.screen.x)) > 50, 'player visibly traverses the fixed arena');
    await writeFile(path.join(output, `motion-samples-${width}.json`), JSON.stringify(samples));
    await s.close();
  }
  assert.deepEqual(h.errors, []);
  console.log('Fixed camera, four edges, eight-direction asset, stride, discharge and pause checks passed.');
} finally {
  await writeFile(path.join(output, 'motion-report.json'), JSON.stringify({ sourceHash:build.sourceHash, observations, errors:h.errors }, null, 2));
  await h.close();
}
