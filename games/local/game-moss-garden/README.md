# 苔光花园

一款原创植物主题的竖屏逻辑小游戏。每行、每列和每片彩色花圃各安放一颗光种，光种之间不能相邻（包括相邻斜角；远距离同一对角线允许）。点格子播种，再点取回；切换标记后可以拖动排除格子，支持撤回和解释提示。

167 章共 1000 个独立生成的静态关卡，从 4×4 到 8×8。每关的花圃四向连通，经过独立求解器验证唯一解，排除旋转/镜像/换色重复。原 30 关 ID 与布局不变，旧版本存档可以继续第 31 关。内容 revision 升至 2，schema 和存档 version 仍为 1。正常通关逐关解锁，已通关可以重玩；不设置失败生命，基础播种、标记与撤回免费。主页、选关、游玩、暂停、手册、设置和结算均已实现；进度和当前对局通过 Game Host 存档接口保存，存储不可用时继续本地游玩。

关卡选择采用按章浏览的六个大关卡按钮，区分当前、已通关和未解锁。主页、暂停和结算均可直接选关；选中当前关卡或点击「继续第 N 关」恢复原棋盘。结算显示「第 N 关 · 已通关」和「挑战第 N+1 关」，末关提供全部通关后的选关与重玩。主页明确播种目标，首关用金框引导单格花圃，结算展示本关种子开花。最新设计与验证见 [千关扩展](docs/design/expansion-2026-10-21/design.md)。

## 运行与验证

在仓库根目录使用固定 Node.js 24.21.0 / pnpm 12.6.0：

```sh
pnpm --filter @coffeeeeffoc/game-moss-garden dev
pnpm exec turbo run build --filter=@coffeeeeffoc/game-moss-garden
pnpm --filter @coffeeeeffoc/game-moss-garden test
pnpm --filter @coffeeeeffoc/game-moss-garden test:browser
```

独立 Web 地址为 `/games/moss-garden/index.html`，游戏目录路由为 `#/games/moss-garden`。浏览器回归脚本默认用 `/usr/bin/chromium`，也支持 `PLAYWRIGHT_EXECUTABLE_PATH` 和 `GAME_URL`。实际浏览器截图及记录见 [验证说明](docs/verification.md)，先行效果图和设计说明见 [设计目录](docs/design/README.md)。

## 原生小游戏

同一份纯规则、Controller 和 Canvas 渲染运行在微信、抖音、B站、快手四个平台，原生包不依赖 DOM，也不展示浏览器全屏按钮。所有美术使用原创 Canvas 路径；三段音效通过正弦波合成，无外部字体和图片依赖。

```sh
pnpm minigame:build --game moss-garden --platform wechat --preview
pnpm minigame:build --game moss-garden --platform douyin --preview
pnpm minigame:build --game moss-garden --platform bilibili --preview
pnpm minigame:build --game moss-garden --platform kuaishou --preview
node scripts/native-game-smoke.mjs --standalone --game moss-garden
```

输出在 `apps/shell-minigame/dist/<platform>/moss-garden/`。正式构建使用 `--app-id` 或 `--config` 配置实际 AppID，不加 `--preview`；现有构建器会拒绝缺少 AppID 的正式构建。四个平台的开发者工具和客户端真机验证需在这些包上完成，当前交付验证为浏览器触屏模拟和原生 SDK mock。

Web 全屏复用 `platforms/h5/fullscreen.js`，不支持时仍可正常游玩。开发模式遵循统一 `?dev=1` / `localStorage.dev` 约定；开发面板的「任意选关（1–1000）」和选关页「输入关卡号 · 试玩」都可直接进入任意关，开发选关页全部可点。试玩的提示免费，不写正常通关/当前棋盘，也不分享试玩战绩。显式 `?dev=0` 关闭后恢复普通逐关解锁。

## 代码与内容

| 文件                | 职责                                             |
| ------------------- | ------------------------------------------------ |
| `src/content.ts`    | 稳定关卡 ID、章节、独立花圃配置与目录校验        |
| `src/rules.ts`      | 摆放约束、求解器、提示、撤回、棋盘 schema 与恢复 |
| `src/progress.ts`   | 版本 1 存档校验、连续解锁与幂等结算              |
| `src/controller.ts` | 页面、触屏取消、暂停计时、串行存档和试玩隔离     |
| `src/render.ts`     | 原创植物绘画、棋盘与触控热区                     |
| `src/canvas.ts`     | Game Contract、内容版本校验与原生入口            |
| `src/web.ts`        | Web Game Host、无障碍按钮、浏览器输入和音效      |

增加关卡应修改配置和目录，再执行规则与浏览器回归；内容修订需同步 envelope revision 和存档迁移，避免覆盖现有稳定 ID。

机制参考 [Meowdoku 官方玩法介绍](https://play.google.com/store/apps/details?id=com.oakever.meowdoku) 和通用的 [Queens 规则](https://www.linkedin.com/help/linkedin/answer/a6269510)。代码、名称、植物美术、界面文案、音效和花圃布局均独立创作，没有导入参考作品素材或关卡数据。

## 提示与通用激励端口

每局第一条提示免费；之后点击「视频提示」进入确认页，完整观看获得一次提示（种下一颗或修正一颗）。首免已用状态由 puzzle.hints 保存，撤回/刷新不会返还。广告取消、未看完、失败、不可用时不改变棋盘和提示数；玩法仍可继续。

控制器使用 `GameHost.ads.offer({ id: 'moss-garden.hint', reward: { kind: 'hint', count: 1, levelId } })`，只接受 `status: 'completed'` 发放一次。Web 在每次请求时读取宿主注入的 `globalThis.SmallGamesRewardAds.offer`（兼容 `show`），取消时调用宿主 `cancel`。请求绑定当前局面，退出或销毁后回调作废，广告隐藏期间完成的提示等前台恢复再发放。

后续 TapTap H5 打包复用仓库 `platforms/h5/game-rewards.js → platform-ads.js → tap.createRewardedVideoAd`，不要经旧 publishing.rewarded 的总超时层。打包注入 `SmallGamesPublishingConfig` 的 `adMode: 'host'`、`adsEnabled: true`、`platform: 'taptap-h5'` 及本游戏真实 `adUnitId`，在游戏入口前加载公共 game-rewards.js（连同 platform-ads.js、interstitial.js）。普通独立页面没有广告宿主时会明确提示不可用，不用模拟视频发奖。

统一 `build:games` 已登记 `moss-garden`、源码目录 `games/local/game-moss-garden`、广告位环境变量 `TAPTAP_MOSS_GARDEN_AD_UNIT_ID` 和 portrait 方向。2026-10-27重试 MCP 后确认 App1000893 广告已生效、竖屏方向有效，返回广告位1054324，已填写根 `game-build.local.mjs`，当前批次未选择本游戏；复用现有提示逻辑，无需另外安装 SDK。真实库存与 TapTap 宿主播放仍待验收。原生 Canvas 使用宿主 GameHost 广告能力，原生 TapADN 需单独验收，不能复用 H5 广告位。

离线关卡可复现检查：`node games/local/game-moss-garden/scripts/generate-levels.mjs --check`。普通扩关不在运行时随机生成。

上架资料与验证边界：[publishing/STATUS.md](publishing/STATUS.md)。
