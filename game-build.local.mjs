/** Public H5 target identifiers only.
 * pnpm build:games --dry-run validates; pnpm build:games builds without uploading.
 */
export default {
  version: 2,
  games: [
    // 'cops-robbers',
    // 'cops-robbers-realtime',
    // 'xiangqi-five',
    'night-overwatch',
    // 'wulong-city',
    // 'carding-car',
    // 'letters-words2',
    // 'homebound-station',
    // 'bullet-garden',
    // 'merge-front',
    // 'tower-brake',
    // 'tetracube',
    // 'place-and-clear',
    // 'tianxia-chalu',
    // 'ball-roguelite',
    // 'flick-arena',
    // 'chase-thief',
    // 'moss-garden',
    // 'cage-rescue',
    // 'bullet-garden',
    // 'ashfall-front',
  ],
  targets: [
    {
      platform: 'taptap',
      type: 'h5',
      ads: [true],
      backend: [true],
      tapIdentityAppIds: { 'night-overwatch': 'tapmcjgwi2thafs87k' },
      adUnits: {
        // 'cops-robbers': '1054324',
        // 'cops-robbers-realtime': '1054324',
        // 'xiangqi-five': '1054324',
        // Verified per app through TapTap MCP on 2026-10-23 (H5 only).
        'night-overwatch': '1054323',
        'wulong-city': '1054323',
        'carding-car': '1054323',
        'letters-words2': '1054324',
        // Empty IDs keep rewards off; user-entered drafts below still need per-app MCP checks.
        'homebound-station': '',
        'merge-front': '',
        'tower-brake': '',
        tetracube: '',
        'place-and-clear': '',
        'tianxia-chalu': '',
        'flick-arena': '',
        'ball-roguelite': '',
        'bullet-garden': '1054324', // User-entered; App 1000882, portrait; MCP check pending.
        'chase-thief': '1054324', // User-entered; App 1003107, portrait; MCP check pending.
        'moss-garden': '1054324', // MCP verified 2026-10-27; App 1000893, portrait.
        'cage-rescue': '1054324', // User-entered; App 1000885, portrait; MCP check pending.
        'ashfall-front': '1054323', // User-entered; App 1000862, landscape; MCP check pending.
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
  // development：开发测试包；test：普通测试包；production：正式包。
  // 命令行 --build-type 覆盖此默认值；单游戏 buildType 优先级更高。
  buildType: 'development',
  apiUrls: {
    production: 'https://api.nenggongzhiren.cn/small-games/v1',
  },
  gameOverrides: {
    'night-overwatch': {
      // 当前 FRP 网关只放行夜航；其他游戏接通后再配置其测试地址。
      apiUrls: { test: 'https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1' },
    },
  },
  localBackend: false,
};
