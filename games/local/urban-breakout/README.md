# 街区突围 / Urban Breakout

原创竖屏 3D 自动射击游戏。当前交付 **P1 老街核心实战样板**，不是完整 P0–P4 联机版。90 秒内横移、转火限时补给、救援队员、对付冲刺者与盾牌感染体，借助吊架破甲击败街口 Boss。

## 启动

在仓库根目录使用 Node 24.21.0、pnpm 12.6.0：

```sh
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/urban-breakout dev
```

打开 <http://localhost:4330>。手机连接同一局域网后访问终端的局域网地址。端口冲突会明确失败，不会悄悄改端口。

```sh
pnpm --filter @coffeeeeffoc/urban-breakout typecheck
pnpm --filter @coffeeeeffoc/urban-breakout build
pnpm --filter @coffeeeeffoc/urban-breakout preview
```

生产制品是 `dist/`，使用相对资源路径，可以静态托管在子目录。Web Shell 已登记 `#/games/urban-breakout`；Shell 正常准备流程会复制其制品。没有自动发布云端。

## 操作

- 手机：拖动战场下半部；松手停在当前横向位置，世界继续前进。
- 桌面：A/D、方向键或鼠标拖动；空格使用震荡弹，F 切换阵型，Esc 暂停。
- 进入有补给的同侧金色带，确认约 0.17 秒后整队转火；离开即回防。没有有效补给时继续向前射击。
- 暂停菜单可以重开、返回、静音、关闭震屏、全屏、打开调试面板；`?debug=1` 直接显示调试。
- 点击开始后启用原创节奏背景音；敌群逼近或 Boss 出现时增加音乐层次。暂停菜单可分别调节背景音乐 / 战斗音效，设置保存在本机；暂停、切后台和退出会停止当前声音。
- 第 6 秒左侧榴弹柜值得投入；第 25 秒右侧同等奖励伴随冲刺者；第 36 秒救援 / 霰弹互斥；第 56 秒三档箱不必拿满；第 77 秒吊架能破 Boss 护甲。

## 可运行检查

```sh
pnpm --filter @coffeeeeffoc/urban-breakout test
pnpm --filter @coffeeeeffoc/urban-breakout test:balance
pnpm --filter @coffeeeeffoc/urban-breakout test:load
pnpm check:games urban-breakout
# 先启动 dev 或 preview；浏览器脚本默认连接 4330
pnpm --filter @coffeeeeffoc/urban-breakout test:browser
pnpm --filter @coffeeeeffoc/urban-breakout test:branches
pnpm --filter @coffeeeeffoc/urban-breakout test:visual
# 音频波形夹具需要 Vite dev 服务（使用 /src 模块），默认 4330
pnpm --filter @coffeeeeffoc/urban-breakout test:audio
```

`test:browser --quick` 只做快速操作检查。`test:browser` 包含真实时间的完整战斗。PowerShell 可先设置 `$env:URBAN_URL='http://127.0.0.1:4332'` 来检查指定预览服务。需要本机 Playwright Chromium；缺失时运行 `pnpm exec playwright install chromium`。

`test:visual` 经 DOM 键盘事件游玩至 Boss，检查暂停与四种视口的奖励卡片布局，并保存实际 WebGL 截图。截图时使用离线暂停，临时隐藏暂停菜单；不修改模拟状态或加速时钟。截图用于人工复查，不代表已完成真机验收。

本地压测命令只测 **共享模拟吞吐**，不是服务器并发测试。当前没有联网双客户端测试命令、PostgreSQL 迁移或线上负载结论，因为 P2/P3 尚未实现。

## 文件入口

- `src/core/`：纯 TypeScript 固定步长规则，Node 与浏览器共用；无 DOM、React、Three.js、系统时间或全局随机数。
- `src/content/levels.ts`：校验器、武器、敌人、90 秒样板、三个透明的平衡测试场景。
- `src/client/`：Three.js 实例化场景、输入与时钟、浏览器存储和程序化声音。
- `src/main.tsx`：React HUD、开始、暂停、结算、本机战绩。
- [准确进度和下一步](docs/progress.md)、[决策](docs/decisions.md)、[玩法](docs/gdd.md)、[架构](docs/architecture.md)、[测试记录](docs/testing.md)、[资产来源](docs/assets.md)。

本地战绩不上传，不进入全区榜；没有假队友、假排行榜或占位联网按钮。微信/B站原生平台尚未适配。名称仍为工作名。
