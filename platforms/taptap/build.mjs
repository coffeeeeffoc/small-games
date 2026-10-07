/** Ordinary TapTap mini-game source project, not an upload ZIP or an H5 bundle. */
export const taptapPlatform = {
  module: '@coffeeeeffoc/platform-taptap',
  sdk: 'tap',
  start: 'startTapTapGame',
  // The public docs do not specify an AppID length. Validate a safe opaque identifier,
  // without mistaking the developer-centre numeric game ID for a runtime MiniApp ID.
  appId: /^[A-Za-z0-9_-]+$/,
  advertising: false,
  entryArguments: () => '',
  files({ game, appId, version }) {
    return {
      'game.json': {
        deviceOrientation: 'portrait',
        appId,
        productName: game,
        productVersion: version,
        iOSHighPerformance: true,
      },
      'project.config.json': {
        description: `${game} TapTap mini-game source project`,
        appid: appId,
        projectname: `${game}-taptap`,
        compileType: 'game',
        setting: { es6: true },
      },
    };
  },
};
