import test from 'node:test';
import assert from 'node:assert/strict';
import { DuelPresentation } from '../assets/scripts/Presentation.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { createDuel, advanceDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
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
