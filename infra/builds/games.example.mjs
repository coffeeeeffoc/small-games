/**
 * 字段参考模板；日常直接修改仓库根的 game-build.local.mjs，不覆盖已有配置。
 * game-build.local.mjs 随 Git 管理版本：本机试打通过后提交，不合适则回退。
 * pnpm build:games --dry-run 只检查配置、列出任务；pnpm build:games 正式构建。
 * 也可用 pnpm build:games --config path/to/config.mjs 选择其他配置。
 * 本文件是 JavaScript，支持行注释、块注释和尾逗号；只需维护下面的对象。
 * 仅填写公开 AppID、广告位和 API 地址，不填写 AppSecret、令牌或登录凭据。
 */
export default {
  // 2 = 多平台、多包类型配置。旧版本 1 仅表示 TapTap H5，仍可读取。
  version: 2,

  // 只构建这里明确列出的游戏；空数组会报错，不会默认构建所有游戏。
  // 当前已接入以下三款，取消注释即可选择；其他游戏需先接入构建器。
  games: [
    // 'cops-robbers',          // 围捕小队：回合制
    // 'cops-robbers-realtime', // 别跑！街区围捕：实时玩法
    // 'xiangqi-five',         // 象五子棋
  ],

  // 可同时选择多个目标；每个目标都会构建 games 中的每款游戏。
  // 同一平台可同时选择 h5 和 minigame，但不能重复相同 platform + type。
  targets: [
    {
      platform: 'taptap',
      // minigame = 原生小游戏包；h5 = 网页包。不是 Android APK。
      type: 'minigame',

      // 默认 true：所有选中游戏都必须填写本平台真实 AppID，缺少就整批报错。
      // false 仅供显式预览；不会自动降级，预览包也不会标为正式上传文件。
      release: true,

      // 每款游戏独立配置。TapTap 填 MiniApp ID，通常以 tap 开头。
      // 查看位置：该应用开发者后台 → 应用配置 → MiniApp ID。
      // 部分版本入口为「开放能力 → 小游戏基本信息」。
      // 后台 URL /app/984485 中的数字是后台应用 ID，不是这里的 MiniApp ID。
      // 可以预填其他已接入游戏的 ID；仅 games 选中的游戏参与构建与缺失检查。
      appIds: {
        // 'cops-robbers': '',
        // 'cops-robbers-realtime': '',
        // 'xiangqi-five': '',
      },

      // ads 包含 true 时，每款游戏必须填写本目标的真实广告位 ID。
      // 无广告时可留空；H5 和原生广告位分开填写，不能相互回退。
      // Tap SDK services work independently of backend. Fill target-owned public IDs.
      tapServices: {
        // 'cops-robbers': { enabled: true, appConsoleId: 'YOUR_CONSOLE_ID', appId: 'YOUR_MINIAPP_ID', leaderboardId: 'YOUR_LEADERBOARD_ID' },
      },
      adUnits: {
        // 'cops-robbers': '',
        // 'cops-robbers-realtime': '',
        // 'xiangqi-five': '',
      },

      // 可在目标内覆盖全局默认值，例如仅此目标生成离线、无广告包：
      // ads: [false],
      // backend: [false],
    },

    // 同时生成 TapTap H5 包：取消注释下面整个对象。
    // H5 的应用归属由上传后台关联，不填写原生 appIds / release。
    // {
    //   platform: 'taptap',
    //   type: 'h5',
    //   adUnits: {}, // 开广告时按游戏填写 H5 广告位
    //   tapServices: {}, // H5 应用的 console/app/leaderboard IDs，不能复用原生应用
    // },

    // 同时生成微信工程：取消注释并为每款已选游戏填真实 wx... AppID。
    // 微信产物导入微信开发者工具预览/上传，不是 TapTap ZIP。
    // {
    //   platform: 'wechat',
    //   type: 'minigame',
    //   release: true,
    //   appIds: {
    //     'cops-robbers': '',
    //     'cops-robbers-realtime': '',
    //     'xiangqi-five': '',
    //   },
    //   adUnits: {},
    // },

    // 其他已接入原生平台：bilibili、douyin、alipay、kuaishou。
    // 前三者输出开发者工程；快手仅输出待官方转换的微信源工程。
    // 当前支付宝不支持本仓库的在线竞赛服务，backend 必须为 [false]。
    // 百度、QQ、OPPO、vivo 等尚未接入的目标会报错，不能仅改名称使用。
  ],

  // 默认广告变体：[false] 无广告；[true] 有广告；[false, true] 两种都打。
  // 填入广告位只配置已实现的广告能力，仍需平台真实播放验证。
  ads: [false],

  // 默认后端变体：[false] 离线；[true] 在线；[false, true] 两种都打。
  // 广告和后端做所有组合：两项都选 false/true 时，每款每目标生成 4 个包。
  // 目标自己的 ads / backend 优先；关闭后端的包内 API 地址会清空。
  backend: [false],

  // 任一实际任务开启后端时必须配置公开 HTTPS 地址，无凭据、查询串或片段。
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',

  // true 仅允许 H5 本机验证使用 localhost / 127.0.0.1 的 HTTP 地址。
  // 原生发布仍要求 HTTPS；正常打包保持 false。
  localBackend: false,
};

// 输出：outputs/game-builds/<批次>/<平台>-<类型>/，builds.json 为整批清单。
// TapTap 选择该目录内单款 .zip 上传，不能再次压缩整个批次目录。
// 原生 ZIP 保留官方转换结果；H5 ZIP 用 H5 上传入口；历史批次不会覆盖。
// 本命令不自动提交代码、上传、提审、部署，也不代替平台和真机验收。
