# 快手 Canvas 运行端口

`@coffeeeeffoc/platform-kuaishou` 将传入的 `ks` 画布、触摸、前后台、图片、音频及存储能力组装到共享 `native-game-shell`。启动前检查必需方法，缺少 SDK 或生命周期注销方法时明确失败；可选退出能力缺失时返回不可用。存档键按 `kuaishou:<gameId>:` 隔离，不将 SDK 对象暴露给游戏。

```sh
pnpm --filter @coffeeeeffoc/platform-kuaishou test
pnpm minigame:build --platform kuaishou --game cultivation --preview
node scripts/competition-build.mjs --native --platform=kuaishou
node scripts/competition-native-smoke.mjs
```

前两个构建流程分别服务于 Game Host Canvas 游戏和已有五款好友竞赛 Canvas 入口。当前九款接入状态见 [平台矩阵](../../docs/deployment/nine-games-platform-status.md)。原生工程不会装载 iframe、远程 JavaScript 或浏览器 DOM。

## 能力与验证边界

仓库既有 [平台调研](../../docs/research/mini-game-platforms-2026-09-17.md) 记录了快手 `ks` API 与单款小游戏发布路径。[ADR-0010](../../docs/adr/0010-platform-runtime-and-channel-boundaries.md) 引用了官方激励广告直接调用 show 的差异。本轮读取 [快手官方文档](https://open.kuaishou.com/miniGameDocs/gameDev/start/start.html) 被网络代理拒绝（403），未重新核验当前 API 的全部字段与工具配置。

因此本包目前实现的是可执行、经测试的最小运行端口；生成的 `game.json` / `project.config.json` 是供官方工具核对的工程配置模板，AppID 格式仅做本地字符检查，不能替代真实账号权限或官方校验。测试使用 SDK fixture，并未证明官方工具/实体设备兼容。

激励视频暂未实现；构建器拒绝配置快手广告位，游戏奖励请求返回 unavailable。没有从微信或抖音复制未经核验的广告/销毁语义。也未猜测快手服务端 code2Session 协议，现有好友赛服务会明确返回渠道暂不可用，不能把本地模拟身份当作已完成真实登录。

下一步需核验官方工具工程字段与当前 `ks` 基础接口，取得各游戏 AppID，完成触摸、图片、音频、存档、前后台和清理的实体设备验收；再根据官方协议接入服务端登录及广告，最后验证邀请、真实双人竞赛与排行榜。
