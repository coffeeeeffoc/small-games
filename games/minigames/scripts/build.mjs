import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { root, repo, games, configuration, creatorVersion } from './config.mjs';
import { prepareGame, copyRuntimeAssets, fingerprint } from './prepare.mjs';
import { editor, editorRoot, runCreator } from '../../local/carding-car/scripts/toolchain.mjs';
import {
  digest,
  inventory,
  zipInventory,
  verifyTapProject,
} from '../../../apps/shell-minigame/scripts/taptap-package.mjs';
import {
  verifyPlugin,
  officialPluginSha256,
} from '../../../apps/shell-minigame/scripts/taptap-cocos-inputs.mjs';
import { installTapTapLogin } from '../../../apps/shell-minigame/scripts/taptap-login.mjs';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
export async function runCheckedConversion(convert, options) {
  const output = [],
    originals = new Map();
  for (const name of ['log', 'warn', 'error']) {
    originals.set(name, console[name]);
    console[name] = (...args) => {
      output.push(args.map(String).join(' '));
      originals.get(name).apply(console, args);
    };
  }
  try {
    const result = await convert(options);
    // Official v1.2.2 returns successfully when only SOME Babel files fail.
    assert(
      !/\[Babel\] 转换失败:|Babel转换完成:.*失败 [1-9]\d*/.test(output.join('\n')),
      'Official TapTap converter reported partial Babel failures',
    );
    return result;
  } finally {
    for (const [name, method] of originals) console[name] = method;
  }
}
export function pluginPaths(env = process.env) {
  return {
    archive: path.resolve(env.TAPTAP_PLUGIN_ARCHIVE || path.join(root, '.tools/taptap.zip')),
    directory: path.resolve(
      env.TAPTAP_PLUGIN_DIR || path.join(root, '.tools/taptap/taptap-minigame-tools'),
    ),
  };
}
export async function verifyCreatorOutput(directory, config, { source = false } = {}) {
  const files = await inventory(directory),
    names = new Set(files.map((f) => f.path));
  assert(
    names.has(config.platform === 'web-preview' ? 'index.html' : 'game.js'),
    'Actual Creator entry is missing',
  );
  assert(
    files.some((f) => /(?:^|\/)settings(?:\.[\w-]+)?\.(json|js)$/.test(f.path)),
    'Actual Creator settings are missing',
  );
  if (config.platform === 'web-preview') return { files };
  const game = await json(path.join(directory, 'game.json'));
  assert.equal(game.deviceOrientation, config.orientation, 'Native orientation mismatch');
  const roots = (game.subpackages || game.subPackages || []).map(
    (item) => (item.root || item.name).replace(/\/$/, '') + '/',
  );
  for (const prefix of roots) assert(names.has(prefix + 'game.js'), 'Subpackage entry is missing');
  const mainBytes = files
    .filter((f) => !roots.some((prefix) => f.path.startsWith(prefix)))
    .reduce((n, f) => n + f.bytes, 0);
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  const mainLimit =
    config.platform === 'taptap'
      ? 20_000_000
      : config.platform === 'kuaishou'
        ? 6_000_000
        : // Match the repository's existing Creator main-package budget: 4 MiB.
          4 * 1024 * 1024;
  assert(
    mainBytes <= mainLimit &&
      totalBytes <= (config.platform === 'kuaishou' ? 30_000_000 : 20_000_000),
    `Package budget exceeded: main=${mainBytes} (limit ${mainLimit}), total=${totalBytes}`,
  );
  if (
    config.platform !== 'alipay' &&
    config.platform !== 'kuaishou' &&
    !(config.platform === 'taptap' && !source)
  ) {
    const project = await json(path.join(directory, 'project.config.json'));
    const expected =
      source && ['taptap', 'kuaishou'].includes(config.platform)
        ? 'touristappid'
        : config.appId ||
          (config.platform === 'bilibili'
            ? 'preview-only'
            : config.platform === 'wechat'
              ? 'touristappid'
              : '');
    assert.equal(project.appid, expected, 'Creator output AppID mismatch');
  }
  return { files, mainBytes, totalBytes };
}

