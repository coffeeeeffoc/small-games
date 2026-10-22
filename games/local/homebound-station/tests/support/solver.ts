import assert from 'node:assert/strict';
import type { LevelConfig } from '../../src/levels.ts';
import {
  STEP,
  advance,
  canDispatch,
  createSimulation,
  dispatch,
  type Simulation,
} from '../../src/simulation.ts';

export const ORDERS = ['forward', 'reverse', 'random'] as const;
export type Order = (typeof ORDERS)[number];
export type Action = { tick: number; vehicleId: string };
export function ticksFor(seconds: number, name: string) {
  const ticks = Math.round(seconds / STEP);
  assert(
    Number.isFinite(seconds) && ticks > 0 && Math.abs(ticks * STEP - seconds) < 1e-9,
    `${name} must be a positive multiple of the simulation step (${STEP}s)`,
  );
  return ticks;
}

// Shared with the existing 100-level invariant tests: same LCG and vehicle ordering.
export function solveLevel(
  config: LevelConfig,
  order: Order,
  {
    intervalSeconds = STEP,
    maxSeconds = 700,
    maxDispatchesPerBeat = Infinity,
    onStep = (_s: Simulation) => {},
    onDispatch = (_s: Simulation) => {},
  } = {},
) {
  assert(ORDERS.includes(order), 'Unknown solver order');
  assert(
    maxDispatchesPerBeat === Infinity ||
      (Number.isInteger(maxDispatchesPerBeat) && maxDispatchesPerBeat > 0),
  );
  const intervalTicks = ticksFor(intervalSeconds, 'intervalSeconds'),
    maxTicks = ticksFor(maxSeconds, 'maxSeconds'),
    s = createSimulation(config),
    actions: Action[] = [];
  let seed = config.id * 7919;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  while (s.ticks < maxTicks && !s.won) {
    if (s.ticks % intervalTicks === 0) {
      const cars =
        order === 'forward'
          ? s.vehicles
          : order === 'reverse'
            ? [...s.vehicles].reverse()
            : s.vehicles
                .map((v) => ({ v, key: rand() }))
                .sort((a, b) => a.key - b.key)
                .map(({ v }) => v);
      let dispatched = 0;
      for (const v of cars) {
        if (!canDispatch(s, v.id).ok) continue;
        assert(dispatch(s, v.id).ok);
        actions.push({ tick: s.ticks, vehicleId: v.id });
        onDispatch(s);
        if (++dispatched >= maxDispatchesPerBeat) break;
      }
    }
    advance(s, STEP);
    onStep(s);
  }
  return { state: s, actions };
}
