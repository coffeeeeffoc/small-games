# 操作与节奏优化验收（2026-10-24）

本地未提交版本；真实 Cocos Creator 3.8.8 的 `web-mobile` 生产构建。当前构建源码指纹 `2960a86c45e9483779b9471efb9e04ca0bb5ed4c6a65ec22454b7b298faed332`。渠道为 preview，未推送、部署或上传平台。

## 根因与改动

- 固定摇杆此前以触摸落点为原点，只在 TOUCH_MOVE 更新移动：按住外圈不动，`movement.browser.mjs` 在修改前稳定失败。旧生产包中从中心拖动可移动约74个世界单位，故并非模拟移动或坐标映射失效。改为以可见中心计算，按下立即更新；补入 WASD/方向键及空格。保留多指独立归属与失焦/暂停清理。
- 基础射击间隔从0.245改为0.4秒，保留各类增益与永久射速倍率。十秒无增益射击的回归范围24–26发，攻速强化至少增加3发。
- 局内经验从12/+10改为16/+12；首次选择最早20战斗秒，后续至少间隔15秒。经验与奖励排队保留，选卡和暂停不推进时间；无击杀不因计时获得奖励，清场胜利仍优先。
- 原场景和角色不变；首页/选关/战斗/强化/营地/暂停/结算/设置/帮助统一纸金、深绿、图形徽章和装饰边框。短屏技能并排，营地动态分页，购买热区互斥。截图复核后修复帮助文字覆盖、横屏生命文字偏移、结算大块留白、短横屏选关节点与翻页按钮重叠。

## 证据

- `node scripts/typecheck.mjs` 通过，真实 Creator 构建成功；检查资源清单与源码一致后才进行最终录制。
- `node --test --test-concurrency=1 tests/*.test.mjs`：166项通过。更新经验/射速和隔离夹具，增加经验保留及15秒间隔、自然首奖时间、射速提升断言。
- `node tests/balance.mjs`：12组正常生命构筑均通关；五类主动技能仍可用。
- `node tests/campaign-balance.mjs`：种子7/42/81各完整通过14关，使用真实通关所得货币购买成长。首关首次强化分别约26.50/26.03/26.50秒；所有相邻选择至少15秒。完整记录：[campaign/balance-report.json](actual/campaign/balance-report.json)。无永久购买对照也保留在报告中，不把对照结果冒充正式成长流程。
- `node tests/movement.browser.mjs`：330×717、320×568、844×390下按住外圈、反向拖动、取消、键盘移动、失焦暂停和恢复后不漂移通过。
- `node tests/polish.browser.mjs`：320×480、640×360、320×568、330×717、390×844、430×932、844×390七尺寸菜单/战斗截图与控件互斥检查通过。自然首关第8次击杀、24.48战斗秒获得首次强化；60.86秒清场、满血通关、进度重载一致、零页面异常。[polish-report.json](actual/polish-report.json)。
- `node tests/cocos.browser.mjs`：正式浏览器回归通过；四尺寸多指摇杆+冲刺、技能拖动取消/施放、自然失败/重试、开发模式开关、同源 iframe 状态通知、暂停/失焦/resize、存档重载，及串行调用的移动和真实 WebAudio 生命周期均通过。[browser-report.json](actual/regression/browser-report.json)。

## 画面对照与资料

[02-concept.png](02-concept.png) 为概念图，不能作为实机证据。最终实际画面见 [首页](actual/home-330.png)、[选关](actual/levels-330.png)、[战斗](actual/battle-330.png)、[强化](actual/upgrade-1-390.png)、[结算](actual/victory-390.png)。实现沿用现有 Graphics/Label/Sprite，保留概念中的配色、徽章、卡片和层次；未额外制作概念图中所有细密雕花贴图。

八类上架基础资料统一归档于 [publishing/STATUS.md](../../../publishing/STATUS.md)，实际录屏与宣传剪辑分别交付。历史设计和旧批次记录保留。

这些证据来自桌面 Chromium 手机触屏模拟与纯规则回放，不等于真实手机、TapTap/微信原生运行或广告填充验证；本轮不改变广告接线、公共平台模块和无关游戏。
