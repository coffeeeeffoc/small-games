/** Public H5 target identifiers only.
 * pnpm build:games --dry-run validates; pnpm build:games builds without uploading.
 */
export default {
  version: 2,
  games: ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'],
  targets: [
    {
      platform: 'taptap',
      type: 'h5',
      ads: [false, true],
      adUnits: {
        'cops-robbers': '1054324',
        'cops-robbers-realtime': '1054324',
        'xiangqi-five': '1054324',
      },
      tapServices: {
        'cops-robbers': {
          enabled: true,
          appConsoleId: '982507',
          appId: 'tapmcxkgyp8f6atdqr',
          leaderboardId: 'z3nf6zkrricapllh2k',
        },
        'cops-robbers-realtime': {
          enabled: true,
          appConsoleId: '980554',
          appId: 'tapmc7uoynpdag3hl5',
          leaderboardId: 'vkxuarn8divk17o04z',
        },
        'xiangqi-five': {
          enabled: true,
          appConsoleId: '982449',
          appId: 'tapmcyzizzcvo4amav',
          leaderboardId: 'mdgzfvle71ugtv1ird',
        },
      },
    },
  ],
  ads: [false],
  backend: [false],
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',
  localBackend: false,
};
