/** Build-time public settings only; account credentials never enter the H5 artifact. */
import { h5AdConfig } from '../../../../scripts/h5-ad-config.mjs';
export function adConfiguration(taptap, env = process.env, args = []) {
  if (taptap && env.H5_ADS_ENABLED === undefined && !args.includes('--without-ads'))
    env = { ...env, H5_ADS_ENABLED: '1' };
  return h5AdConfig('cops-robbers', { env, args });
}

export const configurationScript = config => `globalThis.SmallGamesPublishingConfig ??= Object.freeze(${JSON.stringify(config)});\n`;
