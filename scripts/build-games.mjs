import { validateTapServices, tapServicesVariable } from './taptap-services-config.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  buildH5Packages,
  root,
  compilerEnvironment,
  ordinaryDirectory,
  validateTapIdentityAppIds,
} from './h5-taptap-build.mjs';
import { h5AdGames, h5PackageGames, additionalH5Games } from './h5-ad-config.mjs';
import { competitionService } from './competition-service-config.mjs';
import { h5BasicServiceGames } from './h5-game-services.mjs';
import { packageModes } from './h5-taptap-matrix.mjs';
import { buildTypes } from './h5-build-type.mjs';

export const localConfig = 'game-build.local.mjs';
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
function validateApiUrls(value = {}, local = false) {
  assert(record(value), 'BUILD_API_URLS');
  for (const [type, apiUrl] of Object.entries(value)) {
    assert(['test', 'production'].includes(type) && typeof apiUrl === 'string', 'BUILD_API_URLS');
    validateService({ apiUrl }, type === 'test' && local);
    if (type === 'production') {
      assert(
        !['localhost', '127.0.0.1', '[::1]'].includes(new URL(apiUrl).hostname),
        'BUILD_PRODUCTION_API',
      );
    }
  }
}
export function gameBuildSettings(config, game) {
  if (!config.buildType) return {};
  const override = config.gameOverrides?.[game];
  const buildType = override?.buildType ?? config.buildType;
  const urls = { ...config.apiUrls, ...override?.apiUrls };
  if (buildType !== 'production' && urls.test && urls.production)
    assert(
      new URL(urls.test).href.replace(/\/+$/, '') !==
        new URL(urls.production).href.replace(/\/+$/, ''),
      'BUILD_TEST_PRODUCTION_API_CONFLICT',
    );
  return {
    buildType,
    devMode: buildType === 'development',
    apiUrl: urls[buildType === 'production' ? 'production' : 'test'] ?? '',
  };
}
function validateService(config, local = Boolean(config.localBackend)) {
  assert(config.apiUrl, 'BUILD_API_URL_REQUIRED: backend=true requires apiUrl');
  try {
    competitionService({
      env: { COMPETITION_SERVICE_ENABLED: '1', COMPETITION_PUBLIC_API_URL: config.apiUrl },
      local,
    });
  } catch {
    assert.fail(
      'BUILD_API_URL_INVALID: use public HTTPS without credentials, query or fragment; localBackend only allows H5 loopback HTTP',
    );
  }
}
function variants(ads, backend) {
  for (const axis of [ads, backend])
    assert(
      Array.isArray(axis) &&
        axis.length &&
        new Set(axis).size === axis.length &&
        Array.from(axis).every((v) => typeof v === 'boolean'),
      'BUILD_VARIANTS',
    );
  return backend.flatMap((service) =>
    ads.flatMap((advertising) =>
      packageModes({
        [service ? 'with-service' : 'without-service']: true,
        [advertising ? 'with-ads' : 'without-ads']: true,
      }),
    ),
  );
}
function identifiers(value = {}, games, label, legacy = false) {
  assert(record(value), `BUILD_${label}`);
  for (const [game, id] of Object.entries(value))
    assert(
      games.includes(game) &&
        typeof id === 'string' &&
        (!id ||
          (/^[\w-]+$/.test(id) &&
            id.length <= (label === 'AD_UNITS' ? 160 : 128) &&
            (legacy || !/^(YOUR_|REPLACE_|TODO)/i.test(id)))),
      `BUILD_${label}`,
    );
  return value;
}
export function parseGameBuildConfig(config) {
  assert(record(config) && [1, 2].includes(config.version), 'BUILD_CONFIG');
  const allowed = [
    'version',
    'games',
    'ads',
    'backend',
    'apiUrl',
    'localBackend',
    ...(config.version === 2 ? ['buildType', 'apiUrls', 'gameOverrides'] : []),
    config.version === 1 ? 'adUnits' : 'targets',
  ];
  assert(
    Object.keys(config).every((key) => allowed.includes(key)),
    'BUILD_CONFIG',
  );
  assert(
    Array.isArray(config.games) &&
      config.games.length &&
      new Set(config.games).size === config.games.length &&
      Array.from(config.games).every((game) => h5PackageGames.includes(game)),
    'BUILD_GAMES',
  );
  const modes = variants(config.ads, config.backend);
  assert(
    config.localBackend === undefined || typeof config.localBackend === 'boolean',
    'BUILD_CONFIG',
  );
  assert(config.apiUrl === undefined || typeof config.apiUrl === 'string', 'BUILD_CONFIG');
  if (config.buildType !== undefined) {
    assert(buildTypes.includes(config.buildType), 'BUILD_TYPE');
    assert(config.apiUrl === undefined, 'BUILD_API_URL_CONFLICT: use apiUrls with buildType');
    validateApiUrls(config.apiUrls, Boolean(config.localBackend));
    assert(
      config.gameOverrides === undefined || record(config.gameOverrides),
      'BUILD_GAME_OVERRIDES',
    );
    for (const [game, override] of Object.entries(config.gameOverrides ?? {})) {
      assert(h5PackageGames.includes(game) && record(override), 'BUILD_GAME_OVERRIDE');
      assert(
        Object.keys(override).every((key) => ['buildType', 'apiUrls'].includes(key)),
        'BUILD_GAME_OVERRIDE',
      );
      assert(
        override.buildType === undefined || buildTypes.includes(override.buildType),
        'BUILD_TYPE',
      );
      validateApiUrls(override.apiUrls, Boolean(config.localBackend));
    }
  } else {
    assert(
      config.apiUrls === undefined && config.gameOverrides === undefined,
      'BUILD_TYPE_REQUIRED',
    );
  }
  if (config.apiUrl || (config.version === 1 && config.backend.includes(true)))
    validateService(config);
  if (config.version === 1) {
    const adUnits = identifiers(config.adUnits ?? {}, config.games, 'AD_UNITS', true);
    return {
      ...config,
      adUnits,
      modes,
      targets: [{ platform: 'taptap', type: 'h5', modes, adUnits }],
    };
  }
  assert(Array.isArray(config.targets) && config.targets.length, 'BUILD_TARGETS');
  const seen = new Set();
  const targets = Array.from(config.targets, (target) => {
    assert(
      record(target) &&
        Object.keys(target).every((key) =>
          [
            'platform',
            'type',
            'release',
            'ads',
            'backend',
            'appIds',
            'adUnits',
            'tapServices',
            'tapIdentityAppIds',
          ].includes(key),
        ),
      'BUILD_TARGET',
    );
    const { platform, type } = target;
    assert(type === 'h5' && platform === 'taptap', 'BUILD_PLATFORM_TYPE');
    const key = `${platform}-${type}`;
    assert(!seen.has(key), 'BUILD_DUPLICATE_TARGET');
    seen.add(key);
    if (type === 'h5')
      assert(
        target.release === undefined && target.appIds === undefined,
        'H5 upload identity is configured in the platform console, not appIds/release',
      );
    assert(target.release === undefined || typeof target.release === 'boolean', 'BUILD_RELEASE');
    assert(
      !target.tapServices || platform === 'taptap',
      'TapTap services cannot be used on another platform',
    );
    const tapServices = Object.fromEntries(
      Object.entries(target.tapServices || {}).map(([game, value]) => {
        assert(h5AdGames.includes(game), 'Unknown TapTap services game');
        const service = validateTapServices(value);
        return [game, service];
      }),
    );
    return {
      ...target,
      tapServices,
      tapIdentityAppIds: validateTapIdentityAppIds(target.tapIdentityAppIds),
      release: false,
      adUnits: identifiers(target.adUnits, h5PackageGames, 'AD_UNITS'),
      modes: variants(target.ads ?? config.ads, target.backend ?? config.backend),
    };
  });
  return { ...config, modes, targets };
}

