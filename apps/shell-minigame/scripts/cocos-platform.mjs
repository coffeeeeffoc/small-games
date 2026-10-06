import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const editor =
  process.env.COCOS_CREATOR ||
  (existsSync('D:/tools/cocos/CocosCreator.exe')
    ? 'D:/tools/cocos/CocosCreator.exe'
    : path.join(os.homedir(), '.cache/cocos/3.8.8/CocosCreator.exe'));
async function runCreator(args, logPath) {
  const result = spawnSync(editor, args, {
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  await writeFile(logPath, output);
  if (result.error) throw result.error;
  return { code: result.status, output };
}

export const channels = Object.freeze({
  wechat: {
    target: 'wechatgame',
    output: 'wechatgame',
    variable: 'WECHAT_APP_ID',
    pattern: /^wx[A-Za-z0-9_-]+$/,
  },
  bilibili: {
    target: 'bilibili',
    output: 'biligame',
    variable: 'BILIBILI_APP_ID',
    pattern: /^(?!(?:wx|tt|touristappid$|preview-only$))[A-Za-z0-9_-]+$/i,
  },
  douyin: {
    target: 'douyin',
    output: 'bytedance-mini-game',
    variable: 'DOUYIN_APP_ID',
    pattern: /^tt[A-Za-z0-9_-]+$/,
  },
  kuaishou: {
    variable: 'KUAISHOU_APP_ID',
    pattern: /^[A-Za-z0-9_-]+$/,
    blocked:
      'No compatible official Creator 3.8.8 Kuaishou adapter has been verified in this repository.',
  },
  alipay: {
    target: 'alipay-mini-game',
    output: 'alipay-mini-game',
    variable: 'ALIPAY_APP_ID',
    pattern: /^\d{16}$/,
  },
});
export function descriptor(channel, { mode = 'preview', env = process.env } = {}) {
  const target = channels[channel];
  if (!target) throw Error(`Unknown platform: ${channel}`);
  if (!['preview', 'release'].includes(mode)) throw Error('mode must be preview or release');
  const appId = env[target.variable] || '';
  if (appId && !target.pattern.test(appId))
    throw Error(`${target.variable} must contain a public ${channel} AppID.`);
  if (mode === 'release' && !appId)
    throw Error(`Release requires ${target.variable}; no preview identity is accepted.`);
  return { ...target, channel, mode, appId, configured: !!appId };
}
async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Native output must not contain symlinks.');
    if (!entry.isFile() || entry.name === 'platform-manifest.json') continue;
    const file = path.join(entry.parentPath, entry.name);
    const bytes = await readFile(file);
    output.push({
      path: path.relative(directory, file).replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return output.sort((a, b) => a.path.localeCompare(b.path));
}
export async function verifyManifest(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'platform-manifest.json'), 'utf8'),
  );
  if (JSON.stringify(manifest.files) !== JSON.stringify(await files(directory)))
    throw Error('Native artifact integrity mismatch.');
  return manifest;
}
export function alipayConfig(gameName) {
  return {
    name: gameName,
    platform: 'alipay-mini-game',
    outputName: 'alipay-mini-game',
    debug: false,
    md5Cache: true,
    buildPath: 'project://build',
    includeModules: [
      'base',
      'gfx-webgl',
      'gfx-webgl2',
      '3d',
      '2d',
      'ui',
      'graphics',
      'mask',
      'audio',
      'primitive',
      'profiler',
    ],
    startScene: '47889f0b-3be6-4dbd-a05d-b4381a0277e9',
    scenes: [
      { url: 'db://assets/scenes/main.scene', uuid: '47889f0b-3be6-4dbd-a05d-b4381a0277e9' },
    ],
    // Alipay documents deviceOrientation, not the WeChat orientation/appid schema.
    packages: { 'alipay-mini-game': { deviceOrientation: 'landscape' } },
  };
}
export async function buildPlatform(gameRoot, channel, options = {}) {
  const info = descriptor(channel, options); // release credentials fail before engine checks
  if (info.blocked) throw Error(info.blocked);
  const configOnly = options.configOnly === true;
  const reports = path.join(gameRoot, 'reports');
  await mkdir(reports, { recursive: true });
  if (channel === 'alipay') {
    const configPath = path.join(reports, 'build-alipay.json');
    await writeFile(configPath, JSON.stringify(alipayConfig(path.basename(gameRoot)), null, 2));
    if (configOnly) return { ...info, status: 'configuration-only', configuration: configPath };
    if (!existsSync(editor))
      throw Error('Set COCOS_CREATOR to Creator 3.8.8; no native artifact was built.');
    const outputDirectory = path.resolve(gameRoot, 'build', info.output);
    if (path.dirname(outputDirectory) !== path.resolve(gameRoot, 'build'))
      throw Error('Build output escaped project.');
    await mkdir(outputDirectory, { recursive: true });
    for (const name of await readdir(outputDirectory))
      await rm(path.join(outputDirectory, name), { recursive: true, force: true, maxRetries: 3 });
    const result = await runCreator(
      ['--project', gameRoot, '--build', `configPath=${configPath}`],
      path.join(reports, 'build-alipay.log'),
    );
    if (![0, 36].includes(result.code) || /Missing class:|Build failed/i.test(result.output))
      throw Error('Alipay Creator build failed.');
  } else {
    if (!configOnly && !existsSync(editor))
      throw Error('Set COCOS_CREATOR to Creator 3.8.8; no native artifact was built.');
    const result = spawnSync(
      process.execPath,
      ['scripts/build.mjs', info.target, ...(configOnly ? ['--config-only'] : [])],
      {
        cwd: gameRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...(options.env || {}) },
      },
    );
    if (result.status !== 0)
      throw Error(result.stderr || result.stdout || `Creator build exited ${result.status}`);
    if (configOnly)
      return {
        ...info,
        status: 'configuration-only',
        configuration: path.join(reports, `build-${info.target}.json`),
      };
  }
  const directory = path.join(gameRoot, 'build', info.output);
  await readFile(path.join(directory, 'game.js'));
  const game = JSON.parse(await readFile(path.join(directory, 'game.json'), 'utf8'));
  if (game.deviceOrientation !== 'landscape')
    throw Error('Native output must declare landscape orientation.');
  if (channel !== 'alipay') {
    const project = JSON.parse(await readFile(path.join(directory, 'project.config.json'), 'utf8'));
    const expected =
      info.appId ||
      (channel === 'wechat' ? 'touristappid' : channel === 'bilibili' ? 'preview-only' : '');
    if (project.appid !== expected)
      throw Error('Native output public AppID differs from wrapper environment.');
  }
  const { sourceHash } = await import(pathToFileURL(path.join(gameRoot, 'scripts/artifact.mjs')));
  if (channel !== 'alipay') {
    const provenance = JSON.parse(await readFile(path.join(directory, 'build-info.json'), 'utf8'));
    if (provenance.creator !== '3.8.8' || provenance.sourceHash !== (await sourceHash()))
      throw Error('Native artifact source provenance mismatch.');
  }
  const outputFiles = await files(directory);
  // Alipay documentation gives a 4 MiB limit; do not apply the WeChat 20 MiB allowance.
  if (
    channel === 'alipay' &&
    outputFiles.reduce((sum, file) => sum + file.bytes, 0) > 4 * 1024 * 1024
  )
    throw Error(
      'Alipay package exceeds 4 MiB; configure and verify official remote resource hosting before delivery.',
    );
  const manifest = {
    schema: 1,
    game: path.basename(gameRoot),
    platform: channel,
    mode: info.mode,
    appId: info.appId,
    previewOnly: info.mode === 'preview',
    creator: '3.8.8',
    sourceHash: await sourceHash(),
    wrapperHash: createHash('sha256')
      .update(await readFile(new URL('./cocos-platform.mjs', import.meta.url)))
      .digest('hex'),
    validation: {
      creatorBuild: true,
      integrity: true,
      developerTools: false,
      realDevice: false,
      platformApproval: false,
    },
    capabilities: {
      login: 'unconfigured',
      advertising: 'unconfigured',
      sharing: channel === 'alipay' ? 'unavailable' : 'requires-host-verification',
    },
    files: outputFiles,
  };
  await writeFile(
    path.join(directory, 'platform-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  await verifyManifest(directory);
  return { ...info, status: 'built-unverified-on-host', directory, manifest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gameRoot = path.resolve(process.argv[2] || '');
  const channel = process.argv[3];
  const result = await buildPlatform(gameRoot, channel, {
    mode: process.argv.includes('--release') ? 'release' : 'preview',
    configOnly: process.argv.includes('--config-only'),
  });
  console.log(JSON.stringify(result));
}
