# 本轮验证

环境：Node 24.21.0、Chromium `/usr/bin/chromium`，390×844 / 320×640 / 320×568 / 844×390 / 1280×900，触屏模拟。不是实体手机或原生渠道真机验收。

已通过：

- `pnpm --filter @coffeeeeffoc/orbit-atelier build`（含 TypeScript）。
- `pnpm --filter @coffeeeeffoc/orbit-atelier test`：20 项规则/存档/交点选择检查，全部 24 关可解。
- `ORBIT_EVIDENCE_DIR=docs/design/expansion-2026-10-11/actual node tests/browser.mjs`（游戏目录）：生产构建主页、选关、触屏拖动/取消/撤回、暂停/后台/恢复、正常结算与关卡解锁、末关星栓、损坏/禁用存储、桌面/手机/iframe、全屏进入退出及拒绝降级。完整记录见 [browser-report.json](actual/browser-report.json)。
- `node games/local/orbit-atelier/tests/publishing.browser.mjs`（仓库根）：真实触屏同盘通关；提示后撤回不清除次数；挑战结算/分享不改正常进行中的存档；取消分享不复制；公共链接清除 dev/token；回工坊恢复原关卡；`adMode: off` 三次真实普通结算无广告；配置 `publicUrl` 后分享指向配置入口且只带关卡。

[主页](actual/mobile-home.png)、[游玩](actual/challenge-playing.png)、[暂停](actual/challenge-paused.png)、[结算邀请](actual/challenge-result.png)、[320 宽返回](actual/challenge-return-small.png)。逐张检查了本轮结果页面新增按钮、字数、安全区与热区，沿用现有布局没有遮挡。

仅异步同盘邀请，不声称真人实时对战或服务器认证成绩；真实分享宿主/广告渠道尚待参数与真机验收。
