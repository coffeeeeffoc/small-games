import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEVICES, makeLevel, PV_RATED_W } from './levels.js';
import type { Action, Request, State } from './model.js';
import {
  act,
  createState,
  preview,
  step,
  summarize,
  power,
  serviceRate,
  canResumeAfterTrip,
  resumeAfterTrip,
} from './simulation.js';

function advance(s: State, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) step(s);
}
const pending = (r: Request) => !['future', 'completed', 'missed'].includes(r.status);

/** A fallible once-per-second policy using only visible state, not future events. */
function dispatch(s: State, fanFirst = true, maxActions = Infinity) {
  const apply = (action: Action) => {
    if (maxActions > 0 && act(s, action)) maxActions--;
  };
  const active = s.requests.filter(pending);
  for (const r of active) {
    if (fanFirst && r.device === 'ac' && r.progress === 0 && !r.source)
      apply({ type: 'cooling', requestId: r.id });
    if (
      r.device === 'fan' &&
      (DEVICES.fan.duration - r.progress) / serviceRate(r, s.temperature) >
        r.deadline - s.time - 4 &&
      r.deadline - s.time < 28 &&
      s.demand + DEVICES.ac.startupPower - DEVICES.fan.power <= s.capacity
    )
      apply({ type: 'cooling', requestId: r.id });
  }
  const needed = (r: Request) =>
    (DEVICES[r.device].duration - r.progress) / serviceRate(r, s.temperature) +
    (r.source ? r.startupRemaining : DEVICES[r.device].startupSeconds);
  const order = active.sort(
    (a, b) =>
      Number(!!b.required) - Number(!!a.required) ||
      (DEVICES[a.device].power < 200
        ? -200
        : a.deadline - s.time - needed(a) - (a.source ? 60 : 0)) -
        (DEVICES[b.device].power < 200
          ? -200
          : b.deadline - s.time - needed(b) - (b.source ? 60 : 0)) ||
      Number(!!b.source) - Number(!!a.source),
  );
  let watts = 80;
  const chosen: Request[] = [];
  for (const r of order) {
    const demand = r.source ? power(r) : DEVICES[r.device].startupPower;
    if (watts + demand <= s.capacity) {
      watts += demand;
      chosen.push(r);
    }
  }
  for (const r of active)
    if (r.source && !chosen.includes(r)) apply({ type: 'disconnect', requestId: r.id });
  for (const r of chosen)
    if (!r.source) apply({ type: 'connect', requestId: r.id, source: 'grid' });
}
function run(index: number, seed: number, fanFirst = true) {
  const s = createState(makeLevel(index, seed));
  while (s.result === 'playing') {
    if (s.tick % 20 === 0) dispatch(s, fanFirst);
    step(s);
  }
  return s;
}
describe('realistic branch power and weather', () => {
  it('uses physical watts, six panels, concurrent appliances and mandatory lighting', () => {
    const s = createState(makeLevel(0, 0));
    advance(s, 2);
    expect(s.requests.filter((r) => r.resident === 1 && r.status === 'waiting')).toHaveLength(3);
    expect(DEVICES.ac.power).toBe(1100);
    expect(PV_RATED_W).toBe(2700);
    expect('ev' in DEVICES).toBe(false);
    for (let i = 0; i < 20; i++)
      for (let seed = 0; seed < 8; seed++) {
        const l = makeLevel(i, seed);
        expect(
          l.solar.every((e) => e.output >= 0 && e.output <= 2200 && e.output < PV_RATED_W),
        ).toBe(true);
        expect(l.requests.filter((r) => r.required).length).toBeGreaterThan(0);
      }
    expect(makeLevel(11, 3).solar.every((e) => e.output === 0)).toBe(true);
    expect(makeLevel(0, 1).solar).not.toEqual(makeLevel(0, 2).solar);
    expect(makeLevel(0, 1)).toEqual(makeLevel(0, 1));
  });
  it('shares solar across the bus and responds to weather without selecting a socket', () => {
    const l = makeLevel(0, 0);
    l.solar = [
      { time: 0, output: 2200, temperature: 35, weather: '晴天' },
      { time: 5, output: 120, temperature: 27, weather: '阵雨' },
    ];
    const s = createState(l);
    advance(s, 2);
    act(s, { type: 'connect', requestId: 'l1-r1', source: 'grid' });
    act(s, { type: 'connect', requestId: 'l1-r4', source: 'grid' });
    expect(s.demand).toBe(2080);
    expect(s.load).toBe(0);
    advance(s, 3);
    expect(s.load).toBe(1960);
    expect(s.capacity).toBe(l.gridLimit + 120);
  });
  it('makes fans slower in heat and preserves progress through mode changes and startup', () => {
    const s = createState(makeLevel(0, 0)),
      r = s.requests[1];
    advance(s, 1);
    expect(serviceRate({ ...r, device: 'fan' }, 35)).toBeLessThan(
      serviceRate({ ...r, device: 'fan' }, 27),
    );
    act(s, { type: 'cooling', requestId: r.id });
    expect(r.device).toBe('fan');
    act(s, { type: 'connect', requestId: r.id, source: 'grid' });
    advance(s, 3);
    const progress = r.progress;
    act(s, { type: 'cooling', requestId: r.id });
    expect(r.device).toBe('ac');
    expect(r.progress).toBe(progress);
    expect(power(r)).toBe(1100);
    advance(s, 2);
    expect(r.progress).toBe(progress);
    expect(power(r)).toBe(1100);
  });
  it('rejects input atomically, previews purely and bounds deferrals to the visible wave', () => {
    const s = createState(makeLevel(0, 0)),
      before = JSON.stringify(s);
    expect(act(s, { type: 'cooling', requestId: 'l1-r1' })).toBe(false);
    expect(act(s, { type: 'connect', requestId: 'missing', source: 'grid' })).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    preview(s, { type: 'connect', requestId: 'l1-r1', source: 'grid' });
    expect(JSON.stringify(s)).toBe(before);
    advance(s, 2);
    expect(act(s, { type: 'defer', requestId: 'l1-r4' })).toBe(true);
    expect(s.requests[3].deadline).toBe(45);
    expect(act(s, { type: 'defer', requestId: 'l1-r4' })).toBe(false);
    expect(() => createState({ ...s.level, gridLimit: NaN })).toThrow();
    expect(() =>
      createState({
        ...s.level,
        solar: [{ time: 0, output: -1, temperature: 20, weather: '晴天' }],
      }),
    ).toThrow();
  });
  it('trips when everything is switched on, and cannot win by doing nothing', () => {
    for (let seed = 0; seed < 8; seed++) {
      const s = createState(makeLevel(0, seed));
      advance(s, 8);
      for (const r of s.requests.filter(pending))
        act(s, { type: 'connect', requestId: r.id, source: 'grid' });
      advance(s, 5);
      expect(s.result).toBe('tripped');
      expect(canResumeAfterTrip(s)).toBe(true);
      expect(resumeAfterTrip(s)).toBe(true);
      expect(resumeAfterTrip(s)).toBe(false);
      expect(s.load).toBeLessThanOrEqual(s.level.gridLimit * 0.9);
      const idle = createState(makeLevel(0, seed));
      advance(idle, 90);
      expect(idle.result).toBe('failed');
    }
  });
  it('cannot conceal missed public lighting behind the overall quota', () => {
    const s = createState(makeLevel(0, 0));
    s.level = { ...s.level, target: 1 };
    advance(s, 44);
    expect(s.requests.some((r) => r.required && r.status === 'missed')).toBe(true);
    expect(s.result).toBe('failed');
  });
});
describe('achievable shifts and weather seeds', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))(
    'shift %i completes without ads across all eight forecasts',
    (index) => {
      for (let seed = 0; seed < 8; seed++) {
        const s = run(index, seed);
        expect(
          s.result,
          'seed ' +
            seed +
            ' completed ' +
            s.completed +
            '/' +
            s.level.target +
            ' missed ' +
            s.requests
              .filter((r) => r.status === 'missed')
              .map((r) => r.id + ':' + r.device)
              .join(','),
        ).toBe('won');
        expect(s.assisted).toBe(false);
      }
    },
  );
  it('allows human-paced actions (one every 600ms) across the first shift forecasts', () => {
    for (let seed = 0; seed < 8; seed++) {
      const s = createState(makeLevel(0, seed));
      while (s.result === 'playing') {
        if (s.tick % 12 === 0) dispatch(s, true, 1);
        step(s);
      }
      expect(s.result, 'seed ' + seed + ' served ' + s.completed).toBe('won');
    }
  });
  it('replays a full action log exactly and exports browser input evidence', () => {
    const s = run(0, 0),
      replay = createState(makeLevel(0, 0));
    for (let tick = 0; replay.result === 'playing'; tick++) {
      for (const e of s.log.filter((e) => e.tick === tick))
        expect(act(replay, e.action as Action)).toBe(true);
      step(replay);
    }
    expect(replay).toEqual(s);
    mkdirSync('../../../test-results/building-power', { recursive: true });
    writeFileSync(
      '../../../test-results/building-power/shift-witness.json',
      JSON.stringify({ seed: 0, actions: s.log, summary: summarize(s) }, null, 2),
    );
  });
});
