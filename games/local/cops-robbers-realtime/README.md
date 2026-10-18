# 街区追捕

手机触屏实时策略游戏：保安与小偷在道路上追逐，点角色选中、点道路下令，至少两名保安封住全部退路并持续合围才算抓获。街区挑战、自由追逐、出口竞速各 100 关，另有 3 关战术试炼和不消耗正式局数的夹击练习。

冲刺提速 20%、持续 4 秒，失败可回溯约 5 秒。前 5 个实际开始的正式对局各赠两种支援 1 次；每局每种可补领 1 次。广告完整观看后只增加次数，返回原页面后再次点击使用；取消或失败不消耗补领资格。广告关闭的构建可直接补领。辅助成绩与普通最佳分开保存，回溯不退还已用次数。暂停、切后台和练习返回保留同局，恢复须明确继续；广告关闭则恢复原游玩页面。

默认离线运行，进度与偏好存于本机；原有共享后端的好友房和纪录服务由 `backend` 配置启用。Web 首页提供开始、装扮、手册、设置及分享入口，随实际方向投影地图，不显示全屏按钮；原生/Cocos 配置横屏。存储不可用时仍能继续本次游戏。

父仓库通过 `game-build.local.mjs` 的 `tapServices` 配置启用首页“TapTap 小站”，提供宿主登录、手动云存档、平台排行榜和 SDK 好友房。这些能力不依赖 `backend` 开关；`backend` 控制原有共享竞赛与纪录服务，后端代码继续保留。SDK 好友房是独立休闲对局，不写单机成绩或正式积分。H5 与原生使用不同应用，云档和排行榜分别保存。普通游戏目录的 `pnpm build` 不等同于该渠道服务包。

[Tap 服务说明](../../../platforms/taptap/docs/game-services.md) · [好友房规则与验证](../../../platforms/taptap/docs/design/multiplayer-2026-10-19/README.md) · [统一构建](../../../docs/operations/game-builds.md)

## 目录

| 路径 | 职责 |
| --- | --- |
| `index.html`、`src/main.js`、`src/renderer.js`、CSS | H5 页面、输入、生命周期和 Canvas 绘制 |
| `src/engine.js`、`src/support.js` | 平台无关的道路模拟、胜负、冲刺与回溯 |
| `src/levels.js`、`challenge-finals.js`、`quick-trials.js`、`layout-variants.js` | 关卡目录及配置；`level-safety.js` 校验逃生路线 |
| `src/native.js`、`src/competition-renderer.js` | 原生小游戏与 Cocos 共用的 Canvas 玩法入口 |
| `src/records.js`、`src/taptap-h5-ads.js`、`src/share.js` | 纪录协议、广告回调与公开分享 |
| `src/tap-save.js`、`src/tap-multiplayer.js` | 云档白名单、榜单计分与平台好友房规则适配 |
| `tests/`、`scripts/` | 规则测试、浏览器验收、构建与专项工具 |
| `docs/`、`src/assets/` | 设计、验证、营销证据与运行素材 |

[Cocos 工程](../../minigames/cops-robbers-realtime/)复用 `src/native.js`，接入与生成文件约定见[原生工程说明](../../minigames/README.md)。H5 与原生共用规则、关卡、装扮和支援实现；页面布局由各自入口适配。内部 `cop`、`robber` 和旧存储键保留兼容，不随角色文案改名。规则还被服务端重放引用，修改时需验证实际消费者。

## 开发与验证

依赖使用仓库根 `pnpm-lock.yaml`，从根目录安装后执行：

```sh
pnpm --filter cops-robbers-realtime dev
pnpm --filter cops-robbers-realtime test
pnpm --filter cops-robbers-realtime test:levels
pnpm --filter cops-robbers-realtime build
pnpm --filter cops-robbers-realtime test:browser
```

`test:browser` 自行启动生产产物服务，覆盖手机触屏、分享、暂停、练习恢复、异步开局取消、支援、存档、iframe 与安全区。默认截图/报告写入本游戏忽略目录 `outputs/browser/`；`OUTPUT_DIR` 可指定输出根目录，两个专项分别使用 `publishing/`、`safe-area/`，不会覆盖历史设计证据。`PLAYWRIGHT_EXECUTABLE_PATH` 可指定浏览器。小偷通关见证在 `tests/fixtures/runner-witnesses.json`，由规则测试真实复演；`test:runner-browser` 是需先启动服务的额外浏览器专项。

游戏包统一从仓库根配置 `game-build.local.mjs`，先运行 `pnpm build:games --dry-run`，再按需运行 `pnpm build:games`；渠道、公开 AppID、H5/原生上传包区别见[统一游戏包构建](../../../docs/operations/game-builds.md)。游戏目录 `pnpm build` 仅产生本游戏静态 `dist/`。不要手改生成的 Cocos 入口或公共副本：`dev-mode.js`/类型由根 `pnpm sync:dev-mode` 同步，`src/fullscreen.js` 仍由根 H5 全屏同步清单管理。

[文档与历史证据索引](docs/README.md) · [TapTap H5 接入](docs/deployment/taptap-h5.md)

浏览器手机尺寸模拟、SDK 夹具和打包校验不代表实体手机、真实商业广告或平台审核通过。
