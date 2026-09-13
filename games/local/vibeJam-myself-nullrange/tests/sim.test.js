import assert from 'node:assert/strict';
import { action, aimTarget, createGame, startGame, terrainHeight, updateGame } from '../src/sim.js';

const step = (s, input = {}, seconds = 1) => { for (let i = 0; i < Math.ceil(seconds / 0.02); i++) updateGame(s, input, 0.02); };
const fresh = () => startGame(createGame());
const isolated = () => { const s = fresh(); s.enemies.forEach((enemy) => { enemy.x += 2000; enemy.fireCooldown = 999; }); return s; };

const menu = createGame();
assert.equal(menu.mode, 'menu');
updateGame(menu, { fire: true }, 1);
assert.equal(menu.time, 0);
assert.deepEqual(createGame(), createGame(), 'same seed produces the same opening');
for (let x = -1000; x <= 1000; x += 100) assert.ok(terrainHeight(x, x * 0.6) >= 0 && terrainHeight(x, x * 0.6) < 70);

const movement = isolated();
step(movement, { x: 1, y: -1 }, 0.8);
assert.ok(movement.player.x > 10 && movement.player.z < -30 && movement.player.y > 110);
assert.ok(movement.player.yaw < 0 && movement.player.pitch > 0);
const energy = movement.player.energy;
step(movement, { boost: true });
assert.ok(movement.player.speed > 140 && movement.player.energy < energy);
step(movement, {}, 2);
assert.ok(movement.player.energy > 90);
const beforePause = structuredClone(movement);
movement.mode = 'paused';
updateGame(movement, { fire: true, x: 1 }, 0.05);
assert.deepEqual(movement.player, beforePause.player);
assert.equal(movement.time, beforePause.time);
assert.equal(action(movement, 'missile'), false);
movement.mode = 'running';
const beforeLargeStep = movement.time;
updateGame(movement, {}, 100);
assert.ok(Math.abs(movement.time - beforeLargeStep - 0.05) < 1e-8);

const combat = fresh();
combat.enemies = [{ id: 100, x: 0, y: 105, z: -170, hp: 44, yaw: Math.PI, kind: 'drone', fireCooldown: 999, phase: 0 }];
assert.equal(aimTarget(combat)?.id, 100);
let sawShoot = false, sawHit = false, sawKill = false;
for (let i = 0; i < 100; i++) {
  updateGame(combat, { fire: true }, 0.02);
  sawShoot ||= combat.events.includes('shoot');
  sawHit ||= combat.events.includes('hit');
  sawKill ||= combat.events.includes('kill');
  if (combat.kills) break;
}
assert.ok(sawShoot && sawHit && sawKill, 'actual moving projectiles hit and kill');
assert.equal(combat.kills, 1);
assert.equal(combat.pickups.length, 1, 'kills leave an actual recoverable pickup');

const sideTarget = fresh();
sideTarget.enemies = [{ id: 2, x: 250, y: 105, z: 0, hp: 44, yaw: 0, kind: 'drone', fireCooldown: 999, phase: 0 }];
assert.equal(aimTarget(sideTarget), null, 'no full-screen pulse targeting');
assert.equal(action(sideTarget, 'missile'), false, 'missiles need a forward target');
assert.equal(sideTarget.missiles, 6);

const missile = fresh();
assert.equal(action(missile, 'missile'), true);
assert.equal(missile.missiles, 5);
assert.equal(missile.missileCooldown, 3);
assert.equal(action(missile, 'missile'), false);
updateGame(missile, {}, 0.02);
assert.ok(missile.events.includes('missile'), 'action event survives until the next update');
step(missile, {}, 1.8);
assert.ok(missile.kills >= 1, 'homing missile actually hits its moving target');

