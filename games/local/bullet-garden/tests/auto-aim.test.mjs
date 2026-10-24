import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGame, startGame, step } from '../src/simulation.mjs';
const run = () => {
  const s = startGame(createGame('ruins', 42));
  s.spawnTimer = 1e6; s.terrain = []; s.pet = null;
  return s;
};
const enemy = (s, x = s.player.x + 100, layer = 'ground') => ({ id:99, kind:'sprout', x, y:s.player.y, hp:1000,maxHp:1000,radius:16,armor:0,layer,speed:0,touch:0,statuses:[],ai:{},contactCooldown:0 });
const advance = (s,n) => { for(let i=0;i<n;i++) step(s,1/60,{autoFire:true}); };

test('automatic fire stays quiet without a living, hittable enemy in range', () => {
  const s = run(); advance(s,90);
  assert.equal(s.stats.shots,0); assert.equal(s.lastShot,null);
  for (const e of [enemy(s,s.player.x+600), {...enemy(s),hp:0}, enemy(s,s.player.x+100,'underground')]) {
    s.enemies=[e]; advance(s,1);
    assert.equal(s.stats.shots,0);
  }
  s.enemies=[enemy(s)]; advance(s,1);
  assert.equal(s.stats.shots,1);
  s.enemies=[]; const shots=s.stats.shots; advance(s,90);
  assert.equal(s.stats.shots,shots);
});

test('queued automatic bursts stop when the battlefield has no targets', () => {
  const s=run(); s.upgrades.push('burst'); s.enemies=[enemy(s)];
  advance(s,1); assert.equal(s.burstQueue.length,1);
  const shots=s.stats.shots; s.enemies=[]; advance(s,40);
  assert.equal(s.stats.shots,shots); assert.equal(s.burstQueue.length,0);
});
