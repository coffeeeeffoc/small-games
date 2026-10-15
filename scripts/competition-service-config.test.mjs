import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  competitionService,
  serviceEnvironment,
  serviceGames,
} from './competition-service-config.mjs';
import { configuration } from '../games/minigames/scripts/config.mjs';
import { publicTapTapLoginConfig } from '../apps/shell-minigame/scripts/taptap-login.mjs';
import { prepareH5Service } from './competition-h5-service.mjs';
import { prepareSite } from './deploy-tencent.mjs';
import { prepareBundleSite, buildEnvironment } from './deployment-bundle.mjs';
import {
  createNativeSDKFixture,
  flushNative,
} from '../games/local/letters-words2/tests/native-sdk-fixture.mjs';
import { startNativeCompetition } from '../platforms/competition/native.js';
import { buildCompetition } from './competition-build.mjs';
import { targetOptions } from '../apps/shell-minigame/scripts/nine-games-targets.mjs';
import { tapTapOptions } from '../apps/shell-minigame/scripts/taptap-targets.mjs';

const url = 'https://api.example.com/api/competition/v1';
const online = { COMPETITION_SERVICE_ENABLED: '1', COMPETITION_PUBLIC_API_URL: url };
test('service flags leave the other channel games public configuration unchanged', () => {
  for (const game of [
    'carding-car',
    'night-overwatch',
    'letters-words2',
    'vibeJam-myself-history-guess',
    'travel-bund',
    'wulong-city',
  ]) {
    const env = {
      MINIGAME_COMPETITION_API_URL: url,
      MINIGAME_TRAVEL_BUND_ASSET_BASE: 'https://assets.example.com/',
    };
    for (const platform of ['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'])
      assert.deepEqual(
        targetOptions(game, platform, { preview: true, env: { ...env, ...online } }),
        targetOptions(game, platform, { preview: true, env }),
      );
    assert.deepEqual(
      tapTapOptions(game, { preview: true, env: { ...env, ...online } }),
      tapTapOptions(game, { preview: true, env }),
    );
  }
});
test('optional services require permission and an address; explicit disabling discards stale addresses', () => {
  for (const env of [
    {},
    { COMPETITION_PUBLIC_API_URL: url },
    { COMPETITION_SERVICE_ENABLED: '0', COMPETITION_PUBLIC_API_URL: 'invalid' },
  ])
    assert.deepEqual(competitionService({ env }), { competitionEnabled: false, apiUrl: '' });
  assert.deepEqual(competitionService({ env: online }), { competitionEnabled: true, apiUrl: url });
  assert.throws(
    () => competitionService({ env: { COMPETITION_SERVICE_ENABLED: 'true' } }),
    /0 or 1/,
  );
  assert.throws(
    () => competitionService({ env: { COMPETITION_SERVICE_ENABLED: '1' } }),
    /set COMPETITION_PUBLIC_API_URL/,
  );
  assert.throws(() => serviceEnvironment(['--with-service', '--without-service'], {}), /Choose/);
  assert.equal(
    competitionService({ env: serviceEnvironment(['--without-service'], online) }).apiUrl,
    '',
  );
  for (const value of [
    'http://example.com/api',
    'https://u:p@example.com/api',
    url + '?token=x',
    url + '#hash',
    url + '?',
    url + '#',
    'javascript:alert(1)',
    'https://example.com/</script>',
  ])
    assert.throws(
      () => competitionService({ env: { ...online, COMPETITION_PUBLIC_API_URL: value } }),
      /requires/,
    );
  const local = {
    ...online,
    COMPETITION_PUBLIC_API_URL: 'http://127.0.0.1:43010/api/competition/v1/',
  };
  assert.throws(() => competitionService({ env: local }), /HTTPS/);
  assert.equal(
    competitionService({ env: local, local: true }).apiUrl,
    local.COMPETITION_PUBLIC_API_URL.slice(0, -1),
  );
});

test('all three TapTap release configurations work offline and only enable a configured service', () => {
  for (const game of serviceGames) {
    const env = { TAPTAP_APP_ID: 'real-public-app-id', TAPTAP_API_URL: url };
    const offline = configuration(game, 'taptap', { release: true, env });
    assert.equal(offline.apiUrl, '');
    assert.equal(offline.competitionEnabled, false);
    assert.equal(publicTapTapLoginConfig(offline).apiUrl, '');
    const configured = configuration(game, 'taptap', { release: true, env: { ...env, ...online } });
    assert.equal(configured.competitionEnabled, true);
    assert.equal(publicTapTapLoginConfig(configured).apiUrl, url);
    const local = configuration(game, 'web-preview', {
      env: { ...online, COMPETITION_PUBLIC_API_URL: 'http://localhost:43010/api/competition/v1' },
    });
    assert.equal(local.competitionConfigured, true);
  }
});

