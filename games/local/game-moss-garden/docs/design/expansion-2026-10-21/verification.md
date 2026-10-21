# 2026-10-21 千关扩展验证

基线：`0459b0cb3c89a748f3a6bd252858951ba1ca073d`（远端 dev）。环境：Linux，Node 24.21.0 / pnpm 12.6.0，Chromium 151.0.7922.173。以下全部为生产构建的浏览器/触屏模拟，不是真机广告。

## 通过检查

- `pnpm exec turbo run build --filter=@coffeeeeffoc/game-moss-garden`：TypeScript与Vite生产构建通过，入口JS约172KB（gzip约55KB）。
- `pnpm --filter @coffeeeeffoc/game-moss-garden test`：29项规则/生成器/存档/挑战/广告/开发模式/输入测试通过。
- `node games/local/game-moss-garden/scripts/generate-levels.mjs --check`：固定seed可复现，718317个候选。1000关唯一解、连通、D4去重；独立枚举+BFS复核同样通过。前30关与基线逐项一致；1000关顺序解锁与最后一关结算通过。
- `pnpm --filter @coffeeeeffoc/game-moss-garden test:browser`：14组普通流程、7组邀请分享、5组新增激励/开发流程通过。
- `pnpm check:dev-mode`、`pnpm test:dev-mode`：副本检查与5项公共语义测试通过。
- `DEV_MODE_GAME_IDS=moss-garden PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:dev-mode:browser`：10组通过，覆盖真实Shell生产入口、独立入口、URL/存储/显式关闭、跨域传递及公共触屏拖动/取消。
- `pnpm check:games`：67款登记，0问题；`pnpm check:dependencies`、本次文件Prettier检查和`git diff --check`通过。

本环境先补齐固定gitlink的三个游戏子模块，并编译Shell实际依赖release-contract，再生成Shell生产产物和仅本游戏的内嵌路径。没有为了测本游戏运行全游戏构建。最初缺子模块/依赖导致的环境准备失败已解决。

## 实际流程与截图

320×568、390×844触屏，844×390横屏视口，1280×900桌面。实际画面对照[先行效果图](concept.svg)：保留纸张植物风格、金色种子和大按钮；首关单格花圃高亮；完成后的本关种子变花；提示确认页说明奖励并保留取消。复核中修正结算棋盘与文案间距、广告退出计时和试玩分享隔离。

- [首关引导](actual/tutorial-390.png)
- [本关开花结算](actual/bloom-result-390.png)
- [开发者数字选关](actual/developer-select-390.png)
- [第1000关](actual/level-1000-390.png)
- [小屏激励确认](actual/hint-confirm-320.png)
- [普通流程报告](actual/browser-report.json)、[邀请分享报告](actual/publishing-browser.json)、[激励流程报告](actual/expansion-browser.json)、[开发模式报告](actual/dev-mode-browser.json)

广告专项加载仓库真实`game-rewards.js → platform-ads.js`，使用模拟Tap SDK。验证未看完、失败、主动取消、重复/迟到完成、隐藏与返回两个顺序、SDK不存在、虚拟时钟推进十分钟视频/结束页停留，只有completed获得一次可见提示。普通提示的首次免费记录随存档恢复，撤回不返还；开发选关1/30/1000与试玩提示不写正常存档。

## 验证边界

没有配置本游戏真实TapTap身份/广告位，没有构建或上传TapTap正式包，没有真机真实广告验收。游戏侧统一激励端口已接通；后续共享打包器白名单/目录登记及配置步骤见[游戏README](../../../README.md#提示与通用激励端口)。本地测试不等于CI或Pages部署完成。此次按仓库最新约定执行相关定向检查，未运行可选的全候选隔离worktree校验。
