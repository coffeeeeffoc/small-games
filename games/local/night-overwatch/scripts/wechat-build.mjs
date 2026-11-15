import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { clearOutput } from '../../carding-car/scripts/clear-output.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function wechatConfiguration(release = {}, env = process.env, production = false) {
  const appId = env.WECHAT_APP_ID || release.wechatAppId || 'touristappid';
  assert(appId === 'touristappid' || /^wx[\da-f]{16}$/i.test(appId), 'Use a public WeChat wx AppID');
  if (production) assert(appId !== 'touristappid', 'WeChat release requires WECHAT_APP_ID');
  const resourceUrl = env.NIGHT_WECHAT_RESOURCE_URL || release.wechatResourceUrl ||
    (production ? '' : 'http://127.0.0.1:4320/');
  const apiUrl = env.NIGHT_WECHAT_API_URL ?? release.wechatApiUrl ?? '';
  for (const [name, value] of [['resource', resourceUrl], ['API', apiUrl]]) {
    if (name === 'API' && !value) continue;
    let url;
    try { url = new URL(value); } catch { throw Error(`WeChat ${name} URL is required`); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    assert(!url.username && !url.password && !url.search && !url.hash &&
      ((url.protocol === 'https:' && (!production || !loopback)) ||
        (!production && loopback && url.protocol === 'http:')), `Invalid WeChat ${name} URL`);
  }
  const adUnitId = env.NIGHT_WECHAT_AD_UNIT_ID ?? release.wechatAdUnitId ?? '';
  assert(typeof adUnitId === 'string' && (!adUnitId || /^adunit-[\da-f]+$/i.test(adUnitId)),
    'Use this WeChat game’s rewarded adunit ID; TapTap IDs are not accepted');
  return { appId, resourceUrl: resourceUrl.replace(/\/*$/, '/'), apiUrl: apiUrl.replace(/\/+$/, ''),
    adUnitId, production };
}

export function wechatCreatorOptions(config) {
  return {
    server: config.resourceUrl,
  };
}

export async function wechatBootstrapSource(config) {
  const { build } = await import(process.env.NIGHT_WECHAT_VITE_ENTRY || 'vite');
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent',
    resolve: { alias: {
      '@coffeeeeffoc/ad-runtime': path.resolve(root, '../../../packages/ad-runtime/src/index.ts'),
      '@coffeeeeffoc/ad-config': path.resolve(root, '../../../packages/ad-config/src/index.ts'),
      zod: process.env.NIGHT_WECHAT_ZOD_ENTRY || createRequire(path.resolve(root, '../../../packages/ad-config/package.json')).resolve('zod'),
    } },
    build: { write: false, minify: true, target: 'es2018', lib: {
      entry: fileURLToPath(new URL('./wechat-runtime.mjs', import.meta.url)),
      formats: ['iife'], name: 'NightWechat',
    } } });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap((part) => part.output);
  assert(chunks.length === 1 && chunks[0].type === 'chunk' && !chunks[0].imports.length &&
    !chunks[0].dynamicImports.length, 'WeChat bootstrap must be self-contained');
  return chunks[0].code + `\nNightWechat.installWechatRuntime(${JSON.stringify(config)});\n`;
}

const mainManifests = ['wechat-manifest.json', 'platform-manifest.json', 'artifact-manifest.json'];
async function inventory(directory, omitted = []) {
  const files = [];
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'WeChat artifact cannot contain symlinks');
    if (!entry.isFile()) continue;
    const filename = path.join(entry.parentPath, entry.name);
    if (omitted.includes(path.relative(directory, filename))) continue;
    const bytes = await readFile(filename);
    files.push({ path: path.relative(directory, filename).replaceAll('\\', '/'), bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function finishWechatBuild(directory, config, version, sourceHash) {
  const remote = directory + '-remote';
  await clearOutput(remote);
  // Creator separates remote bundle data from local executable scripts.
  await rename(path.join(directory, 'remote'), path.join(remote, 'remote'));
  const service = { platform: 'wechat', game: 'night-overwatch', appId: config.appId,
    apiUrl: config.apiUrl, competitionEnabled: Boolean(config.apiUrl),
    release: { ...version, channel: 'wechat', buildId: 'night-wechat-' +
      createHash('sha256').update(JSON.stringify({ sourceHash, config, version })).digest('hex') } };
  for (const [key, file, symbol] of [['ranked', 'Replay', 'RANKED_RULE_VERSION'], ['multiplayer', 'Duel', 'DUEL_VERSION']]) {
    const code = await readFile(path.join(root, `assets/scripts/core/${file}.ts`), 'utf8');
    const rule = code.match(new RegExp(`export const ${symbol} = '([^']+)'`))?.[1];
    assert(rule, 'Missing Night rule version');
    service.release[key] = rule;
  }
  const ads = { platform: 'wechat', adsEnabled: Boolean(config.adUnitId), adUnitId: config.adUnitId };
  await writeFile(path.join(directory, 'night-wechat.js'), await wechatBootstrapSource({ service, ads }));
  const entry = path.join(directory, 'game.js');
  await writeFile(entry, `require('./night-wechat.js');\n` + await readFile(entry, 'utf8'));
  const files = await inventory(directory, mainManifests), resources = await inventory(remote);
  const manifest = { creator: '3.8.8', platform: 'wechat', previewOnly: !config.production,
    sourceHash, version, service, ads, resourceUrl: config.resourceUrl, files, resources,
    canonicalSourceHash: process.env.NIGHT_WECHAT_CANONICAL_SOURCE_HASH || sourceHash,
    validation: { creatorBuild: true, developerTools: false, realDevice: false } };
  await writeFile(path.join(directory, 'wechat-manifest.json'), JSON.stringify(manifest, null, 2));
  await verifyWechatBuild(directory, config, sourceHash);
  return { mainBytes: files.reduce((sum, file) => sum + file.bytes, 0) + Buffer.byteLength(JSON.stringify(manifest, null, 2)),
    remoteBytes: resources.reduce((sum, file) => sum + file.bytes, 0), remoteDirectory: remote,
    configured: config.appId !== 'touristappid', version: version.version };
}

export async function verifyWechatBuild(directory, config, sourceHash) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'wechat-manifest.json'), 'utf8'));
  assert([manifest.sourceHash, manifest.canonicalSourceHash].includes(sourceHash), 'WeChat source changed; rebuild');
  assert.equal(manifest.service.appId, config.appId);
  assert.equal(manifest.service.apiUrl, config.apiUrl);
  assert.equal(manifest.ads.adUnitId, config.adUnitId);
  assert.equal(manifest.previewOnly, !config.production);
  assert.equal(manifest.resourceUrl, config.resourceUrl);
  assert.deepEqual(await inventory(directory, mainManifests), manifest.files, 'WeChat package integrity mismatch');
  assert.deepEqual(await inventory(directory + '-remote'), manifest.resources, 'Remote resource integrity mismatch');
  const project = JSON.parse(await readFile(path.join(directory, 'project.config.json'), 'utf8'));
  const game = JSON.parse(await readFile(path.join(directory, 'game.json'), 'utf8'));
  assert.equal(project.appid, config.appId);
  assert.equal(game.deviceOrientation, 'landscape');
  const settingsFile = manifest.files.find((file) => /^src\/settings.*\.json$/.test(file.path));
  assert(settingsFile, 'Creator settings missing');
  const settings = JSON.parse(await readFile(path.join(directory, settingsFile.path), 'utf8'));
  assert.equal(settings.assets.server, config.resourceUrl);
  assert(settings.assets.remoteBundles.includes('resources'), 'Resources must use the official remote bundle');
  assert(!settings.assets.subpackages.includes('resources'), 'Remote resources cannot also be a local subpackage');
  assert(manifest.resources.some((file) => /resources\/config.*\.json$/.test(file.path)), 'Remote bundle missing');
  let bytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0) +
    (await readFile(path.join(directory, 'wechat-manifest.json'))).length;
  for (const [name, omitted] of [['platform-manifest.json', mainManifests.slice(1)], ['artifact-manifest.json', mainManifests.slice(2)]]) {
    const outer = await readFile(path.join(directory, name)).catch((error) => {
      if (error.code === 'ENOENT') return Buffer.alloc(0);
      throw error;
    });
    bytes += outer.length;
    if (outer.length) assert.deepEqual(await inventory(directory, omitted), JSON.parse(outer).files, 'Outer manifest integrity mismatch');
  }
  assert(bytes <= 4 * 1024 * 1024, `WeChat main package exceeds 4 MiB: ${bytes}`);
  return manifest;
}
