/** 修改根目录 game-build.local.mjs，先 pnpm build:games --dry-run，再正式构建。
 * 仅填写公开应用信息、广告位和 API 地址；配置不包含服务端凭据。
 */
export default {
  version: 2,
  games: ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'],
  targets: [
    {
      platform: 'taptap',
      type: 'h5',
      // 开广告时按游戏填写 H5 广告位。
      adUnits: {},
      // 可选云存档、排行榜与好友对战，使用各 H5 应用自己的公开配置。
      tapServices: {},
    },
  ],
  ads: [false], // [false, true] 同时生成两种广告变体。
  backend: [false], // [false, true] 同时生成离线和在线变体。
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',
  localBackend: false, // true 仅允许本机 H5 HTTP 验证。
};
// 输出 outputs/game-builds/<批次>/taptap-h5/，单款 ZIP 上传到 H5 入口。
