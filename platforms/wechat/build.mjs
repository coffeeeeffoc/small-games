export const wechatPlatform = {
  module: '@coffeeeeffoc/platform-wechat',
  sdk: 'wx',
  start: 'startWechatGame',
  appId: /^wx[0-9a-f]{16}$/,
  entryArguments: ({ adUnitId }) => JSON.stringify(adUnitId),
  files({ game, appId }) {
    return {
      'game.json': { deviceOrientation: 'portrait' },
      'project.config.json': {
        appid: appId || 'touristappid',
        projectname: `${game}-wechat`,
        compileType: 'game',
        miniprogramRoot: './',
        setting: { es6: true },
      },
    };
  },
};
