# Night Overwatch 独立浏览器交互与视觉复查

构建：`0903f04fd2eeb33eb102945938d2ced50cfc8a7c0507f5fe1f81acef5f8a1888`。URL：`http://localhost:4318`。所有运行均在开始、结束校验 URL build-info 与当前生产源码 hash。只改独立测试与本报告目录；没有改生产文件。

环境：本机独立 Chromium，568×320 / 844×390 为 CDP 触控模拟，1366×768 为 Playwright 鼠标。不是实机验证。已实际打开并检查下述截图，未用测试断言代替视觉评审。完整四分钟任务回放由主代理负责，不计入本次独立执行覆盖。

结论：核心设置/暂停/全屏/缩放/松手停止流程可用；发现两项布局问题和一项右键误触问题，建议修正后定向复测。另给出宽视场标记的尺寸建议。首轮 pinch 两个失败是测试测量方式有误，已保留断言、改正指标并复测通过。

## P2：568×320 友伤警告直接覆盖准星和友军标记

复现：开始→小地图定位固定友军→选择重型炮→准星对准该友军。白光和热成像均复现，无需开火。准星位于约 `(284,160)`；友伤条位于中心 y=158、高28px，文字和背景横穿准星及标记。认出友军和精确观察瞄准点同时受影响。

- Case：`friendly-warning-overlap`，568。
- [白光截图](2026-09-29T17-43-25.959Z-18476/568-friendly-warning-overlap-centered-friendly-day.png) / [快照](2026-09-29T17-43-25.959Z-18476/568-friendly-warning-overlap-centered-friendly-day.json)。
- [热成像截图](2026-09-29T17-43-25.959Z-18476/568-friendly-warning-overlap-centered-friendly-thermal.png) / [快照](2026-09-29T17-43-25.959Z-18476/568-friendly-warning-overlap-centered-friendly-thermal.json)。
- 第二次独立路径也出现：[放大后的友军截图](2026-09-29T17-36-45.557Z-51404/568-markers-and-dust-friendly-focus.png)。
- 来源：`HUD.ts:238` 的固定 compact y=158。该 case 自动交互步骤通过，视觉判定失败；不能把脚本的 passed 当作视觉无问题。

最小建议：568 高度时将警告放进当前底部教学信息条所在位置（中心 y≈229，高28px），警告期间替换教学文本。准星周围至少留出半径40px的文字禁入区。无需给所有标签增加复杂的通用布局系统。

## P2：568×320 波次通知让正在瞄准的目标名称消失

复现：开始后立即小地图定位炮台17→飞行面板放大四次→收起面板→瞄准炮台。波次条在时没有“炮台”，通知结束后同一目标的名称出现。844/1366 在同一用例中可正常显示。

- Case：`focused-target-label`，568；这是可重复运行的失败断言。
- [波次条存在时](2026-09-29T17-43-06.197Z-33764/568-focused-target-label-wave-banner-active.png) / [快照](2026-09-29T17-43-06.197Z-33764/568-focused-target-label-wave-banner-active.json)：time=1.30、aimedUnit=17、unitLabels[17].active=false。
- [通知消失后](2026-09-29T17-43-06.197Z-33764/568-focused-target-label-wave-banner-cleared.png) / [快照](2026-09-29T17-43-06.197Z-33764/568-focused-target-label-wave-banner-cleared.json)：time=4.15、aimedUnit=17、active=true。
- [结果与输入步骤](2026-09-29T17-43-06.197Z-33764/results.json)。
- 来源：`HUD.ts:1025` 只尝试上下48px；568可用高度加上波次条避让导致两个候选都无效，焦点标签被隐藏。

最小建议：优先保留正在瞄准的类型标签，波次通知进入底部信息条。compact 关注标签宽度可从固定176px收至按文案约92–120px；字号12–13px，保留深色底，仅显示当前关注单位的类型/受损状态。不要同时恢复全场类型或血条。

## P2：桌面右键会激活武器卡片

复现：新任务默认速射炮，右键点击重型炮卡片中心。无需左键/数字键，武器立即变成重型炮。使用右键临时观察时误落HUD会改变武器。

- Case：`right-click-controls`，1366。
- [截图](2026-09-29T17-43-35.720Z-44340/1366-right-click-controls-right-click-weapon.png) / [快照](2026-09-29T17-43-35.720Z-44340/1366-right-click-controls-right-click-weapon.json)：selected=2、fired=0、held=[]。
- [失败断言及坐标步骤](2026-09-29T17-43-35.720Z-44340/results.json)。
- 来源：`Overwatch.ts:273` 对任意鼠标按钮记录HUD按钮，`:308` 释放时没有区分主键便执行 action。

最小建议：HUD按钮的按下与激活只接受鼠标主键；继续保留战场右键的临时观察行为。没有发现此例误开火。

## 宽视场标记：尺寸与关注标签建议

已查看：[568宽视场](2026-09-29T17-54-42.283Z-30068/568-wide-field-markers-wide.png)、[568放大四次](2026-09-29T17-54-42.283Z-30068/568-wide-field-markers-zoomed.png)、[844宽视场](2026-09-29T17-54-42.283Z-30068/844-wide-field-markers-wide.png)、[844放大四次](2026-09-29T17-54-42.283Z-30068/844-wide-field-markers-zoomed.png)。

当前普通单位方框/菱形直径16px，重甲22px。以地面投影作间距观测（不是标记0.8高度的精确包围盒）：568的固定友军4/5横向仅2.50px、纵向1.39px；844为3.05px/1.69px。568车队1/2横向5.55px。放大四次到zoom=2.799后，568友军4/5仍仅5.46px/2.87px。截图确认三层方框套在一起；只缩小方框不能完全解决最密集组。

