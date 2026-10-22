import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  stat,
  rm,
  realpath,
  readdir,
  lstat,
  rename,
  unlink,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { h5AdGames, h5PackageGames, additionalH5Games, prepareH5Ads } from './h5-ad-config.mjs';
import { prepareH5Service } from './competition-h5-service.mjs';
import { h5BasicServiceGames, prepareGameServices } from './h5-game-services.mjs';
import {
  packageModes,
  h5Orientations,
  acceptanceSelection,
  productionCompetitionApi,
  localCompetitionApi,
} from './h5-taptap-matrix.mjs';
import { inventory, zipInventory, digest } from '../apps/shell-minigame/scripts/taptap-package.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
// Local ZIP-bomb protection for H5 verification. This is not a platform upload
// allowance; the native mini-game verifier keeps its separate 20 MiB budget.
export const h5ExpandedBudgetBytes = 256 * 1024 * 1024;
const retained = 'h5-packages';
export function compilerEnvironment(env = process.env) {
  const allowed =
    /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|LANG|LC_[A-Z_]+|CI|COCOS_CREATOR|KART_PREBUILT_DIR|NIGHT_OVERWATCH_PREBUILT_DIR|HOMEBOUND_STATION_PREBUILT_DIR|MERGE_FRONT_PREBUILT_DIR|TETRACUBE_PREBUILT_DIR|H5_ADS_ENABLED|COMPETITION_SERVICE_ENABLED|COMPETITION_PUBLIC_API_URL|TAPTAP_(?:COPS_ROBBERS|COPS_ROBBERS_REALTIME|XIANGQI_FIVE|CARDING_CAR|VIBEJAM_MYSELF_HISTORY_GUESS|WULONG_CITY|NIGHT_OVERWATCH|TRAVEL_BUND|LETTERS_WORDS2|HOMEBOUND_STATION|MERGE_FRONT|TETRACUBE)_(?:AD_UNIT_ID|SERVICES))$/i;
  return {
    ...Object.fromEntries(
      Object.keys(env)
        .filter((name) => allowed.test(name))
        .map((name) => [name, env[name]]),
    ),
    NODE_OPTIONS: '--max-old-space-size=512',
    UV_THREADPOOL_SIZE: '1',
  };
}
const inside = (base, target) => {
  const relative = path.relative(base, target);
  return (
    relative !== '' &&
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
  );
};
const git = (workspace, args, optional = false) => {
  try {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: workspace,
      env: compilerEnvironment(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    }).trim();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
};
export async function ordinaryDirectory(base, destination) {
  assert(destination === base || inside(base, destination), 'Directory escaped workspace');
  let current = base;
  for (const component of path.relative(base, destination).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      const info = await lstat(current);
      assert(info.isDirectory() && !info.isSymbolicLink(), 'Output directory cannot be a link');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
}

// Classic deterministic ZIP, using Node's built-in zlib and the existing inventory reader.
export async function writeH5Zip(source, files, destination) {
  assert(files.length < 65535, 'ZIP file count limit');
  const chunks = [],
    central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from('dist/' + file.path),
      bytes = await readFile(path.join(source, file.path)),
      compressed = deflateRawSync(bytes),
      crc = crc32(bytes);
    assert(
      name.length < 65536 && bytes.length < 0x100000000 && offset < 0x100000000,
      'ZIP size limit',
    );
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x2821, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0x2821, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    chunks.push(header, name, compressed);
    central.push(entry, name);
    offset += header.length + name.length + compressed.length;
  }
  const index = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(destination, Buffer.concat([...chunks, index, end]), { flag: 'wx' });
}

async function cleanGeneratedOutput(gameRoot) {
  const output = path.join(gameRoot, 'dist');
  await ordinaryDirectory(gameRoot, output);
  for (const entry of await readdir(output, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Generated output cannot contain links');
    if (entry.name === retained) {
      assert(entry.isDirectory(), 'Retained output must be a directory');
      continue;
    }
    const target = path.resolve(output, entry.name);
    assert(
      inside(output, target) && inside(gameRoot, await realpath(target)),
      'Generated output escaped',
    );
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  return output;
}

async function moveGeneratedDirectory(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) ||
        attempt >= 300
      )
        throw error;
      await delay(100);
    }
  }
}

