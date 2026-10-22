import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compilerEnvironment, buildH5Packages } from './h5-taptap-build.mjs';
import { acceptanceSelection } from './h5-taptap-matrix.mjs';
test('compiler environment fixes child memory/thread limits and never inherits arbitrary Node flags', () => {
  const env = compilerEnvironment({
    PATH: 'public',
    NODE_OPTIONS: '--require PRIVATE_CANARY',
    UV_THREADPOOL_SIZE: '99',
    SECRET: 'PRIVATE_CANARY',
  });
  assert.deepEqual(env, {
    PATH: 'public',
    NODE_OPTIONS: '--max-old-space-size=512',
    UV_THREADPOOL_SIZE: '1',
  });
});
test('profile conflicts fail before inspecting a workspace or creating package outputs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'h5-profile-contract-'));
  try {
    for (const values of [
      { profile: 'online-ads', local: true },
      { profile: 'online-ads', 'without-ads': true },
      { profile: 'qa-matrix', local: true, 'with-service': true },
      { profile: 'unknown', local: true },
      { profile: 'online-ads', games: ['cops-robbers'] },
      { profile: 'online-ads', modes: [[true, true]] },
    ])
      await assert.rejects(buildH5Packages(values, { workspace: directory }));
    assert.deepEqual(await readdir(directory), []);
    assert.equal(acceptanceSelection({ profile: 'qa-matrix', local: true }).modes.length, 4);
    assert.deepEqual(acceptanceSelection({ profile: 'online-ads' }).modes, [[true, true]]);
    await assert.rejects(
      buildH5Packages(
        { profile: 'online-ads' },
        {
          workspace: directory,
          allowDirty: true,
          env: { COMPETITION_PUBLIC_API_URL: 'https://api.nenggongzhiren.cn/small-games/v1' },
        },
      ),
    );
  } finally {
    assert.equal(path.dirname(directory), tmpdir());
    await rm(directory, { recursive: true, force: true });
  }
});

test('homebound H5 compiler receives only its explicit Creator artifact and advertisement slot', () => {
  const env = compilerEnvironment({
    HOMEBOUND_STATION_PREBUILT_DIR: '/verified/homebound',
    TAPTAP_HOMEBOUND_STATION_AD_UNIT_ID: 'homebound-slot',
    OTHER_PRIVATE_TOKEN: 'omit',
  });
  assert.equal(env.HOMEBOUND_STATION_PREBUILT_DIR, '/verified/homebound');
  assert.equal(env.TAPTAP_HOMEBOUND_STATION_AD_UNIT_ID, 'homebound-slot');
  assert.equal(env.OTHER_PRIVATE_TOKEN, undefined);
});

test('Tetracube H5 compiler preserves its explicit artifact and advertisement configuration', () => {
  const env = compilerEnvironment({
    TETRACUBE_PREBUILT_DIR: '/verified/tetracube',
    TAPTAP_TETRACUBE_AD_UNIT_ID: 'tetracube-slot',
    H5_ADS_ENABLED: '1',
    PRIVATE_TOKEN: 'omit',
  });
  assert.equal(env.TETRACUBE_PREBUILT_DIR, '/verified/tetracube');
  assert.equal(env.TAPTAP_TETRACUBE_AD_UNIT_ID, 'tetracube-slot');
  assert.equal(env.H5_ADS_ENABLED, '1');
  assert.equal(env.PRIVATE_TOKEN, undefined);
});
