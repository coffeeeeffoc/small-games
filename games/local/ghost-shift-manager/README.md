# 鬼班经理 · Ghost Shift Manager

纸偶闹鬼酒店，三鬼、三客、三夜。点选或拖放鬼员工，用0/4/8秒引信抓客人动作；吓得刚好积累好评，过吓可撤鬼或按铃救场。纯 HTML/CSS/SVG/ES modules + Web Audio，无运行依赖。

## 运行

在本目录运行（Node.js 20+，无需 npm install）：

```powershell
Set-Location 'F:\playground\playground-ai\small-games\games\local\ghost-shift-manager'
npm start
npm test
```

- 独立入口：[http://127.0.0.1:4407/](http://127.0.0.1:4407/)。端口占用会报错，不会杀其他进程。
- 资源全部相对路径；独立服务器的 `/ghost-shift-manager/` 也已验证。默认仅监听本机。

## 操作

1. 选一夜，按开始；点一个鬼、选引信，再点房间，或把鬼拖进房间。鼠标移入房间可看预测，触摸落点也显示预演。
2. 点房里倒计时的鬼，或点休息室中已安排的员工，即可撤回；出场前均能撤回，撤回不消耗冷却。
3. 安抚铃再点房间，恐惧减3；铃休息25秒。恐惧过红线连续5秒才退房，来得及救。
4. 绿段是这位客人的合适惊吓；三颗心代表累计舒适体验。三人体验达标且此刻都在合适区间即提前胜利，120秒仍未达标则失败。
5. 主播自拍时反应更强；故意错过会抱怨镜头没开。侦探手电能识破床单。管道鬼会波及紧邻上下层。
6. 右上角声音、暂停、重试；切出后自动暂停，回来必须按「继续夜班」。Tab/Enter 可操作，Escape 暂停；静音和减少动态效果不影响规则提示。

## 验证记录（2026-09-27）

`npm test` 用 Node assert 检查，失败以非零退出；[规则记录](docs/rules-report.json) 与 [固定重放](docs/replays.json) 保留实际结果。

| 夜班 | 实质变化 | 每客目标舒适时长 | 重放胜利时刻 | 操作数 |
| --- | --- | ---: | ---: | ---: |
| 怪可爱的 | 自拍窗口、初始低恐惧、主播在中层 | 22秒 | 28.7秒 | 6 |
| 隔墙有鬼 | 甜点师换到中层、串房风险与动作节奏改变 | 25秒 | 36.25秒 | 7 |
| 午夜投诉 | 甜点师已在收拾行李、顺序倒置、先救场 | 28秒 | 43秒 | 5 |

目标值由当前规则模拟和真实浏览器重放校准，未经外部玩家试玩。保留120秒供观察和失误恢复；熟练解可提前结束。

- 同种子同输入三夜完全相同；81组含待执行任务的预测与实际结算一致；非法引信2秒等输入被拒绝。
- 自拍命中/错过对照，管道过吓在8.95秒实际退房；同局撤鬼避免退房、安抚铃救回均通过。
- 只用镜框鬼（允许安抚）的8秒前瞻策略三夜均失败；冷却就随机投放且会紧急安抚，每夜100种子，胜率3%、3%、0%。这是所测策略证据，不是对所有弱鬼解的数学不可能证明。没有加入习惯惩罚。
- [浏览器记录](docs/playtest-report.json)：本机 Chrome 无头模式真实点击完成开局→失败→重试→救回、三夜完整胜利；静音检查到 AudioContext suspended，暂停冻结引信，鼠标拖放/拖出取消正常。
- 390×844触控模拟完成点选、引信、房间和撤回；CDP触控拖放只施法一次、touchCancel不施法且下一次点按正常。无横向滚动，所有可见按钮至少44px，主界面适配844px高度。
- [桌面截图](docs/playtest-desktop.png)、[手机尺寸截图](docs/playtest-mobile.png) 来自实际游戏；[效果图](docs/concept.png) 仅作设计参考，游戏不加载这张静态图。

## 验证边界

手机尺寸模拟不等于实机。未测试实体手机、iOS Safari、音响实际听感、原生小游戏平台或SDK；未接广告支付。
无头 Chrome 切标签仍报告 visible；后台逻辑已用 blur 与 hidden/visible 事件夹具验证“停钟且显式继续”，真实系统切后台仍待实机确认。没有宣称5名用户试玩或趣味性评审通过。

浏览器检查脚本仅为验收工具，不属于运行或 npm test 依赖。可在有 Playwright 的环境手动复验：

```powershell
node docs/browser-check.cjs 'F:/playground/playground-ai/prototypes/games1/node_modules/@playwright/test'
node docs/touch-check.cjs 'F:/playground/playground-ai/prototypes/games1/node_modules/@playwright/test'
```

`docs/tune.mjs` 为规则策略对照，不接入游戏；`DESIGN.md` 保留真实三轮取舍，第三轮覆盖第一轮旧参数。不创建agent，不提交、不推送。

## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/ghost-shift-manager test` 和 `pnpm --filter @coffeeeeffoc/ghost-shift-manager build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/ghost-shift-manager`，独立入口为 `games/ghost-shift-manager/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