async function pathInfo(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function recoverRetainedPackages(workspace, gameRoot, game) {
  const recovery = path.join(workspace, 'outputs', '.h5-package-recovery');
  await ordinaryDirectory(workspace, recovery);
  const record = path.join(recovery, game + '.json'),
    info = await pathInfo(record);
  if (!info) return record;
  assert(
    info.isFile() && !info.isSymbolicLink() && info.size < 8192,
    'Invalid retained output record',
  );
  const value = JSON.parse(await readFile(record, 'utf8'));
  assert(
    value.version === 1 &&
      value.game === game &&
      Number.isSafeInteger(value.pid) &&
      value.pid > 0 &&
      typeof value.holding === 'string',
    'Invalid retained output record',
  );
  let active = true;
  try {
    process.kill(value.pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') active = false;
    else throw error;
  }
  assert(!active, 'Another build owns retained output');
  const holding = path.resolve(workspace, value.holding),
    original = path.join(gameRoot, 'dist', retained);
  assert(
    inside(path.join(workspace, 'outputs'), holding) &&
      path.basename(holding) === '.retained-' + game,
    'Invalid retained output path',
  );
  const held = await pathInfo(holding),
    old = await pathInfo(original);
  assert(
    !held ||
      (held.isDirectory() &&
        !held.isSymbolicLink() &&
        inside(path.join(workspace, 'outputs'), await realpath(holding))),
    'Invalid retained output path',
  );
  assert(!old || (old.isDirectory() && !old.isSymbolicLink()), 'Invalid retained output directory');
  assert(Boolean(held) !== Boolean(old), 'Retained output recovery is ambiguous');
  if (held) {
    await ordinaryDirectory(gameRoot, path.join(gameRoot, 'dist'));
    await moveGeneratedDirectory(holding, original);
  }
  await unlink(record);
  console.log(`GAME_BUILD_RECOVERED ${game}`);
  return record;
}

async function retainPackages(workspace, gameRoot, output, game) {
  const record = await recoverRetainedPackages(workspace, gameRoot, game);
  const original = path.join(gameRoot, 'dist', retained),
    holding = path.join(output, '.retained-' + game);
  try {
    const info = await lstat(original);
    assert(
      info.isDirectory() && !info.isSymbolicLink() && inside(gameRoot, await realpath(original)),
      'Retained output cannot escape game',
    );
  } catch (error) {
    if (error.code === 'ENOENT') return async () => {};
    throw error;
  }
  assert(inside(output, holding) && inside(gameRoot, original), 'Retained move escaped');
  await assert.rejects(lstat(holding), { code: 'ENOENT' });
  await writeFile(
    record,
    JSON.stringify({
      version: 1,
      game,
      pid: process.pid,
      holding: path.relative(workspace, holding),
    }),
    { flag: 'wx' },
  );
  await moveGeneratedDirectory(original, holding);
  return async () => {
    await ordinaryDirectory(gameRoot, path.join(gameRoot, 'dist'));
    await assert.rejects(lstat(original), { code: 'ENOENT' });
    assert(inside(output, await realpath(holding)), 'Retained restore escaped');
    await moveGeneratedDirectory(holding, original);
    await unlink(record);
  };
}

export async function buildH5Packages(
  values,
  {
    workspace = root,
    env = process.env,
    allowDirty = false,
    perGame = false,
    buildOnly = false,
    compile,
    zip = writeH5Zip,
  } = {},
) {
  // Reject incompatible acceptance requests before even creating an output directory.
  const selection = acceptanceSelection(values);
  if (selection) {
    const expectedApi = values.local ? localCompetitionApi : productionCompetitionApi;
    assert.equal(
      env.COMPETITION_PUBLIC_API_URL,
      expectedApi,
      'Acceptance profile requires its exact API',
    );
    assert(!allowDirty && !buildOnly, 'Acceptance profiles require a clean complete candidate');
  }
  workspace = await realpath(workspace);
  const games =
    selection?.games ?? values.games ?? (values.game === 'all' ? h5AdGames : [values.game]);
  assert(
    games.length &&
      new Set(games).size === games.length &&
      games.every((game) => h5PackageGames.includes(game)),
    'Unknown or empty H5 game selection',
  );
  const sourceSHA = git(workspace, ['rev-parse', 'HEAD'], allowDirty),
    dirty = git(workspace, ['status', '--porcelain', '--ignore-submodules=none'], allowDirty);
  if (!allowDirty) assert.equal(dirty, '', 'Commit source changes before packaging');
  const sourceDirty = dirty === null ? 'unknown' : Boolean(dirty);
  const requestedModes = selection?.modes ?? values.modes ?? packageModes(values, env);
  assert(
    !requestedModes.some(([, service]) => service) ||
      games.every((game) => h5AdGames.includes(game) || h5BasicServiceGames.includes(game)),
    'Selected H5 games do not support the competition backend',
  );
  let submoduleSHA = null;
  if (games.includes('xiangqi-five')) {
    const child = path.join(workspace, 'games/submodules/xiangqi-five'),
      top = git(child, ['rev-parse', '--show-toplevel'], allowDirty);
    if (top && (await realpath(top)) === (await realpath(child)))
      submoduleSHA = git(child, ['rev-parse', 'HEAD'], allowDirty);
    else if (!allowDirty) throw Error('Missing xiangqi-five submodule checkout');
  }
  const output = path.resolve(
    workspace,
    values.output || `outputs/h5-taptap/${sourceSHA?.slice(0, 12) || 'uncommitted'}-${Date.now()}`,
  );
  assert(inside(path.join(workspace, 'outputs'), output), 'Package output must be under outputs');
  await ordinaryDirectory(workspace, path.dirname(output));
  await mkdir(output, { recursive: false });
  const modes = selection?.modes ?? values.modes ?? packageModes(values, env),
    manifests = [];
  assert(
    modes.length &&
      modes.every((pair) => pair.length === 2 && pair.every((value) => typeof value === 'boolean')),
    'Choose ads and backend variants',
  );
  const batch = values.batch ?? path.basename(output);
  assert(/^[A-Za-z0-9_-]+$/.test(batch), 'Invalid batch');
  for (const game of games) {
    const gameRoot = await realpath(
      path.join(
        workspace,
        game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${game}`,
      ),
    );
    assert(inside(workspace, gameRoot), 'Game directory escaped workspace');
    const prebuiltKey = {
      'carding-car': 'KART_PREBUILT_DIR',
      'night-overwatch': 'NIGHT_OVERWATCH_PREBUILT_DIR',
      'homebound-station': 'HOMEBOUND_STATION_PREBUILT_DIR',
      'merge-front': 'MERGE_FRONT_PREBUILT_DIR',
      tetracube: 'TETRACUBE_PREBUILT_DIR',
    }[game];
    let prebuilt;
    if (prebuiltKey && env[prebuiltKey]) {
      // Snapshot a verified artifact before cleaning dist, including when the
      // caller reuses this very project. Later variants reuse this immutable copy.
      const { verifyPrebuilt } = await import(
        pathToFileURL(path.join(gameRoot, 'scripts/artifact.mjs'))
      );
      const source = await verifyPrebuilt(path.resolve(env[prebuiltKey]));
      prebuilt = path.join(output, `verified-prebuilt-${game}`);
      await mkdir(prebuilt);
      await cp(source, path.join(prebuilt, 'dist'), {
        recursive: true,
        filter: async (file) => {
          assert(!(await lstat(file)).isSymbolicLink(), 'Prebuilt output cannot contain links');
          return path.relative(source, file).split(path.sep)[0] !== retained;
        },
      });
      if (game === 'night-overwatch' || game === 'tetracube')
        await cp(
          path.join(path.resolve(env[prebuiltKey]), 'cc.d.ts'),
          path.join(prebuilt, 'cc.d.ts'),
        );
    }
    const restorePackages = await retainPackages(workspace, gameRoot, output, game);
    const gameManifests = [];
    try {
      for (const [ads, service] of modes) {
        const name = `${game}${buildOnly ? '-taptap-h5' : ''}-ads-${ads ? 'on' : 'off'}-service-${service ? 'on' : 'off'}`;
        const directory = path.join(output, name),
          dist = path.join(directory, 'dist');
        const buildEnv = compilerEnvironment({
          ...compilerEnvironment(env),
          H5_ADS_ENABLED: ads ? '1' : '0',
          COMPETITION_SERVICE_ENABLED: service ? '1' : '0',
          ...(prebuilt ? { [prebuiltKey]: prebuilt } : {}),
        });
        const buildOutput = await cleanGeneratedOutput(gameRoot);
        if (compile) await compile({ game, gameRoot, buildOutput, env: buildEnv });
        else
          execFileSync(
            process.execPath,
            additionalH5Games.includes(game)
              ? [path.join(workspace, 'scripts/h5-game-build.mjs'), game]
              : [game === 'xiangqi-five' ? 'build.js' : 'scripts/build.mjs'],
            { cwd: gameRoot, env: buildEnv, stdio: 'inherit', timeout: 1200000 },
          );
        await mkdir(directory);
        await cp(buildOutput, dist, {
          recursive: true,
          filter: async (filename) => {
            const rel = path.relative(buildOutput, filename);
            if (rel === retained || rel.startsWith(retained + path.sep)) return false;
            assert(!(await lstat(filename)).isSymbolicLink(), 'Build output cannot contain links');
            return true;
          },
        });
        const adConfig = await prepareH5Ads(game, dist, { env: buildEnv }),
          serviceConfig = h5AdGames.includes(game)
            ? await prepareH5Service(game, dist, {
                env: buildEnv,
                local: Boolean(values.local),
                identityMode: 'persistent',
              })
            : h5BasicServiceGames.includes(game)
              ? await prepareGameServices(game, dist, {
                  env: buildEnv,
                  local: Boolean(values.local),
                })
              : { apiUrl: '' },
          files = await inventory(dist);
        assert(
          files.some((file) => file.path === 'index.html'),
          'Missing compiler entry',
        );
        const zipPath = path.join(output, name + '.zip');
        await zip(dist, files, zipPath);
        const bytes = await readFile(zipPath);
        assert.deepEqual(
          zipInventory(bytes, { maxBytes: h5ExpandedBudgetBytes }),
          files
            .map((file) => ({ ...file, path: 'dist/' + file.path }))
            .sort((a, b) => a.path.localeCompare(b.path)),
          'ZIP must match this build output',
        );
        const manifest = {
          profile: selection?.profile ?? null,
          identityMode: 'persistent',
          name,
          game,
          platform: 'taptap-h5',
          packageType: 'h5',
          entry: 'dist/index.html',
          orientation: h5Orientations[game],
          orientationVerified: false,
          adsEnabled: ads,
          effectiveAdsEnabled: adConfig.adsEnabled,
          adMode: adConfig.adMode,
          adUnitConfigured: Boolean(adConfig.adUnitId),
          serviceEnabled: service,
          apiUrl: serviceConfig.apiUrl,
          localValidation: Boolean(values.local),
          sourceSHA,
          sourceDirty,
          submoduleSHA,
          zip: path.basename(zipPath),
          bytes: (await stat(zipPath)).size,
          sha256: digest(bytes),
          files,
          buildOnly,
          qualityChecks: 'not-run',
          realAdsVerified: false,
          realDeviceVerified: false,
        };
        if (perGame) {
          const gameOutput = path.join(buildOutput, retained, batch);
          manifest.gameOutput = path.relative(workspace, gameOutput).split(path.sep).join('/');
        }
        await writeFile(
          path.join(output, name + '.json'),
          JSON.stringify(manifest, null, 2) + '\n',
          {
            flag: 'wx',
          },
        );
        manifests.push(manifest);
        gameManifests.push(manifest);
        console.log(`Built ${name}: ${manifest.sha256}`);
      }
    } finally {
      await restorePackages();
    }
    if (perGame) {
      const gameOutput = path.join(gameRoot, 'dist', retained, batch);
      await ordinaryDirectory(gameRoot, gameOutput);
      for (const manifest of gameManifests) {
        await cp(path.join(output, manifest.name), path.join(gameOutput, manifest.name), {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
        await cp(path.join(output, manifest.zip), path.join(gameOutput, manifest.zip), {
          errorOnExist: true,
          force: false,
        });
        await cp(
          path.join(output, manifest.name + '.json'),
          path.join(gameOutput, manifest.name + '.json'),
          { errorOnExist: true, force: false },
        );
      }
    }
  }
  const matrix = {
    profile: selection?.profile ?? null,
    sourceSHA,
    sourceDirty,
    submoduleSHA,
    buildOnly,
    qualityChecks: 'not-run',
    variants: manifests,
  };
  await writeFile(path.join(output, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n', {
    flag: 'wx',
  });
  console.log(`H5_MATRIX ${output}`);
  return { output, ...matrix };
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      game: { type: 'string', default: 'all' },
      profile: { type: 'string' },
      matrix: { type: 'boolean' },
      'with-ads': { type: 'boolean' },
      'without-ads': { type: 'boolean' },
      'with-service': { type: 'boolean' },
      'without-service': { type: 'boolean' },
      local: { type: 'boolean' },
      output: { type: 'string' },
    },
  });
  return await buildH5Packages(values);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(() => {
    console.error('H5_BUILD_FAILED');
    process.exitCode = 1;
  });
