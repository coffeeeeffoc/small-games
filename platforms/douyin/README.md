# 抖音原生小游戏

`@coffeeeeffoc/platform-douyin` 把 `tt` 接到现有 native-game-shell；不引入浏览器或微信 SDK 垫片。构建器按游戏打包，使用 `game.js`、竖屏 `game.json` 和 `project.config.json`。

```sh
pnpm install --no-frozen-lockfile
pnpm --filter @coffeeeeffoc/platform-douyin test
pnpm minigame:build --platform douyin --game building-power --preview
```

预览输出：`apps/shell-minigame/dist/douyin/building-power/`。`--preview` 只允许生成本地检查制品，空 AppID 不代表可以在官方工具中免登录预览。正式构建去掉 `--preview`，传入该游戏的 `--app-id tt...` 或现有 `--config` 文件中的 `building-power.douyin.appId`。`--ad-unit-id` 可选；未配置时广告返回 unavailable，不发奖励。

新增 workspace 依赖为 Web/原生 Shell 的 `@coffeeeeffoc/game-building-power`，原生 Shell 的 `@coffeeeeffoc/platform-douyin`。本包只复用已有 native-game-shell/game-contract 和仓库现有版本的 TypeScript、ESLint、Vitest；依赖统一记录在根 pnpm-lock.yaml。

## SDK 差异与来源

- [开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game)：首个 `tt.createCanvas()` 是上屏画布，输入/前后台/音频由共享原生运行时管理。
- [小游戏存储](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/data-caching/tt-get-storage-sync)：缺失键返回空字符串；读写异常继续上抛。存档使用 `douyin:<gameId>:` 前缀。
- [激励视频指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ad/incentive-ads)及 [API](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/tt-create-rewarded-video-ad)：显式 `multiton: false`，直接 show；仅 `isEnded === true` 算完成，count/重复回调不增加奖励。单例同一时刻只允许一个请求，每次解绑自己的监听。
- [广告 destroy](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-destroy)返回 Promise，重建需要等待。每个请求结束（包括超时）都会销毁 SDK 实例，只有销毁成功才释放租约；等待期间的新请求返回 failed。销毁失败或抛错时继续阻止后续请求，避免旧广告回调误发新请求的奖励。
- [反馈日志](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/performance-optimization-both/performance-optimization/performance-tuning-tool/feedback-log-capability)要求登录，本地单人游戏使用 console 记录，不隐式申请账号。

## 验收边界

适配器测试覆盖触摸取消、后台停止声音、监听清理、存档异常、广告完成/中断/失败/超时/重复通知。Shell 测试覆盖注册与 AppID 门槛。测试和 Vite 构建都不等于官方工具或真机验收。

仍需各渠道真实 AppID、官方工具和设备分别验证画布/安全区、触摸、音频、后台恢复与存档。抖音广告库存、自动分享降级、分享/侧边栏必接能力与审核要求需在真实渠道接入时核验；本包不宣称已通过发布审核，也未实现支付或分享奖励。
