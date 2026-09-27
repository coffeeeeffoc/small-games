# Rule Thief · 规则窃贼

三条唯一规则，在身边的物体之间转移。旧主立即失去能力，新主也接过副作用。三关，零运行依赖，中文触控 Web 原型。

## 运行

Node.js 20+，无需 `npm install`。在本目录运行：

```powershell
Set-Location 'F:\playground\playground-ai\small-games\games\local\rule-thief'
npm start
npm test
```

- 独立入口：[http://127.0.0.1:4408/](http://127.0.0.1:4408/)
- 本项目服务器也支持 `/rule-thief/`。页面、CSS、模块、链接全部相对寻址，不借兄弟项目文件运行。
- 可用 `npm start -- --host 0.0.0.0 --port 4408` 供同网络访问；不会自动修改防火墙。端口占用会报错，不结束别的进程。

## 操作

- 点三张规则之一，再点自己或上下左右相邻的目标；也能从规则卡拖到目标。拖动时显示虚影，触控取消不走时。
- 每次有效操作推进一拍：主动动作 → 直行 → 北漂。按住或悬停动作／目标可看这一拍的预演；默认虚影是“等一拍”。
- **穿墙**改变所有位移的内墙碰撞；不能穿实体与外框。规则还在墙内时，先让原主出墙再揭走。
- **直行**每拍沿朝向走一格，受阻原地右转；**北漂**在每拍最后向上漂一格，受阻停下。
- 四向按钮或方向键／WASD 移动；空格等一拍（按钮聚焦时仍保留原生按钮操作）；Z 撤销；Esc 取消选卡。
- 碰哨兵失败；这一拍最后停在敞开的出口即胜。所有合法等价解都算，不检查预定脚本或持卡数量。
- 撤销恢复整个世界的坐标、朝向、归属、拍数、胜负与当前关卡；动画中和胜负后都能撤销。重试只重置本关。
- 声音由 Web Audio 合成，首次操作解锁；右上角可静音并记住选择。没有 SDK、广告、支付、账号和后端数据。

## 实际通过的检查

[规则报告](docs/rules-check.json) 与 [浏览器报告](docs/playtest-report.json) 记录执行时间和结果；[固定解法](docs/solutions.json) 可直接重放。

| 关卡 | 已重放胜利解 | 核心证据 |
| --- | ---: | --- |
| 借道 | 6 拍 | 禁止从哨兵拿走直行，穷尽 1 个可继续状态后无解；转移旧主停下，新主当拍移动 |
| 隔墙接力 | 10 拍 | 禁止同宿主叠卡：穷尽 490 状态无解；禁止从载体一回收穿墙：穷尽 970 状态无解 |
| 带走麻烦 | 6 拍 | 玩家同时持直行与北漂，先走后漂抵消副作用到出口；接受这个合法替代解 |

`npm test` 使用 Node 原生 assert，任何断言失败非零退出。检查完整解法、预演与执行一致、三卡守恒、500 个状态的后继分支、非法转移、受阻转向、替代解与撤销快照。

搜索最多 **30,000 状态／5 秒**；到上限返回 `unknown`（未判定），已测试容量截断不会冒称无解。本次三项必要性证明均真正穷尽，不是限时猜测。不是对所有关卡状态的全覆盖证明，也没有运行时全局死局提示。

浏览器使用实际 Chrome 154 自动操作：1360×980 桌面、390×844 触控模拟分别点通三关，失败 → 重试 → 胜利；验证失败后／胜利后／动画中撤销、鼠标拖动、原生 touchCancel、触控拖放、静音持久化。页面错误为零。

390×844、360×800 无横向溢出，全部游戏按钮至少 44px，移动／等／撤销／重试都在首屏。4400 子路径与 4408 根路径都实际操作通关，独立服务器子路径也已加载验证。

- [桌面实测截图](docs/playtest-desktop.png)
- [手机尺寸实测截图](docs/playtest-mobile.png)
- [失败状态](docs/playtest-failure.png)、[转移动画中间帧](docs/playtest-motion.png)
- [协调者生成的概念图](docs/concept.png) 与 [原始提示词](docs/concept-prompt.md)；图只决定材质与表现方向，不是验证关卡或游戏背景。

**边界**：手机尺寸是浏览器模拟，未测实机或移动 Safari；音频节点运行与静音已验证，未独立验证扬声器听感；没有外部真人试玩。3–10 分钟是体验目标，未据此声称实测时长；熟悉解法后是 22 拍的短局，不宣称留存或无限重玩。

## 复跑浏览器检查（可选）

游戏与 `npm test` 不需要 Playwright。以下路径仅为本次用户许可借用的测试工具，也可传入自己的模块位置；需 Chrome 和上述两个已运行入口：

```powershell
node docs/browser-check.cjs 'F:\playground\playground-ai\prototypes\games1\node_modules\@playwright\test'
```

脚本会重新写截图和浏览器报告。`node docs/find-solutions.mjs` 可在相同硬上限内重搜三张固定图；它与游戏共享 `rules.js`，不会调用其他项目的规则或资源。

## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/rule-thief test` 和 `pnpm --filter @coffeeeeffoc/rule-thief build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/rule-thief`，独立入口为 `games/rule-thief/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
