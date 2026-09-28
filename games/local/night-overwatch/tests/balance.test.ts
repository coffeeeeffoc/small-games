import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSION, UNITS, patrolPoint } from '../assets/scripts/core/Data.ts';

const tick = (s: Simulation, seconds: number) => {
  for (let n = 0; n < seconds * 60 && s.phase === 'playing'; n++) s.step(1 / 60);
};

test('defenders withstand three minutes without air support, but cannot win the mission alone', (t) => {
  const s = new Simulation(); s.start();
  tick(s, 180);
  assert.equal(s.phase, 'playing');
  assert.equal(s.units.filter(u => u.friendly && u.hp > 0).length, 12);
  assert(s.rescue.hp / s.rescue.maxHp > 0.6);
  assert(s.threatsRemaining >= MISSION.events.length / 2);
  assert(s.units.some(u => !u.friendly && u.hp < u.maxHp), 'ground defenders actually return fire');
  const at180 = { allyHp: s.units.filter(u => u.friendly).map(u => u.hp), threats: s.threatsRemaining };
  tick(s, MISSION.duration);
  assert.equal(s.phase, 'failure');
  assert.equal(s.failure, 'timeout');
  assert(s.threatsRemaining > 0);
  assert.equal(s.kills, 0, 'ground fire is not counted as player kills');
  t.diagnostic(JSON.stringify({ at180, end: s.time, allyHp: s.units.filter(u => u.friendly).map(u => u.hp),
    threats: s.threatsRemaining, groundKills: s.friendlyKills }));
});

test('late air support with inaccurate aim and deliberate misses can still finish', (t) => {
  const s = new Simulation(); s.start(); tick(s, 60);
  let attempts = 0, deliberateMisses = 0, nextShot = s.time;
  while (s.phase === 'playing') {
    if (s.time >= nextShot) {
      const enemies = s.units.filter(u => !u.friendly && u.hp > 0);
      enemies.sort((a,b) => (a.kind === 'heavy' ? -1 : 0) - (b.kind === 'heavy' ? -1 : 0) || a.hp - b.hp);
      for (const enemy of enemies) {
        const gun = enemy.kind === 'heavy' || s.guns[1].ammo === 0 ? 2 : 1;
        s.choose(gun);
        const lead = s.flightTime(gun, enemy) * 1.12;
        const p = enemy.kind === 'light' ? patrolPoint(enemy.origin, s.time - enemy.born + lead) : enemy;
        const miss = attempts % 4 === 0;
        s.setAim({ x: p.x + (miss ? 13 : 1.4), z: p.z + 0.8 });
        if (!s.friendlyRisk && s.fire()) {
          attempts++; if (miss) deliberateMisses++;
          nextShot = s.time + Math.max(gun === 2 ? 3.2 : 1.05, s.flightTime(gun, s.aim) * 0.75);
          break;
        }
      }
    }
    s.step(1 / 60);
  }
  t.diagnostic(JSON.stringify({ phase:s.phase,time:s.time,attempts,deliberateMisses,kills:s.kills,
    groundKills:s.friendlyKills, ammo:s.guns.map(g=>g.ammo), allies:s.units.filter(u=>u.friendly).map(u=>u.hp),
    remaining:s.units.filter(u=>!u.friendly&&u.hp>0).map(u=>({kind:u.kind,hp:u.hp,x:u.x,z:u.z})) }));
  assert.equal(s.phase, 'success');
  assert(deliberateMisses >= 6);
  assert.equal(s.friendlyDamage, 0);
  assert.equal(s.friendlyLosses, 0);
  assert(s.kills >= MISSION.events.length / 2, 'aircraft remains the primary source of eliminations');
  assert.equal(s.kills + s.friendlyKills, MISSION.events.length);
});

test('defender armor, return-fire ownership and pause obey the same simulation clock', () => {
  const s = new Simulation(); s.start(); s.convoy = 'holding';
  const defender = s.units.find(u => u.friendly && u.kind === 'escort' && u.group === 1)!;
  s.units = [s.rescue, defender];
  const enemy = s.addUnit('turret', {x:defender.x-8,z:defender.z});
  tick(s, MISSION.warmup + 0.1);
  assert(defender.hp < defender.maxHp && defender.maxHp-defender.hp < UNITS.turret.damage/2);
  assert(enemy.hp < enemy.maxHp);
  const frozen=JSON.stringify({units:s.units,events:s.events});
  s.pause('manual',true); tick(s,10);
  assert.equal(JSON.stringify({units:s.units,events:s.events}),frozen);
  s.pause('manual',false);
  enemy.hp=0.1; defender.attack=0; tick(s,.1);
  assert.equal(s.friendlyKills,1); assert.equal(s.kills,0); assert.equal(s.friendlyDamage,0);
  assert(s.events.some(e=>e.type==='attack' && e.friendly && e.unit===enemy.id));
});