export function gameBuildPlan(config) {
  return config.targets.flatMap((target) =>
    config.games.flatMap((game) =>
      target.modes.map(([ads, backend]) => {
        const settings = gameBuildSettings(config, game);
        const job = {
          game,
          platform: target.platform,
          type: target.type,
          release: Boolean(target.release),
          ads,
          backend,
        };
        if (
          config.version === 2 &&
          ads &&
          !(target.type === 'h5' && additionalH5Games.includes(game))
        )
          assert(
            target.adUnits[game],
            `BUILD_AD_UNIT_REQUIRED: ${game}/${target.platform}/${target.type}`,
          );
        if (backend)
          validateService(
            config.buildType ? settings : config,
            settings.buildType !== 'production' &&
              target.type === 'h5' &&
              Boolean(config.localBackend),
          );
        assert(
          !backend || h5AdGames.includes(game) || h5BasicServiceGames.includes(game),
          `BUILD_SERVICE_UNSUPPORTED: ${game}/taptap/h5`,
        );
        return {
          ...job,
          ...(config.buildType ? { ...settings, apiUrl: backend ? settings.apiUrl : '' } : {}),
          delivery: 'upload-zip',
          effectiveAdsEnabled: ads && Boolean(target.adUnits[game]),
          ...(backend && target.tapIdentityAppIds?.[game]
            ? {
                identityProvider: 'taptap',
                identityAppId: target.tapIdentityAppIds[game],
              }
            : {}),
        };
      }),
    ),
  );
}

