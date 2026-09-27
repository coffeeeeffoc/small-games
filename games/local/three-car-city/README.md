# 小城救援队

分派救援、疏通道路，让同伴及时赶到。指挥三辆服务车处理火情、寻宠、清障和停电；用分工与路线选择帮助同伴赶上救援期限。

## 启动

只需要 Node.js，无第三方运行依赖，不用 `npm install`。

```powershell
Set-Location F:\playground\playground-ai\small-games\games\local\three-car-city
npm start
```


HTML、样式、模块均用相对路径；独立服务也支持 `/three-car-city/`。无需账号、联网资源、广告或平台 SDK。

## 操作

- 点地图或下方固定车位选车，再点求助卡片或对应路口；也支持先点地点再选车、把车直接拖到卡片或路口。选中有高亮，拖动有跟手车标和指引线。
- 第一次成功派遣自动开始；点空路口可让车提前赶去待命。1/圆、2/三角、3/方区分三辆车，下方显示空闲、赶路和处理剩余秒数。
- 选车、派单、取消和无效拖放都不改变运行状态；A车处理时选B车，A车继续工作。主动点“暂停”后可以规划，必须点“继续”才执行；切后台或失焦也保持暂停。
- 到达后还要服务，进度条填满才完成。服务中的车不能改派；路上的车改派时先走完当前路段。
- 两条路线不同时才出现路线按钮。“按当前路况预估”不是保证：同伴完成维修后，已进入减速路段的车也会加速。
- 火情逾期扣2格，寻宠/堵车扣1格，停电扣2格；累计3格结束。逾期故障可以继续修复，扣分不返还。同一事件不重复扣分。
- 顶部选关；“重试”保持相同事件与起点。声音与动效按钮可分别关闭；键盘 Tab、Enter 派单，Escape 取消。

三关都有后续事件波：教学4件、清障合作5件、双危机6件。理想调度分别在26、32、36秒左右完成，暂停思考不计入模拟时长。所有关卡可直接选择，无解锁门槛。

## 检查与证据

```powershell
npm test
```

Node 自带断言检查真实模拟；断言失败会非零退出。包含所有关卡零失误回放、确定性、清障反事实、路线选择差异、压线完成、过期、改派连续性、服务锁定和减速叠加。

浏览器验收脚本不属于运行依赖。可以使用机器上已有 Playwright 与 Chrome：

```powershell
node playtest.mjs 'F:\playground\playground-ai\prototypes\games1\node_modules\@playwright\test\index.mjs'
```

该脚本需要统一服务4400与本项目独立服务4404同时运行。它使用真实浏览器点击、拖动和触控事件，按实际时间推进，不直接修改模拟状态或加速游戏。外部 Playwright 路径只传给验收脚本，游戏和 `npm test` 都不读取它。

- [设计取舍](./DESIGN.md)：第15节记录本次命名与交互修订，覆盖此前暂停规则。
- [TypeSafe语义请求](./semantic-review.mjs)：开发阶段评审，不接入游戏运行时。现有密钥请求返回401，尚未取得模型结果；不将人工命名写成模型结论。有效密钥配置到本机 `TYPESAFE_API_KEY` 后运行 `node semantic-review.mjs` 可补跑。
- [生成效果图](./docs/concept.png) / [完整提示词与查看说明](./docs/concept-prompt.md)：内置 image_gen 生成；概念图的装饰路网和数字不是运行状态。
- [桌面实玩截图](./docs/playtest-desktop.png) / [手机尺寸截图](./docs/playtest-mobile.png)：实际 Web 原型，非效果图。
- [浏览器验收记录](./docs/playtest-results.json)：本机运行结果，以 `passed` 与具体检查为准。

验证边界：手机截图与触控来自 Chrome 视口/输入模拟，不是实机。未进行真人首玩研究、真机浏览器/系统音频听感验证。自动化只能证明规则和操作链，不能证明长期可玩性。页面隐藏/冻结及失焦处理均保持暂停；浏览器回归实际验证的是切换标签页的失焦与返回。

当前浏览器记录以 [playtest-results.json](./docs/playtest-results.json) 为准，覆盖三关零失误回放、切车不停工、正反顺序派遣、区域待命、真实浏览器触控拖放与取消、主动暂停及后台返回。规则对照仍为清障17.4秒救火完成、不清障22秒逾期；第三关捷径0格失误、当前快路2格失误。

## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/three-car-city test` 和 `pnpm --filter @coffeeeeffoc/three-car-city build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/three-car-city`，独立入口为 `games/three-car-city/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
