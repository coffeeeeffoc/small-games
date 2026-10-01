# Night Overwatch 最终构建定向复验

构建：`f8f28eab6a6c710151d2b34e82050a5824f04338f7ec588fa942b5d2817171eb`。URL：`http://localhost:4318`。

结论：本轮指定的五组定向检查通过，关键截图已实际打开并检查。上一轮三项P2在此构建、所列视口及输入方式下不再复现；568/844远处友军聚合及关注展开符合预期。

每次运行开始、结束均验证远端build-info、指定hash与当前生产源码hash一致。只修改独立测量脚本和新增本报告，未修改生产文件。旧报告、旧截图及失败记录全部保留。

测试的是同一个 `web-mobile` 构建：568×320 / 844×390 使用 Chromium CDP 触控模拟，1366×768使用鼠标；1366结果不代表本代理另测了web-desktop产物。没有重复主代理的全量交互、240s任务回放和desktop presentation，也没有物理设备验收。

## 定向结论与证据

| 用例 | 视口 | 自动检查 | 实际截图检查 |
| --- | --- | --- | --- |
| friendly-warning-overlap | 568×320 | 通过 | 白光/热成像警告移到底部，不再穿过准星或友军标记 |
| focused-target-label | 568×320 | 通过 | 波次条存在时炮台名称仍可见；通知消失后仍可辨认 |
| right-click-controls | 1366×768 | 通过 | 右键重型炮卡片后仍选中速射炮，未消耗弹药或开火 |
| friendly-group-focus | 568×320 | 通过 | 远处友军显示×3；移入准星后该组展开，显示护卫名称 |
| friendly-group-focus | 844×390 | 通过 | 同上；关注文字避开准星，未保留旧组数量覆盖关注单位 |

### 568：友伤警告与准星

- [白光图](2026-09-29T18-18-22.746Z-21140/568-friendly-warning-overlap-centered-friendly-day.png) / [快照](2026-09-29T18-18-22.746Z-21140/568-friendly-warning-overlap-centered-friendly-day.json)。
- [热成像图](2026-09-29T18-18-22.746Z-21140/568-friendly-warning-overlap-centered-friendly-thermal.png) / [快照](2026-09-29T18-18-22.746Z-21140/568-friendly-warning-overlap-centered-friendly-thermal.json)。

准星约(284,160)，红色警告位于y≈229的底部信息条；友军类型置于左侧，红色短提示在上方。实际图中没有旧版横条压住瞄准中心的情况。

### 568：关注炮台与波次条共存

- [波次条存在时](2026-09-29T18-18-27.351Z-41472/568-focused-target-label-wave-banner-active.png) / [快照](2026-09-29T18-18-27.351Z-41472/568-focused-target-label-wave-banner-active.json)。
- [通知消失后](2026-09-29T18-18-27.351Z-41472/568-focused-target-label-wave-banner-cleared.png) / [结果](2026-09-29T18-18-27.351Z-41472/results.json)。

炮台标签移到准星左侧，波次条在底部，原先active=false的回归断言现在通过。

### 1366：右键武器卡片

- [右键后截图](2026-09-29T18-18-36.034Z-48348/1366-right-click-controls-right-click-weapon.png) / [快照](2026-09-29T18-18-36.034Z-48348/1366-right-click-controls-right-click-weapon.json) / [结果与坐标](2026-09-29T18-18-36.034Z-48348/results.json)。

从新任务默认速射开始，右键点击重型炮卡片后selected仍为0，fired=0、held=[]。旧版会切为selected=2，此问题不再复现。

### 568/844：远处友军聚合、关注展开

选取实际可见的友军group=1、成员4/5/6。初始显示一个小方框与×3，通过真实触控拖动将准星移到该组：组数量消失，出现独立方框及护卫名称，其他不受关注的组仍按距离条件显示。

- 568：[聚合图](2026-09-29T18-24-30.464Z-5776/568-friendly-group-focus-distant-group-count.png) → [关注展开图](2026-09-29T18-24-30.464Z-5776/568-friendly-group-focus-focused-group-expanded.png) / [展开快照](2026-09-29T18-24-30.464Z-5776/568-friendly-group-focus-focused-group-expanded.json) / [测量结果](2026-09-29T18-24-30.464Z-5776/results.json)。准星到最近成员投影距离0.863 CSS px。
- 844：[聚合图](2026-09-29T18-24-34.070Z-20552/844-friendly-group-focus-distant-group-count.png) → [关注展开图](2026-09-29T18-24-34.070Z-20552/844-friendly-group-focus-focused-group-expanded.png) / [展开快照](2026-09-29T18-24-34.070Z-20552/844-friendly-group-focus-focused-group-expanded.json) / [测量结果](2026-09-29T18-24-34.070Z-20552/results.json)。准星到最近成员投影距离1.232 CSS px。

图中非关注标记比旧版紧凑，远处友军套叠减少；焦点处仍有明显的大方框和护卫文字。两例均没有开火、弹药消耗或残留射击输入。

## 新增聚合用例的测量修正

18:20首次新增聚合用例误用 `Simulation.aimedUnit` 作为HUD视觉关注的必要条件，导致两例失败。原始目录 `2026-09-29T18-20-26.676Z-51504` 和 `2026-09-29T18-20-30.802Z-51512` 保留。

核实 `Simulation.ts:242`：getter筛选所有存活单位，并不只筛敌军；它要求世界距离不超过该单位半径+1.2，再取最近单位。HUD则按单位本体到标记的屏幕线段距离判断关注，普通单位容差12 CSS px。二者语义不同；首轮图中护卫标签已经active且该组count已经隐藏，火控aimedUnit为空不构成聚合失败。

修正后保留并加强实际功能断言：初始存在可见的该组×3；真实输入后准星距该组成员投影<4 CSS px；该组护卫/救援车类型标签active；该组×数量不再active；没有开火、弹药消耗或残留按压。该断言能捕获准星未到该组、关注不展开、标签不显示和组数量残留。以上最终两例均通过且已看图。

本轮没有发现需要追加生产修改的问题。每个运行目录保留PNG/JSON对、results.json及Playwright trace.zip；自动输出中的visual-review-pending已由本报告的人工看图结论补齐。
