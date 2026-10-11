# 好友多人模式运行验证

2026-10-11，Node 24.21.0、pnpm 12.6.0、Playwright 1.55.1、Chromium 151.0.7922.173。

已运行生产构建，通过真实 Runtime API（本地端口 43002）与 PostgreSQL 17.6 的独立 `competition_test` 数据库验证。每位玩家使用独立浏览器 context、独立访客身份；没有用本地消息通道或伪造 HTTP 成功响应代替联网。

报告见 [friends-browser-report.json](friends-browser-report.json)。覆盖彩色 2、3、4 人，经典单打与四人双打；邀请链接/房间码、房主权限、人数限制、准备状态、指定与随机关卡、四个物理席位的触屏出杆、回合与棋盘一致性、丢响应重试幂等、刷新恢复、再来与退出、本地存档隔离。手机视口为 390×844、320×844，并实际切换到 844×390 横屏后触屏出杆。截图由浏览器直接保存为 JPEG。

三人终局使用明确的末局测试数据：只在独立测试数据库摆放最后一枚己方棋子，客户端重新加载后以真实触屏击球，服务端模拟最后一杆并计算排名和累计积分。这证明末杆、结算与再来的流程，**不表示从初始布盘完整打完了一局**。其他出杆从正常新房间布盘开始，没有提交或修改客户端成绩。

开发开关仅用于读取状态快照，未调用开发者改分、获胜或换手操作。截图中可见开发入口；默认关闭的生产入口由现有单人和 Shell 检查另行验证。没有进行真实手机或原生小游戏宿主测试。

## 复现

先按仓库运行时服务流程建立并迁移 `competition_test`，启动 Runtime API，允许来源 `http://127.0.0.1:43010`。然后在仓库根目录执行：

```sh
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium \
CARROM_TEST_DATABASE_URL=postgres://runtime_app:local-runtime-only@127.0.0.1:15432/competition_test \
node games/local/carrom-club/tests/friends-browser.mjs
```

脚本默认重新构建生产 `dist` 并启动 43010 静态服务。`CARROM_TEST_API_URL` 可指定其他本机 Runtime API 端口；测试拒绝非本机 API 及非 `competition_test` 的数据库末局写入。

## 关键截图

- [四人房间](colors-4-room-390.jpg)
- [三人随机关卡预览](colors-3-random-preview.jpg)
- [右侧席位在 320 宽视口触屏瞄准](colors-4-seat-1-aim.jpg)
- [左侧席位触屏瞄准](colors-4-seat-3-aim.jpg)
- [横屏触屏瞄准](colors-4-landscape-aim.jpg)
- [三人末局测试数据的结算](colors-3-result-fixture.jpg)
- [四人经典双打](doubles-4-seat-0-aim.jpg)
