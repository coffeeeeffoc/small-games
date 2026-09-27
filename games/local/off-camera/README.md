# 镜头外发生了什么

深夜小店里，椅子消失、老板成了奶油甜甜圈，小狗偷错了午餐。看前后画面，摆出两三张事件卡，观看自己推断出的具体动作。

## 启动

Node.js 20+，无运行依赖，不需要 npm install。

```powershell
Set-Location -LiteralPath 'F:\playground\playground-ai\small-games\games\local\off-camera'
npm start
```

独立地址：`http://127.0.0.1:4403/`。可用 `npm start -- --port 4403 --host 0.0.0.0` 开放局域网试玩。

运行资源全部使用相对路径；本目录复制到其他位置仍能独立运行。`docs/` 不是运行必需项。

## 怎么玩

- 点“之前 / 之后”看监控证据；右上方方框按钮放大。
- 点事件卡放进第一个空槽，也可直接拖到槽位。拖动槽内卡交换顺序；点槽内卡取回。
- 卡齐自动播放人物动作。手机尺寸会定位到重演画面，确认按钮固定在下方。
- 只需点一次“确认推断”。错误会放大两份画面中的具体矛盾；可直接修改或点“重新排”。
- 三个小案均可从上方选择，依次通关约 2～4 分钟；没有时间限制。
- 右上角切换声音，静音不影响推理；键盘 Tab/Enter 可选卡、取回、查看和确认，Esc 关闭放大。

## 检查

```powershell
Set-Location -LiteralPath 'F:\playground\playground-ai\small-games\games\local\off-camera'
npm test
```

Node 内置断言失败即非零退出。检查穷举的 14 种排列、三案可见证据、无效动作、不修改初始画面、典型错误结局和两个等价答案同时通过。答案由最终可见状态决定，不比较预存顺序字符串。

可选浏览器审计脚本保存在 `docs/playtest.mjs` 和 `docs/standalone-check.mjs`。它们需要临时提供一个已有 Playwright 模块的文件 URL，不属于游戏或 `npm test` 的依赖。例如本次验证使用：

```powershell
Set-Location -LiteralPath 'F:\playground\playground-ai\small-games\games\local\off-camera'
$env:PLAYWRIGHT_MODULE = 'file:///F:/playground/playground-ai/prototypes/games1/node_modules/@playwright/test/index.mjs'
node .\docs\playtest.mjs
node .\docs\standalone-check.mjs
```


## 已取得的证据

- `npm test` 通过：三案各 1 解，奶油等价结果 2 解均接受。
- Edge 浏览器桌面：三案逐一故意答错→显示真实矛盾→修改/重试→胜利；第一案使用实际鼠标拖动交换事件卡；最终完成 3/3。
- 390×844 手机尺寸：触控点选完成失败/重试及三案胜利；360×640：触控通过首案。两种尺寸均无横向溢出。
- 观察到重演期间 SVG 图像随动作变化；键盘选卡可通关；静音状态切换并在刷新后保留。
- 将八个运行/规则检查文件复制到隔离目录后，根路径与 `/off-camera/` 都能实际通过首案；规则检查也通过。缺文件 404，测试的 Windows 路径穿越请求 403。
- 浏览器测试无 pageerror 或 HTTP 4xx/5xx 资源错误。

证据文件：[桌面矛盾反馈](docs/playtest-desktop.png)、[手机尺寸通关](docs/playtest-mobile.png)、[椅子案失败](docs/playtest-failure.png)、[桌面通关](docs/playtest-victory.png)、[完整试玩报告](docs/playtest-report.json)、[独立运行报告](docs/standalone-report.json)。

## 真实边界

浏览器验收使用 Edge 的桌面/手机尺寸模拟，**不是物理手机测试**，也不是 iOS Safari 验收。未进行陌生目标玩家试玩或留存测量；三案是有限短局，没有无限内容承诺。

声音由 Web Audio 实时生成；已验证静音交互和持久化，未做扬声器听音验收。额外的触控拖动取消/音频节点探测命令被自动审批拒绝，仅返回 `blocked by policy`，因此不把这些补充项目计作通过。实际鼠标拖动和手机尺寸触控点选已通过。

[最终效果图](docs/concept.png) 由内置 image_gen 生成并已查看，[prompt](docs/concept-prompt.md) 保留原文。它是风格与玩法参考，不是游戏截图；运行版用 SVG 精确绘制唯一一把椅子、奶油图层和食物位置，前后画面采用切换按钮节省手机空间。

[DESIGN.md](DESIGN.md) 保留真实第一轮方案及本轮逐条挑战回应，末节为最终三案取舍。无 SDK、广告、支付、提交或推送。

## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/off-camera test` 和 `pnpm --filter @coffeeeeffoc/off-camera build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/off-camera`，独立入口为 `games/off-camera/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