test('Creator web previews use a real guest session without invoking platform login', async () => {
  const f = createNativeSDKFixture();
  const saved = { fetch: globalThis.fetch, competition: globalThis.__competition };
  const restore = f.installGlobals();
  const requests = [];
  let instance;
  try {
    delete globalThis.__competition;
    globalThis.fetch = async (target) => {
      requests.push(target);
      return {
        status: 200,
        json: async () =>
          target.endsWith('/sessions/guest')
            ? { token: 'a'.repeat(64), playerId: 'preview-player', expiresAt: Date.now() + 3600000 }
            : target.endsWith('/me')
              ? { playerId: 'preview-player', name: '测试玩家' }
              : {
                  version: 'roles-initiative-duel-v2',
                  roles: ['pursuer', 'runner'],
                  modes: [{ id: 'escape' }, { id: 'survival' }],
                },
      };
    };
    instance = startNativeCompetition(
      f.sdk,
      {
        game: 'cops-robbers',
        platform: 'web-preview',
        competitionEnabled: true,
        apiUrl: 'http://127.0.0.1:43010/api/competition/v1',
      },
      () => ({ draw() {}, tap() {} }),
    );
    await flushNative();
    assert(requests.some((target) => target.endsWith('/sessions/guest')));
    assert(requests.some((target) => target.endsWith('/boards/cops-robbers')));
    assert.equal(f.requests.length, 0);
  } finally {
    instance?.stop();
    globalThis.fetch = saved.fetch;
    if (saved.competition === undefined) delete globalThis.__competition;
    else globalThis.__competition = saved.competition;
    restore();
  }
});

test('legacy native build commands produce playable solo controllers without service requests', async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'competition-native-offline-'));
  try {
    for (const game of serviceGames) {
      await buildCompetition({
        native: true,
        only: game,
        platform: 'wechat',
        outputRoot,
        env: { COMPETITION_SERVICE_ENABLED: '0', COMPETITION_PUBLIC_API_URL: url },
      });
      const f = createNativeSDKFixture();
      const restore = f.installGlobals();
      const exports = {};
      const context = {
        wx: f.sdk,
        exports,
        module: { exports },
        console,
        Date,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame,
        cancelAnimationFrame,
      };
      try {
        vm.runInNewContext(
          await readFile(path.join(outputRoot, 'wechat', game, 'game.js'), 'utf8'),
          context,
        );
        await flushNative();
        assert(f.labels.length > 0, `${game} must render its solo home`);
        assert.equal(f.requests.length, 0, `${game} must not log in or request the service`);
        const instance = exports.instance;
        (instance.stop || instance.dispose).call(instance);
      } finally {
        restore();
      }
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('rebuilding and deploying a managed H5 entry never retain an old service address or bundle', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'competition-service-'));
  try {
    const source = path.join(temporary, 'source');
    await mkdir(source);
    await writeFile(path.join(source, 'index.html'), '<html><head></head><body></body></html>');
    await prepareH5Service('cops-robbers', source, { env: online });
    assert(
      (await readFile(path.join(source, 'competition.js'), 'utf8')).includes('mountCompetition'),
    );
    for (const [name, deploy] of [
      ['tencent', (destination, env) => prepareSite(source, destination, env)],
      ['bundle', (destination, env) => prepareBundleSite(source, destination, [], 'off', env)],
    ]) {
      for (const enabled of ['0', '1']) {
        const destination = path.join(temporary, name + enabled);
        await deploy(destination, { ...online, COMPETITION_SERVICE_ENABLED: enabled });
        const html = await readFile(path.join(destination, 'index.html'), 'utf8');
        const context = {};
        vm.runInNewContext(
          html.match(/<script data-competition-service>(.*?)<\/script>/)[1],
          context,
        );
        assert.equal(context.__COMPETITION_CONFIG__.competitionEnabled, enabled === '1');
        assert.equal(context.__COMPETITION_CONFIG__.apiUrl, enabled === '1' ? url : '');
        if (enabled === '0') {
          assert(!html.includes(url));
          await assert.rejects(readFile(path.join(destination, 'competition.js')), {
            code: 'ENOENT',
          });
        }
      }
    }
    assert.equal(buildEnvironment(online).COMPETITION_SERVICE_ENABLED, '1');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
