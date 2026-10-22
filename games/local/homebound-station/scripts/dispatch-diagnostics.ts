import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LEVELS, type LevelConfig } from '../src/levels.ts';
import {
  STEP,
  advance,
  createSimulation,
  dispatch,
  snapshot,
  stars,
  type Simulation,
} from '../src/simulation.ts';
import { ORDERS, solveLevel, ticksFor, type Action, type Order } from '../tests/support/solver.ts';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const DIAGNOSTIC_VERSION = 1;
export const DEFAULT_INTERVAL_SECONDS = 0.5;
export type Metrics = {
  won: boolean;
  elapsedTicks: number;
  elapsedSeconds: number;
  completionSeconds: number | null;
  stars: number;
  maxWaitSeconds: number;
  threeStarMarginSeconds: number | null;
  twoStarMarginSeconds: number | null;
  maxQueuedVehicles: number;
  maxTrafficBlockedVehicles: number;
  deliveredPassengers: number;
  targetPassengers: number;
};
export type Diagnosis = {
  key: string;
  levelId: number;
  levelDigest: string;
  order: Order;
  seed: number;
  intervalSeconds: number;
  maxSeconds: number;
  actions: Action[];
  metrics: Metrics;
  finalStateDigest: string;
  flags: string[];
};
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;

export function queueCounts(s: Simulation) {
  return {
    queuedVehicles: s.services.filter(
      (j) =>
        j.bayId &&
        j.clearedAt === undefined &&
        j.phase !== 'done' &&
        s.bays.find((b) => b.id === j.bayId)?.vehicleId !== j.vehicleId,
    ).length,
    trafficBlockedVehicles: s.services.filter(
      (j) => ['driving', 'departing'].includes(j.phase) && j.waitingForTraffic === true,
    ).length,
  };
}
function collector() {
  let maxQueuedVehicles = 0,
    maxTrafficBlockedVehicles = 0;
  return {
    sample(s: Simulation) {
      const q = queueCounts(s);
      maxQueuedVehicles = Math.max(maxQueuedVehicles, q.queuedVehicles);
      maxTrafficBlockedVehicles = Math.max(maxTrafficBlockedVehicles, q.trafficBlockedVehicles);
    },
    finish(s: Simulation): Metrics {
      return {
        won: s.won,
        elapsedTicks: s.ticks,
        elapsedSeconds: rounded(s.time),
        completionSeconds: s.won ? rounded(s.time) : null,
        stars: stars(s),
        maxWaitSeconds: rounded(s.maxWait),
        threeStarMarginSeconds: s.won ? rounded(s.config.stars[0] - s.maxWait) : null,
        twoStarMarginSeconds: s.won ? rounded(s.config.stars[1] - s.maxWait) : null,
        maxQueuedVehicles,
        maxTrafficBlockedVehicles,
        deliveredPassengers: s.delivered.size,
        targetPassengers: s.target,
      };
    },
  };
}
function result(
  config: LevelConfig,
  order: Order,
  intervalSeconds: number,
  maxSeconds: number,
  actions: Action[],
  s: Simulation,
  samples: ReturnType<typeof collector>,
): Diagnosis {
  const metrics = samples.finish(s);
  return {
    key: `${config.id}/${order}`,
    levelId: config.id,
    levelDigest: digest(config),
    order,
    seed: config.id * 7919,
    intervalSeconds,
    maxSeconds,
    actions,
    metrics,
    finalStateDigest: digest({
      ...snapshot(s),
      maxWait: s.maxWait,
      ticks: s.ticks,
      remainder: s.remainder,
    }),
    flags: [
      ...(!s.won ? ['time-limit-reached'] : []),
      ...(s.won && metrics.stars < 3 ? ['below-three-stars'] : []),
      ...(s.won && metrics.threeStarMarginSeconds! >= 0 && metrics.threeStarMarginSeconds! <= 5
        ? ['three-star-margin-at-most-5s']
        : []),
    ],
  };
}
export function diagnoseLevel(
  config: LevelConfig,
  order: Order,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  maxSeconds = 700,
) {
  const samples = collector();
  const { state, actions } = solveLevel(config, order, {
    intervalSeconds,
    maxSeconds,
    maxDispatchesPerBeat: 1,
    onStep: samples.sample,
    onDispatch: samples.sample,
  });
  return result(config, order, intervalSeconds, maxSeconds, actions, state, samples);
}

