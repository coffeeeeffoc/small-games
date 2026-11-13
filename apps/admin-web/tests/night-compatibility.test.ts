import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasIncompatibleNewGames,
  newGameBlock,
  ruleOrder,
  ruleAdvice,
  runtimeReport,
  ruleSupport,
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
  const old = 'night-duel-v10';
  assert.equal(ruleSupport('multiplayer', old, status, 100_000), 'retained');
  assert.equal(ruleSupport('ranked', 'night-input-replay-v18', status, 100_000), 'current');
  assert.equal(ruleSupport('multiplayer', 'night-duel-v12', status, 100_000), 'unsupported');
  assert.match(ruleAdvice('night-duel-v12', status.report!.multiplayer), /需升级服务端/);
  assert.match(ruleAdvice('night-duel-v9', status.report!.multiplayer), /需升级客户端/);
  assert.match(ruleAdvice(old, status.report!.multiplayer), /已保留支持/);
  assert.equal(ruleOrder('night-duel-v10', 'night-duel-v9'), '客户端较高 / 服务端较低');
  assert.equal(ruleOrder('other-v10', 'night-duel-v9'), '版本系列不同，无法排序');
  assert.equal(ruleOrder('solo-a', 'solo-b'), '版本系列不同，无法排序');
  assert.equal(
    ruleSupport('multiplayer', old, { ...status, otherInstances: ['two'] }, 100_000),
    'partial',
  );
  assert.equal(ruleSupport('multiplayer', old, { ...status, report: null }, 100_000), 'unknown');
  assert.equal(ruleSupport('multiplayer', old, status, 160_001), 'unknown');
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
  assert(!hasIncompatibleNewGames(build, release, status, 'draining'));
  assert.equal(newGameBlock('ranked', build, release, 'disabled'), '游戏已停用');
  assert.equal(newGameBlock('multiplayer', build, release), undefined);
});
