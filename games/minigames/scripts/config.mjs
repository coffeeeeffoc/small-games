import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const repo = path.resolve(root, '../..');
export const creatorVersion = '3.8.8';
export const games = Object.freeze({
  'cops-robbers': {
    title: '围捕小队',
    orientation: 'portrait',
    entry: 'games/minigames/cops-robbers/controller.mjs',
    start: 'startCocosCopsGame',
    scene: 'bd0162fa-a517-4f91-8b48-7a2dba290101',
    script: 'bd0162fa-a517-4f91-8b48-7a2dba290102',
  },
  'cops-robbers-realtime': {
    title: '街区追逐',
    orientation: 'landscape',
    entry: 'games/local/cops-robbers-realtime/src/native.js',
    start: 'startNativeStreetGame',
    scene: 'bd0162fa-a517-4f91-8b48-7a2dba290201',
    script: 'bd0162fa-a517-4f91-8b48-7a2dba290202',
  },
  'xiangqi-five': {
    title: '象棋五子棋',
    orientation: 'portrait',
    entry: 'platforms/competition/xiangqi-five/native.js',
    start: 'startNativeXiangqiGame',
    scene: 'bd0162fa-a517-4f91-8b48-7a2dba290301',
    script: 'bd0162fa-a517-4f91-8b48-7a2dba290302',
  },
});
export const platforms = Object.freeze({
  'web-preview': 'web-mobile',
  wechat: 'wechatgame',
  taptap: 'wechatgame',
  bilibili: 'wechatgame',
  douyin: 'bytedance-mini-game',
  kuaishou: 'wechatgame',
  alipay: 'alipay-mini-game',
  baidu: null,
});
export const modules = ['base', 'gfx-webgl', 'gfx-webgl2', '2d', 'ui', 'audio'];

export function configuration(game, platform, { release = false, env = process.env } = {}) {
  assert(Object.hasOwn(games, game), `Unknown game: ${game}`);
  assert(Object.hasOwn(platforms, platform), `Unknown platform: ${platform}`);
  assert(
    platform !== 'baidu',
    'Creator 3.8 removed Baidu on 2022-11-30. No supported Baidu artifact can be built with the pinned engine; use an officially supported engine/adapter first.',
  );
  assert(
    !(release && platform === 'web-preview'),
    'web-preview is a developer preview, not a release channel',
  );
  const prefix = `MINIGAME_${game.toUpperCase().replaceAll('-', '_')}_${platform.toUpperCase().replaceAll('-', '_')}_`;
  const value = (name) => env[prefix + name] || env[`${platform.toUpperCase()}_${name}`] || '';
  const appId = value('APP_ID'),
    apiUrl = value('API_URL'),
    adUnitId = value('AD_UNIT_ID');
  assert(!appId || /^[A-Za-z0-9_-]{1,128}$/.test(appId), 'Invalid public AppID');
  if (platform === 'wechat' && appId)
    assert(/^wx[\da-f]{16}$/i.test(appId), 'Expected a WeChat wx AppID');
  if (platform === 'douyin' && appId)
    assert(/^tt[A-Za-z0-9_-]+$/.test(appId), 'Expected a Douyin tt AppID');
  if (platform === 'alipay' && appId)
    assert(/^\d{16}$/.test(appId), 'Expected an Alipay 16-digit AppID');
  if (['taptap', 'bilibili', 'kuaishou'].includes(platform))
    assert(
      !/^(wx|tt|touristappid$|preview-only$|kwai_game_test_appid$)/i.test(appId),
      'A real channel AppID is required; do not reuse preview/WeChat identities',
    );
  if (apiUrl) {
    const url = new URL(apiUrl);
    assert(
      url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
      'API_URL must be public HTTPS without credentials, query or fragment',
    );
  }
  if (release) assert(appId, `Release requires ${prefix}APP_ID`);
  if (release && platform === 'taptap')
    assert(apiUrl, 'TapTap release requires the server code2Session API URL');
  const competitionConfigured = Boolean(
    appId && apiUrl && platform !== 'alipay' && platform !== 'web-preview',
  );
  return {
    game,
    title: games[game].title,
    platform,
    orientation: games[game].orientation,
    appId,
    apiUrl,
    rewardedAdUnitId: adUnitId,
    competitionConfigured,
    competitionEnabled: game === 'xiangqi-five' && competitionConfigured,
    preview: !release,
    assetRoot: '',
    pixelRatio: 1.5,
    maxUploadsPerSecond: game === 'cops-robbers-realtime' ? 30 : 60,
    debug: !release,
  };
}

export function creatorConfiguration(config) {
  const platform = platforms[config.platform],
    descriptor = games[config.game];
  const appid = ['taptap', 'kuaishou'].includes(config.platform)
    ? 'touristappid'
    : config.appId ||
      (config.platform === 'bilibili'
        ? 'preview-only'
        : platform === 'wechatgame'
          ? 'touristappid'
          : '');
  return {
    name: config.game,
    platform,
    debug: false,
    md5Cache: false,
    buildPath: 'project://build',
    outputName:
      config.platform === 'bilibili'
        ? 'wechat-bilibili-source'
        : ['taptap', 'kuaishou'].includes(config.platform)
          ? `${config.platform}-source`
          : config.platform,
    includeModules: modules,
    startScene: descriptor.scene,
    scenes: [{ url: 'db://assets/scenes/main.scene', uuid: descriptor.scene }],
    packages:
      platform === 'web-mobile'
        ? { 'web-mobile': { orientation: config.orientation } }
        : platform === 'alipay-mini-game'
          ? { [platform]: { deviceOrientation: config.orientation } }
          : {
              [platform]: { appid, orientation: config.orientation, separateEngine: false },
              ...(config.platform === 'bilibili'
                ? {
                    'biligame-builder': {
                      isBiliGame: true,
                      biliGameAppId: appid,
                      biliGameVersion: '0.1.0',
                    },
                  }
                : {}),
            },
  };
}