export function replayDiagnosis(config: LevelConfig, recorded: Diagnosis) {
  assert.equal(recorded.levelId, config.id, 'Replay level ID changed');
  assert.equal(recorded.levelDigest, digest(config), 'Replay level configuration changed');
  assert(ORDERS.includes(recorded.order), 'Unknown replay order');
  assert.equal(recorded.seed, config.id * 7919, 'Replay seed changed');
  const intervalTicks = ticksFor(recorded.intervalSeconds, 'intervalSeconds'),
    maxTicks = ticksFor(recorded.maxSeconds, 'maxSeconds');
  assert(
    Number.isInteger(recorded.metrics.elapsedTicks) &&
      recorded.metrics.elapsedTicks > 0 &&
      recorded.metrics.elapsedTicks <= maxTicks,
  );
  if (!recorded.metrics.won)
    assert.equal(
      recorded.metrics.elapsedTicks,
      maxTicks,
      'Incomplete replay must reach its recorded time limit',
    );
  const state = createSimulation(config),
    samples = collector();
  let previousTick = -1;
  for (const action of recorded.actions) {
    assert(
      Number.isInteger(action.tick) &&
        action.tick >= 0 &&
        action.tick < recorded.metrics.elapsedTicks &&
        action.tick % intervalTicks === 0 &&
        action.tick > previousTick,
      'Replay actions must be one per increasing cadence tick',
    );
    previousTick = action.tick;
  }
  let index = 0;
  while (state.ticks < recorded.metrics.elapsedTicks) {
    assert(!state.won, 'Replay completed earlier than recorded');
    if (recorded.actions[index]?.tick === state.ticks) {
      const action = recorded.actions[index++];
      assert(
        dispatch(state, action.vehicleId).ok,
        `Replay rejected ${action.vehicleId} at tick ${state.ticks}`,
      );
      samples.sample(state);
    }
    advance(state, STEP);
    samples.sample(state);
  }
  assert.equal(index, recorded.actions.length, 'Replay left actions unapplied');
  const replayed = result(
    config,
    recorded.order,
    recorded.intervalSeconds,
    recorded.maxSeconds,
    recorded.actions,
    state,
    samples,
  );
  assert.deepEqual(replayed, recorded, 'Replay result or final state differs');
  return replayed;
}

export function rankResults(results: Diagnosis[]) {
  return [...results].sort(
    (a, b) =>
      Number(a.metrics.won) - Number(b.metrics.won) ||
      (a.metrics.threeStarMarginSeconds ?? -Infinity) -
        (b.metrics.threeStarMarginSeconds ?? -Infinity) ||
      b.metrics.maxQueuedVehicles - a.metrics.maxQueuedVehicles ||
      b.metrics.maxTrafficBlockedVehicles - a.metrics.maxTrafficBlockedVehicles ||
      b.metrics.elapsedSeconds - a.metrics.elapsedSeconds ||
      a.levelId - b.levelId ||
      ORDERS.indexOf(a.order) - ORDERS.indexOf(b.order),
  );
}
export async function sourceFingerprint() {
  const files = [
    '../assets/scripts/core/levels.ts',
    '../assets/scripts/core/simulation.ts',
    '../tests/support/solver.ts',
    './dispatch-diagnostics.ts',
  ];
  return digest(
    await Promise.all(
      files.map(async (file) => [
        file,
        (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n'),
      ]),
    ),
  );
}
export async function validateReportMetadata(report: {
  version: number;
  sourceFingerprint: string;
  simulationStepSeconds: number;
  intervalSeconds: number;
  maxSeconds: number;
  results: Diagnosis[];
}) {
  assert.equal(report.version, DIAGNOSTIC_VERSION, 'Unsupported diagnostic report');
  assert.equal(
    report.sourceFingerprint,
    await sourceFingerprint(),
    'Diagnostic sources changed; regenerate the report',
  );
  assert.equal(report.simulationStepSeconds, STEP, 'Report simulation step changed');
  ticksFor(report.intervalSeconds, 'intervalSeconds');
  ticksFor(report.maxSeconds, 'maxSeconds');
  assert(Array.isArray(report.results) && report.results.length > 0, 'Empty diagnostic report');
  assert.equal(
    new Set(report.results.map((item) => item.key)).size,
    report.results.length,
    'Duplicate report cases',
  );
  for (const item of report.results) {
    assert.equal(item.intervalSeconds, report.intervalSeconds, 'Report cadence differs from case');
    assert.equal(item.maxSeconds, report.maxSeconds, 'Report time limit differs from case');
  }
}
export async function diagnoseCampaign(
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  maxSeconds = 700,
) {
  const results = LEVELS.flatMap((level) =>
    ORDERS.map((order) => diagnoseLevel(level, order, intervalSeconds, maxSeconds)),
  );
  for (const item of results)
    replayDiagnosis(LEVELS.find((level) => level.id === item.levelId)!, item);
  const ranked = rankResults(results);
  return {
    version: DIAGNOSTIC_VERSION,
    sourceFingerprint: await sourceFingerprint(),
    simulationStepSeconds: STEP,
    intervalSeconds,
    maxSeconds,
    policy:
      'At each cadence tick, dispatch at most one currently dispatchable vehicle; no click when none is available. First opportunity is tick 0. Random LCG generates one ordering key per vehicle on every cadence decision.',
    metrics: {
      stars:
        'Production stars(maxWait): maximum simulated time until a group starts boarding, not completion time.',
      queuedVehicles:
        'Assigned, uncleared services whose vehicle is not the current owner of its assigned bay; sampled after every dispatch and 0.05s simulation step.',
      trafficBlockedVehicles:
        'Driving/departing services with waitingForTraffic=true; sampled after every dispatch and simulation step.',
      ranking:
        'Incomplete first, then smallest three-star margin, greatest queued/traffic-blocked peaks, longest duration, stable level/order tie-break. Review priority, not proof of a gameplay defect.',
    },
    summary: {
      cases: results.length,
      completed: results.filter((r) => r.metrics.won).length,
      threeStar: results.filter((r) => r.metrics.stars === 3).length,
      replayVerified: results.length,
    },
    anomalyRanking: ranked.filter((r) => r.flags.length).map((r) => r.key),
    reviewCandidates: ranked.slice(0, 10).map((r) => r.key),
    results,
  };
}
