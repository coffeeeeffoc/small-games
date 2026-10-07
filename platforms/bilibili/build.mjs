export const bilibiliPlatform = {
  module: '@coffeeeeffoc/platform-bilibili',
  sdk: 'bl',
  start: 'startBilibiliGame',
  appId: /^biligame[A-Za-z0-9]+$/,
  entryArguments: ({ title, adUnitId }) => `${JSON.stringify(title)}, ${JSON.stringify(adUnitId)}`,
  files({ game, appId, version }) {
    return {
      'game.json': {
        deviceOrientation: 'portrait',
        appId,
        version,
        ...(game === 'travel-bund'
          ? {
              androidHighPerformance: true,
              'androidHighPerformance+': true,
              iOSHighPerformance: true,
              'iOSHighPerformance+': true,
            }
          : {}),
      },
      'project.config.json': {
        appid: appId,
        projectname: `${game}-bilibili`,
        compileType: 'game',
        miniprogramRoot: './',
        setting: { es6: true },
      },
    };
  },
};
