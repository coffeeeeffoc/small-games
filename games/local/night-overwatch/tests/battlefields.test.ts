import test from 'node:test';
import assert from 'node:assert/strict';
import { isWater, mapRoute, terrainHeight, type BattlefieldId } from '../assets/scripts/core/Data.ts';
import { recoilOffset } from '../assets/scripts/core/Flight.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';

test('two battlefields have distinct heights/routes and all mission vehicles stay on dry land or the bridge', () => {
  assert.notDeepEqual(mapRoute('valley'), mapRoute('highland'));
  assert(Math.abs(terrainHeight(0, 0, 'valley') - terrainHeight(0, 0, 'highland')) > 3);
  for (const id of ['corridor-01', 'ambush-02', 'patrol-03', 'training-60'] as const) {
    const s = new Simulation(id); s.start();
    for (let n = 0; n < 3900 && s.phase === 'playing'; n++) {
      for (const u of s.units) if (u.friendly) u.hp = u.maxHp;
      s.step(.1);
      for (const u of s.units) assert(!isWater(u, s.mission.map), `${id}: ${u.kind} ${u.id} in water at ${s.time}`);
    }
  }
  for (const map of ['valley', 'highland'] as BattlefieldId[]) {
    const s = new Simulation(map === 'valley' ? 'corridor-01' : 'ambush-02'); s.start();
    s.setAim({ x: 45, z: 35 }); assert(s.fire());
    assert.equal(s.shots[0].targetY, terrainHeight(45, 35, map));
  }
});

test('weapon recoil scales with power, decays to rest, respects reduced motion and does not mutate aim', () => {
  const kicks = [0, 1, 2].map(weapon => recoilOffset([{ type: 'shot', weapon, time: 1 }], 1.01));
  assert(kicks[0].y > 0 && kicks[1].y > kicks[0].y && kicks[2].y > kicks[1].y);
  assert.deepEqual(recoilOffset([{ type: 'shot', weapon: 2, time: 1 }], 1.5), { x: 0, y: 0 });
  assert(recoilOffset([{ type: 'shot', weapon: 2, time: 1 }], 1.01, true).y < kicks[2].y / 4);
  const s = new Simulation(); s.start(); s.setAim({ x: 40, z: 30 }); const aim = { ...s.aim };
  s.choose(2); assert(s.fire()); recoilOffset(s.events, s.time); assert.deepEqual(s.aim, aim);
});
