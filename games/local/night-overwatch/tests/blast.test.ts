import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { UNITS, WEAPONS } from '../assets/scripts/core/Data.ts';

test('an off-centre terrain blast damages nearby hulls progressively and emits a miss on empty terrain', () => {
  const s = new Simulation();
  s.start();
  s.convoy = 'holding';
  s.units = s.units.filter((u) => u.friendly);
  const hit = { x: 0, z: -20 };
  const centre = s.addUnit('turret', hit);
  const near = s.addUnit('turret', { x: 2, z: -20 });
  const edge = s.addUnit('turret', { x: 3.5, z: -20 });
  const outside = s.addUnit('turret', { x: UNITS.turret.radius + WEAPONS[1].radius + 0.3, z: -20 });
  s.choose(1);
  const settle = () => {
    const due = s.shots.at(-1)!.due;
    while (s.time < due + 0.05) s.step(1 / 60);
    return s.events.findLast((e) => e.type === 'impact')!;
  };
  s.setAim(hit);
  assert(s.fire());
  const impact = settle();
  const damage = (u: typeof centre) => UNITS.turret.hp - u.hp;
  assert.equal(damage(centre), WEAPONS[1].damage);
  assert(damage(near) > damage(edge) && damage(edge) > 0, 'near misses deal declining splash damage');
  assert(damage(near) < damage(centre), 'near miss is weaker than a direct hit');
  assert.equal(damage(outside), 0);
  assert(Math.abs(impact.damage! - damage(centre) - damage(near) - damage(edge)) < 1e-8);
  s.setAim({ x: 40, z: -45 });
  assert(s.fire());
  const miss = settle();
  assert.equal(miss.outcome, 'miss');
  assert.equal(miss.damage, 0);
  assert.equal(miss.weapon, 1);
  assert(Number.isFinite(miss.y), 'empty terrain still creates an explosion contact');
  assert.equal(s.shots.length, 0);
});
