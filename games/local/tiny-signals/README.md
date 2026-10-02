# 同频归航 · Tiny Signals

一次方向输入，同时控制四块独立棋盘上的四位机械信使。利用墙壁让其中一位停下，安排不同的行进路线，把大家送回归航台。抵达终点的信使会停留在那里。

本版是六关单人解谜原型，采用陶瓷、黄铜与悬浮工坊视觉。游戏没有运行依赖、网络服务或时间限制；最少步数保存在当前浏览器中。

## 运行

Node.js 20+，无需安装依赖，在游戏目录运行：

```sh
node server.mjs
# http://localhost:5186/
node --test *.test.mjs
node build.mjs
```

也可使用 `npm start`、`npm test`、`npm run build`。服务器同时支持根路径和 `/tiny-signals/`，默认监听 `0.0.0.0:5186`。可以通过 `PORT=5187 node server.mjs` 更改端口，命令行 `node server.mjs --port 5188 --host 127.0.0.1` 优先于 `PORT`。

`dist/` 只包含页面、样式、运行模块和必要素材，可由任意静态 Web 服务器托管。所有资源使用相对路径。

## 操作与机关

- 手机端在屏幕任意位置单指滑动指定方向，一次滑动走一步；轻触不移动，双指可滚动页面。电脑端使用方向键、WASD 或右侧方向按钮。撞墙的信使留在原地；这一拍其他信使和机关照常行动。
- 撤销可逐步恢复整个局面；重开回到当前关卡起点。选关栏可直接体验六关。
- 单向风门：只允许朝标识方向通过。
- 转向罗盘：让下一拍输入顺时针旋转 90°，每块棋盘独立结算。
- 折叶桥：离开后收起，不能再经过。
- 旋转风轮：追加一次位移，风向逐拍改变。
- 配重灯箱：推动灯箱压住开关，控制闸门。
- 巡检残影：重复上一拍指令，需要预判下一拍位置。

六关依次介绍机关，再逐步组合。准确规则、关卡数据与最优解验证分别由 `rules.mjs`、`levels.mjs` 和原生 Node 测试维护。

每关均有联合状态搜索证明的最优解，依次为 **8 / 10 / 13 / 10 / 12 / 13 步**。键盘 `Z` 撤销、`R` 重来；开启“预览”后先选方向，再确认执行。鼠标悬停方向按钮可直接查看落点。路线提示从关卡起点开始，查看提示的游玩会单独标记，重来仍保留该标记。

## 验证与实际画面

2026-10-02 首版验证：52 项 Node 测试通过，覆盖机关结算、完整撤销、每关最优解、存档版本与条件写入。Chromium 通过真实键盘/按钮完成六关；390×844 手机视口验证触控、预览确认、撤销重开及无横向溢出。保存后刷新、失败后撤销、异步存档重新挂载与 BFCache 返回也有回归用例。

浏览器检查需要 Python Playwright 和 Chromium。启动服务后执行：

```sh
python scripts/browser-check.py
node scripts/solve-levels.mjs
```

实际运行截图见 [桌面](docs/playtest-desktop.png) 和 [手机](docs/playtest-mobile.png)。这两张截图来自可运行版本，最初概念图见 [设计案](../../../docs/plans/2026-10-02-tiny-signals-design.md)。

本机已通过构建、发布文件引用与 HTTP 访问检查、依赖边界检查，以及已登记的 Pages 桌面/手机操作用例。全仓库 `check:games` 仍会报告四个既有子模块未初始化；本次没有初始化或改动这些子模块，也没有执行整个大厅的全量构建。手机检查是浏览器模拟，不代表真机性能验收。

## 仓库接入

在仓库根目录运行：

```sh
pnpm --filter @coffeeeeffoc/tiny-signals test
pnpm --filter @coffeeeeffoc/tiny-signals build
pnpm check:games tiny-signals
node scripts/test-tiny-signals-input.mjs
```

Web Shell 通过 `#/games/tiny-signals` 加载本游戏，独立静态入口为 `/games/tiny-signals/index.html`。大厅登记信息在 `apps/shell-web/src/standalone-games.json`；Pages 操作回归包含移动、撤销、重开与选关。

规则与关卡模块不依赖 DOM；`game.mjs` 导出 GameDefinition，`main.mjs` 负责独立页面启动，`host.mjs` 提供本地 Game Host。该边界便于后续复用规则与接入宿主能力。

地图编辑器、更多地图组合、云排行榜、好友合作及对战属于后续扩展，当前版本不包含这些在线功能。
