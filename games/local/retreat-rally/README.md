# 收兵再冲

原创单线进退战斗原型。六名青岚士兵自动推进、接敌；按住收兵，松手进攻。退开后恢复体力，不回血、不复活。敌军继续推进，夺下敌方军旗获胜。

## 试玩

仓库根目录：

```sh
pnpm --filter @coffeeeeffoc/retreat-rally dev
```

独立地址：<http://localhost:4420/>。Shell 路由 `#/games/retreat-rally`；独立发布入口 `/games/retreat-rally/index.html`。使用仓库标准 `pnpm --filter @coffeeeeffoc/shell-web dev` 或 `pnpm build:pages` 打包目录。开发服务启动时复制游戏构建，修改游戏后需重新准备 Shell 静态副本。

- 人机战役：山谷初战（齐射）、追兵压境（追击加速）、连弩险关（两段箭雨）。正常通关依次解锁；六人存活得三枚军功，四至五人得两枚，其余一枚。
- 随机匹配：本地匹配演示，明确显示模拟对手。抽选不同反应延迟，不连接真人或后端。可取消。
- 好友对战：真实可操作的同屏双人。蓝、红各六名相同属性士兵，双方各一枚收兵按钮，箭雨同时警告双方。支持独立多触点、松手和取消。
- 鼠标/触屏长按；键盘空格或 A 指挥蓝方，L 指挥红方，Esc 暂停。失焦、切后台会释放指令并暂停，恢复后手动继续。
- 三分钟未分胜负按平局收兵。存档仅保存关卡军功和静音偏好；对战与开发试玩不改变战役进度。

按本次用户确认，**不实现、不接入后端**，不提供联网房间或跨设备实时对战。不提供支付、排行榜和奖励翻倍入口。2026-10-11 扩围新增同关异步战绩挑战及频控模拟插屏，仍不提供跨设备实时对战。

## 微信小游戏预览

复用仓库 `native-game-shell`、微信适配器和 Game Host 存档；原生入口为 `src/native.mjs`，与 H5 共用规则、关卡与战场绘图，无 DOM、浏览器全屏 API 或后端调用。

```sh
pnpm minigame:build --platform wechat --game retreat-rally --preview
node scripts/native-game-smoke.mjs --platform wechat --game retreat-rally
```

输出 `apps/shell-minigame/dist/wechat/retreat-rally/` 可导入微信开发者工具。预览使用 `touristappid`，`game.json` 指定横屏。正式打包需传入实际 `--app-id wx…`，不得把预览包当成已上线版本。已验证构建与模拟 SDK 无 DOM 启动、暂停恢复、多触点和清理；**尚未完成微信开发者工具及手机真机验收**。

## 实现与验证

- `src/levels.mjs`：独立关卡配置和 schema 校验，稳定 ID、前置关系、箭雨节奏与追击参数。
- `src/simulation.mjs`：无平台依赖模拟。预警锁定落点，同步结算近战伤害，避免双人先遍历的一方占优；固定细分步长并限制后台时间跳变。
- `src/progress.mjs`：v1 存档校验、解锁与幂等结算；无法读写存储时仍能游玩。
- `src/renderer.mjs`：原创程序绘制的旗帜、士兵、挥刀、弓箭和体力/伤害反馈。AI 生成山水背景压缩为单张约 428 KB WebP，概念图不作为战场画面。
- `src/main.mjs` / `src/native.mjs`：Web 与原生界面/输入适配。Web 在竖屏时旋转完整界面，使用公共 H5 全屏、统一开发模式，Shell 战斗时隐藏外围导航。

```sh
pnpm --filter @coffeeeeffoc/retreat-rally test
pnpm --filter @coffeeeeffoc/retreat-rally build
pnpm --filter @coffeeeeffoc/retreat-rally test:browser
pnpm check:dev-mode
pnpm test:dev-mode
DEV_MODE_GAME_IDS=retreat-rally pnpm test:dev-mode:browser
pnpm test:h5-fullscreen
```

浏览器验收需先准备 Shell 生产构建及本游戏静态副本。测试脚本自动开临时端口，支持 `PLAYWRIGHT_EXECUTABLE_PATH`。使用真实控件输入和可控时钟，不直接修改战斗状态。覆盖三关胜利、失败重试、存档恢复、模拟匹配取消、同屏双人、390×844 / 360×800 竖屏兜底和 844×390 横屏、方向切换、Shell 出入与触点取消。记录与实际截图位于 `docs/verification/`，概念图位于 `docs/design/`。

浏览器模拟不等于真机验证。尚未做用户试玩或留存测试。全量其他游戏制品与线上部署不属于本游戏验收。

## 2026-10-11 扩围优化

箭雨提示新增随真实波次推进的节拍条。最后一轮落下后提供两秒「反攻窗口 · 松手进攻」反馈，双箭关在两轮之间继续警示，不误报安全窗口。沿用原有单位数值，保留六人可通关的平衡。

战役胜利可以分享同关目标（存活人数与夺旗用时）；链接校验关卡和成绩范围，移除开发参数，分享取消/不可用时有准确提示与手动复制。挑战可进入未解锁关卡，但不写正常军功、解锁或开发成绩。正常同屏双人和模拟匹配保留原入口。

每三次自然结算经公共频控显示可立即关闭的模拟插屏，首两次不打断，至少60秒间隔、每次游戏会话最多3次，无广告奖励。生产构建直接复制 `platforms/h5/publishing.js`，开发服务读取公共源。

专项验证：`node games/local/retreat-rally/tests/publishing.browser.mjs`（从仓库根运行）。设计及横屏/竖屏旋转后的触屏截图见 [扩围记录](docs/design/expansion-2026-10-11/README.md)。

部署可通过 `SmallGamesPublishingConfig.adMode`（由 `DEPLOY_H5_AD_MODE` 注入）选择 off/mock/host，并接受 publicUrl 和 Game Host provider。默认使用明确标识的模拟广告；off 模式完全关闭结算插屏。
