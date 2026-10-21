import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function nativeRewardConfig(channel, env = process.env) {
  if (!['wechat', 'douyin', 'bilibili'].includes(channel)) throw Error('Unknown reward channel');
  const key = `MERGE_FRONT_${channel.toUpperCase()}_AD_UNIT_ID`;
  const adUnitId = (env[key] || '').trim();
  if (adUnitId && (!/^[\w-]{1,160}$/.test(adUnitId) || /^(YOUR_|REPLACE_|TODO)/i.test(adUnitId)))
    throw Error(`${key} must be a real native ad unit ID`);
  return { platform: channel, adUnitId };
}

export async function installNativeRewards(directory, channel, env = process.env) {
  const config = nativeRewardConfig(channel, env);
  const source = await readFile(
    new URL('../../../../platforms/h5/platform-ads.js', import.meta.url),
    'utf8',
  );
  if (
    !source.startsWith('/**') ||
    (source.match(/export function /g) || []).length !== 1 ||
    /^import /m.test(source)
  )
    throw Error('Shared provider changed; review its native CommonJS packaging');
  // Package the common provider unchanged apart from its module export.
  const provider = source.replace(
    'export function createPlatformAdProvider',
    'function createPlatformAdProvider',
  );
  await writeFile(
    path.join(directory, 'merge-rewards.js'),
    `${provider}\nconst config = ${JSON.stringify(config)};
const provider = createPlatformAdProvider(config);
globalThis.MergeFrontHost = { ads: {
  available: Boolean(config.adUnitId),
  offer: request => provider.show({opportunityId: request.id, kind: 'rewarded'}),
  cancel: () => provider.cancel(),
  dispose: () => provider.dispose()
}};\n`,
  );
  const entry = path.join(directory, 'game.js');
  const code = await readFile(entry, 'utf8');
  await writeFile(entry, `require('./merge-rewards.js');\n${code}`);
  return config;
}
