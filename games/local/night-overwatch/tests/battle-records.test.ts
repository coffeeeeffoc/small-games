import test from 'node:test';
import assert from 'node:assert/strict';
import { battleCounts, readMissionTimes, recordMissionTime, formatTime } from '../assets/scripts/core/BattleRecords.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
test('personal records retain the faster result and compare first, slower, equal and faster runs', () => {
  const records = readMissionTimes(null), sim = new Simulation();
  sim.phase = 'success'; sim.time = 80;
  assert.deepEqual(recordMissionTime(records, sim), { currentMs: 80000, bestMs: 80000, previousMs: undefined, newRecord: true });
  sim.time = 90; assert.equal(recordMissionTime(records, sim)?.bestMs, 80000);
  sim.time = 80; assert.equal(recordMissionTime(records, sim)?.newRecord, false);
  sim.time = 70; assert.equal(recordMissionTime(records, sim)?.newRecord, true);
  assert.deepEqual(readMissionTimes(JSON.stringify(records)), records);
  sim.phase = 'failure'; assert.equal(recordMissionTime(records, sim), undefined);
  assert.equal(records[sim.mission.id].attempts, 4);
  assert.deepEqual(readMissionTimes('{bad'), {});
});

test('time display rounds across the minute boundary', () => {
  assert.equal(formatTime(59999), '01:00.00'); assert.equal(formatTime(59990), '00:59.99');
  assert.equal(formatTime(60000), '01:00.00'); assert.equal(formatTime(61230), '01:01.23');
});
test('battle report separates pending waves from living and destroyed units', () => {
  const sim = new Simulation('operation-028');
  const before = battleCounts(sim);
  assert.equal(before.reduce((sum, row) => sum + row.pending, 0), sim.mission.events.length);
  sim.start(); const enemy = sim.units.find(unit => !unit.friendly)!; enemy.hp = 0;
  const counts = battleCounts(sim);
  assert.equal(counts.reduce((sum, row) => sum + row.destroyed, 0), 1);
  for (const row of counts) assert.equal(row.total, row.alive + row.destroyed + row.pending);
});
