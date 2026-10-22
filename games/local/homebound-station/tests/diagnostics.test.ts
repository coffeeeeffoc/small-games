import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, type LevelConfig } from '../src/levels.ts';
import { advance, createSimulation, dispatch, STEP } from '../src/simulation.ts';
import {
  diagnoseLevel,
  queueCounts,
  rankResults,
  replayDiagnosis,
  sourceFingerprint,
  validateReportMetadata,
  DIAGNOSTIC_VERSION,
} from '../scripts/dispatch-diagnostics.ts';
import { solveLevel } from './support/solver.ts';

function fixture(): LevelConfig {
  return {
    id: 900,
    title: 'diagnostic fixture',
    subtitle: '',
    hint: '',
    stars: [150, 240],
    groups: Array.from({ length: 8 }, (_, i) => ({ id: `T${i + 1}`, size: 2 })),
    vehicles: Array.from({ length: 8 }, (_, i) => ({
      id: `V${i + 1}`,
      capacity: 4 as const,
      column: i % 2 ? 4 : 0,
      row: Math.floor(i / 2),
      direction: i % 2 ? ('E' as const) : ('W' as const),
    })),
  };
}
test('fixed cadence dispatches at most one vehicle per beat, while legacy burst semantics stay intact', () => {
  const config = fixture();
  const paced = diagnoseLevel(config, 'forward');
  assert(paced.metrics.won);
  assert.equal(paced.actions[0].tick, 0);
  assert.equal(new Set(paced.actions.map((a) => a.tick)).size, paced.actions.length);
  for (let i = 1; i < paced.actions.length; i++)
    assert(paced.actions[i].tick - paced.actions[i - 1].tick >= 10);
  assert(paced.actions.every((a) => a.tick % 10 === 0));
  const fast = solveLevel(config, 'forward');
  assert.equal(fast.actions.filter((a) => a.tick === 0).length, 8);
  assert(fast.state.won);
  assert.deepEqual(replayDiagnosis(config, paced), paced);
});
test('random decisions and serialized action replay are deterministic; other cadences remain quantized', () => {
  const first = diagnoseLevel(LEVELS[0], 'random', 0.25);
  assert.deepEqual(diagnoseLevel(LEVELS[0], 'random', 0.25), first);
  assert(first.actions.every((a) => a.tick % 5 === 0));
  assert.deepEqual(replayDiagnosis(LEVELS[0], JSON.parse(JSON.stringify(first))), first);
  for (const invalid of [0, -1, NaN, Infinity, 0.03, 0.333])
    assert.throws(() => diagnoseLevel(LEVELS[0], 'forward', invalid), /positive multiple/);
});
test('star margins use maximum boarding wait, not the later completion time', () => {
  const config = fixture(),
    result = diagnoseLevel(config, 'reverse');
  assert(result.metrics.completionSeconds! > result.metrics.maxWaitSeconds);
  assert.equal(
    result.metrics.threeStarMarginSeconds,
    Math.round((150 - result.metrics.maxWaitSeconds) * 1e6) / 1e6,
  );
  assert.equal(
    result.metrics.twoStarMarginSeconds,
    Math.round((240 - result.metrics.maxWaitSeconds) * 1e6) / 1e6,
  );
  assert.notEqual(result.metrics.threeStarMarginSeconds, 150 - result.metrics.completionSeconds!);
  const tight = { ...config, stars: [0, 1] as [number, number] };
  const lower = diagnoseLevel(tight, 'reverse');
  assert.equal(lower.metrics.stars, 1);
  assert(lower.flags.includes('below-three-stars'));
});
test('queue metric counts waiting bay assignments, separately from traffic-blocked services', () => {
  const state = createSimulation(fixture());
  for (const vehicle of state.vehicles) assert(dispatch(state, vehicle.id).ok);
  assert.equal(queueCounts(state).queuedVehicles, 4);
  advance(state, STEP);
  assert.equal(
    queueCounts(state).trafficBlockedVehicles,
    state.services.filter((j) => ['driving', 'departing'].includes(j.phase) && j.waitingForTraffic)
      .length,
  );
  const measured = diagnoseLevel(fixture(), 'forward');
  assert(measured.metrics.maxQueuedVehicles >= 1);
  assert(measured.metrics.maxTrafficBlockedVehicles >= 1);
});
test('incomplete cases remain replayable and rank before star/time-margin concerns', () => {
  const incomplete = diagnoseLevel(LEVELS[0], 'forward', 0.5, 0.1);
  assert.equal(incomplete.metrics.won, false);
  assert.equal(incomplete.metrics.completionSeconds, null);
  assert.equal(incomplete.metrics.threeStarMarginSeconds, null);
  assert.deepEqual(replayDiagnosis(LEVELS[0], incomplete), incomplete);
  assert.throws(
    () => replayDiagnosis(LEVELS[0], { ...incomplete, maxSeconds: 700 }),
    /recorded time limit/,
  );
  const complete = diagnoseLevel(LEVELS[0], 'forward');
  assert.equal(rankResults([complete, incomplete])[0], incomplete);
});
test('report metadata rejects cadence, time limit, simulation step and source drift', async () => {
  const valid = {
    version: DIAGNOSTIC_VERSION,
    sourceFingerprint: await sourceFingerprint(),
    simulationStepSeconds: STEP,
    intervalSeconds: 0.5,
    maxSeconds: 700,
    results: [diagnoseLevel(LEVELS[0], 'forward')],
  };
  await validateReportMetadata(valid);
  await assert.rejects(
    () => validateReportMetadata({ ...valid, simulationStepSeconds: 0.1 }),
    /simulation step changed/,
  );
  await assert.rejects(
    () => validateReportMetadata({ ...valid, intervalSeconds: 1 }),
    /cadence differs/,
  );
  await assert.rejects(
    () => validateReportMetadata({ ...valid, maxSeconds: 600 }),
    /time limit differs/,
  );
  await assert.rejects(
    () => validateReportMetadata({ ...valid, sourceFingerprint: 'changed' }),
    /sources changed/,
  );
  await assert.rejects(
    () => validateReportMetadata({ ...valid, results: [...valid.results, ...valid.results] }),
    /Duplicate/,
  );
});
test('replay rejects configuration drift, extra same-tick input, illegal actions and forged final metrics', () => {
  const config = fixture(),
    original = diagnoseLevel(config, 'forward');
  assert.throws(
    () => replayDiagnosis({ ...config, stars: [1, 2] }, original),
    /configuration changed/,
  );
  const sameTick = structuredClone(original);
  sameTick.actions[1].tick = sameTick.actions[0].tick;
  assert.throws(() => replayDiagnosis(config, sameTick), /one per increasing cadence tick/);
  const illegal = structuredClone(original);
  illegal.actions[0].vehicleId = 'missing';
  assert.throws(() => replayDiagnosis(config, illegal), /Replay rejected/);
  const forged = structuredClone(original);
  forged.metrics.maxQueuedVehicles++;
  assert.throws(() => replayDiagnosis(config, forged), /Replay result or final state differs/);
});
