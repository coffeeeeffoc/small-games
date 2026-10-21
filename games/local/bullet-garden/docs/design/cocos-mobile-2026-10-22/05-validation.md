# 交付验证 · 2026-10-22

## 实现与画面对照

产品方案和 `02-concept.png` 先于 Cocos 实现。最终为 Creator 3.8.8 的原生 Sprite/Graphics/Label 场景，竖屏首页、十四关选关、战斗、强化、营地、暂停和结算；独立及 Shell 均无全屏按钮。新图标用于 Web 和原生加载页。

实际画面以 `actual/home-320.png`、`home-390.png`、`home-430.png`、`home-844.png`、`battle-first10-390.png`、`victory-390.png`、`failed-390.png` 为准。`01-home/02-levels/03-battle` 是首轮记录；旧战区过大的问题已修正为竖屏边界，不能将旧 `03-battle` 当最终画面。

## 已执行

- Windows / Node 24.21.0 / pnpm 12.6.0，真实 Creator 3.8.8 构建；没有自制引擎替身或网页 iframe 冒充 Cocos。
- 165项规则、存档、广告租约、配置边界、预制品物理路径和原生启动桥接测试全部通过，typecheck通过；结果见 `reports/unit-final.txt`。
- 12种正常血量流派回放通过；3个seed各14关，按正常奖励购买成长后通过。`actual/campaign/balance-report.json` 是核心回放，非手机真机证据。
- 同存档/seed/升级策略的移动对照：第二关站桩受伤6.108、移动0；中期关96.33、移动0，均可通关。`actual/movement-comparison.json`。
- Chromium触屏模拟320×568、390×844、430×932、844×390：主页/选关/营地/帮助、摇杆与冲刺多指、技能拖拽取消、暂停与失焦、旋转继续、自然60秒首关胜利、保存重载解锁，以及后期存档fixture中的自然碰撞失败、手动结算和重试。`actual/browser-report.json` 记录最终运行结果。
- 真实生产Creator广告fixture加模拟TapTap SDK：治疗/复活完整观看才奖励、取消和错误不扣机会、重复和换局后的迟到回调无效、隐藏中完成待返回前台发奖且保持暂停。`actual/ads-mockSDK-report.json` 标记 `mockSDK:true`、`platformAcceptance:false`；对应源码哈希记录在报告中。
- Shell沉浸入口与导航113项测试通过；统一开发开关源检查及5项语义测试通过。
- 仓库正式独立入口、390×844手机Shell触屏流程及统一开发开关10项生产浏览器检查通过，见 `actual/shell-phone-report.json`、`shell-phone-390.png`、`unified-dev-mode.json`。最终默认Web包和原生转换包的源码哈希一致，为 `3c4c0f1cf5f231a5443343ff2e07590b4a818be77cc925be728be4df7b4074eb`。
- 官方TapTap插件1.2.2的归档和完整安装目录（含原始自带依赖）验证后，使用共享隔离回放执行真实转换并确认Babel零失败，随后注入真实SDK启动连接、绑定manifest并重打ZIP。包11,708,625字节，ZIP与目录逐文件相同，压缩与解压大小均低于20MiB；完整receipt归档为 `actual/taptap-build-receipt.json`。

## 最终集成修复

- Shell菜单为返回目录预留独立行，进入战斗后场景恢复占满视口，避免覆盖Cocos返回控件。
- Web启动层仅对不可取消的GameCanvas touchcancel事件关闭无效preventDefault调用，原事件继续交给引擎清理输入；没有过滤错误日志或吞掉手势取消。
- 合并远端Homebound Cocos接入和共享原生广告修复后，六款Creator制品路由12项与发布范围96项测试通过。旧候选f4a43850因真实入口问题未通过，不作为最终发布依据。

最终包 `productVersion` 为本游戏版本1.0.0；原始官方转换步骤的0.1.0保留在转换receipt中，绑定后的ZIP记录最终版本。

最后一次生产包完整触屏复测通过，记录已更新。自然失败用例修正了自动选择回血成长及忽略剩余飞行敌人的测试策略；仍使用真实触屏、正常模拟速度和真实碰撞，不直接改战斗状态。

## 配置与验收边界

最终Web发布包必须为 `preview`、空AppID/广告位、`adsEnabled:false`，广告fixture不参与发布。配置文件只接受platform、appId、adUnitId、adsEnabled四项，native/H5不能混用；Turbo对配置读取的build/typecheck关闭缓存，预制品仍核验相同配置。

尚未做手机真机、真实TapTap广告位/SDK、平台后台上传或审核。未配置真实广告ID；普通游玩、重试、选关均不依赖广告。源码匹配的Web制品与官方转换包仅证明本地构建和契约，不证明真机验收。

准确base/head候选验证、dev推送及CI/Pages状态由主会话最终交付记录说明；本文件不预先宣称远端通过。
