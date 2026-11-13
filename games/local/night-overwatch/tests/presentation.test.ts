import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelPresentation } from '../assets/scripts/Presentation.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { createDuel, advanceDuel, commandDuel, configureDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { GROWTH_VERSION } from '../assets/scripts/core/Progression.ts';
import { shareScreenControl } from '../assets/scripts/ShareScreen.ts';

test('10Hz snapshots produce smooth presentation without changing authoritative simulation', () => {
  const duel = createDuel(41), display = new DuelPresentation();
  let sim = Simulation.restore(viewDuel(duel).simulation), previous = -1, changes = 0, snapshots = 0;
  for (let frame = 0; frame < 120; frame++) {
    const now = frame * 1000 / 60;
    if (frame % 6 === 0) {
      advanceDuel(duel, now); sim = Simulation.restore(viewDuel(duel).simulation);
      display.push(sim, now); snapshots++;
    }
    const before = sim.checkpoint(), rendered = display.sample(sim, now);
    if (rendered.time !== previous) changes++;
    assert(rendered.time >= previous); assert(rendered.time <= sim.time);
    previous = rendered.time;
    assert.deepEqual(sim.checkpoint(), before, 'rendering cannot advance combat or mutate input');
  }
  assert.equal(snapshots, 20); assert(changes >= 90, String(changes));
  sim.phase = 'success'; assert.equal(display.sample(sim, 3000), sim, 'final battlefield stays frozen');
});

function opponentShot(weapon: number, guided = false) {
  const duel = createDuel(41), display = new DuelPresentation();
  if (guided) configureDuel(duel, [[], ['tracking'] as const].map(effects => ({
    version: GROWTH_VERSION, level: 6, effects: [...effects], skipped: [],
  })));
  const observer = () => Simulation.restore(viewDuel(duel, 0).simulation);
  display.push(observer(), 0);
  advanceDuel(duel, 30);
  const { x, z } = duel.simulation.units.find(unit => unit.group === 0)!;
  commandDuel(duel, 1, [
    { command: 'choose', args: [weapon] },
    { command: 'setAim', args: [{ x, z }] },
    ...(guided ? [{ command: 'useSkill', args: [] }] : []),
    { command: 'fire', args: [] },
  ]);
  advanceDuel(duel, 100);
  const sim = observer(), shot = sim.shots.find(shot => shot.side === 1)!;
  assert(shot);
  display.push(sim, 100);
  return { duel, display, observer, sim, shot };
}

test('opponent shells keep flying between packets and meet their confirmed impact', () => {
  const { duel, display, observer, sim, shot } = opponentShot(0);
  const before = sim.checkpoint();
  const position = (now: number) => {
    const frame = display.sample(sim, now);
    return frame.shotPosition(shot, frame.projectileTime ?? frame.time);
  };
  for (let now = 100; now <= 210; now += 10) position(now);
  const first = position(210);
  for (let now = 220; now < 350; now += 10) position(now);
  assert.notDeepEqual(position(350), first, 'in-flight shell moves after reaching the last snapshot time');
  assert.deepEqual(sim.checkpoint(), before);

  // The next frame sees the post-impact state while presentation is still behind the contact.
  const queued = new DuelPresentation();
  queued.push(sim, 100);
  for (let now = 200; now <= 1450; now += 50) {
    advanceDuel(duel, now);
    const authority = observer();
    queued.push(authority, now);
    queued.sample(authority, now);
  }
  advanceDuel(duel, 1550);
  const authority = observer();
  const impact = authority.events.find(event => event.shot === shot.id)!;
  assert.equal(impact.type, 'impact');
  assert(!authority.shots.some(s => s.id === shot.id));
  queued.push(authority, 1550);
  let frame = queued.sample(authority, 1550);
  const closing = frame.shots.find(s => s.id === shot.id)!;
  assert(closing, 'shell is still visible until the presentation reaches its impact');
  assert.equal(closing.due, impact.time);
  assert(frame.projectileTime! < impact.time);
  frame = queued.sample(authority, 1700);
  assert(frame.projectileTime! >= impact.time);
  assert.equal(frame.events.find(e => e.id === impact.id)?.time, impact.time);

  // The same contact arriving after the visual time still gets a fresh explosion.
  display.sample(sim, 2000);
  display.push(authority, 2000);
  const late = display.sample(authority, 2000);
  assert.equal(late.events.find(e => e.id === impact.id)?.shownAt, late.projectileTime);
  assert(impact.time < late.projectileTime!);
});

test('opponent guidance extrapolates briefly and connects to a new confirmed path', () => {
  const { duel, display, observer, sim, shot } = opponentShot(1, true);
  assert(shot.guidance);
  const before = sim.checkpoint();
  let frame = display.sample(sim, 250);
  assert(frame.projectileTime! > sim.time);
  const guided = frame.shots.find(s => s.id === shot.id)!;
  assert.notDeepEqual(frame.shotPosition(guided, frame.projectileTime), shot.guidance.position);
  assert(guided.guidance!.trail.at(-1)!.time <= sim.time + .12 + 1e-8);
  const predicted = frame.shotPosition(guided, 1);
  assert.deepEqual(frame.shotPosition(guided, 2), predicted);
  assert.deepEqual(sim.checkpoint(), before);

  advanceDuel(duel, 250);
  const authority = observer(), confirmed = authority.shots.find(s => s.id === shot.id)!;
  const time = frame.projectileTime;
  display.push(authority, 250);
  frame = display.sample(authority, 250);
  assert.equal(frame.projectileTime, time, 'a new packet does not rewind the projectile clock');
  assert.deepEqual(frame.shotPosition(frame.shots.find(s => s.id === shot.id)!, authority.time), confirmed.guidance!.position);
  assert.deepEqual(display.sample(authority, 266).shots.map(s => s.id), [shot.id]);
});

test('fullscreen is opt-in, user-triggered, reversible and absent without a browser document', async () => {
  assert.equal(shareScreenControl('?fullscreen=1', () => {}), undefined);
  const listeners = new Map<string, () => void>(), states: boolean[] = [];
  let entered = 0, exited = 0;
  const doc = {
    fullscreenEnabled: true, fullscreenElement: null as object | null,
    addEventListener(name: string, fn: () => void) { listeners.set(name, fn); },
    removeEventListener(name: string) { listeners.delete(name); },
    documentElement: { async requestFullscreen() { entered++; doc.fullscreenElement = {}; listeners.get('fullscreenchange')?.(); } },
    async exitFullscreen() { exited++; doc.fullscreenElement = null; listeners.get('fullscreenchange')?.(); },
  };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  try {
    for (const search of ['', '?fullscreen=0', '?fullscreen=1&fullscreen=1'])
      assert.equal(shareScreenControl(search, () => {}), undefined);
    const control = shareScreenControl('?room=123456&fullscreen=1', active => states.push(active))!;
    assert.equal(entered, 0); await control.toggle(); await control.toggle();
    assert.equal(entered, 1); assert.equal(exited, 1); assert.deepEqual(states, [false, true, false]);
    control.dispose(); assert.equal(listeners.size, 0);
    doc.fullscreenEnabled = false; assert.equal(shareScreenControl('?fullscreen=1', () => {}), undefined);
  } finally { Reflect.deleteProperty(globalThis, 'document'); }
});
