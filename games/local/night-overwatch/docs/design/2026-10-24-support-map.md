# 任务地图、支援选择与快速撤离

2026-10-24，延续既有海军蓝/琥珀色战术界面。[效果图](2026-10-24-support-map-concept.png)使用内置 imagegen 生成，仅作设计参考；实际地形卡片由 Cocos Graphics 绘制，不把概念画当作实机截图。

## 玩家流程

- 战斗 → 设置 → 战斗补给 → 选择战斗支援。整张卡可点选，琥珀色边框、勾选与文字标明当前项。
- 自动追踪：普通炮弹自动追踪敌人，60秒。追踪弹+2：点选敌人，再按开火。射速提升：普通炮射速提高30%，60秒。
- 明确点击“看广告并启用”才请求广告。完成后一次性启用选中项，3秒准备倒计时后返回战斗，并显示获得的效果。
- 取消/失败留在选择页，说明未获得奖励；“不使用，继续战斗”立即恢复，无倒计时，不必返回设置页再按继续。
- 已存支援资格无需再观看广告，服务不可用也能“启用并返回战斗”；选择留到下次不会丢失资格。
- 如果完成回调先于前台恢复，资格先保存；原局面恢复可交互后才启用并倒计时。退出/重开不把计时增益带入新局。

## 地图与战斗结束

任务卡使用实际地形高度、真实路线、敌方初始位置及友军据点，补上山脊明暗、树林、河岸和村落。白天/黄昏/夜间用独立配色。最小横屏把任务号与名称并排，让地形保留空间。

全部威胁（含尚未出现波次）清除后，自动解除车队待命，镜头回到车队，以3秒动画走完剩余路线。停火并继续正常判定在途炮弹；炮弹尚未落地时不提前宣布胜利。友军损失仍优先判负；暂停冻结撤离。已清敌的短撤离阶段不被战斗截止时间截断。完成后进入结算，可重开或下一关。规则回放版本提升到v3。

## 图像生成提示

Built-in imagegen; original output: exec-4754298f-8331-4a8c-aae9-77f463de5396.png.

Create a polished UI design reference sheet for an existing Chinese mobile landscape tactical aerial escort shooter NIGHT OVERWATCH 夜航守望. TWO wide 2.16:1 game screens stacked vertically. Existing dark navy military instrument panels, amber primary button, cyan allies, restrained red enemy icons, readable Simplified Chinese. Top: compact support panel, title 选择战斗支援, subtitle 选一项支援 · 完整观看广告后立即生效. Three clickable cards 自动追踪 / 追踪弹 +2 / 射速提升 with concrete effects and durations, first selected. Footer 已选：自动追踪 · 领取后自动返回战斗. Secondary 不使用，继续战斗; primary 看广告并启用. Bottom: 任务地图 with daytime valley, dusk plateau and night terrain cards. Shaded ridges, winding river, bridge, roads, compounds, trees; amber convoy route, cyan start/extraction symbols, red hostile diamonds. No fullscreen button or device frame. Design mockup, achievable using Cocos Graphics.
