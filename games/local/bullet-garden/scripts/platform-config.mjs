import { readFile } from 'node:fs/promises';
export const PREVIEW = Object.freeze({
  platform: 'preview',
  appId: '',
  adUnitId: '',
  adsEnabled: false,
});
export async function platformConfig(filename) {
  if (!filename) return { ...PREVIEW };
  const config = JSON.parse(await readFile(filename, 'utf8'));
  if (
    !config ||
    Array.isArray(config) ||
    Object.keys(config).sort().join(',') !== 'adUnitId,adsEnabled,appId,platform'
  )
    throw Error('Expected platform, appId, adUnitId, adsEnabled only.');
  if (
    !['preview', 'taptap', 'taptap-h5'].includes(config.platform) ||
    typeof config.adsEnabled !== 'boolean'
  )
    throw Error('Invalid channel or adsEnabled.');
  for (const key of ['appId', 'adUnitId'])
    if (typeof config[key] !== 'string' || (config[key] && !/^[\w-]{1,160}$/.test(config[key])))
      throw Error(`Invalid ${key}.`);
  if (
    config.adsEnabled &&
    (config.platform === 'preview' ||
      !config.appId ||
      !config.adUnitId ||
      /^(YOUR_|REPLACE_|TODO)/i.test(config.adUnitId))
  )
    throw Error('Enabled ads require explicit channel and real IDs.');
  return {
    platform: config.platform,
    appId: config.appId,
    adUnitId: config.adUnitId,
    adsEnabled: config.adsEnabled,
  };
}
