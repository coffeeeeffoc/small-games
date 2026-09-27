# 天气指挥部

三次天气，一船补给。零运行依赖的中文 Web 原型，5 个航段，包含 4 张独立地图和 1 张冰雪初态变体。

## 直接试玩

- 本项目独立入口：<http://127.0.0.1:4402/>


## 单独启动与检查

Node.js 20+，无需 npm install。在本项目目录运行：

```powershell
Set-Location 'F:\playground\playground-ai\small-games\games\local\weather-command'
npm start
npm test
```

`npm start` 默认监听 127.0.0.1:4402。端口占用会明确退出，不会结束其他进程或自动改端口。

同一局域网的手机可使用：

```powershell
npm start -- --host 0.0.0.0 --port 4402
```

然后访问电脑实际局域网 IP 的 4402 端口。不会自动修改防火墙。本轮没有实际手机访问证据。

## 操作

- **雨**：单击涨水一级，同时融雪。**太阳**：单击退水一级，同时融雪。
- **雪**：单击铺雪或结冰，下一阵风会沿直线滑到障碍前。
- **风**：从船身拖出上、下、左、右方向，释放立即吹风；也可点四向按钮。水上最多推 3 格，雪面一直滑；干涸普通地面不能吹动船。
- 天气按钮按住、悬停或聚焦时显示当前一步预演，不需要双击确认。风的拖动距离只决定方向，不改变力度。
- 键盘 Tab 可定位按钮，Enter/空格执行；沙盘聚焦后方向键吹风，Escape 取消预演。
- 必须停在码头上。木栅撞碎后继续航行；高水过不了低桥。第三次行动正好到达算胜。
- 完全无效的指令不扣次数。三次用完仍未到达则失败，可以撤销或重来；撤销同时恢复天气、栅栏和次数。
- 声音由 Web Audio 生成；右下方可静音，选择保存在本机。没有账号、服务器结算、SDK、广告或支付。

## 实际验收记录

2026-09-27，已执行 `npm test` 和真实 Chrome 浏览器自动操作。见 [规则输出](docs/rules-check.json)、[浏览器记录](docs/playtest-report.json)。

| 航段 | 最多三次有效指令的通关序列数 | 不同空间路线数 |
| --- | ---: | ---: |
| 1 让船浮起来 | 5 | 1 |
| 2 分岔航道 | 3 | 2 |
| 3 桥下的水线 | 4 | 2 |
| 4 借一场雪 | 1 | 1 |
| 5 上一班的天气 | 4 | 2 |

规则检查会因断言失败非零退出；包含穷举、预演/执行一致、无效指令、不同冰水落点、高水桥、融雪、栅栏恢复和第三次判胜。浏览器实际完成五关、失败→重试→胜利、拖船、单击天气、撤销、动画中重来、静音持久化。两个 URL 入口均实际操作通关。

- [桌面截图](docs/playtest-desktop.png)：1360×980 浏览器视口，全页截图。
- [手机尺寸截图](docs/playtest-mobile.png)：390×844 触屏模拟，按住拖动时的真实预演画面，全页截图。
- [动作中间帧](docs/playtest-motion.png)、[失败状态](docs/playtest-failure.png)。

390×844 与 360×800 下检查无横向溢出、主要操作在首屏、操作目标至少 44px。390px 画面底部的航段导航可轻微纵向滚动。触屏模拟通过原生触控事件验证拖动取消不扣次数。

**真实边界**：不是实机测试；未验证移动 Safari、真实扬声器听感或真实手机后台生命周期。Web Audio 已验证用户手势后运行及静音持久化；未找外部玩家试玩，不能声称好玩或留存已验证。每图是有限小谜题，不宣称无限重玩。

## 可选：复跑浏览器验收

游戏不需要 Playwright。`docs/browser-check.cjs` 仅用于验收，显式传入测试工具模块路径，需要本机 Chrome 和两个服务器入口可访问：

```powershell
node .\docs\browser-check.cjs 'F:\playground\playground-ai\prototypes\games1\node_modules\@playwright\test'
```

该路径仅是本轮获准临时使用的浏览器测试工具，未加入 package.json，未被游戏运行代码导入；换环境可传入自己的 Playwright 模块路径。执行会覆盖 docs 中的验收截图和报告。

## 设计与效果图

- [DESIGN.md](DESIGN.md) 保留真实第一轮提案，以及第二轮挑战回应与第三轮收敛。没有虚构评审或试玩。
- [最终美术效果图](docs/concept.png) 使用内置 image_gen 生成；[prompt 与检查记录](docs/concept-prompt.md)。生成图只定美术，不冒充实际截图；精确关卡以运行代码为准。

## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/weather-command test` 和 `pnpm --filter @coffeeeeffoc/weather-command build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/weather-command`，独立入口为 `games/weather-command/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
