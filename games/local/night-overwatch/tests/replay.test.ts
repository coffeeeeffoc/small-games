import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';
import { WEAPONS, UNITS, distance, patrolPoint } from '../assets/scripts/core/Data.ts';
import { applyNightReplay, createNightReplay, nightReplayResult, observeNightInputs,
  type ReplayFrame } from '../assets/scripts/core/Replay.ts';

function warmupTrace() {
  const sim = new Simulation('training-60'); sim.start();
  const frames: ReplayFrame[] = [];
  observeNightInputs(sim, (input, ticks) => frames.push({ input, ticks }));
  const pending = new Map<number, { unit: number; damage: number }>();
  for (let frame = 0; frame < 3600 && sim.phase === 'playing'; frame++) {
    for (const id of pending.keys()) if (!sim.shots.some(shot => shot.id === id)) pending.delete(id);
    const friends = sim.units.filter(unit => unit.friendly && unit.hp > 0);
    for (const enemy of sim.units.filter(unit => !unit.friendly && unit.hp > 0)) {
      const inbound = [...pending.values()].filter(shot => shot.unit === enemy.id).reduce((sum, shot) => sum + shot.damage, 0);
      if (inbound >= enemy.hp) continue;
      const gun = enemy.kind === 'heavy' ? 2 : 1;
      sim.choose(gun);
      let aim = { x: enemy.x, z: enemy.z };
      const target = friends.reduce((a, b) => distance(enemy, a) < distance(enemy, b) ? a : b);
      for (let n = 0; n < 8; n++) {
        const flight = sim.flightTime(gun, aim);
        if (enemy.kind === 'light') aim = patrolPoint(enemy.origin, sim.time - enemy.born + flight);
        if (enemy.kind === 'heavy') {
          const range = distance(enemy, target), move = Math.min(UNITS.heavy.speed * flight, Math.max(0, range - 12));
          aim = { x: enemy.x + (target.x - enemy.x) * move / range, z: enemy.z + (target.z - enemy.z) * move / range };
        }
      }
      sim.setAim(aim);
      if (sim.friendlyRisk || !sim.fire()) continue;
      pending.set(sim.shots.at(-1)!.id, { unit: enemy.id,
        damage: WEAPONS[gun].damage * (enemy.kind === 'heavy' ? WEAPONS[gun].armor : 1) });
      break;
    }
    sim.step(1 / 60);
  }
  assert.equal(sim.phase, 'success');
  return { sim, frames };
}

test('real warmup inputs reproduce the complete result across durable checkpoint boundaries', () => {
  const { sim, frames } = warmupTrace();
  let state = createNightReplay('training');
  for (let offset = 0; offset < frames.length; offset += 97) {
    state = JSON.parse(JSON.stringify(state));
    applyNightReplay(state, frames.slice(offset, offset + 97));
  }
  assert.deepEqual(state.simulation, sim.checkpoint());
  assert.deepEqual(nightReplayResult(state), { complete: true, eligible: true, score: 1,
    secondary: Math.round(sim.time * 1000) });
  assert.throws(() => applyNightReplay(state, [{ input: {}, ticks: 2 }]));
  state.assisted = true;
  assert.equal(nightReplayResult(state).eligible, false);
});

test('checkpoint restores flight targets, input sets, pauses and nested controls exactly', () => {
  const sim = new Simulation('ambush-02'); sim.start();
  const frames: ReplayFrame[] = [];
  observeNightInputs(sim, (input, ticks) => frames.push({ input, ticks }));
  sim.adjustAltitude(20); sim.adjustRadius(-20); sim.setOrbitDirection(-1);
  sim.setAim({ x: -70, z: 30 }); sim.setFire('touch:1', true);
  for (let i = 0; i < 75; i++) sim.step(1 / 60);
  sim.pause('manual', true); sim.beginResumeCountdown();
  for (let i = 0; i < 30; i++) sim.stepCountdown(.1);
  sim.setFire('touch:1', false); sim.command();
  for (let i = 0; i < 75; i++) sim.step(1 / 60);
  const state = createNightReplay('campaign', 'ambush-02');
  for (const frame of frames) applyNightReplay(state, [frame]);
  assert.deepEqual(state.simulation, sim.checkpoint());
  assert.equal(nightReplayResult(state).complete, false);
  assert.equal(frames.filter(frame => frame.input.command === 'fire').length, 0,
    'setFire owns its nested first shot; automatic fire is not recorded a second time');
});

test('all campaign missions use registered content and reject forged states, time and controls', () => {
  for (const mission of MISSIONS) {
    const state = createNightReplay('campaign', mission.id);
    applyNightReplay(state, [{ input: {}, ticks: 6 }]);
    assert.equal(nightReplayResult(state).eligible, false);
    assert.equal(state.simulation.missionId, mission.id);
  }
  for (const input of [{ score: 999 }, { command: 'setAim', args: [{ x: NaN, z: 0 }] },
    { command: 'adjustRadius', args: [1000] }, { command: 'setFire', args: ['touch', 1] },
    { command: 'pause', args: ['invented', true] }, { command: 'setHp', args: [999] }])
    assert.throws(() => applyNightReplay(createNightReplay('training'), [{ input, ticks: 0 }]));
  for (const ticks of [1, -2, Infinity, 2402])
    assert.throws(() => applyNightReplay(createNightReplay('training'), [{ input: {}, ticks }]));
  assert.throws(() => createNightReplay('campaign', 'invented'));
  assert.throws(() => createNightReplay('training', 'corridor-01'));
  const assisted = createNightReplay('training');
  applyNightReplay(assisted, [{ input: { command: 'grantBuff', args: ['rate'] }, ticks: 0 }]);
  assert.equal(assisted.assisted, true);
});

test('settings configuration and skipping an interrupted resume round-trip through replay', () => {
  const sim = new Simulation(); sim.start(); const frames: ReplayFrame[] = [];
  observeNightInputs(sim, (input, ticks) => frames.push({ input, ticks }));
  sim.beginResumeCountdown(); sim.pause('background', true); sim.pause('background', false);
  assert(sim.resumeRequired);
  sim.pause('settings', true); sim.adjustAltitude(20); sim.adjustRadius(20); sim.setOrbitDirection(-1); sim.command();
  sim.pause('supply', true); sim.pause('settings', false);
  sim.pause('countdown', false); sim.pause('supply', false); sim.pause('manual', false);
  assert(!sim.resumeRequired); assert(!sim.paused); assert.equal(sim.resumeCountdown, 0);
  const state = createNightReplay('campaign', sim.mission.id); applyNightReplay(state, frames);
  assert.deepEqual(state.simulation, sim.checkpoint());
});
