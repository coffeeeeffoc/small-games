import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRun,
  step,
  targetInCone,
  sweptDistance,
  damagePlayer,
  DT,
} from '../assets/scripts/core/rules.ts';
import { MISSIONS } from '../assets/scripts/core/content.ts';
import { pilot } from './pilot.mjs';
test('normal flight / pulse / missiles wins deterministically without changing game state', () => {
  const runs = [createRun(), createRun()];
  for (const s of runs) for (let i = 0; i < 10800 && s.status === 'running'; i++) step(s, pilot(s));
  assert.equal(runs[0].status, 'won');
  assert.equal(runs[0].kills, 6);
  assert.ok(runs[0].tick > 60);
  assert.deepEqual(runs[0], runs[1]);
  const score = runs[0].score;
  step(runs[0], { fire: true });
  assert.equal(runs[0].score, score);
  console.log(`Normal flight victory: ${(runs[0].tick * DT).toFixed(1)}s, score ${score}`);
});
test('normal terrain failure and clean restart', () => {
  const s = createRun();
  for (let i = 0; i < 10800 && s.status === 'running'; i++) step(s, { y: -1 });
  assert.equal(s.status, 'lost');
  assert.match(s.reason, /地形/);
  assert.equal(s.player.hull, 0);
  const fresh = createRun();
  assert.equal(fresh.tick, 0);
  assert.equal(fresh.player.hull, 100);
  assert.equal(fresh.missiles, 6);
});
test('acquisition is forward, bounded, ignores dead targets; rejected missile consumes nothing', () => {
  const s = createRun();
  assert.ok(targetInCone(s, 25, 900));
  s.enemies.forEach((e) => {
    e.x = 0;
    e.z = 200;
  });
  step(s, { missile: true });
  assert.equal(s.missiles, 6);
  assert.equal(s.missileCooldown, 0);
  s.enemies.forEach((e) => {
    e.z = -1200;
  });
  assert.equal(targetInCone(s, 25, 900), undefined);
  s.enemies[0].z = -200;
  s.enemies[0].hp = 0;
  assert.equal(targetInCone(s, 25, 900), undefined);
});
test('relative sweep catches crossing targets and fast shots; a shot cannot kill twice', () => {
  assert.equal(
    sweptDistance(
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 50, y: -20, z: 0 },
      { x: 50, y: 20, z: 0 },
    ),
    0,
  );
  const s = createRun();
  s.enemies = s.enemies.slice(0, 2);
  s.enemies.forEach((e) => {
    e.x = 0;
    e.y = 95;
    e.z = -50;
    e.hp = 1;
  });
  s.shots.push({
    id: 999,
    x: 0,
    y: 95,
    z: 0,
    velocity: { x: 0, y: 0, z: -6000 },
    owner: 'player',
    target: 0,
    missile: false,
    life: 2,
  });
  step(s);
  assert.equal(s.kills, 1);
  assert.equal(s.shots.length, 0);
});
test('heat locks and recovers, shield absorbs once, boost drains then refills, pickups consumed once', () => {
  const s = createRun();
  s.enemies.forEach((e) => (e.z = 10000));
  for (let i = 0; i < 200; i++) step(s, { fire: true });
  assert.ok(s.overheated);
  for (let i = 0; i < 150; i++) step(s);
  assert.equal(s.overheated, false);
  damagePlayer(s, 80, 'test');
  assert.equal(s.player.hull, 90);
  assert.equal(s.player.shield, 0);
  damagePlayer(s, 100, 'duplicate');
  assert.equal(s.player.hull, 90);
  for (let i = 0; i < 400; i++) step(s);
  assert.ok(s.player.shield > 0);
  for (let i = 0; i < 60; i++) step(s, { boost: true });
  assert.ok(s.player.energy < 80);
  const energy = s.player.energy;
  for (let i = 0; i < 60; i++) step(s);
  assert.ok(s.player.energy > energy);
  s.pickups.push({ ...s.player, id: 900, life: 40 });
  step(s, { scan: true });
  const score = s.score;
  step(s);
  assert.equal(s.recovered, 1);
  assert.equal(s.score, score);
  assert.equal(s.scanCooldown > 0, true);
});
test('missile cooldown and action input validate without mutating content', () => {
  const content = JSON.stringify(MISSIONS),
    s = createRun();
  step(s, { missile: true });
  assert.equal(s.missiles, 5);
  step(s, { missile: true, x: Infinity, y: NaN });
  assert.equal(s.missiles, 5);
  assert.ok(Number.isFinite(s.player.yaw));
  assert.equal(JSON.stringify(MISSIONS), content);
});
