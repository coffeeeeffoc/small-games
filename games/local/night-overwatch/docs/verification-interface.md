# 界面材质与交互验证（整合前历史版本）

本报告对应 `1f668069` 一路的 `6c7dad…` 制品与原始截图，不能作为后续整合版本的验收结果。当前身份见 [STATUS](../publishing/STATUS.md)。

2026-10-28。实际制品：Cocos Creator 3.8.8 `web-mobile`，源码身份 `6c7dadbd1f7e1f6978b97827aa090a47ab17b2bed7e11b5982b1aef539993c3d`，13,486,752 字节。运行规则和网络协议未改；核对合并远端后源码身份与制品一致。完整状态及媒体清单以 [STATUS](../publishing/STATUS.md) 为准。

## 功能证据

- HUD 24/24：可见皮肤与触屏热区分离、禁用状态及图标、战绩游标续页、中英文、安全区、紧凑布局、设置/帮助/补给、结果关闭与全局控件隔离。
- 原生适配契约 7/7：更新规范源码指纹，检查真实适配输入、隔离暂存及指纹计算；这不是原生宿主运行验证。
- [界面记录](../reports/interface/style-evidence.json)：568×320、844×390、1280×720 共40张运行截图；鼠标与触屏拖出后移回不触发，缩放双指加第三指按钮同样取消。直接读取实际 Sprite 世界边界，防止贴图赋值后被重置为原始尺寸。
- [输入记录](../reports/interface/input-evidence.json)：三个尺寸均验证昵称保存、软键盘模拟缩屏及焦点、房号密码输入、记录页隐藏设置、单人/对战战况入口及真实开火。
- [自然结算记录](../reports/interface/finish-evidence.json)：通过正常瞄准和射击击败本地机器人，保留最后战场，完成语音正常播放，结算期间计时停止，三个尺寸均可关闭并返回大厅。隔离外部服务，不制造公开积分。

浏览器使用 Chromium / D3D11，手机尺寸采用触屏模拟。截图与录屏来自同一真实 Creator 制品，未注入胜利状态、假房间或假成绩。完整本地抓图位于 `outputs/night-overwatch-interface/`；下列关键帧及上架资料已版本化，机器可读摘要见 [verification.json](../reports/interface/verification.json)。

## 视觉对照与修正

参考为 [当前效果图](design/interface-concept.png) 与 [维护规范](design/interface.md)。实际素材是独立生成的面板、主按钮和透明徽章；文本与状态仍由引擎绘制。检查内容如下，截图存在和断言通过不替代这些画面检查。

| 页面 | 实际画面与结果 |
| --- | --- |
| 首页 | [桌面](../publishing/gameplay/screenshots/interface-2026-10-28/04-home.png)、[小横屏](../reports/interface/home-568.png)：夜航背景与标题保留；单人主按钮、对战次按钮、榜单/手册轻入口，头像/记录不挤主标题 |
| 设置与飞行 | [设置](../publishing/gameplay/screenshots/interface-2026-10-28/05-settings.png)、[小横屏设置](../reports/interface/settings-568.png)、[飞行](../reports/interface/flight-controls-568.png)：材质面板、分隔行、声音状态、轻量增减；选中方向使用下划线，主要强调继续战斗 |
| 大厅与表单 | [大厅](../publishing/gameplay/screenshots/interface-2026-10-28/06-lobby.png)、[私密房](../reports/interface/private-room-568.png)、[昵称](../reports/interface/nickname-568.png)：主要房间动作与工具栏分区；表单确认限宽，返回是轻入口；房间类型用选中线，不与确认争夺主视觉 |
| 排行与记录 | [排行榜](../reports/interface/ranking-568.png)、[记录](../reports/interface/history-568.png)：小型分页、清楚的不可用箭头；数据区保留真实离线状态，不填假数据 |
| 任务与帮助 | [任务](../publishing/gameplay/screenshots/interface-2026-10-28/07-missions.png)、[帮助](../reports/interface/help-568.png)：任务卡保留实际地形、光照及敌人信息，底部不再三块等宽按钮；帮助正文可滚动，标签与返回可达 |
| 战斗与退出 | [战斗](../publishing/gameplay/screenshots/interface-2026-10-28/03-duel.png)、[退出](../reports/interface/exit-568.png)：战场保留视野，必要 HUD 和武器状态可辨；确认页主次操作及危险色明确 |
| 结算与反馈 | [结算](../publishing/gameplay/screenshots/interface-2026-10-28/08-settlement.png)、[小横屏结算](../reports/interface/settlement-568.png)、[按下](../reports/interface/pressed-1280.png)：徽章/标题/用时/积分有层级，数据不再各占一块大色板；按钮按下高亮，结算隐藏会碰撞关闭入口的全局控件 |

检查中发现并修正了皮肤按原始纹理尺寸显示、选中按钮与提交按钮同时过度强调、空分页图标仍像可点击、战绩游标续页误禁用、多指拖出误激活，以及结算缩屏后的齿轮重叠。

与生成参考的必要差异：真实房间只有双人，概念中的等级、在线人数与4/8人房不进入实现；本地练习积分显示破折号，不显示示例+40；任务地形和结算背景来自实时3D战场。各尺寸按实际安全区重排，桌面设置使用右侧抽屉，小横屏使用分栏。字体由运行系统渲染，材质使用已登记的实际纹理；不把生成参考当作实际截图或声称逐像素复刻。

## 未覆盖与复查

未执行全仓库候选套件、实体手机软键盘、原生小游戏宿主、真实广告或联网服务验收。新增三张纹理约4.68MB，本次Web包约13.49MB；原生渠道需要单独检查包体和真机加载。提交、推送、CI与Pages各自记录，不以本地通过代替线上状态。
