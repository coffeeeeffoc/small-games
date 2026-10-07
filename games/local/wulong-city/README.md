# 乌龙城

竖屏触屏喜剧解谜小游戏。小岔走进青瓦小城，点按、拖放、转身和移动，处理 100 件不按常理的日常小事。主页、选关、游玩、暂停、三级提示、奇遇手记与结算分别成页；十章选关遵守实际解锁进度。

美术先生成七页效果图，再实现并对照运行截图：[移动端视觉方案](docs/design/mobile-2026-10-06/README.md)。青绿瓦檐、奶油墙、暖金灯笼与黄色帽子小岔共用同一组素材；移动机关、碰撞和触控保持独立。

## 原生小游戏

已接入仓库 Canvas GameDefinition 与 Game Host，微信、抖音、B 站和快手入口直接渲染 Canvas，使用宿主输入、音效、内容和存档，无 DOM 或 WebView 依赖。原生宿主配置竖屏和全屏承载，不显示浏览器全屏按钮。

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/content-schema build
pnpm --filter @coffeeeeffoc/game-contract build
pnpm minigame:build --game wulong-city --platform wechat --preview
pnpm minigame:build --game wulong-city --platform douyin --preview
pnpm minigame:build --game wulong-city --platform bilibili --preview
pnpm minigame:build --game wulong-city --platform kuaishou --preview
node scripts/native-game-smoke.mjs --standalone --platform wechat --game wulong-city
```

产物在 `apps/shell-minigame/dist/<platform>/wulong-city/`，可导入对应开发者工具。正式发布按仓库平台工程传入真实 AppID；预览构建不代表渠道发布或真机验收。

- `native/canvas.js`：七页原生界面、输入、物理、生命周期与 Game Host 适配。
- `native/shared-source.mjs`：构建时将经典脚本静态转换为模块。原生与预览复用 `levels-data.js`、`level-order.js`、`levels.js` 和 `render.js`，没有运行时源码求值或重复关卡规则。
- `assets/art/` 与 `assets/audio/`：实际入包美术和轻量音效；可选素材或存储失败仍能继续本地游玩。

## 移动预览

保留 H5/Shell 入口供浏览器试玩和自动回归，默认先进入游戏主页。390×844 为设计基准，320px 小屏保持控件可触达；横向浏览器视口将场景与控件分列，不重置对局。设置/暂停页提供浏览器全屏，原生入口由宿主处理。

```sh
pnpm --filter @coffeeeeffoc/wulong-city dev
pnpm --filter @coffeeeeffoc/wulong-city build
pnpm --filter @coffeeeeffoc/wulong-city preview
```

打开 `http://127.0.0.1:4174/`，`PORT` 可覆盖端口。Shell 路由为 `#/games/wulong-city`。

- 触屏：底部左右与跳跃按钮支持多指；直接点按、拖动物件。暂停、换页、后台和拖动取消均释放输入。
- 键盘补充：A/D、方向键移动，W/↑/空格跳跃，S/↓ 加速下落；Tab 选物件，Enter 操作或抓取，方向键调位置，Enter 松手，Esc 取消并暂停。
- 提示按需进入独立页；重试在暂停页。手记收录已完成关卡，也保留两项不改主线的今日试演。
- 普通玩家顺序解锁；`?challenge=1` 至 `?challenge=100` 使用稳定内部 ID 试玩分享关，不写主线存档。分享取消不会复制链接，无剪贴板时显示可手动复制的公开链接。
- `?dev=1&level=100` 与统一 `localStorage.dev` 开关支持开发检查。未解锁关开发试玩不写进度；正式默认关闭。`window.__wulong.snapshot()` 只读，没有自动通关 API。

## 关卡、解锁与旧档

保留原 1–26 关内部 ID、记录和分享链接。显示顺序仍为 `1,2,4,5,6,7,8,3,9…100`，例如旧 `challenge=3` 仍进入宠物通道，显示第 08 关。存档键 `wulong-city-v1` 和 `orderVersion: 2` 保持兼容，旧第三关的解锁及记录不会改指其他谜题。

27–100 关由独立 `WULONG_SCENES` 配置组合拖放、转向、近身取物、近身操作、远程触发、顺序敲击、背对观察和等待稳定八种机制。通用规则校验 schema、依赖、位置与答案；全部机关就绪后仍需走到出口。新关只增加配置，不复制玩法循环。

已完成旧 26 关的存档仅补开第 27 关；仅到达旧末关仍需完成它。主线逐关结算一次，分享与未解锁开发试玩不补开普通关卡。选关、下一关和存档使用同一份目录。

## 验证

```sh
pnpm --filter @coffeeeeffoc/wulong-city test
pnpm --filter @coffeeeeffoc/wulong-city test:mobile
pnpm --filter @coffeeeeffoc/wulong-city test:keyboard
pnpm --filter @coffeeeeffoc/wulong-city test:lifecycle
pnpm --filter @coffeeeeffoc/wulong-city test:progression
pnpm --filter @coffeeeeffoc/wulong-city test:browser
INPUT=touch WIDTH=360 FLOW=1 pnpm --filter @coffeeeeffoc/wulong-city test:browser
pnpm check:dev-mode
pnpm test:dev-mode
```

浏览器脚本需要先启动 dev 或 preview 和 Playwright Chromium。`BASE_URL` 支持生产子路径；`PLAYWRIGHT_EXECUTABLE_PATH` 可选择已安装 Chromium。指定内部 ID 可执行 `node tests/playtest.mjs 27 49 58 75 100`。

规则测试覆盖 100 关初始化、全部新增关真实机关成功/失败/取消、闭门阻挡、步行出口、连续解锁及旧档。浏览器测试以当前页面行为和语义入口断言，已更新旧弹窗/顶栏/26关计数要求；覆盖七页流程、小屏、多指、键盘、暂停与重试、分享隔离和存档恢复。

实际手机尺寸截图保存在 `docs/design/mobile-2026-10-06/implemented/`，原生 Canvas 截图与像素/生命周期核验保存在同目录 `native-actual/`。详细验证记录见 [本次回归报告](docs/design/mobile-2026-10-06/verification.md)。这些是 Chromium 触屏模拟与渠道工程冒烟验证，未替代实体手机或渠道开发者工具真机验收。

原设计与试玩历史见 `docs/PRODUCT.md`、`docs/LEVELS.md`、`docs/PLAYTEST.md`、`docs/PROGRESS.md`；其中原 games4 路径和 26 关状态属于改造前记录。
