import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, TRAINING, missionDefinition, nextMission } from '../assets/scripts/core/MissionCatalog.ts';
import { newMissionProgress, readMissionProgress, missionUnlocked, completeMission } from '../assets/scripts/core/MissionProgress.ts';

test('120 immutable unique operations retain old IDs and have distinct deployments with valid timing', () => {
  assert.equal(MISSIONS.length, 120);
  assert.deepEqual(MISSIONS.slice(0, 3).map(m => m.id), ['corridor-01', 'ambush-02', 'patrol-03']);
  assert.equal(new Set(MISSIONS.map(m => m.id)).size, 120);
  assert.equal(new Set(MISSIONS.map(m => JSON.stringify([m.map, m.events]))).size, 120);
  assert(Object.isFrozen(MISSIONS));
  for (const mission of MISSIONS) {
    assert(Object.isFrozen(mission) && Object.isFrozen(mission.events));
    assert(mission.events.every(event => Object.isFrozen(event) && Object.isFrozen(event.direction)));
    assert.equal(mission.events.length, [4, 6, 8, 12, 16][MISSIONS.indexOf(mission)] ?? MISSIONS.indexOf(mission) + 19);
    assert(mission.duration > 240 && mission.attackInterval >= 4.8);
  }
  assert.equal(missionDefinition('training-60'), TRAINING);
  assert.equal(missionDefinition('operation-999').id, MISSIONS[0].id);
});

test('legacy public operations stay unlocked; each clear unlocks the next and all 120 are reachable', () => {
  let progress = newMissionProgress();
  assert(MISSIONS.slice(0, 3).every(m => missionUnlocked(progress, m.id)));
  assert.equal(missionUnlocked(progress, MISSIONS[3].id), false);
  for (const [index, mission] of MISSIONS.entries()) {
    assert(missionUnlocked(progress, mission.id), `${mission.id} is reachable`);
    progress = completeMission(progress, mission.id, true);
    assert(progress.cleared.includes(mission.id));
    assert(missionUnlocked(progress, nextMission(mission.id)));
    const restored = readMissionProgress(JSON.stringify(progress));
    assert.deepEqual(restored, progress, 'saved progress can resume every stage');
    if (index < MISSIONS.length - 2) assert(!missionUnlocked(progress, MISSIONS[index + 2].id) || index < 2);
  }
  assert.equal(progress.cleared.length, 120);
  assert.equal(nextMission(MISSIONS.at(-1)!.id), MISSIONS.at(-1)!.id, 'final operation never silently wraps');
});

test('failure, practice, locked IDs, range scores and duplicate settlement cannot advance escort progress', () => {
  const progress = newMissionProgress();
  for (const args of [[MISSIONS[0].id, false, false], [MISSIONS[0].id, true, true],
    [MISSIONS[3].id, true, false], [TRAINING.id, true, false]] as const)
    assert.equal(completeMission(progress, ...args), progress);
  const cleared = completeMission(progress, MISSIONS[0].id, true);
  assert.equal(completeMission(cleared, MISSIONS[0].id, true), cleared);
});

test('corrupt, oversized and disconnected records degrade safely while valid legacy clears migrate', () => {
  for (const raw of [null, '{broken', '{}', '{"version":2,"cleared":[]}', 'x'.repeat(16001)])
    assert.deepEqual(readMissionProgress(raw), newMissionProgress());
  assert.deepEqual(readMissionProgress(JSON.stringify({ version: 1,
    cleared: ['patrol-03', 'patrol-03', 'training-60', 'unknown', 'operation-004', 'operation-119', 'operation-120'] })),
    { version: 1, cleared: ['patrol-03', 'operation-004'] });
});