export async function main(
  args = process.argv.slice(2),
  { workspace = root, build = buildH5Packages, read = readFile, env = process.env } = {},
) {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string' },
      'build-type': { type: 'string' },
      help: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'pnpm build:games [--config path.mjs] [--build-type development|test|production] [--dry-run]\n按 game-build.local.mjs 选择 TapTap H5 包；单游戏 buildType 优先于命令行全局默认。\n兼容 --config path.js / path.json；默认 mjs 不存在时才读取旧 game-build.local.json。\n--dry-run 仅校验并列出构建计划。构建串行执行，不自动上传、提审或部署。\n说明：docs/operations/game-builds.md；模板：infra/builds/games.example.mjs。',
    );
    return;
  }
  let raw, source;
  let configFile = path.resolve(workspace, values.config ?? localConfig);
  try {
    try {
      source = await read(configFile, 'utf8');
    } catch (error) {
      if (values.config || error.code !== 'ENOENT') throw error;
      configFile = path.resolve(workspace, 'game-build.local.json');
      source = await read(configFile, 'utf8');
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw Error('BUILD_CONFIG_MISSING');
    throw Error('BUILD_CONFIG_INVALID');
  }
  try {
    const extension = path.extname(configFile);
    assert(['.mjs', '.js', '.json'].includes(extension));
    raw =
      extension === '.json'
        ? JSON.parse(source)
        : (await import(pathToFileURL(configFile).href)).default;
  } catch {
    throw Error('BUILD_CONFIG_INVALID');
  }
  const config = parseGameBuildConfig(
    values['build-type'] === undefined ? raw : { ...raw, buildType: values['build-type'] },
  );
  const jobs = gameBuildPlan(config);
  if (values['dry-run']) {
    const plan = {
      jobs,
    };
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  const batch = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(3).toString('hex')}`;
  if (config.version === 2) {
    workspace = await realpath(workspace);
    const output = path.join(workspace, 'outputs/game-builds', batch);
    await ordinaryDirectory(workspace, path.dirname(output));
    await mkdir(output);
    const targets = [];
    for (const target of config.targets) {
      const key = `${target.platform}-${target.type}`;
      const targetOutput = path.relative(workspace, path.join(output, key));
      const selected = jobs.filter(
        (job) => job.platform === target.platform && job.type === target.type,
      );
      console.log(
        `GAME_BUILD_SCOPE ${config.games.join(',')} target=${key} packages=${selected.length} quality_checks=not-run deployment=none`,
      );
      let result;
      {
        const buildEnv = {
          ...compilerEnvironment(env),
          COMPETITION_PUBLIC_API_URL: config.apiUrl ?? '',
        };
        for (const game of h5PackageGames) {
          buildEnv[`TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_AD_UNIT_ID`] =
            target.adUnits[game] ?? '';
          // The unified entry point follows explicit target configuration only.
          // The optional second slot remains a direct H5 CLI setting.
          buildEnv[`TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_INTERSTITIAL_AD_UNIT_ID`] =
            '';
        }
        for (const game of h5AdGames)
          buildEnv[tapServicesVariable(game)] = JSON.stringify(
            target.tapServices?.[game] || { enabled: false },
          );
        result = await build(
          {
            games: config.games,
            modes: target.modes,
            local: Boolean(config.localBackend),
            output: targetOutput,
            batch,
            tapIdentityAppIds: target.tapIdentityAppIds,
            ...(config.buildType
              ? {
                  gameSettings: Object.fromEntries(
                    config.games.map((game) => [game, gameBuildSettings(config, game)]),
                  ),
                }
              : {}),
          },
          { workspace, env: buildEnv, allowDirty: true, perGame: true, buildOnly: true },
        );
      }
      targets.push({
        platform: target.platform,
        type: target.type,
        directory: key,
        variants: result.variants,
      });
    }
    const summary = {
      version: 2,
      buildOnly: true,
      qualityChecks: 'not-run',
      platformAcceptance: 'not-run',
      targets,
    };
    await writeFile(path.join(output, 'builds.json'), JSON.stringify(summary, null, 2) + '\n', {
      flag: 'wx',
    });
    console.log(`GAME_BUILD_OUTPUT ${output}`);
    return { output, ...summary };
  }
  const buildEnv = {
    ...compilerEnvironment(env),
    COMPETITION_PUBLIC_API_URL: config.backend.includes(true) ? (config.apiUrl ?? '') : '',
  };
  for (const [game, id] of Object.entries(config.adUnits))
    buildEnv[`TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_AD_UNIT_ID`] = id;
  for (const game of h5PackageGames)
    buildEnv[`TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_INTERSTITIAL_AD_UNIT_ID`] = '';
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
      `GAME_BUILD_STOPPED ${error.code === 'ERR_ASSERTION' ? error.message : ['BUILD_CONFIG_MISSING', 'BUILD_CONFIG_INVALID'].includes(error.message) ? error.message : 'COMPILATION_OR_PACKAGE_FAILED'}`,
    );
    process.exitCode = 1;
  });
