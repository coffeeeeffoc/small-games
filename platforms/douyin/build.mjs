export const douyinPlatform = {
  module: '@coffeeeeffoc/platform-douyin',
  sdk: 'tt',
  start: 'startDouyinGame',
  appId: /^tt[A-Za-z0-9]+$/,
  entryArguments: ({ adUnitId }) => JSON.stringify(adUnitId),
  files({ game, appId }) {
    return {
      'game.json': { deviceOrientation: 'portrait' },
      'project.config.json': {
        appid: appId,
        projectname: `${game}-douyin`,
        compileType: 'game',
        miniprogramRoot: './',
        setting: { es6: true },
      },
    };
  },
};
