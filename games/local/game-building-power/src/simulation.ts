/* eslint max-lines: off -- Keep tick ordering, atomic actions and rescue preflight in one rule module. */
import { DEVICES } from './levels.js';
import type { Action, Level, Request, State, Summary } from './model.js';

export const TICK_SECONDS = 0.05;
export const TICK_MS = 50;
export const PUBLIC_LOAD = 80;
export const HEAT_LIMIT = 60;
const round = (value: number) => Math.round(value * 1e8) / 1e8;
const settled = (request: Request) => request.status === 'completed' || request.status === 'missed';
const active = (request: Request) => request.status !== 'future' && !settled(request);

export function power(request: Request, stable = false): number {
  if (!request.source) return 0;
  const device = DEVICES[request.device];
  return !stable && request.startupRemaining > 0 ? device.startupPower : device.power;
}

function load(state: State, stable = false): number {
  const demand =
    PUBLIC_LOAD + state.requests.reduce((sum, request) => sum + power(request, stable), 0);
  return Math.max(0, demand - state.solarOutput - (state.batteryRemaining > 0 ? 1500 : 0));
}

/** Effective comfort per second; fans move air, they do not refrigerate a hot room. */
export function serviceRate(request: Request, temperature: number): number {
  if (request.device === 'fan') return temperature >= 33 ? 0.32 : temperature >= 30 ? 0.65 : 1.2;
  if (request.device === 'ac') return temperature >= 33 ? 0.85 : temperature >= 30 ? 1 : 1.3;
  return 1;
}

function refresh(state: State): void {
  state.solarOutput = 0;
  for (const event of state.level.solar) {
    if (event.time <= state.time) {
      state.solarOutput = event.output;
      state.temperature = event.temperature;
      state.weather = event.weather;
    }
  }
  state.notices = state.level.notices
    .filter((event) => event.time <= state.time && state.time < event.time + 3)
    .map((event) => event.text);
  for (const event of state.level.solar) {
    if (
      event.time > state.time &&
      event.time - state.time <= 5 &&
      (event.output !== state.solarOutput || event.temperature !== state.temperature)
    ) {
      state.notices.push(
        Math.ceil(event.time - state.time) +
          '秒后' +
          event.weather +
          '，太阳能 ' +
          event.output +
          'W',
      );
    }
  }
  state.load = load(state);
  state.demand = PUBLIC_LOAD + state.requests.reduce((sum, request) => sum + power(request), 0);
  state.capacity =
    state.level.gridLimit + state.solarOutput + (state.batteryRemaining > 0 ? 1500 : 0);
}

function activateRequests(state: State): void {
  for (const request of state.requests) {
    if (request.status !== 'future' || request.arrives > state.time) continue;
    request.status = 'waiting';
  }
}

/** Fixed event tables only: no wall clock, random source, DOM, or rendering dependency. */
export function createState(level: Level): State {
  const onTick = (value: number) =>
    Number.isFinite(value) && Math.abs(value * 20 - Math.round(value * 20)) < 1e-8;
  const ids = new Set<string>();
  if (
    !onTick(level.duration) ||
    level.duration <= 0 ||
    !Number.isFinite(level.gridLimit) ||
    level.gridLimit < 1000 ||
    level.gridLimit > 20000 ||
    !Number.isInteger(level.target) ||
    level.target < 1 ||
    level.target > level.requests.length
  ) {
    throw new Error('Invalid level duration or service target');
  }
  if (new Set(level.requests.map((request) => request.resident)).size > 6)
    throw new Error('At most six residents');
  for (const request of level.requests) {
    if (
      !request.id ||
      ids.has(request.id) ||
      !Object.hasOwn(DEVICES, request.device) ||
      !Number.isInteger(request.resident) ||
      request.resident < 1 ||
      request.resident > 6 ||
      !onTick(request.arrives) ||
      !onTick(request.deadline) ||
      request.arrives < 0 ||
      request.arrives >= level.duration ||
      request.deadline <= request.arrives ||
      request.deadline > level.duration
    ) {
      throw new Error('Invalid request event');
    }
    ids.add(request.id);
  }
  let previousTime = -1;
  for (const event of level.solar) {
    if (
      !onTick(event.time) ||
      event.time < 0 ||
      event.time <= previousTime ||
      event.time > level.duration ||
      !Number.isFinite(event.output) ||
      event.output < 0 ||
      event.output > 10000 ||
      !Number.isFinite(event.temperature) ||
      event.temperature < -30 ||
      event.temperature > 50 ||
      typeof event.weather !== 'string'
    )
      throw new Error('Invalid solar event');
    previousTime = event.time;
  }
  const state: State = {
    time: 0,
    tick: 0,
    level,
    requests: level.requests.map((request) => ({
      ...request,
      progress: 0,
      source: null,
      startupRemaining: 0,
      status: 'future',
      deferred: false,
      interruptions: 0,
    })),
    load: PUBLIC_LOAD,
    demand: PUBLIC_LOAD,
    capacity: level.gridLimit,
    temperature: 27,
    weather: '晴天',
    heat: 0,
    completed: 0,
    missed: 0,
    result: 'playing',
    overloadSeconds: 0,
    interruptions: 0,
    defersLeft: 2,
    batteryRemaining: 0,
    batteryUsed: false,
    assisted: false,
    solarOutput: 0,
    notices: [],
    log: [],
  };
  activateRequests(state);
  refresh(state);
  return state;
}

