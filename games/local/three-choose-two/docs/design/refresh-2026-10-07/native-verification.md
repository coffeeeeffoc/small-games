# 原生首页与退出流程验证

2026-10-07 使用构建后的微信、B 站原生 CJS preview 包，在系统 Chromium 中通过 mock 平台 SDK 和 CDP 触屏输入运行。基准视口 390 × 844，小屏 320 × 640；这是浏览器宿主模拟，不代表平台真机验收。

关卡目录最终版完成后，重新构建两平台包并重新执行本文全部原生检查，结果均通过。随后窄修旧存局显示：主页标题、游玩目标/预算/组数、帮助提示和结算标题/组数优先使用 `state.config`，缺字段时保留目录回退；再次构建两平台并通过浏览器 18 项与两平台共享 smoke。广告行为未改，按增量验证复用此前两平台恢复各 9 项结果。最终源码与包的 SHA-256、各阶段检查对应的源码版本及构建元数据见 `native-final-build-verification.json`；最终候选 hooks 按仓库流程照常执行。

## 验证结果

- `native/browser-check.mjs` 的 18 项检查通过：主页主操作与选关同排，普通选关锁定，拖拽与手势取消，双触点归属，通关解锁，撤销，前后台，存档恢复，直接首页保局，退出本关跨重载清局，独立线上恢复序号/待发落子/结束意图保留，退出练习不结算，以及分享与资源清理。
- 首页帮助在未开始对局时前后台切换正常；从首页、设置和游玩打开帮助，均回到对应来源。
- 已有存档恢复检查增加旧配置快照断言：旧标题、提示、7 条线目标、9 组限制与 13 弃格预算保持一致；退出旧局后重新开始读取当前目录配置。
- 微信、B 站 `native/recovery-check.mjs` 各 9 项通过：合法失败、失败恢复、撤销、广告取消/失败、后台广告完成保持暂停、续局仅奖励两组、重载无重复奖励、已确认凭据中断恢复。
- 微信、B 站共享 `scripts/native-game-smoke.mjs` 均通过，原生宿主没有 Web 全屏入口。
- `git diff --check` 通过。独立代理只读审查通过：本地退出不修改记录、解锁及排位恢复；在线“结束本局”仍使用原有 `endOnline` 权威结算。

## 实际截图核对

`native-home.png` 与先行主页图核对：设置在右上，继续/选关并列，无尽保留独立卡片，排行榜/提示在下方。`native-game.png` 左上直接显示“首页”，右上暂停为两条实心竖条。`native-pause.png`、`native-pause-small.png` 显示明确“退出关卡”和清局说明，各项触控互不遮挡。`native-levels.png` 保留普通玩家的进度锁定。小屏主页与棋盘见 `native-home-small.png`、`native-game-small.png`。

完整机器记录见 `native-verification.json`、`native-recovery-wechat-verification.json` 和 `native-recovery-bilibili-verification.json`。

## 可复现命令

工具链环境：`PATH=/tmp/three-choose-two-tools/bin:$PATH`，`BROWSER_EXECUTABLE=/usr/bin/chromium`，`PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium`。

```sh
node apps/shell-minigame/scripts/build.mjs --game three-choose-two --platform wechat --preview --ad-unit-id native-recovery-fixture
node apps/shell-minigame/scripts/build.mjs --game three-choose-two --platform bilibili --preview --ad-unit-id native-recovery-fixture
node games/local/three-choose-two/native/browser-check.mjs
node games/local/three-choose-two/native/recovery-check.mjs --platform wechat
node games/local/three-choose-two/native/recovery-check.mjs --platform bilibili
node scripts/native-game-smoke.mjs --standalone --game three-choose-two --platform wechat
node scripts/native-game-smoke.mjs --standalone --game three-choose-two --platform bilibili
```

本次未运行真实 Runtime API/PostgreSQL 原生在线浏览器回归，未验证官方平台登录、真实广告或真机安全区。原生线上恢复保留使用存档契约定向验证；公开排位代码及结算协议没有调整。
