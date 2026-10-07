# 难度、首页、退出与开发模式验证

2026-10-07，Node 24.21.0、pnpm 12.6.0、Chromium 151.0.7922.173。本次使用生产静态构建、手机视口和 CDP 触屏；未将浏览器模拟称为真机验证。

## 最终功能结果

- 游戏规则测试 37 项通过：30 关三星路径、前 5 关教学保留、跨组规划、弃格预算、旧配置恢复、奖励幂等和开发参数隔离。四种单步贪心策略对第 6–30 关共 100 次运行均未通关。
- H5 浏览器 23 项通过，页面异常为 0。覆盖 390×844、360×640、320×568，真实拖放、取消与多点触控、暂停、直接首页保存、退出清局、重载恢复、普通解锁、全屏和方向变化。
- 开发模式的普通选关页可试玩第 30 关，完整参考路径由真实触屏落子获得三星，原正式存档逐字段保持一致。工具页展示参考落点并返回原暂停页；撤销、增组、预算和清线目标调试保持独立试玩，显式 `dev=0` 恢复正常锁关。
- 在线导航 transport fixture 验证同一会话及未确认落子在返回首页、取消开发选关并继续后保留，且开发调参拒绝修改在线棋盘。这是客户端导航测试，不是正式身份或服务端排位验收。
- Shell 生产构建的 iframe 桌面和独立手机触屏流程通过，检查直接首页、继续、退出、真实首关胜利及宿主导航隐藏/恢复。对应语义行为契约已同步修改。
- 公共开发模式一致性检查及 5 项开关规则测试通过；本游戏生产构建的独立/Shell 四组开关与公共手机/iframe用例合计 10 项通过，覆盖默认关闭、URL、存储、显式关闭、拖动面板、触点取消和跨域显式传递。
- 原生 Canvas 手机模拟 18 项及微信/B站共享 smoke 通过。旧存局的标题、提示、目标、预算和组数使用保存配置；原生结果及两平台广告恢复验证的具体版本边界见 [原生记录](native-verification.md)。

## 截图对照

[首页概念图](home-concept.png) 与 [320×568 实际首页](actual/home-320x568.png) 保持主操作、进度、选关/无尽卡片及轻入口的层级。短屏压缩积木插画，不裁掉操作入口。

[游玩概念图](game-concept.png) 与 [第 30 关实际试玩](actual/developer-level-30.png) 保留棋盘和三块候选，左上“首页”与右上实心双竖条暂停入口清晰。目标、多线和弃格预算只显示本关必要信息。

[开发工具概念图](developer-tools-concept.png) 与 [实际开发工具](actual/developer-tools.png) 展示任意选关、参考解、撤销、重置与清棋盘。扩展授权与参数 API 在 [H5 说明](h5-layout.md) 中记录。

完整 H5 自动化记录见 [verification.json](actual/verification.json)，原生截图以 `native-*.png` 留档。独立代码审查见 [review.md](review.md)。

## 复现命令

```sh
pnpm --filter @coffeeeeffoc/three-choose-two test
pnpm --filter @coffeeeeffoc/three-choose-two test:browser
pnpm check:dev-mode
pnpm test:dev-mode
DEV_MODE_GAME_IDS=three-choose-two pnpm test:dev-mode:browser
```

浏览器设置 `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium`。公共开关浏览器流程使用已构建的本游戏、Shell 和既有乌龙城公共触屏 fixture；Shell 构建只准备目标游戏，未执行全游戏 Pages 构建。

精确候选版本验证与推送由最终发布步骤执行，另记录准确 base/head 和远端结果。本次未验收平台真机、官方登录、真实广告、真实 Runtime API/PostgreSQL 或线上 CI/Pages 发布结果。
