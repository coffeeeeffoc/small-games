# 象五子棋 H5 / Cocos 交互对齐

2026-10-19。复用现有 H5 山间棋亭主题，不修改 H5 画面或核心棋规。

## 实施前依据

- [最新 H5 首页](../../../../../../games/submodules/xiangqi-five/docs/design/home-polish-2026-10-18/home-mobile.png)与[实际棋盘](../../../../../../games/submodules/xiangqi-five/docs/design/home-polish-2026-10-18/play-mobile.png)。
- [H5 山间棋亭设计](../../../../../../games/submodules/xiangqi-five/docs/design/mountain-pavilion.md)与[现有原生方案](../PLAN.md)。
- [本轮四屏概念](concept.png)：主页、准备、棋盘、重开确认；这是实施前的 HTML 概念图，不是原生运行截图。[可复现 HTML](concept.html)。

使用原 H5 的 `pavilion-background.png`、`five-piece-logo.webp`，米纸、朱红、青绿和木色。Cocos 通过可选 `visualAssets` 显式登记素材；没有映射或图片能力时保留可玩纯色界面，不向旧渠道包请求缺失资源。

## 页面与状态

主页突出开始/继续，提供战术练习、玩法说明与设置。开始后选择单人/同屏，再在准备页选择棋盘和难度。准备阶段只改草稿；继续同一局只提交难度，改变玩法或棋盘须确认重开，取消完整保留旧棋局与存档。

练习使用独立状态，首次进入保存普通棋局、对手、难度、棋盘与拖动位置；退出练习恢复原上下文。成功后下一题，失败重试；电脑认输明确说明原因，不伪称连五。

棋盘继续使用 44 逻辑像素棋格与拖动，不改为缩小整盘。保留安全区、触摸取消、多指取消、后台暂停、异步 AI 和奖励请求取消语义。菜单按钮至少 44 px，窄屏或横屏页面可滚动。

## 验证边界

Linux、Node 24.21.0、Chromium 触屏仿真。实际 [主页](actual-home-390.png)、[含棋子对局](actual-play-390.png)、[电脑准备](actual-setup-computer-390.png) 已逐图对照概念与 H5 参考：小 logo 不拉伸、标题居中、主操作在底部、战术/说明并排；原生棋盘保留 44 px 格与拖动。

本轮执行：

- 子仓 `pnpm test`：52 项通过，包含真实构建、有/无服务标记、旧产物清理、输出符号链接保护和原有规则/电脑/存档/房间/奖励。
- `node --test --test-concurrency=1 platforms/taptap/tests/rewarded-ads.test.mjs platforms/competition/xiangqi-five/tests/native.test.mjs games/minigames/tests/build.test.mjs`：34 项通过。覆盖原局/待落棋子/难度/视口恢复、草稿与取消重开、下一题、认输文案、可选素材和源码身份。
- `NATIVE_SCREENSHOT_ROOT=<本轮输出> node platforms/competition/xiangqi-five/tests/browser.mjs`：320×568、390×844、430×932、844×390 实际 Canvas 触屏通过。包括准备/取消重开、棋盘拖动、前后台、提示与悔棋的模拟 SDK 流程。
- 子仓 `node build.js --with-service` 后运行 `pavilion-check.mjs`：22 组检查、110 张截图通过；通过 `XIANGQI_ARTIFACT_DIR` 写入本轮输出，没有覆盖 H5 历史证据。
- 旧 competition 的微信/B站/抖音/快手单机包、nine-games 微信包、TapTap 预览 CJS 包完成真实构建后通过各自 smoke。新版可选图片映射仅由 Cocos 登记；旧包不请求缺失图片。

Tap wrapper 以 45 秒限制打开阶段，show Promise 成功通知游戏移除 46 秒兜底；模拟时钟推进 10 分钟仍等待关闭。只有 `isEnded === true` 发放奖励。预加载复用、同步错误回放、重复 Hide、迟到通知、取消和销毁失败占用均有回归。本轮没有配置广告位或验证真实库存。

完整本地日志/多尺寸图片位于父仓库 `outputs/cleanup-2026-10-19/xiangqi/`。以上为工作区检查；发布前由父仓库记录准确候选版本。Node / Chromium Canvas 检查不能替代 Creator 3.8.8 构建、平台开发者工具、真实 Tap 广告或真机验收。
