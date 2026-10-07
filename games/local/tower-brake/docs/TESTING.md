# 验证记录

2026-10-06，Linux / Node.js 24.19.0 / Chromium 151.0.7922.173。手机尺寸使用桌面 Chromium 触屏模拟，未将其视为真实手机验收。

## 已通过

- `node --test tests/*.test.mjs`：31 项规则与存档检查。覆盖八关以有限转速与主动刹车通关、30/60/120 FPS 物理一致、掉帧逐层碰撞、三层补刹车、六连落、0.8 秒冻结和恢复、落地清零、失败、终点、一次续关、损坏存档恢复与成绩隔离。
- `node build.mjs`：生成不含测试、设计图或服务器的独立静态制品；运行代码无第三方依赖。
- `node tests/browser.mjs`：使用上述生产制品。真实触点完成主页、选关、设置、帮助、转塔、双指刹车、三层充能后危险救回、暂停、通关解锁、失败、一次续关与返回。检查触点取消、失焦暂停、开发试玩退出、320×568 / 390×844 / 844×390 / 1280×900 控件、URL 与存储开关、存储拒绝、iframe、全屏进入/退出/拒绝。共 12 组检查，零页面脚本异常；[机器记录](design/browser-evidence.json)。
- 游戏自身的 iframe 回归独立执行触屏游玩、暂停、返回和选关，显式子页 `dev=0` 覆盖父页 `dev=1`。Shell 中另有正式 `exerciseStandalone` 登记用例，游戏测试不跨包引用它。未将独立 iframe 测试称为全量 Shell 构建验收。
- 仓库统一开发模式同步检查：50 款游戏、零问题。开发模式与 Shell 入口适配单测 8 项通过。新增游戏配置、清单与锁文件登记通过检查。

## 实际画面

- [主页](design/actual-home.png) 与 [选关](design/actual-levels.png)
- [三连落后，在第四层危险区上方刹住](design/actual-brake.png)
- [暂停](design/actual-pause.png)、[通关](design/actual-win.png)、[失败](design/actual-failure.png)
- [物理横屏](design/actual-landscape.png)

以上是实际生产构建截图，部分保留显式启用的开发按钮用于核对物理状态。[概念效果图](design/concept.png) 单独保存。

## 环境边界

全仓配置与公共全屏全量检查受四个既有未初始化子模块（fishing、office-slacking、tower-defense-game、xiangqi-five）阻塞。没有更改它们的登记或伪造通过。当前环境未安装完整 monorepo 依赖，未执行完整 Shell 生产构建与全部游戏浏览器回归；新游戏已构建、在 iframe 中运行并验证其正式 Shell 操作用例。

真实 iOS/Android 设备、渠道 WebView、微信/抖音/B站原生平台、广告 SDK 与支付未验收。当前免费续关与三套免费皮肤不模拟广告或付费交易。
