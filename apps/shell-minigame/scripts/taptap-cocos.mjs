import { cp, lstat, mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { prepareNativeProject, adaptationRecipeSha256 } from './night-native-project.mjs';
import {
  installTapTapLogin,
  publicTapTapLoginConfig,
  tapTapLoginPrefix,
  verifyTapTapLogin,
} from './taptap-login.mjs';
import {
  digest,
  inventory,
  localPath,
  relativeFile,
  tapIdentity,
  trustedInventory,
  verifyOfficialPackage,
  verifyTapProject,
} from './taptap-package.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const tapCocosPlugin = Object.freeze({
  name: 'taptap-minigame-tools',
  version: '1.2.2',
  download: 'https://app-res.tapimg.com/file/2026-04-14/67e7d94f5e586596dab061816d1c509d.zip',
  documentation: 'https://developer.taptap.cn/minigameapidoc/dev/engine/Cocos-Laya-Egret/',
});
const mutableSourceFiles = new Set([
  'game.js',
  'game.json',
  'project.config.json',
  'build-info.json',
  'platform-manifest.json',
  'artifact-manifest.json',
  'release.json',
]);
const json = async (directory, file) =>
  JSON.parse(await readFile(path.join(directory, file), 'utf8'));

/** Imports an explicit converted Creator output. The public docs do not expose
 * conversion CLI parameters, so this never invents an Editor option or SDK. */
export async function verifyConvertedCocosPackage({
  gameRoot,
  sourceDirectory,
  convertedDirectory,
  pluginDirectory,
  currentSourceHash,
  verifiedSourceInventory,
  resourceMappings = {},
  game = path.basename(gameRoot || ''),
  apiUrl = '',
  appId = '',
  mode = 'preview',
  orientation = 'landscape',
} = {}) {
  tapIdentity(appId, mode);
  const loginConfig = { platform: 'taptap', game, appId, apiUrl, preview: mode === 'preview' };
  const loginPublicConfig = publicTapTapLoginConfig(loginConfig);
  if (!/^[a-f0-9]{64}$/.test(currentSourceHash || ''))
    throw Error('Current Creator source fingerprint required.');
  await localPath(gameRoot);
  const source = await localPath(sourceDirectory),
    converted = await localPath(convertedDirectory),
    plugin = await localPath(pluginDirectory);
  if (
    source === converted ||
    source.startsWith(converted + path.sep) ||
    converted.startsWith(source + path.sep)
  )
    throw Error('Creator source and TapTap output must be independent directories.');
  const sourceFiles = await inventory(source),
    expected = trustedInventory(verifiedSourceInventory);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(expected))
    throw Error('Trusted Creator source integrity mismatch.');
  const sourceBuildInfo = await readFile(path.join(source, 'build-info.json'), 'utf8'),
    info = JSON.parse(sourceBuildInfo);
  if (
    info.creator !== '3.8.8' ||
    info.sourceHash !== currentSourceHash ||
    ![info.target, info.platform].some((target) => target === 'wechatgame') ||
    [info.target, info.platform].some((target) => target && target !== 'wechatgame')
  )
    throw Error(
      'Creator source provenance mismatch; require the actual WeChat build used by the official converter.',
    );
  const sourceGame = await json(source, 'game.json');
  if (sourceGame.deviceOrientation !== orientation)
    throw Error('Creator source orientation mismatch.');
  const sourceEntry = await readFile(path.join(source, 'game.js'), 'utf8');
  if (
    !/\brequire\s*\(/.test(sourceEntry) ||
    !sourceFiles.some((file) => /(?:^|\/)settings(?:\.[\w-]+)?\.(?:json|js)$/.test(file.path))
  )
    throw Error('Real Creator entry and settings required.');
  const pluginFiles = await inventory(plugin);
  if (!pluginFiles.length)
    throw Error('Supply the actual official TapTap plugin directory, not an empty placeholder.');
  // The public archive cannot be inspected here. The docs show the extension's
  // UI name, not its package.json schema or package name. Preserve actual local
  // metadata when present without treating that metadata as authentication.
  const pluginInfo = pluginFiles.some((file) => file.path === 'package.json')
    ? await json(plugin, 'package.json')
    : {};
  if (pluginInfo.version && pluginInfo.version !== tapCocosPlugin.version)
    throw Error('TapTap supplied plugin version differs from the documented v1.2.2.');
  const login = await verifyTapTapLogin(converted, loginConfig);
  const prefix = tapTapLoginPrefix(loginConfig);
  const convertedEntry = await readFile(path.join(converted, 'game.js'), 'utf8');
  const originalEntry = sourceEntry.startsWith(prefix)
    ? sourceEntry.slice(prefix.length)
    : sourceEntry;
  if (originalEntry.trim() === convertedEntry.slice(prefix.length).trim())
    throw Error(
      'Creator entry was not converted; a renamed WeChat output is not a TapTap package.',
    );
  const project = await verifyTapProject({
    directory: converted,
    appId,
    mode,
    orientation,
    entryPrefixToIgnore: prefix,
  });
  const byPath = new Map(project.files.map((file) => [file.path, file]));
  if (!resourceMappings || typeof resourceMappings !== 'object' || Array.isArray(resourceMappings))
    throw Error('Invalid Creator resource mapping.');
  const preserved = [],
    destinations = new Set();
  for (const file of sourceFiles) {
    if (mutableSourceFiles.has(file.path)) continue;
    const destination = relativeFile(resourceMappings[file.path] || file.path),
      counterpart = byPath.get(destination);
    if (destinations.has(destination)) throw Error('Duplicate converted Creator resource mapping.');
    destinations.add(destination);
    if (!counterpart || counterpart.bytes !== file.bytes || counterpart.sha256 !== file.sha256)
      throw Error(
        `Converted Creator resource missing or changed: ${file.path}; review the actual plugin resource mapping.`,
      );
    preserved.push({ source: file.path, destination, bytes: file.bytes, sha256: file.sha256 });
  }
  if (
    Object.keys(resourceMappings).some(
      (file) => mutableSourceFiles.has(file) || !sourceFiles.some((item) => item.path === file),
    )
  )
    throw Error('Unrecognized Creator resource mapping.');
  return {
    ...project,
    status: 'converted-source-integrity-verified',
    creator: info.creator,
    sourceHash: currentSourceHash,
    sourceInventorySha256: digest(JSON.stringify(sourceFiles)),
    convertedInventorySha256: digest(JSON.stringify(project.files)),
    sourceFiles,
    sourceBuildInfo,
    preservedResources: preserved,
    plugin: {
      ...tapCocosPlugin,
      suppliedPackageName: pluginInfo.name || null,
      suppliedPackageVersion: pluginInfo.version || null,
      manifestSchemaVerified: false,
      inventorySha256: digest(JSON.stringify(pluginFiles)),
      files: pluginFiles,
      authenticityVerified: false,
    },
    conversionReceipt: 'unverified',
    apiUrl,
    login,
    loginPublicConfig,
    officialToolVerified: false,
    realDeviceVerified: false,
  };
}

