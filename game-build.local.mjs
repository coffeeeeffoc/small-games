/** Public target identifiers only. H5 and native apps own separate saves and rankings.
 * Native ads await a dedicated TapADN/Dirichlet position; never reuse the H5 slot.
 * pnpm build:games --dry-run validates; pnpm build:games builds without uploading.
 */
export default {
  version: 2,
  games: ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'],
  targets: [
    {
      platform: 'taptap',
      type: 'minigame',
      release: true,
      ads: [false],
      appIds: {
        'cops-robbers': 'tapmcyeuvshseosntg',
        'cops-robbers-realtime': 'tapmcfcyjcnccm3pvq',
        'xiangqi-five': 'tapmcgymnoqi9kdbls',
      },
      adUnits: {},
      tapServices: {
        'cops-robbers': {
          enabled: true,
          appConsoleId: '984485',
          appId: 'tapmcyeuvshseosntg',
          leaderboardId: 'v7d59z8auhd6qadwh4',
        },
        'cops-robbers-realtime': {
          enabled: true,
          appConsoleId: '984546',
          appId: 'tapmcfcyjcnccm3pvq',
          leaderboardId: 'rw09ikvhfl9zc1e0c4',
        },
        'xiangqi-five': {
          enabled: true,
          appConsoleId: '984547',
          appId: 'tapmcgymnoqi9kdbls',
          leaderboardId: 'l5civj20ocg584u24q',
        },
      },
    },
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