[投影测量、单位ID、缩放前后配对](2026-09-29T17-54-42.283Z-30068/results.json)。测量脚本只读 `screenPoint`，没有改变单位位置。

建议从以下最小组合开始，数值是设计建议，尚未实施或复测：

1. 非关注普通标记降到9–10px直径、重甲12–14px；保留1.5–2px队色线与约3px深色描边。当前关注标记保留16–18px，并在最上层绘制。准星64px整体轮廓目前易辨，不建议随全场标记一起缩小。
2. 利用已有友军group：组内投影间距不足10–12px时可显示一个组标记及数量（例如“□ ×3”），关注该组或间距超过16px再展开。不要把敌友混成一个标记。这样能解决2–3px间距时缩小仍重叠的问题。
3. 继续只显示一个关注单位名称；触控跟随准星、鼠标跟随悬停。compact标签约92–120px宽，优先于波次通知，保留队色/形状及受损文案即可。

## Pinch：修正测量方式后的两例复测

首轮错误使用世界坐标deepEqual。`World.update` 随飞机移动用上一帧准星射线重算世界aim，因此几毫米的世界坐标差不等于准星移动。原始失败记录保留，不删除断言或改成无条件成功。

新断言：双指放大并收回→抬起第二指→剩余手指横移60 CSS px→比较移动前后各自时刻 `screenPoint(snapshot.aim)`，要求准星位移<1 CSS px；zoom不变；touchCancel后等待并验证fired=0、held=[]、弹药不变。均实际查看前后截图。

| 视口 | 余指位移 | 准星屏幕位移 | 取消后 | 结果 |
| --- | ---: | ---: | --- | --- |
| 568×320 | 60px | 0.000000537px | fired=0, held=[] | 通过 |
| 844×390 | 60px | 0.000000675px | fired=0, held=[] | 通过 |

- 568：[结果](2026-09-29T17-54-31.525Z-42688/results.json)、[移动前](2026-09-29T17-54-31.525Z-42688/568-pinch-or-wheel-remaining-finger-before.png)、[60px后](2026-09-29T17-54-31.525Z-42688/568-pinch-or-wheel-remaining-finger-after-60px.png)、[取消快照](2026-09-29T17-54-31.525Z-42688/568-pinch-or-wheel-cancelled-no-fire.json)。
- 844：[结果](2026-09-29T17-54-37.327Z-39492/results.json)、[移动前](2026-09-29T17-54-37.327Z-39492/844-pinch-or-wheel-remaining-finger-before.png)、[60px后](2026-09-29T17-54-37.327Z-39492/844-pinch-or-wheel-remaining-finger-after-60px.png)、[取消快照](2026-09-29T17-54-37.327Z-39492/844-pinch-or-wheel-cancelled-no-fire.json)。

## 已覆盖的其余行为与烟尘证据

三尺寸设置→帮助→设置→暂停→继续的状态链、声音/特效切换、语言切换、帮助滚动、弹窗外点击隔离、飞行抽屉、射击滑出停止/滑回不重启/取消后不继续开火均通过。简报、战场、暂停及帮助内实际进入/退出 Chromium Fullscreen API，检查 `document.fullscreenElement`，暂停时间与弹药保持。1366滚轮放大/缩小不切枪，HUD上滚轮不缩放。

真实重炮输入击毁炮台，已观察冲击烟尘与残骸烟。例：[1366冲击](2026-09-29T17-36-45.557Z-51404/1366-markers-and-dust-impact-0.png)、[烟尘快照](2026-09-29T17-36-45.557Z-51404/1366-markers-and-dust-impact-0.json)含weapon=2、outcome=destroyed、age≈0.447s；[568持续烟尘](2026-09-29T17-36-45.557Z-51404/568-markers-and-dust-persistent-dust.png)和后续友军快照中烟尘age≈4.16s。没有发现烟尘将准星完全遮住。大部分场景采用较远视场，烟尘视觉大小的最终取舍应与标记缩小一起复看；本次没有将它判为确定性故障。

首轮文件名 `enemy-day` / `enemy-thermal` 与实际模式相反：游戏默认DAY，脚本原先假设默认IR。原证据不改写，以各快照thermal字段和截图DAY/IR为准；脚本现已按实际模式命名。首轮dust-0曾使用墙钟等待，受并行运行影响，实际仿真age应读快照，不能从文件名推断“已过1秒”。

捕获到的pageerror、失败请求及HTTP错误均为空。未作音质、物理设备触感、系统全屏兼容性或性能帧率结论；主代理并行长任务，因此本次帧率不作为性能验收。

## 定向复现命令

在 `games/local/night-overwatch` 目录执行（仅此hash有效，生产修正后必须换用新稳定hash）：

```powershell
$env:NIGHT_URL='http://localhost:4318'
$env:NIGHT_EXPECTED_SOURCE_HASH='0903f04fd2eeb33eb102945938d2ced50cfc8a7c0507f5fe1f81acef5f8a1888'
$env:NIGHT_REVIEW_WIDTH='568'
$env:NIGHT_REVIEW_CASE='focused-target-label'
node tests/usability-review.mjs
```

其他case：`friendly-warning-overlap`、`pinch-or-wheel`、`wide-field-markers`；右键例使用width=1366、case=`right-click-controls`。移除这两个筛选变量即可执行全套。每次生成独立目录，保留PNG、JSON、results.json及各视口Playwright trace.zip。
