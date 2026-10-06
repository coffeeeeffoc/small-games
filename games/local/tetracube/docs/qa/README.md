# MVP 验收

2026-10-06，Chromium 151.0.7922.173，Linux；Playwright + CDP 触屏模拟。以下是浏览器验证，不是手机真机验证。

## 实际画面

- [手机主页](mobile-home.png)
- [手机游玩](mobile-play.png)
- [首次教学与落点间距](mobile-tutorial.png)
- [重力连锁](mobile-combo.png)
- [结算](mobile-result.png)
- [320×640 小屏](play-320x640.png)
- [844×390 横屏](play-844x390.png)
- [1440×1000 桌面](play-1440x1000.png)

相较于 [设计参考](../design/reference.png)，实现保留深色方舱、玻璃方块、青色主操作和上下分区。教学提示有独立预留区域，避免遮挡 Ghost；横屏把操作区放到右侧，竖屏放在底部。暂停图标以两条独立实心竖条绘制。

## 结果

- `node --test tests/engine.test.mjs`：31 项通过。
- `node build.mjs`：通过，静态运行不需要第三方脚本或运行时依赖。
- `node tests/browser.mjs`：8 组流程通过，未捕获页面错误。逐项结果见 [browser-report.json](browser-report.json)。
- 独立入口与同源 iframe 在 390×844 触屏和 1280×900 桌面下：启动、落下、暂停、继续、返回通过。
- 统一开发模式默认关闭、URL 开启、存储开启、显式关闭、存储禁用降级均通过。
- 全部现有可用游戏的开发模式副本检查和 workspace 依赖边界检查通过。
- 公共 H5 全屏机制的独立、iframe、不支持与拒绝分支通过。
- 另以 persisted 页面生命周期事件检查返回缓存页面后的画布恢复，并核对教学提示与绘图区没有交叠。

重力连锁用统一开发模式中的可见测试操作创建局面，再通过真实「重力翻转」按钮触发；没有直接改动生产规则。开发局不覆盖普通对局存档或计入最高分。

## 验证边界

仓库当前有四个未初始化的旧游戏子模块，整体 `check:games`/完整 Shell 生产构建不能通过，因此实际 iframe 验收使用相同嵌入约束的浏览器测试夹具和已注册的 Pages 操作用例；未把它称为完整 Shell 构建验收。当前 Node 24.19.0 也低于仓库要求的 24.21.0。未执行线上发布、手机真机、Android/iOS 安装或微信/抖音/B 站原生 SDK 验收。
