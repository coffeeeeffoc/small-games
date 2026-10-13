/** Build-time public settings only; account credentials never enter the H5 artifact. */
export function adConfiguration(taptap, env = process.env) {
  if (!taptap) return { adMode: 'mock' };
  const adUnitId = env.TAPTAP_COPS_ROBBERS_AD_UNIT_ID?.trim() || '';
  if (adUnitId && (!/^[\w-]{1,160}$/.test(adUnitId) || /^(YOUR_|REPLACE_|TODO)/i.test(adUnitId)))
    throw new Error('TAPTAP_COPS_ROBBERS_AD_UNIT_ID 必须是实际广告位 ID；申请中请留空。');
  return { adMode: 'host', platform: 'taptap-h5', adUnitId };
}

export const configurationScript = config => `globalThis.SmallGamesPublishingConfig ??= Object.freeze(${JSON.stringify(config)});\n`;