function environmentInputs(game, env) {
  const prefix = `MINIGAME_${game.toUpperCase().replaceAll('-', '_')}_TAPTAP_`;
  return Object.fromEntries(
    ['SOURCE_DIR', 'SOURCE_INVENTORY', 'CONVERTED_DIR', 'PLUGIN_DIR', 'PACKAGE_FILE'].map(
      (suffix) => [suffix, env[prefix + suffix] || ''],
    ),
  );
}
async function currentFingerprint(gameRoot) {
  const source = await import(pathToFileURL(path.join(gameRoot, 'scripts/artifact.mjs')));
  return source.sourceHash(gameRoot);
}
function independentOutput(output, inputs) {
  for (const input of Object.values(inputs)
    .filter(Boolean)
    .map((value) => path.resolve(value)))
    if (
      input === output ||
      input.startsWith(output + path.sep) ||
      output.startsWith(input + path.sep)
    )
      throw Error('TapTap imported inputs and managed output must be independent paths.');
}
async function managedOutputPath(output) {
  let current = output;
  while (true) {
    const info = await lstat(current).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (info?.isSymbolicLink()) throw Error('TapTap managed output path contains a symlink.');
    if (info && !info.isDirectory())
      throw Error('TapTap managed output path must contain directories.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function importScriptHashes() {
  return Object.fromEntries(
    await Promise.all(
      [
        'taptap-cocos.mjs',
        'taptap-package.mjs',
        'night-native-project.mjs',
        'taptap-login.mjs',
        '../../../platforms/taptap/login.cjs',
      ].map(async (file) => [file, digest(await readFile(new URL(file, import.meta.url)))]),
    ),
  );
}

/** Copy a real converted project, configure its login, then pack this stage with
 * the official tool. Never edits a supplied ZIP or invents a Creator conversion. */
export async function prepareTapTapCocosLogin({
  convertedDirectory,
  outputDirectory,
  config,
} = {}) {
  const publicConfig = publicTapTapLoginConfig(config);
  tapIdentity(publicConfig.appId, config.preview ? 'preview' : 'release');
  const source = await localPath(convertedDirectory);
  if (typeof outputDirectory !== 'string' || !path.isAbsolute(outputDirectory))
    throw Error('Explicit absolute TapTap login staging output required.');
  const output = path.resolve(outputDirectory);
  independentOutput(output, { convertedDirectory: source });
  await managedOutputPath(output);
  const existingOutput = await lstat(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existingOutput && (await readdir(output)).length)
    throw Error(
      'TapTap login staging output must be a new directory or an existing empty directory.',
    );
  const sourceGame = await json(source, 'game.json'),
    sourceProject = await json(source, 'project.config.json');
  const sourceFiles = await inventory(source);
  if (!existingOutput) {
    await mkdir(path.dirname(output), { recursive: true });
    // Exclusive creation: an independently created directory is never adopted
    // or removed if another process fills this path after the preflight.
    await mkdir(output);
  } else if ((await readdir(output)).length) {
    throw Error('TapTap login staging output became nonempty before copying.');
  }
  const stagedFiles = new Set();
  try {
    for (const file of sourceFiles) {
      const destination = path.join(output, file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(source, file.path), destination, { force: false, errorOnExist: true });
      stagedFiles.add(file.path);
    }
    if (!stagedFiles.has('tap-login.js')) {
      await writeFile(path.join(output, 'tap-login.js'), '', { flag: 'wx' });
      stagedFiles.add('tap-login.js');
    }
    await writeFile(
      path.join(output, 'game.json'),
      JSON.stringify({ ...sourceGame, appId: publicConfig.appId }, null, 2) + '\n',
    );
    await writeFile(
      path.join(output, 'project.config.json'),
      JSON.stringify({ ...sourceProject, appid: publicConfig.appId }, null, 2) + '\n',
    );
    // The actual v1.2.2 converter retains Creator's touristappid only in the
    // project metadata. Validate the independently normalized copy before adding
    // login, so the login helper cannot manufacture a Tap runtime boundary.
    await verifyTapProject({
      directory: output,
      appId: publicConfig.appId,
      mode: config.preview ? 'preview' : 'release',
      orientation: 'landscape',
    });
    const login = await installTapTapLogin(output, config);
    const project = await verifyTapProject({
      directory: output,
      appId: publicConfig.appId,
      mode: config.preview ? 'preview' : 'release',
      orientation: 'landscape',
    });
    if (JSON.stringify(sourceFiles) !== JSON.stringify(await inventory(source)))
      throw Error('Original TapTap converted inputs changed during login staging.');
    return {
      directory: output,
      status: 'login-source-staged-awaiting-official-packing',
      publicConfig,
      login,
      files: project.files,
      sourceInventorySha256: project.sourceInventorySha256,
      sourceFiles,
      sourceDirectory: source,
      officialToolVerified: false,
      realDeviceVerified: false,
    };
  } catch (error) {
    if (!existingOutput) await rm(output, { recursive: true, force: true });
    else {
      // The caller's originally empty directory remains in place. Only staged
      // entries are removed, preserving independently introduced files.
      for (const file of stagedFiles) await rm(path.join(output, file), { force: true });
      const folders = new Set();
      for (const file of sourceFiles) {
        let folder = path.posix.dirname(file.path);
        while (folder !== '.') {
          folders.add(folder);
          folder = path.posix.dirname(folder);
        }
      }
      for (const folder of [...folders].sort((a, b) => b.length - a.length)) {
        const full = path.join(output, folder);
        const entries = await readdir(full).catch((failure) => {
          if (failure.code !== 'ENOENT') throw failure;
          return null;
        });
        if (entries?.length === 0) await rmdir(full);
      }
    }
    throw error;
  }
}

/** Missing tools remain explicit blockers. --prepare-source records the native
 * project and official manual steps; it does not claim that Creator ran. */
export async function buildTapTapCocosTarget(
  selected,
  config,
  {
    env = process.env,
    outputRoot = path.join(repositoryRoot, 'apps/shell-minigame/dist/nine-games'),
    prepareSource = false,
  } = {},
) {
  if (
    !['carding-car', 'night-overwatch'].includes(selected?.id) ||
    !selected.cocos ||
    config?.platform !== 'taptap'
  )
    throw Error('Select one of the two reviewed Creator TapTap targets.');
  const mode = config.preview ? 'preview' : 'release';
  tapIdentity(config.appId, mode);
  const gameRoot = path.join(repositoryRoot, selected.directory),
    inputs = environmentInputs(selected.id, env),
    targetRoot = path.resolve(outputRoot, 'taptap', selected.id);
  independentOutput(targetRoot, inputs);
  await managedOutputPath(targetRoot);
  // Receipt defaults are real inputs too. Resolve them before deleting even an
  // older managed artifact, otherwise a missing SOURCE_DIR could erase source.
  let receipt;
  if (!prepareSource && inputs.SOURCE_INVENTORY) {
    await localPath(inputs.SOURCE_INVENTORY, 'file');
    receipt = JSON.parse(await readFile(inputs.SOURCE_INVENTORY, 'utf8'));
    inputs.SOURCE_DIR ||= receipt.sourceDirectory || '';
    independentOutput(targetRoot, inputs);
  }
  await rm(targetRoot, { recursive: true, force: true });
  if (prepareSource) {
    const source = await prepareNativeProject(gameRoot);
    await mkdir(targetRoot, { recursive: true });
    const plan = {
      game: selected.id,
      platform: 'taptap',
      status: 'source-plan-only',
      projectRoot: source.projectRoot,
      canonicalSourceHash: source.canonicalSourceHash,
      sourceHash: source.sourceHash,
      adaptationRecipeSha256: source.adaptationRecipeSha256,
      creator: '3.8.x',
      plugin: tapCocosPlugin,
      steps: [
        'Install the official plugin in Creator.',
        'Select the WeChat mini game build target.',
        'Enable the official plugin option 转换为Tap小游戏 and build.',
        'Capture the WeChat source inventory before conversion.',
        'Run --prepare-login against build/TapBuild/game/ to create an independent configured login stage.',
        'Run the official packing tool on that login stage; supply the unchanged stage and newly packed ZIP through scoped TapTap inputs.',
      ],
      creatorBuildVerified: false,
      officialToolVerified: false,
      realDeviceVerified: false,
    };
    await writeFile(
      path.join(targetRoot, 'tap-source-plan.json'),
      JSON.stringify(plan, null, 2) + '\n',
    );
    return plan;
  }
  if (!inputs.PLUGIN_DIR || !inputs.CONVERTED_DIR || !inputs.SOURCE_INVENTORY)
    throw Error(
      `TapTap ${selected.id} requires Creator 3.8.x with official tap-minigame-ts v1.2.2 conversion: configure scoped TAPTAP_PLUGIN_DIR, SOURCE_INVENTORY, SOURCE_DIR and CONVERTED_DIR from build/TapBuild/game/. No TapTap artifact was built; undocumented plugin CLI options are not invented.`,
    );
  try {
    const provenance = await prepareNativeProject(gameRoot);
    if (
      receipt.game !== selected.id ||
      receipt.sourceHash !== provenance.sourceHash ||
      receipt.canonicalSourceHash !== provenance.canonicalSourceHash ||
      receipt.adaptationRecipeSha256 !== provenance.adaptationRecipeSha256
    )
      throw Error(
        'TapTap staged Creator inventory belongs to a different game or current native source.',
      );
    const result = await verifyConvertedCocosPackage({
      gameRoot,
      sourceDirectory: inputs.SOURCE_DIR || receipt.sourceDirectory,
      convertedDirectory: inputs.CONVERTED_DIR,
      pluginDirectory: inputs.PLUGIN_DIR,
      currentSourceHash: provenance.sourceHash,
      verifiedSourceInventory: receipt.files,
      resourceMappings: receipt.resourceMappings || {},
      game: selected.id,
      apiUrl: config.apiUrl || '',
      appId: config.appId,
      mode,
    });
    await mkdir(targetRoot, { recursive: true });
    const directory = path.join(targetRoot, 'game');
    await cp(result.directory, directory, { recursive: true });
    await verifyTapProject({
      directory,
      appId: config.appId,
      mode,
      orientation: 'landscape',
      verifiedSourceInventory: result.files,
    });
    let packageEvidence;
    if (inputs.PACKAGE_FILE) {
      packageEvidence = await verifyOfficialPackage({
        projectDirectory: directory,
        packageFile: inputs.PACKAGE_FILE,
        officialToolPath: inputs.PLUGIN_DIR,
        verifiedProjectInventory: result.files,
        currentSourceHash: provenance.sourceHash,
        appId: config.appId,
        game: selected.id,
        apiUrl: config.apiUrl || '',
        mode,
        orientation: 'landscape',
      });
      // Byte copy of the independently supplied output; this does not generate
      // or rename any APK/WeChat package and retains an integrity-only claim.
      await cp(packageEvidence.packageFile, path.join(targetRoot, 'game.zip'));
      packageEvidence = { ...packageEvidence, packageFile: 'game.zip' };
    }
    if ((await currentFingerprint(gameRoot)) !== provenance.canonicalSourceHash)
      throw Error('Canonical Creator inputs changed during TapTap verification.');
    const manifest = {
      schemaVersion: 1,
      game: selected.id,
      platform: 'taptap',
      mode,
      appId: config.appId,
      creator: result.creator,
      apiUrl: config.apiUrl || '',
      loginPublicConfig: result.loginPublicConfig,
      login: result.login,
      canonicalSourceHash: provenance.canonicalSourceHash,
      sourceHash: provenance.sourceHash,
      adaptationRecipeSha256: provenance.adaptationRecipeSha256,
      files: result.files,
      preservedResources: result.preservedResources,
      sourceInventorySha256: result.sourceInventorySha256,
      convertedInventorySha256: result.convertedInventorySha256,
      sourceFiles: result.sourceFiles,
      sourceBuildInfo: result.sourceBuildInfo,
      plugin: result.plugin,
      importScriptHashes: await importScriptHashes(),
      ...(packageEvidence ? { package: packageEvidence } : {}),
      conversionReceipt: 'unverified',
      integrityVerified: true,
      officialToolVerified: false,
      realDeviceVerified: false,
    };
    await writeFile(
      path.join(targetRoot, 'cocos-provenance.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    await verifyTapTapCocosArtifact(targetRoot);
    return {
      directory,
      targetRoot,
      status: result.status,
      manifest,
      package: packageEvidence,
      packageStatus: packageEvidence
        ? 'supplied-package-integrity-verified'
        : 'official-package-not-supplied',
    };
  } catch (error) {
    await rm(targetRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyTapTapCocosArtifact(directory) {
  const root = await localPath(directory),
    manifest = await json(root, 'cocos-provenance.json');
  if (
    manifest.platform !== 'taptap' ||
    !['carding-car', 'night-overwatch'].includes(manifest.game) ||
    manifest.officialToolVerified !== false ||
    manifest.realDeviceVerified !== false ||
    manifest.conversionReceipt !== 'unverified'
  )
    throw Error('Invalid TapTap Creator provenance or unsupported verification claim.');
  const files = trustedInventory(manifest.files);
  if (
    manifest.convertedInventorySha256 !== digest(JSON.stringify(files)) ||
    manifest.sourceInventorySha256 !==
      digest(JSON.stringify(trustedInventory(manifest.sourceFiles))) ||
    manifest.plugin?.name !== tapCocosPlugin.name ||
    manifest.plugin?.version !== tapCocosPlugin.version ||
    manifest.plugin?.authenticityVerified !== false ||
    manifest.plugin.inventorySha256 !==
      digest(JSON.stringify(trustedInventory(manifest.plugin.files)))
  )
    throw Error('TapTap Creator provenance inventory mismatch.');
  if (
    !/^[a-f0-9]{64}$/.test(manifest.sourceHash || '') ||
    !/^[a-f0-9]{64}$/.test(manifest.canonicalSourceHash || '') ||
    typeof manifest.sourceBuildInfo !== 'string' ||
    JSON.parse(manifest.sourceBuildInfo).sourceHash !== manifest.sourceHash ||
    manifest.sourceFiles.find((file) => file.path === 'build-info.json')?.sha256 !==
      digest(manifest.sourceBuildInfo) ||
    JSON.stringify(manifest.importScriptHashes) !== JSON.stringify(await importScriptHashes()) ||
    (manifest.game === 'night-overwatch'
      ? manifest.adaptationRecipeSha256 !== adaptationRecipeSha256
      : manifest.adaptationRecipeSha256 !== undefined ||
        manifest.sourceHash !== manifest.canonicalSourceHash)
  )
    throw Error('TapTap Creator native source fingerprint, adaptation recipe or importer changed.');
  await verifyTapProject({
    directory: path.join(root, 'game'),
    appId: manifest.appId,
    mode: manifest.mode,
    orientation: 'landscape',
    verifiedSourceInventory: files,
    entryPrefixToIgnore: tapTapLoginPrefix({
      platform: 'taptap',
      game: manifest.game,
      appId: manifest.appId,
      apiUrl: manifest.apiUrl || '',
      preview: manifest.mode === 'preview',
    }),
  });
  await verifyTapTapLogin(path.join(root, 'game'), {
    platform: 'taptap',
    game: manifest.game,
    appId: manifest.appId,
    apiUrl: manifest.apiUrl || '',
    preview: manifest.mode === 'preview',
  });
  if (
    JSON.stringify(manifest.loginPublicConfig) !==
    JSON.stringify(
      publicTapTapLoginConfig({
        platform: 'taptap',
        game: manifest.game,
        appId: manifest.appId,
        apiUrl: manifest.apiUrl || '',
        preview: manifest.mode === 'preview',
      }),
    )
  )
    throw Error('TapTap Creator login public configuration mismatch.');
  if (manifest.package) {
    const bytes = await readFile(path.join(root, relativeFile(manifest.package.packageFile)));
    if (digest(bytes) !== manifest.package.sha256 || bytes.length !== manifest.package.bytes)
      throw Error('TapTap supplied package integrity mismatch.');
    const { zipInventory } = await import('./taptap-package.mjs');
    if (JSON.stringify(zipInventory(bytes)) !== JSON.stringify(files))
      throw Error('TapTap supplied package resource mismatch.');
  }
  const gameRoot = path.join(repositoryRoot, 'games/local', manifest.game);
  const current = await prepareNativeProject(gameRoot);
  const session =
    current.projectRoot !== gameRoot ? path.resolve(current.projectRoot, '../../..') : null;
  if (session && !path.basename(session).startsWith('night-'))
    throw Error('Unexpected native verification stage path.');
  try {
    if (
      current.canonicalSourceHash !== manifest.canonicalSourceHash ||
      current.sourceHash !== manifest.sourceHash ||
      current.adaptationRecipeSha256 !== manifest.adaptationRecipeSha256
    )
      throw Error('TapTap Creator artifact belongs to older canonical or adapted native sources.');
  } finally {
    if (session) await rm(session, { recursive: true, force: true });
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      game: { type: 'string' },
      output: { type: 'string' },
      appid: { type: 'string' },
      release: { type: 'boolean' },
      'prepare-source': { type: 'boolean' },
      'prepare-login': { type: 'boolean' },
      'converted-dir': { type: 'string' },
      'api-url': { type: 'string' },
      verify: { type: 'string' },
    },
  });
  if (values.verify)
    console.log(
      JSON.stringify(await verifyTapTapCocosArtifact(path.resolve(values.verify)), null, 2),
    );
  else if (values['prepare-login']) {
    if (
      !['carding-car', 'night-overwatch'].includes(values.game) ||
      !values['converted-dir'] ||
      !values.output
    )
      throw Error(
        'Login staging requires a reviewed --game, --converted-dir and independent --output.',
      );
    console.log(
      JSON.stringify(
        await prepareTapTapCocosLogin({
          convertedDirectory: path.resolve(values['converted-dir']),
          outputDirectory: path.resolve(values.output),
          config: {
            platform: 'taptap',
            game: values.game,
            appId: values.appid || '',
            apiUrl: values['api-url'] || '',
            preview: !values.release,
          },
        }),
        null,
        2,
      ),
    );
  } else {
    const { nineGames } = await import('./nine-games-targets.mjs');
    const selected = nineGames.find((game) => game.id === values.game);
    const result = await buildTapTapCocosTarget(
      selected,
      {
        platform: 'taptap',
        game: selected?.id,
        appId: values.appid || '',
        apiUrl: values['api-url'] || '',
        preview: !values.release,
      },
      {
        prepareSource: values['prepare-source'],
        outputRoot: values.output ? path.resolve(values.output) : undefined,
      },
    );
    console.log(JSON.stringify(result, null, 2));
  }
}
