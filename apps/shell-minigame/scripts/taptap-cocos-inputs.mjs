import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { prepareNativeProject } from './night-native-project.mjs';
import { digest, inventory, localPath, zipInventory } from './taptap-package.mjs';
import { prepareTapTapCocosLogin, buildTapTapCocosTarget } from './taptap-cocos.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
export const officialPluginSha256 =
  '6b8a9a3cc62b6c54cefab397097babb771d9d99f90442cddff06310a4c9ed73f';
const games = ['carding-car', 'night-overwatch'];
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

/** Authenticate distribution bytes before executing any downloaded plugin code.
 * npm dependencies are installed separately from the archive's frozen locks. */
export async function verifyPlugin(archive, directory) {
  const bytes = await readFile(await localPath(archive, 'file'));
  assert.equal(digest(bytes), officialPluginSha256, 'Official TapTap v1.2.2 archive changed');
  // The editor extension contains bundled dependencies (~51 MB expanded).
  // This tooling limit does not change the game's strict <20 MiB package gate.
  const expected = zipInventory(bytes, { maxBytes: 128 * 1024 * 1024 })
    .filter((file) => !file.path.includes('/node_modules/'))
    .map((file) => ({ ...file, path: file.path.replace(/^taptap-minigame-tools\//, '') }));
  const actual = (await inventory(await localPath(directory))).filter(
    (file) => !/(^|\/)node_modules\//.test(file.path),
  );
  assert.deepEqual(actual, expected, 'Installed official plugin distribution changed');
  return expected;
}

export function verifyProducer(actual, expected) {
  for (const key of ['sha', 'repository', 'runId', 'runAttempt']) {
    assert(expected[key], `Missing trusted producer context: ${key}`);
    assert.equal(actual[key], expected[key], `TapTap producer mismatch: ${key}`);
  }
  assert.equal(actual.candidateClean, true, 'TapTap inputs were captured from a dirty candidate');
}

async function current(game) {
  assert(games.includes(game), 'Select a reviewed Cocos TapTap game');
  const gameRoot = path.join(repo, 'games/local', game);
  const source = await prepareNativeProject(gameRoot);
  return { gameRoot, ...source };
}

/** Transport receipts bind the raw outputs; they never assert runtime acceptance. */
export async function captureInputs({
  game,
  source,
  converted,
  plugin,
  archive,
  output,
  env = process.env,
}) {
  source = await localPath(source);
  converted = await localPath(converted);
  await verifyPlugin(archive, plugin);
  const provenance = await current(game);
  const info = await json(path.join(source, 'build-info.json'));
  assert.equal(info.creator, '3.8.8', 'Creator source version mismatch');
  assert.equal(info.target, 'wechatgame', 'Creator source target mismatch');
  assert.equal(info.sourceHash, provenance.sourceHash, 'Creator source fingerprint mismatch');
  const sourceFiles = await inventory(source);
  assert(
    sourceFiles.some((file) => /(?:^|\/)settings(?:\.[\w-]+)?\.(json|js)$/.test(file.path)),
    'Real Creator settings required',
  );
  const rawFiles = await inventory(converted);
  const packageFile = path.join(path.dirname(converted), 'game.zip');
  assert.deepEqual(
    zipInventory(await readFile(packageFile)),
    rawFiles,
    'Raw official ZIP differs from conversion output',
  );
  output = path.resolve(output);
  for (const input of [source, converted, plugin, archive].map((file) => path.resolve(file))) {
    const a = output.toLowerCase(),
      b = input.toLowerCase();
    assert(
      a !== b && !a.startsWith(b + path.sep) && !b.startsWith(a + path.sep),
      'TapTap capture output overlaps supplied inputs',
    );
  }
  // Never adopt or remove an existing destination; plugin conversion is also
  // confined to a fresh, exclusively owned directory by --build below.
  await mkdir(path.dirname(output), { recursive: true });
  await localPath(path.dirname(output));
  await mkdir(output);
  await cp(source, path.join(output, 'source'), { recursive: true });
  await cp(converted, path.join(output, 'converted'), { recursive: true });
  await cp(packageFile, path.join(output, 'raw-game.zip'));
  await cp(archive, path.join(output, 'plugin.zip'));
  const receipt = {
    game,
    canonicalSourceHash: provenance.canonicalSourceHash,
    sourceHash: provenance.sourceHash,
    ...(provenance.adaptationRecipeSha256
      ? { adaptationRecipeSha256: provenance.adaptationRecipeSha256 }
      : {}),
    sourceDirectory: path.join(output, 'source'),
    files: sourceFiles,
  };
  assert.deepEqual(
    await inventory(path.join(output, 'source')),
    sourceFiles,
    'Source copy changed',
  );
  assert.deepEqual(
    await inventory(path.join(output, 'converted')),
    rawFiles,
    'Conversion copy changed',
  );
  await save(path.join(output, 'source-inventory.json'), receipt);
  let loginError;
  try {
    await prepareTapTapCocosLogin({
      convertedDirectory: path.join(output, 'converted'),
      outputDirectory: path.join(output, 'login'),
      config: { platform: 'taptap', game, appId: '', apiUrl: '', preview: true },
    });
  } catch (error) {
    loginError = error.message;
  }
  const prefix = `MINIGAME_${game.toUpperCase().replaceAll('-', '_')}_TAPTAP_`;
  const inputs = {
    [prefix + 'SOURCE_DIR']: path.join(output, 'source'),
    [prefix + 'SOURCE_INVENTORY']: path.join(output, 'source-inventory.json'),
    [prefix + 'CONVERTED_DIR']: path.join(output, loginError ? 'converted' : 'login'),
    [prefix + 'PLUGIN_DIR']: plugin,
    // Raw ZIP predates the login stage. Never offer it as that stage's package.
    [prefix + 'PACKAGE_FILE']: '',
  };
  await save(path.join(output, 'inputs.json'), inputs);
  await writeFile(
    path.join(output, 'use-inputs.ps1'),
    Object.entries(inputs)
      .map(([key, value]) => `$env:${key} = '${value.replaceAll("'", "''")}'`)
      .join('\n') + '\n',
    { flag: 'wx' },
  );
  const manifest = {
    schemaVersion: 1,
    game,
    creator: '3.8.8',
    pluginSha256: officialPluginSha256,
    producer: {
      sha: git('rev-parse', 'HEAD'),
      repository: env.GITHUB_REPOSITORY || 'local',
      runId: env.GITHUB_RUN_ID || 'local',
      runAttempt: env.GITHUB_RUN_ATTEMPT || 'local',
      candidateClean: git('status', '--porcelain', '--untracked-files=normal') === '',
    },
    canonicalSourceHash: receipt.canonicalSourceHash,
    sourceHash: receipt.sourceHash,
    adaptationRecipeSha256: receipt.adaptationRecipeSha256,
    rawPackageSha256: digest(await readFile(packageFile)),
    loginError: loginError || null,
    files: await inventory(output),
    officialToolVerified: false,
    realDeviceVerified: false,
  };
  await save(path.join(output, 'inputs-manifest.json'), manifest);
  return { output, manifest, inputs };
}

/** Verify same-run, exact-SHA bytes BEFORE using paths or plugin code. */
export async function verifyInputs(directory, plugin, archive, env = process.env) {
  directory = await localPath(path.resolve(directory));
  const manifest = await json(path.join(directory, 'inputs-manifest.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert(games.includes(manifest.game), 'Unreviewed TapTap bundle game');
  verifyProducer(manifest.producer, {
    sha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
  });
  assert.equal(git('rev-parse', 'HEAD'), env.GITHUB_SHA, 'Consumer checkout SHA mismatch');
  assert.deepEqual(
    (await inventory(directory)).filter((file) => file.path !== 'inputs-manifest.json'),
    manifest.files,
    'TapTap transport inventory changed',
  );
  assert.equal(manifest.pluginSha256, officialPluginSha256);
  assert.equal(digest(await readFile(path.join(directory, 'plugin.zip'))), officialPluginSha256);
  await verifyPlugin(archive, plugin);
  const provenance = await current(manifest.game);
  for (const key of ['canonicalSourceHash', 'sourceHash', 'adaptationRecipeSha256'])
    assert.equal(manifest[key], provenance[key], `TapTap native provenance mismatch: ${key}`);
  const prefix = `MINIGAME_${manifest.game.toUpperCase().replaceAll('-', '_')}_TAPTAP_`;
  const inputs = {
    ...env,
    [prefix + 'SOURCE_DIR']: path.join(directory, 'source'),
    [prefix + 'SOURCE_INVENTORY']: path.join(directory, 'source-inventory.json'),
    [prefix + 'CONVERTED_DIR']: path.join(directory, manifest.loginError ? 'converted' : 'login'),
    [prefix + 'PLUGIN_DIR']: plugin,
    [prefix + 'PACKAGE_FILE']: '',
  };
  return buildTapTapCocosTarget(
    { id: manifest.game, directory: `games/local/${manifest.game}`, cocos: true },
    { platform: 'taptap', game: manifest.game, appId: '', apiUrl: '', preview: true },
    { env: inputs, outputRoot: path.join(repo, '.scratch/taptap-ci-import') },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      game: { type: 'string' },
      'source-dir': { type: 'string' },
      'converted-dir': { type: 'string' },
      'plugin-dir': { type: 'string' },
      'plugin-archive': { type: 'string' },
      output: { type: 'string' },
      build: { type: 'boolean' },
      verify: { type: 'string' },
    },
  });
  const plugin = path.resolve(values['plugin-dir']),
    archive = path.resolve(values['plugin-archive']);
  if (values.verify) await verifyInputs(values.verify, plugin, archive);
  else {
    let source = values['source-dir'] && path.resolve(values['source-dir']);
    let converted = values['converted-dir'] && path.resolve(values['converted-dir']);
    if (values.build) {
      await verifyPlugin(archive, plugin);
      const stage = await current(values.game);
      const work = path.resolve(values.output + '-build');
      for (const input of [stage.projectRoot, plugin, archive]) {
        const a = work.toLowerCase(),
          b = path.resolve(input).toLowerCase();
        assert(
          a !== b && !a.startsWith(b + path.sep) && !b.startsWith(a + path.sep),
          'Creator work output overlaps supplied inputs',
        );
      }
      await mkdir(path.dirname(work), { recursive: true });
      await localPath(path.dirname(work));
      await mkdir(work);
      const result = spawnSync(
        process.execPath,
        [path.join(stage.projectRoot, 'scripts/build.mjs'), 'wechatgame'],
        { cwd: repo, stdio: 'inherit', windowsHide: true },
      );
      assert.equal(result.status, 0, 'Real Creator build failed');
      source = path.join(stage.projectRoot, 'build/wechatgame');
      const { convertWechatToTap } = createRequire(import.meta.url)(
        path.join(plugin, 'dist/converter-ts.js'),
      );
      await convertWechatToTap({
        source,
        target: path.join(work, 'TapBuild'),
        useSubpackage: false,
        gameVersion: '0.1.0',
      });
      converted = path.join(work, 'TapBuild/game');
    }
    const result = await captureInputs({
      game: values.game,
      source,
      converted,
      plugin,
      archive,
      output: values.output,
    });
    console.log(
      JSON.stringify(
        {
          output: result.output,
          game: result.manifest.game,
          loginError: result.manifest.loginError,
          candidateClean: result.manifest.producer.candidateClean,
        },
        null,
        2,
      ),
    );
  }
}
