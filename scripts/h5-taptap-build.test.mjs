import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { compilerEnvironment, buildH5Packages } from './h5-taptap-build.mjs';
import { acceptanceSelection } from './h5-taptap-matrix.mjs';

test('Night H5 online packages keep guest identity until platform login is explicitly configured', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'night-h5-guest-'));
  const apiUrl = 'https://api.example.test/v1';
  try {
    await mkdir(path.join(workspace, 'games/local/night-overwatch'), { recursive: true });
    const result = await buildH5Packages(
      {
        games: ['night-overwatch'],
        modes: [[true, true]],
        output: 'outputs/guest',
        batch: 'guest',
      },
      {
        workspace,
        allowDirty: true,
        buildOnly: true,
        env: {
          COMPETITION_PUBLIC_API_URL: apiUrl,
          TAPTAP_NIGHT_OVERWATCH_AD_UNIT_ID: 'fixture-slot',
        },
        compile: async ({ buildOutput }) => {
          await writeFile(
            path.join(buildOutput, 'index.html'),
            '<html><head></head><body></body></html>',
          );
        },
      },
    );
    const variant = result.variants[0],
      dist = path.join(result.output, variant.name, 'dist');
    const config = await readFile(path.join(dist, 'game-service-config.js'), 'utf8');
    assert.equal(variant.serviceEnabled, true);
    assert.equal(variant.effectiveAdsEnabled, true);
    assert.equal(variant.apiUrl, apiUrl);
    assert.match(config, /"competitionEnabled":true/);
    assert(config.includes(apiUrl));
    assert.doesNotMatch(config, /identityProvider|appId/);
    assert.doesNotMatch(
      await readFile(path.join(dist, 'game-services/game-bootstrap.js'), 'utf8'),
      /installTapCompetitionIdentity/,
    );
    assert(!variant.files.some((file) => /competition-identity|calls\.mjs/.test(file.path)));
  } finally {
    assert.equal(path.dirname(workspace), tmpdir());
    await rm(workspace, { recursive: true, force: true });
  }
});
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

test('Night Tap login packages install the real bridge only for the configured online game', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'night-h5-login-'));
  const tapIdentityAppIds = { 'night-overwatch': 'tapmcjgwi2thafs87k' };
  try {
    for (const game of ['night-overwatch', 'carding-car'])
      await mkdir(path.join(workspace, 'games/local', game), { recursive: true });
    const result = await buildH5Packages(
      {
        games: ['night-overwatch', 'carding-car'],
        modes: [
          [false, true],
          [false, false],
        ],
        output: 'outputs/login',
        batch: 'login',
        tapIdentityAppIds,
      },
      {
        workspace,
        allowDirty: true,
        buildOnly: true,
        env: { COMPETITION_PUBLIC_API_URL: 'https://api.example.test/v1' },
        compile: async ({ buildOutput }) =>
          writeFile(
            path.join(buildOutput, 'index.html'),
            '<html><head></head><body></body></html>',
          ),
      },
    );
    for (const variant of result.variants) {
      const dist = path.join(result.output, variant.name, 'dist');
      const config = await readFile(path.join(dist, 'game-service-config.js'), 'utf8');
      const bootstrap = await readFile(path.join(dist, 'game-services/game-bootstrap.js'), 'utf8');
      const enabled = variant.game === 'night-overwatch' && variant.serviceEnabled;
      assert.equal(config.includes('"identityProvider":"taptap"'), enabled);
      assert.equal(bootstrap.includes('installTapCompetitionIdentity();'), enabled);
      assert.equal(
        variant.identityAppId,
        enabled ? tapIdentityAppIds['night-overwatch'] : undefined,
      );
      assert.equal(
        variant.files.some((file) => file.path === 'game-services/competition-identity.mjs'),
        enabled,
      );
      if (enabled) {
        assert.equal(
          await readFile(path.join(dist, 'game-services/competition-identity.mjs'), 'utf8'),
          await readFile(
            new URL('../platforms/taptap/competition-identity.mjs', import.meta.url),
            'utf8',
          ),
        );
        assert(
          bootstrap.indexOf('installTapCompetitionIdentity();') <
            bootstrap.indexOf('connectGameServices();'),
        );
      }
      if (!variant.serviceEnabled) {
        const root = {
          window: {},
          createGameServices() {
            throw Error('Offline package attempted login');
          },
        };
        vm.runInNewContext(
          config +
            bootstrap.replace(/^import .*;\s*$/gm, '').replace('export function', 'function'),
          root,
        );
        assert.equal(root.SmallGamesServices, undefined);
      }
    }
    await assert.rejects(
      buildH5Packages(
        { tapIdentityAppIds: { 'night-overwatch': 'bad' } },
        { workspace: 'does-not-exist' },
      ),
      /Invalid TapTap identity/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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
