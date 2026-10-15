import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

export const h5AdGames = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
export function h5AdConfig(game, { env = process.env, args = [] } = {}) {
  if (!h5AdGames.includes(game)) throw new Error('Unknown H5 advertising game');
  const on = args.includes('--with-ads'),
    off = args.includes('--without-ads');
  if (on && off) throw new Error('Choose --with-ads or --without-ads');
  const value = on ? '1' : off ? '0' : (env.H5_ADS_ENABLED ?? '0');
  if (!['0', '1'].includes(value)) throw new Error('H5_ADS_ENABLED must be 0 or 1');
  if (value === '0') return { adMode: 'off', adsEnabled: false };
  const key = `TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_AD_UNIT_ID`;
  const adUnitId = (env[key] || '').trim();
  if (adUnitId && (!/^[\w-]{1,160}$/.test(adUnitId) || /^(YOUR_|REPLACE_|TODO)/i.test(adUnitId)))
    throw new Error(`${key} must contain a real advertisement unit ID`);
  return {
    adMode: 'host',
    adsEnabled: true,
    platform: 'taptap-h5',
    adUnitId,
    rewardedAdUnitId: adUnitId,
  };
}

export async function prepareH5Ads(game, directory, options = {}) {
  const config = h5AdConfig(game, options);
  await writeFile(
    path.join(directory, 'platform-config.js'),
    `globalThis.SmallGamesPublishingConfig ??= Object.freeze(${JSON.stringify(config)});\n`,
  );
  const index = path.join(directory, 'index.html');
  let html = await readFile(index, 'utf8');
  if (!html.includes('src="./platform-config.js"'))
    html = html.replace('</head>', '<script src="./platform-config.js"></script></head>');
  if (game === 'xiangqi-five') {
    await copyFile(
      new URL('../platforms/h5/platform-ads.js', import.meta.url),
      path.join(directory, 'platform-ads.js'),
    );
    await copyFile(
      new URL('../platforms/h5/rewarded-host.js', import.meta.url),
      path.join(directory, 'rewarded-host.js'),
    );
    if (!html.includes('src="./rewarded-host.js"'))
      html = html.replace(
        '</head>',
        '<script type="module" src="./rewarded-host.js"></script></head>',
      );
  }
  await writeFile(index, html);
  return config;
}
