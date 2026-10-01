export const kuaishouPlatform = {
  module: '@coffeeeeffoc/platform-kuaishou',
  sdk: 'ks',
  start: 'startKuaishouGame',
  // Conservative local format check; the platform tool must verify the account's actual AppID.
  appId: /^[A-Za-z0-9_-]{6,128}$/,
  advertising: false,
  entryArguments: () => '',
  files({ game, appId }) {
    return {
      'game.json': { deviceOrientation: 'portrait' },
      'project.config.json': {
        appid: appId,
        projectname: `${game}-kuaishou`,
        compileType: 'game',
        miniprogramRoot: './',
      },
    };
  },
};
