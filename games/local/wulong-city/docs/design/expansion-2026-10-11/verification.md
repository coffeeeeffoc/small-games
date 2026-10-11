# 本轮验证

环境：Node 24.21.0、Chromium 触屏模拟，H5 320×568、390×844、844×390；微信预览包 Canvas/SDK 浏览器模拟 390×844。未作官方开发者工具或实体手机验收。

已通过：

- `pnpm --filter @coffeeeeffoc/wulong-city build` 与 `test`：96 项检查，100 关内容/规则/旧档与路线/公共分享去敏。
- `node games/local/wulong-city/tests/publishing.browser.mjs`：主页/选关/游玩/三级提示/暂停/结算/重试/返回均真实触屏；风扇谜题通关；三级提示循环回第一条仍记辅助 3 级；重试提示记录重新计数；分享不含谜底，取消不复制，主线原存档逐字不变；配置 Host provider 收到第三次真实正常结算机会，今日试演返回已完成主线不重复计结算。
- `BASE_URL=http://127.0.0.1:4374/ pnpm --filter @coffeeeeffoc/wulong-city test:mobile`：320/390/横屏、十章 100 关解锁呈现、触屏多指移动跳跃、松手/取消/暂停释放输入、旋转保留关卡、真实触屏结算及重玩。
- `BASE_URL=http://127.0.0.1:4374/ pnpm --filter @coffeeeeffoc/wulong-city test:lifecycle`：100 关三级提示、暂停冻结/恢复、每关两次重试、拖拽取消与独立多指输入、全屏、320/360/390/768/1440 布局、正常首关解锁/主线恢复均通过。[完整生命周期记录](actual/lifecycle-report.json)。
- `pnpm minigame:build --game wulong-city --platform wechat --preview` + `WULONG_EVIDENCE_DIR=.../expansion-2026-10-11/native-actual node games/local/wulong-city/native/browser-check.mjs`：生产原生 Canvas 七页、触屏操作完成首关、结果保存 1 级提示标识、主线保存与生命周期。

[H5 主页](actual/home.png)、[提示](actual/hints.png)、[H5 结算](actual/result.png)、[原生结算](native-actual/result.png)、[原生验证记录](native-actual/verification.json)。提示标识占用既有结算说明区域，两端截图检查未遮挡继续操作。

共享广告只在 H5 普通自然结算触发，仍是明确标记的模拟。原生分享和真实渠道广告未新增，后续需宿主参数与真机验收。
