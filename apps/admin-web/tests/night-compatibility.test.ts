import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCompatibility,
  hasIncompatibleNewGames,
  ruleOrder,
  ruleAdvice,
  runtimeReport,
  type NightRuntimeStatus,
} from '../src/night-compatibility.ts';
import type { NightBuild, NightRelease } from '../src/night-operations-model';

test('rule membership decides compatibility independently of numerical age', () => {
  const status: NightRuntimeStatus = {
    checkedAt: 100_000,
    error: null,
    otherInstances: [],
    report: {
      instanceId: 'one',
      ranked: {
        current: 'night-input-replay-v18',
        supported: ['night-input-replay-v18', 'night-input-replay-v17'],
      },
      multiplayer: { current: 'night-duel-v11', supported: ['night-duel-v11', 'night-duel-v10'] },
    },
  };
  const old = { ranked: 'night-input-replay-v17', multiplayer: 'night-duel-v10' };
  assert.equal(buildCompatibility(old, status, 100_000), '兼容');
  assert.equal(
    buildCompatibility({ ...old, multiplayer: 'night-duel-v12' }, status, 100_000),
    '不兼容',
  );
  assert.match(ruleAdvice('night-duel-v12', status.report!.multiplayer), /需升级服务端/);
  assert.match(ruleAdvice('night-duel-v9', status.report!.multiplayer), /需升级客户端/);
  assert.match(ruleAdvice(old.multiplayer, status.report!.multiplayer), /已保留支持/);
  assert.equal(ruleOrder('night-duel-v10', 'night-duel-v9'), '客户端较高 / 服务端较低');
  assert.equal(ruleOrder('other-v10', 'night-duel-v9'), '版本系列不同，无法排序');
  assert.equal(ruleOrder('solo-a', 'solo-b'), '版本系列不同，无法排序');
  assert.equal(
    buildCompatibility(old, { ...status, otherInstances: ['two'] }, 100_000),
    '部分实例待核实',
  );
  assert.equal(buildCompatibility(old, { ...status, report: null }, 100_000), '待核实');
  assert.equal(buildCompatibility(old, status, 160_001), '待核实');
  assert.equal(runtimeReport(status, 90_000), null);
});

test('alerts only unsupported rules that still admit new games', () => {
  const build: NightBuild = {
    buildId: 'a',
    channel: 'h5',
    ranked: 'solo-v18',
    multiplayer: 'duel-v11',
    backendVersion: '1.0.0',
  };
  const release: NightRelease = {
    schemaVersion: 1,
    builds: [build],
    channels: [],
    legacy: build,
    allowNew: { ranked: ['solo-v18'], multiplayer: ['duel-v11'] },
  };
  const status: NightRuntimeStatus = {
    checkedAt: Date.now(),
    error: null,
    otherInstances: [],
    report: {
      instanceId: 'one',
      ranked: { current: 'solo-v17', supported: ['solo-v17'] },
      multiplayer: { current: 'duel-v11', supported: ['duel-v11'] },
    },
  };
  assert(hasIncompatibleNewGames(build, release, status));
  assert(
    !hasIncompatibleNewGames(
      build,
      { ...release, retiredRules: { ranked: ['solo-v18'], multiplayer: [] } },
      status,
    ),
  );
  assert(
    !hasIncompatibleNewGames(
      build,
      { ...release, allowNew: { ranked: [], multiplayer: ['duel-v11'] } },
      status,
    ),
  );
  assert(
    !hasIncompatibleNewGames(build, { ...release, disabledBackendVersions: ['1.0.0'] }, status),
  );
  assert(!hasIncompatibleNewGames({ ...build, disabled: true }, release, status));
  assert(!hasIncompatibleNewGames({ ...build, removed: true }, release, status));
});
