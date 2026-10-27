import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { terrainContact, shotPosition } from '../assets/scripts/core/Flight.ts';
import { applyNightReplay, observeNightInputs, nightReplayResult, type ReplayFrame } from '../assets/scripts/core/Replay.ts';

const tick = (s: Simulation, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.step(1 / 60);
};
const clear = (s: Simulation) => { for (const u of s.units) if (!u.friendly) u.hp = 0; };

test('ranked completion time is independent of radio playback and mute', () => {
  const silent = new Simulation(), audible = new Simulation();
  for (const sim of [silent, audible]) { sim.start(); clear(sim); }
  audible.setExtractionRadioPending(true);
  tick(silent, 4); tick(audible, 9);
  assert.equal(silent.phase, 'success'); assert.equal(audible.phase, 'playing');
  assert.equal(audible.completionTime, silent.completionTime);
  audible.setExtractionRadioPending(false); audible.step(1 / 60);
  assert.equal(nightReplayResult({ simulation: audible.checkpoint(), assisted: false }).secondary,
    nightReplayResult({ simulation: silent.checkpoint(), assisted: false }).secondary);
});

test('clearing all threats resumes a held convoy and animates extraction in three seconds', () => {
  const s = new Simulation(); s.start(); s.convoy = 'holding'; s.held.add('space'); clear(s);
  s.step(1 / 60);
  assert.equal(s.extractionRemaining, 3); assert.equal(s.convoy, 'moving'); assert.equal(s.held.size, 0);
  const start = s.progress; s.command(); assert.equal(s.convoy, 'moving');
  s.setFire('space', true); assert.equal(s.held.size, 0); assert.equal(s.fire(), false);
  tick(s, 1); assert(s.progress > start && s.progress < s.routeLength); assert.equal(s.phase, 'playing');
  tick(s, 2.05); assert.equal(s.phase, 'success'); assert.equal(s.progress, s.routeLength);
  assert(s.time < 3.1); assert(s.completed.has('arrived'));
});

test('unspawned waves prevent extraction even when all visible enemies are gone', () => {
  const s = new Simulation('operation-008'); s.start(); s.convoy = 'holding'; clear(s);
  tick(s, 4); assert(s.threatsRemaining > 0); assert.equal(s.extractionRemaining, undefined);
  assert.equal(s.convoy, 'holding'); assert.equal(s.phase, 'playing');
});

test('extraction respects pause and survives checkpoint restore without speeding the combat clock', () => {
  const s = new Simulation(); s.start(); clear(s); tick(s, .5);
  const restored = Simulation.restore(s.checkpoint());
  s.pause('manual', true); const before = s.checkpoint(); tick(s, 5);
  assert.deepEqual(s.checkpoint(), before); s.pause('manual', false);
  tick(s, 3); tick(restored, 3); assert.deepEqual(s.checkpoint(), restored.checkpoint());
  assert.equal(s.phase, 'success'); assert(s.time < 3.1);
});

test('in-flight rounds finish and friendly loss still wins over extraction success', () => {
  const s = new Simulation(); s.start(); s.choose(0);
  const post = s.units.find(u => u.group === 3)!;
  for (const u of s.units) if (u.group === 3) u.hp = u === post ? 1 : 0;
  s.setAim(post); assert(s.flightTime() > 3); assert(s.fire());
  clear(s); tick(s, 3.1);
  assert.equal(s.phase, 'failure'); assert.equal(s.failedGroup, 3); assert.equal(s.failureCause, 'friendly');
  assert.equal(s.shots.length, 0); assert(s.time < 3, 'remaining projectile flight is fast-forwarded');
});

test('extraction preserves a projectile position and landing point while accelerating the remaining arc 4x', () => {
  const s = new Simulation(); s.start(); s.choose(0); s.setAim({ x: -130, z: -90 }); assert(s.fire());
  tick(s, .4); const original = s.shots[0]; clear(s); s.step(1 / 60);
  const fast = s.shots[0]; assert.equal(fast.timeScale, 4);
  assert.deepEqual(s.shotPosition(fast), shotPosition(original, s.time));
  const normalImpact = terrainContact(original, s.time, original.due, s.height)!;
  const fastImpact = terrainContact(fast, s.time, fast.due, s.height)!;
  assert(normalImpact && fastImpact);
  assert(Math.hypot(normalImpact.point.x - fastImpact.point.x, normalImpact.point.z - fastImpact.point.z) < 1e-6);
  assert(Math.abs((normalImpact.time - s.time) / 4 - (fastImpact.time - s.time)) < 1e-6);
  tick(s, 3.1); assert.equal(s.phase, 'success'); assert.equal(s.shots.length, 0);
});

test('convoy, shells and radio all gate success independently; waiting remains replayable', () => {
  for (const last of ['radio', 'shell', 'convoy']) {
    const s = new Simulation(); s.start(); s.choose(0); s.setAim({ x: -130, z: -90 }); assert(s.fire());
    clear(s); s.step(1 / 60); s.setExtractionRadioPending(true);
    if (last === 'shell') {
      s.progress = s.routeLength; s.convoy = 'arrived'; s.extractionRemaining = 0;
      s.setExtractionRadioPending(false);
    }
    if (last === 'convoy') s.setExtractionRadioPending(false);
    const state = { simulation: s.checkpoint(), assisted: false }, frames: ReplayFrame[] = [];
    observeNightInputs(s, (input, ticks) => frames.push({ input, ticks }));
    s.setFire('mouse', true); s.setFire('touch:1', true); s.setFire('space', true);
    const fired = s.fired; assert.equal(s.fire(), false); s.selectHoming(); s.homingAmmo = 2;
    assert.equal(s.fireHoming(), false); s.homingAmmo = 0; s.choose(0);
    assert.equal(s.fired, fired); assert.equal(s.held.size, 0);
    tick(s, .1); assert.equal(s.phase, 'playing', last);
    tick(s, 3.1);
    if (last === 'radio') {
      assert.equal(s.phase, 'playing'); assert.equal(s.convoy, 'arrived'); assert.equal(s.shots.length, 0);
      s.pause('background', true); const before = s.checkpoint(); tick(s, 2); assert.deepEqual(s.checkpoint(), before);
      s.pause('background', false); s.setExtractionRadioPending(false); s.step(1 / 60);
    }
    assert.equal(s.phase, 'success', last);
    applyNightReplay(state, frames); assert.deepEqual(state.simulation, s.checkpoint());
  }
});

test('clearing at the deadline reserves the short extraction, while uncleared missions still time out', () => {
  const s = new Simulation(); s.start(); s.time = s.mission.duration - .02; clear(s);
  tick(s, 3.1); assert.equal(s.phase, 'success');
  const unfinished = new Simulation(); unfinished.start(); unfinished.time = unfinished.mission.duration - .02;
  tick(unfinished, .1); assert.equal(unfinished.failure, 'timeout');
});
