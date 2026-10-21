import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { platformConfig } from './platform-config.mjs';
import { sourceHash } from './artifact.mjs';
import {
  verifyPlugin,
  officialPluginSha256,
} from '../../../../apps/shell-minigame/scripts/taptap-cocos-inputs.mjs';
import { replayOfficialConversion } from '../../../../apps/shell-minigame/scripts/taptap-conversion.mjs';
import {
  digest,
  inventory,
  zipInventory,
  verifyTapProject,
  tapPackageBudgetBytes,
} from '../../../../apps/shell-minigame/scripts/taptap-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = await platformConfig(process.env.BULLET_GARDEN_PLATFORM_CONFIG);
assert.notEqual(config.platform, 'taptap-h5', 'Native builds require preview or taptap config');
const plugin = process.env.TAPTAP_PLUGIN_DIR;
const archive = process.env.TAPTAP_PLUGIN_ARCHIVE;
assert(
  plugin && archive,
  'Set explicit TAPTAP_PLUGIN_DIR and TAPTAP_PLUGIN_ARCHIVE for official v1.2.2',
);
const pluginFiles = await verifyPlugin(archive, plugin);
// The cached tool is read-only: never let the converter install dependencies there.
await access(path.join(plugin, 'converter/node_modules'));
await access(path.join(plugin, 'node_modules/archiver'));
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/build.mjs', 'wechatgame'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('error', reject);
  child.on('exit', (code) =>
    code === 0 ? resolve() : reject(Error(`Creator wechatgame failed (${code})`)),
  );
});
const source = path.join(root, 'build/wechatgame');
const info = JSON.parse(await readFile(path.join(source, 'build-info.json'), 'utf8'));
assert.equal(info.sourceHash, await sourceHash());
const sourceFiles = await inventory(source);
await mkdir(path.join(root, 'build'), { recursive: true });
const workspace = await mkdtemp(path.join(root, 'build/taptap-'));
// Converter removes target; this brand-new child is contained in the authorized game directory.
const target = path.join(workspace, 'converted');
assert(target.startsWith(path.resolve(root) + path.sep));
const converterFile = path.join(plugin, 'dist/converter-ts.js');
const project = path.join(target, 'game');
const conversion = await replayOfficialConversion({
  sourceDirectory: source,
  pluginArchive: archive,
  outputDirectory: project,
});
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await cp(path.join(root, 'startup/taptap.cjs'), path.join(project, 'garden-tap-runtime.js'));
const entry = path.join(project, 'game.js');
await writeFile(entry, "require('./garden-tap-runtime.js');\n" + await readFile(entry, 'utf8'));
for (const [file, key] of [
  ['game.json', 'appId'],
  ['project.config.json', 'appid'],
]) {
  const filename = path.join(project, file);
  const value = JSON.parse(await readFile(filename, 'utf8'));
  value[key] = config.appId;
  if (file === 'game.json') {
    value.deviceOrientation = 'portrait';
    value.productVersion = version;
    if ('appid' in value) value.appid = config.appId;
  }
  await writeFile(filename, JSON.stringify(value, null, 2) + '\n');
}
const verified = await verifyTapProject({
  directory: project,
  appId: config.appId,
  mode: 'preview',
  orientation: 'portrait',
});
// Manifests now contain this game's configured identity: regenerate the ZIP with the
// official converter's installed archiver dependency, then verify every byte against disk.
const zipPath = path.join(target, 'game.zip');
const archiver = createRequire(converterFile)('archiver');
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const zip = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  zip.on('error', reject);
  zip.pipe(output);
  zip.directory(project, false);
  zip.finalize().catch(reject);
});
const bytes = await readFile(zipPath);
assert(bytes.length < tapPackageBudgetBytes, 'TapTap ZIP must remain below 20 MiB');
assert.deepEqual(
  zipInventory(bytes),
  verified.files,
  'ZIP must equal the final manifest-bound project',
);
assert.deepEqual(await inventory(source), sourceFiles, 'Conversion must not mutate Creator input');
const receipt = {
  game: 'bullet-garden',
  creator: '3.8.8',
  channel: config,
  sourceHash: info.sourceHash,
  productVersion: version,
  sourceInventorySha256: digest(JSON.stringify(sourceFiles)),
  pluginVersion: '1.2.2',
  pluginArchiveSha256: officialPluginSha256,
  pluginInventorySha256: digest(JSON.stringify(pluginFiles)),
  packageSha256: digest(bytes),
  packageBytes: bytes.length,
  unpackedBytes: verified.totalBytes,
  packageFile: zipPath,
  projectDirectory: project,
  deviceOrientation: 'portrait',
  officialConverterExecuted: true,
  conversionReceipt: conversion.receipt,
  runtimeSdkBridge: 'startup/taptap.cjs',
  manifestBound: true,
  zipMatchesDirectory: true,
  loginIntegrated: false,
  realDeviceVerified: false,
  platformReviewVerified: false,
  files: verified.files,
};
await writeFile(path.join(target, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
await writeFile(
  path.join(root, 'build/taptap-latest.json'),
  JSON.stringify(receipt, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    packageFile: zipPath,
    packageBytes: bytes.length,
    sourceHash: info.sourceHash,
    realDeviceVerified: false,
  }),
);
