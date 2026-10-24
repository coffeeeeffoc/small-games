import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';

test('priority uses the same warmup, cooldown, range and damage as real attacks without mutating state', () => {
  const sim = new Simulation(); sim.start();
  const enemy = sim.units.find(u => !u.friendly)!;
  sim.units.filter(u => !u.friendly && u !== enemy).forEach(u => u.hp = 0);
  sim.units.filter(u => u.friendly && u !== sim.rescue).forEach(u => u.hp = 0);
  enemy.x = sim.rescue.x + 5; enemy.z = sim.rescue.z; enemy.attack = 3; enemy.born = -30;
  const before = JSON.stringify(sim.checkpoint());
  const threat = sim.priorityThreat!;
  assert.equal(threat.unit.id, enemy.id); assert.equal(threat.target.id, sim.rescue.id);
  assert.equal(threat.dueIn, 3); assert(Math.abs(threat.damage - 2.8) < 1e-8);
  assert.equal(JSON.stringify(sim.checkpoint()), before);
  enemy.attack = 9; assert.equal(sim.priorityThreat, undefined);
  enemy.attack = 0; sim.rescue.hp = 2;
  assert.equal(sim.priorityThreat?.critical, true);
  enemy.x += 100; assert.equal(sim.priorityThreat, undefined);
  enemy.x -= 100; enemy.hp = 0; assert.equal(sim.priorityThreat, undefined);
});

test('range training never emits an urgent attack and priority identifies the actual attack target', () => {
  const training = new Simulation('training-60'); training.start();
  assert.equal(training.priorityThreat, undefined);
  const sim = new Simulation(); sim.start(); sim.convoy = 'holding';
  const enemy = sim.units.find(u => !u.friendly)!;
  const friend = sim.units.find(u => u.friendly && u.group === 1)!;
  enemy.x = friend.x; enemy.z = friend.z + 1; enemy.attack = 0; enemy.born = -30;
  const expected = sim.attackIntent(enemy)!;
  sim.step(1 / 60);
  const attack = sim.events.find(e => e.type === 'attack' && !e.friendly)!;
  assert.equal(attack.unit, expected.target.id);
  assert.equal(attack.damage, expected.damage);
});
