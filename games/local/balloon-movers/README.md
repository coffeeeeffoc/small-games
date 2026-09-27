# 气球搬家公司

三关可玩的中文 Web 原型：沙发教学、冰箱侧身、钢琴窄窗。绑点、长短绳、偏心质量与排气实际参与物理；风机提供固定侧风，家具需接触黄垫并稳定约一秒才送达。软垫接受侧躺或倒放，不自动扶正、减速吸附或移动家具。

## 运行

在本目录执行：

```powershell
npm start
```


## 怎么玩

- 从气球仓拖到家具绑环，或点“绑一只”；最多四只、单侧最多三只。可拆球、切换两侧长短绳，也可直接用推荐绑法。
- 点击“起飞”；手机按住左/右气阀，桌面也可按 A / D。松手停止排气，剩余气量不会恢复。
- 两侧轮流排气可降低高度，一侧多排改变倾角。尽量先过窗，再继续放气落到宽黄垫上。轻擦窗沿不会立即失败。
- 少于足够浮力会落回原地；过高、越界或飞行满一分钟仍未送达会失败。重试保留装配并补满气球。
- 顶部可暂停、重来和静音；触控取消或失焦会释放气阀，切到后台会暂停。

## 检查

```powershell
npm test
```

只用 Node 内置 assert，失败非零退出；与浏览器共用 `physics.mjs`。48 条轨迹覆盖三关可解、钢琴两种绑法、同装配不操作失败/排气成功、关键时序提前和推迟 0.15 秒仍成功、绳长与绑点改变轨迹、重放一致、气量范围和窗框穿绳回归。

`browser-check.mjs` 是可选开发验收脚本，需要外部 Playwright 与本机 Chrome，不属于游戏运行依赖。当前仅借用户指定的 `games1/node_modules/@playwright/test` 执行验收；换机器可设置 `PLAYWRIGHT_PATH` 为自己的安装位置后运行 `node browser-check.mjs`。

## 已有证据与边界

- `docs/playtest-results.json`：真实浏览器指针拖拽/按住/松开触发游戏，开局→失败→重试→三关送达；390×844 触摸仿真通关与 touchCancel；360×640 气阀可见且无横向溢出。脚本用受控浏览器时钟提高重复性，没有写入游戏状态。
- `docs/playtest-desktop.png`、`docs/playtest-mobile.png` 为游戏实际渲染，`docs/playtest-win.png` 为送达画面。
- `docs/concept.png` 是内置 image_gen 生成的美术参考，已查看；`docs/concept-prompt.md` 记录实际 prompt。参考图的透视与定格倾角不充当物理证据，实际原型采用正交二维视角。
- 只验证本机 Chrome；手机尺寸与触摸仿真不是实机。Web Audio 初始化与静音状态已检查，手机外放/浏览器兼容性、真人可理解性和重复游玩意愿未验证。
- 绳采用每根两段 Matter.js 碰撞连接，防止窗角穿透；没有绕柱求路、打结、剪绳或绳编辑。气球相互不碰撞，可能叠在一起；气阀标出实际只数。矩形家具不模拟复杂凹形或家具损坏。
- 无 SDK、广告、支付、账户、排行榜或网络存档。

碰撞与连接使用随项目附带的 [Matter.js 0.20.0](https://brm.io/matter-js/docs/classes/Constraint.html)，许可证见 `vendor/MATTER-LICENSE.txt`；不依赖 CDN 在线加载。主逻辑固定 120 Hz，同版本同逐帧输入可重放，不承诺跨浏览器浮点位级一致。

补充独立运行验证：`docs/standalone-results.json` 记录单独 `server.mjs --port 4401` 的根路径、子路径和模块资源 HTTP 200，以及未安装虚拟时钟、用真实 requestAnimationFrame 与鼠标按住/松开的沙发送达；截图见 `docs/playtest-native-win.png`。验收启动的独立服务已关闭，统一 4400 入口继续由原服务提供。

## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/balloon-movers test` 和 `pnpm --filter @coffeeeeffoc/balloon-movers build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/balloon-movers`，独立入口为 `games/balloon-movers/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
