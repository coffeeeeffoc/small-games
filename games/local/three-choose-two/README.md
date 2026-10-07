# 三块选两块

竖屏 8×8 积木消除游戏。每组三块，摆放两块后自动舍弃第三块；行列同时清除，无旋转、重力或时间限制。

## 本地运行

```sh
pnpm --filter @coffeeeeffoc/three-choose-two dev
```

打开 `http://localhost:4422/`。H5 大厅入口为 `#/games/three-choose-two`，生产独立入口为 `/three-choose-two/`。

```sh
pnpm --filter @coffeeeeffoc/three-choose-two test
pnpm --filter @coffeeeeffoc/three-choose-two build
pnpm --filter @coffeeeeffoc/three-choose-two test:browser
```

浏览器测试使用 Playwright 和 Chromium，可通过 `BROWSER_EXECUTABLE` 指定可执行文件。手机触屏模拟记录和截图保存在 `docs/design/actual/`；这类测试不等同于真机验收。

## 内容与规则

- `src/engine.mjs`：纯规则、行列同步消除、计分、三选二、胜负、单步撤销、奖励幂等及重放。
- `src/shapes.mjs`：冻结朝向的形状库及统一的分段随机权重。
- `src/levels.mjs`：30 关独立配置、固定候选序列、目标、星级阈值和可验证路径。
- 前 5 关用于教学；第 6–10 关开始跨组铺垫，第 11–20 关加入更多多线和交叉组合，第 21–30 关同时考验空间规划与弃块预算。所有关卡都有可达到三星的合法参考路径，旧局继续按已保存配置恢复。
- `src/progress.mjs`：关卡解锁、最高星级、最好组数、本地练习纪录、当前局及设置。
- `native/canvas.mjs`：使用同一规则和内容的原生 Canvas GameDefinition。

每关三次免费撤销，只回退最近一次落子；撤销跨组会恢复弃块、原候选及下一组随机状态。先检查胜利，再处理弃块、预算、耗尽和无合法落子。无尽只由消除得分，排位不可撤销。

## 在线能力

API 路径为 `/api/competition/v1/three-choose-two`。服务端创建并保存 24 小时会话，以秘密种子产生当前组，确认每步操作并在终结时重新重放。客户端不能提交权威分数。重复操作和结算幂等；排行榜按当前规则版本的最高单局分数，同分并列，按首次达到时间展示。

复用仓库 competition 身份：微信/B站由服务端交换官方登录 code；平台 AppID 和 secret 必须在部署环境配置。H5 现有 guest 身份仅匿名在线试玩，不入正式榜。离线练习成绩仅保存在本地，不转成排位成绩。API 未运行或平台登录未配置时，本地玩法仍可用，界面明确显示网络/身份状态，不填充虚假成绩。

迁移 `infra/migrations/012-three-choose-two.sql` 必须随 runtime-api 部署。异常成绩进入待复核状态；正常玩家的跨设备恢复使用同一平台身份和活动会话。

在线浏览器回归使用独立 `competition_test` 数据库：先应用 010–012 迁移、构建 runtime-api，并启动本游戏的静态服务；设置 `THREE_CHOOSE_TWO_TEST_DATABASE_URL` 后运行 `pnpm --filter @coffeeeeffoc/three-choose-two test:online:browser`。`PSQL_PATH` 可指定 psql，`THREE_CHOOSE_TWO_ONLINE_BROWSER_URL` 可指定生产页面地址。该流程用隔离的测试身份，不等同于官方登录验收。

## 微信与 B站预览工程

```sh
pnpm minigame:build --game three-choose-two --platform wechat --preview
pnpm minigame:build --game three-choose-two --platform bilibili --preview
```

导入 `apps/shell-minigame/dist/<platform>/three-choose-two/`。预览构建不等于平台发布；真机、正式平台身份、审核和广告需要平台环境验收。激励广告未配置时不展示可领取的续局奖励；核心规则已提供完成奖励后增加固定两组的幂等接口。

配置后的原生在线模式复用正式平台登录。通过 `--config` 指定 `apps/shell-minigame/release-config.example.json` 格式的配置，每个平台填写自己的 `appId` 与 HTTPS `apiUrl`（包含 `/api/competition/v1`）；服务端同时配置官方 AppID/secret 和允许来源。也可通过 `THREE_CHOOSE_TWO_API_URL` 提供公开 API 地址。缺少身份或 API 配置时保持离线练习。开发预览只允许回环 HTTP 地址，发行模式要求 HTTPS。微信激励广告使用该平台真实广告单元；B站广告能力依已有适配器验收状态，不假设已可上线。

H5 使用共享 `dev-mode.js`、`fullscreen.js`、`competition.js`。`?dev=1` 或 `localStorage.dev` 可启用按需调试；默认关闭，`?dev=0` 显式关闭。调试成绩与正常进度/排位隔离，公开分享不带开发参数。

首页突出开始/继续、选关和无尽入口。游玩左上角“首页”保存当前局，回首页后可继续；暂停页“退出关卡”放弃当前局并保留已有星级与解锁进度。原生 Canvas 使用相同返回和退出规则。

开发模式下普通选关页也可选择全部 30 关，选关进入独立试玩。开发工具提供参考解、撤销补充、重置、清空棋盘和参数调整；`window.ThreeChooseTwoDev` 的统一权限及扩展动作接口供后续调试功能复用。主页开始/继续仍可正常推进正式关卡，退出试玩会保留原有真实存档。修改试玩状态的权限不用于修改在线排位。

本次难度依据、先行效果图和手机触屏模拟验证见 [2026-10-07 调整记录](docs/design/refresh-2026-10-07/h5-layout.md)。

原始产品说明、先行手机效果图、布局参数和验收记录见 [设计目录](docs/design/README.md)。