async function typecheck(prepared) {
  const declarations = [
    process.env.COCOS_ENGINE_TYPES,
    path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
    path.resolve(editorRoot, '../Resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
  ].find((file) => file && existsSync(file));
  assert(declarations, 'Real Creator engine declarations missing; run setup with Creator 3.8.8');
  const enginePackage = await json(path.resolve(path.dirname(declarations), '../../package.json'));
  assert.equal(enginePackage.version, creatorVersion, 'The selected Creator engine is not 3.8.8');
  await writeFile(
    path.join(prepared.project, 'reports/engine.d.ts'),
    `/// <reference path=${JSON.stringify(declarations.replaceAll('\\', '/'))} />\n`,
  );
  const resolve = createRequire(path.join(repo, 'games/local/carding-car/package.json'));
  execFileSync(
    process.execPath,
    [
      path.join(path.dirname(resolve.resolve('typescript/package.json')), 'bin/tsc'),
      '-p',
      prepared.project,
    ],
    { cwd: repo, stdio: 'inherit' },
  );
}

export async function buildGame(config, options = {}) {
  const prepared = await prepareGame(config);
  if (options.prepareOnly)
    return {
      status: 'prepared-no-engine-output',
      game: config.game,
      platform: config.platform,
      sourceHash: prepared.sourceHash,
      configFile: prepared.configFile,
    };
  if (config.platform === 'kuaishou' && !options.prepareSource)
    throw new Error(
      'Kuaishou needs official DevTools conversion. Run --prepare-source, then scripts/import-kuaishou.mjs with the real converted directory.',
    );
  assert(
    existsSync(editor),
    'Install real Cocos Creator 3.8.8 and set COCOS_CREATOR (Windows/macOS). No engine artifact was built.',
  );
  if (config.platform === 'bilibili')
    assert(
      existsSync(path.join(prepared.project, 'extensions/biligame-builder/package.json')),
      'Run setup.mjs --bilibili to install the official extension',
    );
  await typecheck(prepared);
  const source = path.join(prepared.project, 'build', prepared.engineConfig.outputName);
  await rm(source, { recursive: true, force: true });
  if (config.platform === 'bilibili')
    await rm(path.join(prepared.project, 'build/biligame'), { recursive: true, force: true });
  const built = await runCreator(
    ['--project', prepared.project, '--build', `configPath=${prepared.configFile}`],
    path.join(prepared.project, 'reports', `build-${config.platform}.log`),
  );
  assert(
    [0, 36].includes(built.code) &&
      !/Missing class:|Build failed|The (?:referenced|attached) script.*(?:missing|invalid)/i.test(
        built.output,
      ),
    'Creator build failed; inspect the real build log',
  );
  let directory =
    config.platform === 'bilibili' ? path.join(prepared.project, 'build/biligame') : source;
  await copyRuntimeAssets(config, directory);
  await verifyCreatorOutput(directory, config, { source: true });
  let conversion;
  if (config.platform === 'taptap') {
    const plugin = pluginPaths();
    await verifyPlugin(plugin.archive, plugin.directory);
    const stage = path.join(prepared.project, 'build/taptap-stage');
    await rm(stage, { recursive: true, force: true });
    await cp(source, stage, { recursive: true });
    const game = await json(path.join(stage, 'game.json')),
      project = await json(path.join(stage, 'project.config.json'));
    game.appId = config.appId;
    if ('appid' in game) game.appid = config.appId;
    project.appid = config.appId;
    await save(path.join(stage, 'game.json'), game);
    await save(path.join(stage, 'project.config.json'), project);
    // Install login BEFORE the official converter packs the archive; never rewrite its ZIP.
    await installTapTapLogin(stage, config);
    const conversionRoot = path.join(prepared.project, 'build/taptap');
    await rm(conversionRoot, { recursive: true, force: true });
    const { convertWechatToTap } = createRequire(import.meta.url)(
      path.join(plugin.directory, 'dist/converter-ts.js'),
    );
    await runCheckedConversion(convertWechatToTap, {
      source: stage,
      target: conversionRoot,
      useSubpackage: false,
      gameVersion: '0.1.0',
    });
    directory = path.join(conversionRoot, 'game');
    const zip = await readFile(path.join(conversionRoot, 'game.zip'));
    assert.deepEqual(
      zipInventory(zip),
      await inventory(directory),
      'Official ZIP differs from the converted project',
    );
    await verifyTapProject({
      directory,
      appId: config.appId,
      mode: config.preview ? 'preview' : 'release',
      orientation: config.orientation,
    });
    conversion = {
      officialPluginSha256,
      packageSha256: digest(zip),
      sourceFiles: await inventory(source),
      stagedFiles: await inventory(stage),
    };
  }
  const checked = await verifyCreatorOutput(directory, config, {
    source: config.platform === 'kuaishou',
  });
  const afterBuild = await fingerprint(
    prepared.files.map((f) => f.path),
    config,
  );
  // Report the actual changed input paths before the aggregate hash, so an
  // editor metadata migration can be diagnosed without weakening source checks.
  assert.deepEqual(afterBuild.files, prepared.files, 'Sources changed during the engine build');
  assert.equal(afterBuild.sourceHash, prepared.sourceHash);
  const receipt = {
    schema: 1,
    creator: creatorVersion,
    config,
    sourceHash: prepared.sourceHash,
    inputs: prepared.files,
    gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    repository: process.env.GITHUB_REPOSITORY || 'local',
    runId: process.env.GITHUB_RUN_ID || 'local',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || 'local',
    files: checked.files,
    mainBytes: checked.mainBytes,
    totalBytes: checked.totalBytes,
    conversion,
    realDeviceVerified: false,
    status:
      config.platform === 'kuaishou'
        ? 'creator-source-awaiting-official-conversion'
        : config.preview
          ? 'preview-build'
          : 'build-awaiting-platform-acceptance',
  };
  const receiptPath = path.join(prepared.project, 'build', `${config.platform}.receipt.json`);
  await save(receiptPath, receipt);
  return { directory, receiptPath, ...receipt };
}

export async function verifyArtifact(directory, receiptFile) {
  const receipt = await json(receiptFile);
  assert.equal(receipt.schema, 1);
  assert.equal(receipt.creator, creatorVersion);
  // Re-resolve all actual imports: a manifest cannot silently omit a changed dependency.
  const current = await prepareGame(receipt.config);
  assert.deepEqual(receipt.inputs, current.files, 'Artifact source inventory mismatch');
  assert.equal(
    receipt.sourceHash,
    current.sourceHash,
    'Artifact belongs to different game sources/configuration',
  );
  assert.deepEqual(
    receipt.files,
    await inventory(path.resolve(directory)),
    'Artifact bytes changed',
  );
  if (process.env.GITHUB_SHA)
    assert.equal(receipt.gitSha, process.env.GITHUB_SHA, 'Artifact candidate SHA mismatch');
  if (receipt.config.platform === 'taptap') {
    const bytes = await readFile(path.join(path.dirname(directory), 'game.zip'));
    assert.equal(digest(bytes), receipt.conversion.packageSha256);
    assert.deepEqual(zipInventory(bytes), receipt.files);
    assert.equal(receipt.conversion.officialPluginSha256, officialPluginSha256);
    await verifyTapProject({
      directory: path.resolve(directory),
      appId: receipt.config.appId,
      mode: receipt.config.preview ? 'preview' : 'release',
      orientation: receipt.config.orientation,
    });
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      game: { type: 'string', default: 'all' },
      platform: { type: 'string', default: 'taptap' },
      release: { type: 'boolean', default: false },
      'prepare-only': { type: 'boolean' },
      'prepare-source': { type: 'boolean' },
      verify: { type: 'string' },
      receipt: { type: 'string' },
    },
  });
  if (values.verify) {
    assert(values.receipt, '--receipt required');
    await verifyArtifact(path.resolve(values.verify), path.resolve(values.receipt));
    console.log('Artifact and current sources verified');
  } else
    for (const id of values.game === 'all' ? Object.keys(games) : [values.game]) {
      const result = await buildGame(
        configuration(id, values.platform, { release: values.release }),
        { prepareOnly: values['prepare-only'], prepareSource: values['prepare-source'] },
      );
      console.log(
        JSON.stringify({
          game: id,
          status: result.status,
          directory: result.directory,
          receipt: result.receiptPath,
          sourceHash: result.sourceHash,
          configuration: result.configFile,
        }),
      );
    }
}
