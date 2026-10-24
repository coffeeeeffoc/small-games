import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gardenCamera, createHeroMotion, advanceHeroMotion, HERO_FRAMES } from '../src/presentation.mjs';
import { createGame, startGame, step, castSkill, normalAimTarget } from '../src/simulation.mjs';
import { weatherStats } from '../src/world.mjs';

const bounds = { left: 480, right: 960, top: 150, bottom: 790 };
const run = () => ({ time: 0, player: { x: 720, y: 470, angle: 0 }, stats: { shots: 0 }, enemies: [] });

test('fixed camera contains all four arena corners and standing actor at phone and short landscape sizes', () => {
  for (const [w, h] of [[330, 458], [320, 350], [390, 555], [844, 183], [640, 153]]) {
    const battle = { w, h, y: 77 }, camera = gardenCamera(bounds, battle);
    for (const x of [bounds.left, bounds.right]) for (const y of [bounds.top, bounds.bottom]) {
      const px = w / 2 + (x - camera.x) * camera.zoom;
      const py = h / 2 + (y - camera.y) * camera.zoom;
      assert(px >= 23.99 && px <= w - 23.99);
      assert(py >= 43.99 && py <= h - 15.99);
    }
    assert.deepEqual(gardenCamera(bounds, battle), camera);
  }
});

test('stride follows distance, stops at a wall and freezes with the simulation clock', () => {
  const state = run(), motion = createHeroMotion(state), frames = new Set();
  for (let i = 0; i < 8; i++) {
    state.time += 0.1; state.player.x += 23;
    advanceHeroMotion(motion, state); frames.add(motion.frame);
  }
  assert.equal(frames.size, 4);
  const paused = structuredClone(motion);
  advanceHeroMotion(motion, state);
  assert.deepEqual(motion, paused);
  state.time += 0.1;
  advanceHeroMotion(motion, state);
  assert.equal(motion.moving, false);
  assert.equal(motion.frame, 1);
  assert.equal(motion.stride, paused.stride);
});

test('turns take the short arc, eight views remain upright, and discharge uses the real angle', () => {
  const state = run(); state.player.angle = Math.PI * 2 - 0.1;
  const motion = createHeroMotion(state);
  state.player.angle = 0.1; state.time = 0.01;
  advanceHeroMotion(motion, state);
  assert(motion.angle > Math.PI * 2 - 0.1 && motion.angle < Math.PI * 2 + 0.1);
  for (let direction = 0; direction < 8; direction++) {
    state.player.angle = direction * Math.PI / 4;
    state.time += 0.4; state.stats.shots++;
    const original = structuredClone(state);
    advanceHeroMotion(motion, state);
    assert.equal(motion.direction, direction);
    assert.equal(motion.shotAngle, state.player.angle);
    assert(motion.recoil > 0 && motion.flash);
    assert.deepEqual(state, original, 'presentation never writes authoritative state');
  }
  state.time += 0.2; advanceHeroMotion(motion, state);
  assert.equal(motion.recoil, 0); assert.equal(motion.flash, false);
  assert.equal(createHeroMotion(run()).stride, 0);
  assert.equal(HERO_FRAMES.length, 32);
  for (const [x,y,w,h] of HERO_FRAMES) assert(x > 2 && y > 2 && x+w+2 < 1774 && y+h+2 < 887);
});

test('pre-aim uses the same range, weather and hit layers as auto-fire', () => {
  const state = createGame('ruins');
  state.player.angle = 0;
  const range = 535 * weatherStats(state).gunRange;
  state.enemies = [{ hp:10, layer:'ground', x:state.player.x, y:state.player.y + range + 1 }];
  const motion = createHeroMotion(state);
  state.time += 0.1; advanceHeroMotion(motion, state);
  assert.equal(motion.angle, 0);
  assert.equal(normalAimTarget(state), null);
  state.enemies[0].y = state.player.y + range - 1;
  state.time += 0.1; advanceHeroMotion(motion, state);
  assert(motion.angle > 0);
  state.weather = { kind: 'fog' };
  assert.equal(normalAimTarget(state), null, 'fog reduces the same pre-aim and firing range');
  state.enemies[0].layer = 'underground';
  assert.equal(normalAimTarget(state), null);
});

test('a queued burst keeps its actual discharge angle after an opposite skill cast', () => {
  const state = createGame('ruins', 42, null, { dev:true, skills:['blast','gale'] });
  startGame(state); state.spawnTimer = 1e6; state.terrain = []; state.enemies = [];
  state.upgrades.push('burst');
  state.player.angle = 0;
  const motion = createHeroMotion(state);
  step(state, 1/60, { aimActive:true, aimX:state.player.x+100, aimY:state.player.y });
  advanceHeroMotion(motion, state);
  assert.equal(state.burstQueue.length, 1);
  state.skillSlots[0].energy = 100;
  assert(castSkill(state, { x:state.player.x - 100, y:state.player.y }, 0));
  assert(Math.abs(state.player.angle) > 3);
  step(state, 0.09, { autoFire:false });
  advanceHeroMotion(motion, state);
  assert.equal(state.lastShot.angle, 0);
  assert.equal(motion.shotAngle, 0);
  assert.equal(motion.direction, 0);
  assert(motion.flash && motion.recoil > 0);
});
