# 三块选两块浏览器验证记录

日期：2026-10-07。结果：**16 项通过，19 张实际截图，未捕获到未处理的页面异常**。机器可读完整结果见 [actual/verification.json](actual/verification.json)，可重复执行的流程见 [../../tests/browser.mjs](../../tests/browser.mjs)。

## 环境与方法

本次运行先执行 `node build.mjs`，再以 `node server.mjs --dist --host 127.0.0.1 --port 4423` 承载生产产物。浏览器为 Playwright 驱动的 `/usr/bin/chromium`（151.0.7922.173），无头模式、device scale factor 1、移动视口与触屏支持。验证了 390 × 844、360 × 640、320 × 568，以及 844 × 390 的方向变化。

点击使用浏览器触屏输入；积木拖动、取消和多触点使用 Chrome DevTools Protocol 的 `Input.dispatchTouchEvent`，不是脚本调用落子方法。测试只读读取实际状态快照，并用关卡配置的已验证解法确定落点；关卡胜负、解锁、存档与撤销均由真实界面操作产生。广告重启恢复是单独标明的确认 receipt 存档 fixture，原始失败状态来自真实四次触屏落子，记录 `realAd:false`。

复现命令：在游戏目录执行 `node build.mjs && node tests/browser.mjs`；或在仓库根执行 `pnpm --filter @coffeeeeffoc/three-choose-two test:browser`。

## 已通过流程

| 验证 | 实际结果 |
| --- | --- |
| 首页、选关、准备 | 正常进入；30 个配置关卡可见，未来关卡锁定；首关可开始 |
| 首关即时胜利 | 将候选单格拖至 (3,4)，立即消除 1 行、得 100 分、获得 3 星；只发生 1 次落子，没有补算舍弃 |
| 合法/非法预览 | 合法轮廓按棋盘真实格距显示，满行预览可见；非法轮廓虚线与叉号可识别 |
| 非法与取消 | 重叠落点回弹，不落子；touchCancel 和取消的双触点不改变棋盘、落子数 |
| 动画输入锁 | 清除第一条线后立即尝试第二次触屏落子被忽略；第一步状态保留 |
| 三选二与撤销 | 第二次合法落子只丢弃一次；三个槽位置固定；跨组撤销恢复棋盘、候选、目标、组号、弃块统计，并消耗 1 次撤销；同操作重复后后续候选一致 |
| 暂停与重启 | 暂停/继续保持盘面；reload 后首页继续恢复棋盘、候选、组号、积分及计数；第二关真实通关后只解锁第三关 |
| 无尽练习 | 正常开始、触屏落子、主动结束；无成功落子撤销；成绩明确为本地练习；分享无页面异常 |
| 排行榜断连 | 显示真实未连接状态，没有虚构榜单玩家或名次 |
| 设置与全屏 | 音效设置独立切换且 reload 后保存；用户触屏进入/退出 H5 全屏；不重置已有进度 |
| 正常失败 | 四次不清线的合法触屏落子耗尽首关组数，实际进入失败；reload 后仍可继续到失败页使用撤销；可免费重开且固定初始棋盘一致 |
| 确认广告 receipt fixture | 模拟奖励确认后、状态保存前重启；恢复一次额外 2 组，原棋盘/落子数保留，界面组数正确显示“3 / 4”；重复同 receipt 并重启不重复奖励；这不是实际广告平台验证 |
| 小屏 | 360 × 640 棋盘 324 px，320 × 568 棋盘 268 px；完整棋盘、三个候选和必要触屏工具可见；均能真实拖动完成首关 |
| 方向变化 | 对局在 390 × 844 → 844 × 390 → 390 × 844 中保留棋盘，恢复竖屏后触屏映射正常并真实通关 |

## 效果图对照

首页已还原奶油纸感背景、深墨绿主色、积木插画、三选二徽标、主要操作与底部轻导航。选关还原五列卡片与三章层级，锁和星级传达状态。游戏保持最大的可用 8 × 8 棋盘、三个不重排槽位、轻量目标和底部工具，未铺满规则说明。暂停图标在实际运行截图中为两根分离的实心竖条。结算保留温暖积木主题、星级、核心统计与下一关操作。

与先行图稿的合理差异：首次新玩家显示第 1 关及 0 纪录，先行主页示例显示第 4 关；实际棋盘使用规则配置的合法首关盘面，示例图为第四关视觉场景；实际棋盘根据内容和视口由 352 px 基准扩展至 354 px 或在短屏缩至 268 px。结算积木庆祝插画延续主页元素，星级另列，层级与主要操作保持。

关键截图：

| 页面/状态 | 实际截图 |
| --- | --- |
| 首页 | [home-390x844.png](actual/home-390x844.png) |
| 选关 | [levels-390x844.png](actual/levels-390x844.png) |
| 准备 | [brief-390x844.png](actual/brief-390x844.png) |
| 游戏 | [game-390x844.png](actual/game-390x844.png) |
| 合法预览 | [game-valid-preview-390x844.png](actual/game-valid-preview-390x844.png) |
| 非法预览 | [game-invalid-preview-390x844.png](actual/game-invalid-preview-390x844.png) |
| 第一次落子后 | [game-after-first-390x844.png](actual/game-after-first-390x844.png) |
| 暂停 | [pause-390x844.png](actual/pause-390x844.png) |
| 成功结算 | [result-win-390x844.png](actual/result-win-390x844.png) |
| 失败结算 | [result-failure-390x844.png](actual/result-failure-390x844.png) |
| 无尽结算 | [practice-result-390x844.png](actual/practice-result-390x844.png) |
| 排行榜断连 | [ranking-offline-390x844.png](actual/ranking-offline-390x844.png) |
| 设置 | [settings-390x844.png](actual/settings-390x844.png) |
| 320 × 568 游戏 | [game-320x568.png](actual/game-320x568.png) |
| 确认奖励重启 fixture | [confirmed-reward-fixture-restored-390x844.png](actual/confirmed-reward-fixture-restored-390x844.png) |

## 实际范围

这是桌面 Chromium 的移动触屏模拟，不是真机、微信或 B 站平台验收。方向变化用来检查竖屏游戏不会丢失对局，未将横屏可滚动页面称为横屏完整触屏专项验证。在线真实服务端会话/重放/排名、Shell/iframe 接入、原生小游戏及其他仓库检查由各自交付验证记录覆盖；本记录只陈述独立 H5 的实际 UI 流程。正式广告展示与平台奖励回调仍须在已授权的平台能力接入后真机验收。
