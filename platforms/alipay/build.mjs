export const alipayPlatform = {
  module: '@coffeeeeffoc/platform-alipay',
  sdk: 'my',
  start: 'startAlipayGame',
  appId: /^\d{16}$/,
  advertising: false,
  entryArguments: () => '',
  files({ game, appId, orientation = 'portrait' }) {
    return {
      // deviceOrientation is current; screenOrientation is documented as historical.
      'game.json': { deviceOrientation: orientation, showStatusBar: false },
      'mini.project.json': {
        format: 2,
        miniprogramRoot: './',
        // JSON textbooks are runtime assets, not application configuration files.
        assetsInclude: [
          ...(game === 'wulong-city' ? ['assets/audio/*.wav'] : ['competition-action.wav']),
          ...(game === 'letters-words2' ? ['assets/english-dict/**/*.json'] : []),
          ...(game === 'travel-bund'
            ? [
                'assets/**/*.wasm',
                'assets/**/*.glb',
                'assets/**/*.json',
                'assets/licenses/*.txt',
                'assets/licenses/*.md',
              ]
            : []),
        ],
      },
      'alipay-preview.json': {
        game,
        preview: !appId,
        appId: appId || null,
        verification: 'requires-official-developer-tools-and-device',
      },
    };
  },
};