const scan = isolated();
assert.equal(action(scan, 'scan'), true);
assert.equal(scan.scanTime, 6);
assert.equal(scan.scanCooldown, 10);
assert.equal(action(scan, 'scan'), false);
scan.player.shield = 20;
scan.pickups.push({ id: 999, x: 100, y: 105, z: -50, life: 40 });
let recovered = false;
for (let i = 0; i < 130; i++) { updateGame(scan, {}, 0.02); recovered ||= scan.events.includes('pickup'); }
assert.ok(recovered && scan.score >= 50 && scan.player.shield >= 34, 'scan magnet attracts and collects salvage');
step(scan, {}, 3.5);
assert.equal(scan.scanTime, 0);
assert.equal(action(scan, 'scan'), false);
step(scan, {}, 4.1);
assert.equal(action(scan, 'scan'), true);

const collision = isolated();
collision.player.shield = 0;
collision.player.y = terrainHeight(0, 0);
updateGame(collision, {}, 0.02);
const healthAfterCrash = collision.player.hull;
assert.ok(healthAfterCrash < 100 && collision.player.y > terrainHeight(collision.player.x, collision.player.z));
collision.player.y = 0;
updateGame(collision, {}, 0.02);
assert.equal(collision.player.hull, healthAfterCrash, 'terrain invulnerability prevents instant repeated damage');
collision.player.hull = 1;
collision._invulnerable = 0;
collision.player.y = 0;
updateGame(collision, {}, 0.02);
assert.equal(collision.mode, 'lost');
assert.ok(collision.events.includes('lost'));
startGame(collision, { difficulty: 'easy' });
assert.equal(collision.mode, 'running');
assert.equal(collision.player.hull, 100);
assert.equal(collision.player.shield, 70);
assert.equal(collision.kills, 0);
assert.equal(collision.shots.length, 0);
assert.equal(collision.effects.length, 0);
assert.equal(collision.scanTime, 0);
assert.equal(collision.missiles, 6);
assert.equal(collision.difficulty, 'easy');

const campaign = fresh();
for (const expectedCount of [3, 4, 5]) {
  assert.equal(campaign.enemies.length, expectedCount);
  for (const enemy of campaign.enemies) {
    enemy.fireCooldown = 999;
    campaign.shots.push({ id: campaign._nextId++, x: enemy.x, y: enemy.y, z: enemy.z + 6,
      vx: 0, vy: 0, vz: -420, owner: 'player', kind: 'missile', life: 2 });
  }
  updateGame(campaign, {}, 0.02);
  if (expectedCount < 5) step(campaign, {}, 2.7);
}
assert.equal(campaign.kills, 12);
assert.equal(campaign.mode, 'won');
assert.ok(campaign.events.includes('won'));
assert.ok(campaign.score >= 1700);
const wonScore = campaign.score;
step(campaign, { fire: true }, 1);
assert.equal(campaign.score, wonScore, 'win reward is added only once');
startGame(campaign);
assert.equal(campaign.wave, 1);
assert.equal(campaign.enemies.length, 3);
assert.equal(campaign.score, 0);
assert.equal(campaign.time, 0);
assert.equal(campaign.notice.includes('第 1 波'), true);

// Complete a normal sortie with only public controls, without editing enemies or health.
const sortie = fresh();
for (let i = 0; i < 9000 && sortie.mode === 'running'; i++) {
  const p = sortie.player;
  const nearest = sortie.enemies.toSorted((a, b) => Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z))[0];
  let x = 0, y = 0;
  if (nearest) {
    const dx = nearest.x - p.x, dy = nearest.y - p.y, dz = nearest.z - p.z;
    const turn = ((Math.atan2(-dx, -dz) - p.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    x = -turn * 2;
    y = -(Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * 3;
  }
  action(sortie, 'missile');
  action(sortie, 'scan');
  updateGame(sortie, { x, y, fire: true }, 0.02);
}
assert.equal(sortie.mode, 'won', 'three-wave campaign is winnable through normal flight and weapons');
assert.equal(sortie.kills, 12);

const bounded = isolated();
step(bounded, { fire: true, x: 1 }, 30);
assert.ok(bounded.shots.length <= 120 && bounded.effects.length <= 60);
assert.ok(bounded.heat >= 0 && bounded.heat <= 1);
assert.ok(Number.isFinite(bounded.player.x));
console.log('sim checks passed: deterministic world, flight/boost, pause, pulse collisions, lock cone, missile, scan/salvage, terrain damage, 3-wave win/loss, reset, entity bounds, full sortie using public controls');