function disconnect(state: State, request: Request): void {
  request.source = null;
  request.startupRemaining = 0;
  request.status = 'paused';
  request.interruptions += 1;
  state.interruptions += 1;
}

/** Atomic drop commit. Invalid actions leave every state field, including log, unchanged. */
export function act(state: State, action: Action): boolean {
  if (state.result !== 'playing' || !action || typeof action !== 'object') return false;
  if (action.type === 'battery') {
    if (!state.level.battery || state.batteryUsed) return false;
    state.batteryRemaining = 8;
    state.batteryUsed = true;
  } else {
    const request = state.requests.find((item) => item.id === action.requestId);
    if (!request || !active(request)) return false;
    if (action.type === 'cooling') {
      if (request.device !== 'ac' && request.device !== 'fan') return false;
      request.device = request.device === 'ac' ? 'fan' : 'ac';
      if (request.source) {
        request.startupRemaining = DEVICES[request.device].startupSeconds;
        request.status = request.startupRemaining ? 'starting' : 'running';
        request.interruptions += 1;
        state.interruptions += 1;
      }
    } else if (action.type === 'disconnect') {
      if (!request.source) return false;
      disconnect(state, request);
    } else if (action.type === 'defer') {
      if (
        state.defersLeft <= 0 ||
        request.deferred ||
        !(request.deferrable ?? DEVICES[request.device].deferrable)
      )
        return false;
      // Keep each home's three slots bounded: extending may not overlap its next wave.
      const waveEnd = (Math.floor(request.arrives / 45) + 1) * 45;
      const extended = Math.min(request.deadline + 15, waveEnd, state.level.duration);
      if (extended <= request.deadline) return false;
      request.deadline = extended;
      request.deferred = true;
      state.defersLeft -= 1;
    } else if (action.type === 'connect') {
      if (action.source !== 'grid' && action.source !== 'solar') return false;
      if (action.source === 'solar' && state.level.solar.length === 0) return false;
      const from =
        action.fromRequestId === undefined
          ? undefined
          : state.requests.find((item) => item.id === action.fromRequestId);
      if (
        action.fromRequestId !== undefined &&
        (!from || from === request || !active(from) || from.source !== action.source)
      )
        return false;
      if (request.source === action.source && !from) return false;
      if (from) disconnect(state, from);
      if (!request.source) {
        request.startupRemaining = DEVICES[request.device].startupSeconds;
        request.status = request.startupRemaining > 0 ? 'starting' : 'running';
      }
      request.source = action.source;
    } else {
      return false;
    }
  }
  state.log.push({ tick: state.tick, action: { ...action } });
  refresh(state);
  return true;
}

/** Stable means connected devices after startup, using today's sun and active battery. */
export function preview(
  state: State,
  action: Action,
): { current: number; instant: number; stable: number } {
  const copy: State = {
    ...state,
    requests: state.requests.map((request) => ({ ...request })),
    log: [...state.log],
    notices: [...state.notices],
  };
  act(copy, action);
  return { current: state.load, instant: copy.load, stable: load(copy, true) };
}

function targetPossible(state: State): boolean {
  return (
    !state.requests.some((request) => request.required && request.status === 'missed') &&
    state.requests.length - state.missed >= state.level.target
  );
}

/**
 * Integrate [time,time+50ms) at its starting load. At the boundary, credit completion
 * before expiry, then emit arrivals/weather. A last startup tick still heats the fuse.
 * Pausing/backgrounding means not calling step; no elapsed wall time is accepted.
 */
