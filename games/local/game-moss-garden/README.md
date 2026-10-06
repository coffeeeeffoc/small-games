# 苔光花园

一款原创植物主题的竖屏逻辑小游戏。每行、每列和每片彩色花圃各安放一颗光种，光种之间不能相邻（包括相邻斜角；远距离同一对角线允许）。点格子播种，再点取回；切换标记后可以拖动排除格子，支持撤回和解释提示。

五章共 30 个独立生成的静态关卡，从 4×4 到 8×8。每关的花圃四向连通，经过独立求解器验证唯一解。正常通关逐关解锁，已通关可以重玩；不设置失败生命或付费门槛。主页、选关、游玩、暂停、手册、设置和结算均已实现；进度和当前对局通过 Game Host 存档接口保存，存储不可用时继续本地游玩。

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

Web 全屏复用 `platforms/h5/fullscreen.js`，不支持时仍可正常游玩。开发模式遵循统一 `?dev=1` / `localStorage.dev` 约定；通过开发面板跳关和完成关卡标记为试玩，不写通关进度。普通选关始终遵循正常解锁。

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
