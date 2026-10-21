import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { wechatPlatform } from './wechat/build.mjs';
import { douyinPlatform } from './douyin/build.mjs';
import { bilibiliPlatform } from './bilibili/build.mjs';
import { kuaishouPlatform } from './kuaishou/build.mjs';
import { alipayPlatform } from './alipay/build.mjs';
import { taptapPlatform } from './taptap/build.mjs';

const adapters = {
  wechat: wechatPlatform,
  douyin: douyinPlatform,
  bilibili: bilibiliPlatform,
  kuaishou: kuaishouPlatform,
  alipay: alipayPlatform,
  taptap: taptapPlatform,
};
export const domesticChannels = Object.freeze({
  wechat: { nativeHost: true, rewardedAds: true, platformLogin: true },
  douyin: { nativeHost: true, rewardedAds: true, platformLogin: true },
  bilibili: { nativeHost: true, rewardedAds: true, platformLogin: true },
  kuaishou: { nativeHost: true, rewardedAds: false, platformLogin: false },
  alipay: { nativeHost: true, rewardedAds: false, platformLogin: false },
  taptap: { nativeHost: true, rewardedAds: true, platformLogin: true },
  qq: { nativeHost: false, rewardedAds: false, platformLogin: false },
  baidu: { nativeHost: false, rewardedAds: false, platformLogin: false },
  oppo: { nativeHost: false, rewardedAds: false, platformLogin: false },
  vivo: { nativeHost: false, rewardedAds: false, platformLogin: false },
  huawei: { nativeHost: false, rewardedAds: false, platformLogin: false },
  xiaomi: { nativeHost: false, rewardedAds: false, platformLogin: false },
});

/** Public configuration only. This validates parameters, not game support or store readiness. */
export function publicReleaseConfiguration(
  game,
  platform,
  { env = process.env, release = false } = {},
) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(game ?? ''))
    throw new Error('Choose a valid game build key.');
  const descriptor = adapters[platform];
  if (!descriptor)
    throw new Error(
      `${platform}: unsupported native host; parameters alone cannot create a platform adapter.`,
    );
  const prefix = `MINIGAME_${game}_${platform}`.toUpperCase().replaceAll('-', '_');
  const appId = env[`${prefix}_APP_ID`] || '';
  const adUnitId = env[`${prefix}_AD_UNIT_ID`] || '';
  if (typeof appId !== 'string' || (appId && !descriptor.appId.test(appId)))
    throw new Error(`Invalid ${prefix}_APP_ID`);
  if (release && (!appId || /^(touristappid|kwai_game_test_appid)$/.test(appId)))
    throw new Error(`Release requires ${prefix}_APP_ID`);
  if (typeof adUnitId !== 'string' || (adUnitId && !/^[\w-]+$/.test(adUnitId)))
    throw new Error(`Invalid ${prefix}_AD_UNIT_ID`);
  if (adUnitId && descriptor.advertising === false)
    throw new Error(
      `${platform}: rewarded advertising is not implemented; omit ${prefix}_AD_UNIT_ID`,
    );
  return { [game]: { [platform]: { appId, adUnitId } } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({
      options: {
        game: { type: 'string' },
        platform: { type: 'string' },
        release: { type: 'boolean' },
        matrix: { type: 'boolean' },
      },
    });
    const value = values.matrix
      ? domesticChannels
      : publicReleaseConfiguration(values.game, values.platform, { release: values.release });
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