export function step(state: State): void {
  if (state.result !== 'playing') return;
  if (state.load > state.level.gridLimit) {
    state.heat = Math.min(
      HEAT_LIMIT,
      round(state.heat + ((state.load - state.level.gridLimit) / 100) * TICK_SECONDS),
    );
    state.overloadSeconds = round(state.overloadSeconds + TICK_SECONDS);
  } else if (state.load <= state.level.gridLimit * 0.9) {
    state.heat = Math.max(0, round(state.heat - 15 * TICK_SECONDS));
  }
  const tripped = state.heat >= HEAT_LIMIT;
  for (const request of state.requests) {
    if (!request.source) continue;
    if (request.startupRemaining > 0) {
      request.startupRemaining = Math.max(0, round(request.startupRemaining - TICK_SECONDS));
      if (request.startupRemaining === 0) request.status = 'running';
    } else {
      request.progress = Math.min(
        DEVICES[request.device].duration,
        round(request.progress + TICK_SECONDS * serviceRate(request, state.temperature)),
      );
      if (request.progress === DEVICES[request.device].duration) {
        request.status = 'completed';
        request.source = null;
        state.completed += 1;
      }
    }
  }
  state.tick += 1;
  state.time = state.tick / 20;
  state.batteryRemaining = Math.max(0, round(state.batteryRemaining - TICK_SECONDS));
  for (const request of state.requests) {
    if (
      !settled(request) &&
      (state.time >= request.deadline || state.time >= state.level.duration)
    ) {
      request.status = 'missed';
      request.source = null;
      request.startupRemaining = 0;
      state.missed += 1;
    }
  }
  activateRequests(state);
  refresh(state);
  if (!targetPossible(state)) state.result = 'failed';
  else if (tripped) state.result = 'tripped';
  else if (state.time >= state.level.duration)
    state.result = state.completed >= state.level.target ? 'won' : 'failed';
}

function rescuePlan(state: State): Request[] | null {
  if (
    state.result !== 'tripped' ||
    state.assisted ||
    !targetPossible(state) ||
    state.time >= state.level.duration
  )
    return null;
  const connected = state.requests
    .filter((request) => request.source)
    .sort((a, b) => power(b) - power(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const disconnected: Request[] = [];
  let remainingLoad = state.load;
  for (const request of connected) {
    if (remainingLoad <= state.level.gridLimit * 0.9) break;
    disconnected.push(request);
    remainingLoad -= power(request);
  }
  // Preflight the *post-rescue* startup costs; remaining free deferrals are valid resources.
  let viable = state.completed;
  let needsDefer = 0;
  for (const request of state.requests) {
    if (settled(request)) continue;
    const device = DEVICES[request.device];
    const startup =
      request.source && !disconnected.includes(request)
        ? request.startupRemaining
        : device.startupSeconds;
    const finish = round(
      Math.max(state.time, request.arrives) +
        startup +
        (device.duration - request.progress) /
          (request.device === 'fan' ? 1.3 : serviceRate(request, state.temperature)),
    );
    if (request.required && finish > Math.min(request.deadline, state.level.duration)) return null;
    if (finish <= Math.min(request.deadline, state.level.duration)) viable += 1;
    else if (
      !request.deferred &&
      (request.deferrable ?? device.deferrable) &&
      finish <=
        Math.min(
          request.deadline + 15,
          (Math.floor(request.arrives / 45) + 1) * 45,
          state.level.duration,
        )
    )
      needsDefer += 1;
  }
  return viable + Math.min(state.defersLeft, needsDefer) >= state.level.target
    ? disconnected
    : null;
}

/** Pure shared eligibility check: show the host reward offer only when this is true. */
export function canResumeAfterTrip(state: State): boolean {
  return rescuePlan(state) !== null;
}

/** Call ONLY after the host confirms a completed rewarded ad. Repeated callbacks are inert. */
export function resumeAfterTrip(state: State): boolean {
  const disconnected = rescuePlan(state);
  if (!disconnected) return false;
  state.heat = 0;
  for (const request of disconnected) disconnect(state, request);
  state.assisted = true;
  state.result = 'playing';
  state.log.push({ tick: state.tick, action: { type: 'rescue' } });
  refresh(state);
  return true;
}

/** Pure settlement; host storage/rewards own their once-only transaction. */
export function summarize(state: State): Summary {
  const won = state.result === 'won';
  const uninterrupted = state.requests.filter(
    (request) => request.status === 'completed' && request.interruptions === 0,
  ).length;
  let stars = won ? 1 : 0;
  if (won && state.completed === state.requests.length && !state.assisted) {
    stars =
      state.overloadSeconds <= state.level.quality.maxOverloadSeconds &&
      state.interruptions <= state.level.quality.maxInterruptions
        ? 3
        : 2;
  }
  return {
    result: state.result,
    stars,
    score: 100 * state.completed + 5 * uninterrupted + (won ? 50 : 0),
    completed: state.completed,
    total: state.requests.length,
    target: state.level.target,
    missed: state.missed,
    uninterrupted,
    overloadSeconds: state.overloadSeconds,
    interruptions: state.interruptions,
    assisted: state.assisted,
    standard: !state.assisted,
  };
}
