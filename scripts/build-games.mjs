import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildH5Packages, root, compilerEnvironment } from './h5-taptap-build.mjs';
import { h5AdGames } from './h5-ad-config.mjs';
import { competitionService } from './competition-service-config.mjs';
import { packageModes } from './h5-taptap-matrix.mjs';

export const localConfig = 'game-build.local.json';
export function parseGameBuildConfig(config) {
  assert(config && typeof config === 'object' && !Array.isArray(config), 'BUILD_CONFIG');
  const allowed = ['version', 'games', 'ads', 'backend', 'apiUrl', 'localBackend', 'adUnits'];
  assert(
    Object.keys(config).every((key) => allowed.includes(key)) && config.version === 1,
    'BUILD_CONFIG',
  );
  assert(
    Array.isArray(config.games) &&
      config.games.length &&
      new Set(config.games).size === config.games.length &&
      config.games.every((game) => h5AdGames.includes(game)),
    'BUILD_GAMES',
  );
  for (const axis of [config.ads, config.backend])
    assert(
      Array.isArray(axis) &&
        axis.length &&
        new Set(axis).size === axis.length &&
        axis.every((value) => typeof value === 'boolean'),
      'BUILD_VARIANTS',
    );
  assert(
    config.localBackend === undefined || typeof config.localBackend === 'boolean',
    'BUILD_CONFIG',
  );
  assert(config.apiUrl === undefined || typeof config.apiUrl === 'string', 'BUILD_CONFIG');
  const adUnits = config.adUnits ?? {};
  assert(
    adUnits &&
      typeof adUnits === 'object' &&
      !Array.isArray(adUnits) &&
      Object.entries(adUnits).every(
        ([game, id]) =>
          config.games.includes(game) &&
          typeof id === 'string' &&
          (!id || /^[\w-]{1,160}$/.test(id)),
      ),
    'BUILD_AD_UNITS',
  );
  if (config.backend.includes(true) || config.apiUrl)
    competitionService({
      env: { COMPETITION_SERVICE_ENABLED: '1', COMPETITION_PUBLIC_API_URL: config.apiUrl ?? '' },
      local: Boolean(config.localBackend),
    });
  const modes = config.backend.flatMap((service) =>
    config.ads.flatMap((ads) =>
      packageModes({
        [service ? 'with-service' : 'without-service']: true,
        [ads ? 'with-ads' : 'without-ads']: true,
      }),
    ),
  );
  return { ...config, adUnits, modes };
}

export async function main(
  args = process.argv.slice(2),
  { workspace = root, build = buildH5Packages, read = readFile, env = process.env } = {},
) {
  const { values } = parseArgs({
    args,
    options: { config: { type: 'string', default: localConfig }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log(
      'pnpm build:games [--config path.json]\n仅构建本地配置选择的三款 TapTap H5 游戏和广告/后端变体；允许未提交源码，不运行测试或部署。\n复制 infra/builds/games.example.json 为 game-build.local.json 后选择 games。',
    );
    return;
  }
  let config;
  try {
    config = parseGameBuildConfig(
      JSON.parse(await read(path.resolve(workspace, values.config), 'utf8')),
    );
  } catch (error) {
    if (error.code === 'ENOENT') throw Error('BUILD_CONFIG_MISSING');
    throw Error('BUILD_CONFIG_INVALID');
  }
  const batch = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(3).toString('hex')}`;
  const buildEnv = {
    ...compilerEnvironment(env),
    COMPETITION_PUBLIC_API_URL: config.backend.includes(true) ? (config.apiUrl ?? '') : '',
  };
  for (const [game, id] of Object.entries(config.adUnits))
    buildEnv[`TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_AD_UNIT_ID`] = id;
  console.log(
    `GAME_BUILD_SCOPE ${config.games.join(',')} platform=taptap-h5 variants=${config.modes.length} quality_checks=not-run deployment=none`,
  );
  return await build(
    {
      games: config.games,
      modes: config.modes,
      local: Boolean(config.localBackend),
      output: `outputs/game-builds/${batch}`,
    },
    { workspace, env: buildEnv, allowDirty: true, perGame: true, buildOnly: true },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(
      `GAME_BUILD_STOPPED ${['BUILD_CONFIG_MISSING', 'BUILD_CONFIG_INVALID'].includes(error.message) ? error.message : 'COMPILATION_OR_PACKAGE_FAILED'}`,
    );
    process.exitCode = 1;
  });
