# 苔光花园 · 关卡入口与移动端界面

本次沿用奶油纸色、苔绿植物和金色光种的原创视觉，以竖屏小游戏的关卡循环为重点。先生成手机比例效果图，再实现界面，最后保存实际生产画面与触屏验证记录。

先行效果图：[concept.svg](./concept.svg)，[PNG 预览](./concept.png)。按仓库 `game-ui-ux` 技能检查页面流转、缩放和有效触区，沿用现有 Canvas 与 Game Host 架构。

## 页面与主操作

- 主页：保留植物棋盘插画；主按钮明确显示「开始第 N 关」或「继续第 N 关」，下方提供「关卡选择」和已通关数量。
- 关卡选择：五章共 30 关，左右切换章节，每章采用 `3 × 2` 大关卡按钮。通过数字、勾选、锁图标及「当前」标识区分当前、已通关、可挑战和未解锁状态；底部可继续当前进度。重玩已通关关卡时，已解锁的下一关仍显示「可挑战」。普通玩家仍按逐关解锁。
- 游玩：顶栏显示「第 N 关」和关卡名称；保留主要棋盘和底部触屏工具，暂停入口进入独立页面。
- 暂停：继续、重试和关卡选择可直接触达，返回选关不丢失当前棋盘和计时。
- 结算：关卡数字徽章与「第 N 关 · 已通关」标题直接说明完成的是哪一关；显示关卡名称、用时、提示和调整次数。主要按钮明确「挑战第 N+1 关」，下方为「再玩本关」和「关卡选择」，并保留返回主页。最后一关显示全部通关及选关入口。

## 视觉与屏幕

- 采用 `390 × 844` 竖屏参考，核心按钮置于屏幕中下部；底部预留安全区。
- 标题保留少量植物主题的衬线字，关卡编号、状态、工具和按钮采用清晰的无衬线字。
- 卡片使用柔和绿底、深绿边框和轻微底部阴影；主按钮使用金色光种与箭头增强游戏反馈。
- 主操作与选关入口提供至少 56 个逻辑像素热区，关卡按钮采用 96 个逻辑像素；紧凑小屏也检查有效 CSS 热区不小于 44 像素。
- 独立、Shell 内置及 iframe 运行复用同一 Canvas 页面和规则；开发试玩继续与玩家解锁进度隔离，兼容现有版本 1 存档。

## 验收

验证主页、关卡选择、游玩、暂停、结果与返回；验证通关和下一关的编号、已通关重玩、锁定关卡不能进入、暂停后选关继续、刷新存档恢复以及最后一关的结算入口。使用 Chromium 的手机尺寸和触屏输入完成生产构建回归，实际截图与记录保存在此目录；浏览器模拟不能替代手机真机或渠道验收。

## 实际验证

Node `24.21.0` / pnpm `12.6.0`；Linux 无头 Chromium `151.0.7922.173`，触屏输入，手机 `390 × 844`、小屏 `320 × 568`、横屏视口 `844 × 390`、桌面 `1280 × 900`。17 项规则/存档检查、生产构建、14 组普通流程及 7 组邀请/分享/广告检查通过，未捕获页面错误和资源失败。生产 iframe 的同源沙箱验证宿主覆盖新增触屏导航和续玩恢复，真实 Shell 兼容仍由准确候选的既有入口门禁验证。

| 页面 / 状态          | 实际生产截图                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| 主页                 | [actual-home.png](./actual/actual-home.png)                                   |
| 初始选关             | [actual-levels.png](./actual/actual-levels.png)                               |
| 已通关与当前关       | [actual-levels-progress.png](./actual/actual-levels-progress.png)             |
| 重玩时已解锁的下一关 | [actual-levels-replay.png](./actual/actual-levels-replay.png)                 |
| 未解锁章节           | [actual-levels-locked-chapter.png](./actual/actual-levels-locked-chapter.png) |
| 小屏选关             | [actual-levels-small-320x568.png](./actual/actual-levels-small-320x568.png)   |
| 游玩                 | [actual-play.png](./actual/actual-play.png)                                   |
| 暂停                 | [actual-pause.png](./actual/actual-pause.png)                                 |
| 普通通关             | [actual-result.png](./actual/actual-result.png)                               |
| 全部通关             | [actual-result-final.png](./actual/actual-result-final.png)                   |
| iframe 返回与续玩    | [actual-iframe-390x844.png](./actual/actual-iframe-390x844.png)               |
| 邀请挑战的小屏结算   | [actual-result-320x568.png](./actual/actual-result-320x568.png)               |

实际画面与先行效果图对照：植物主题、关卡数字徽章、按章浏览的大关卡按钮、金色当前描边、圆角操作和结算双列按钮一致。主页保留原创完整插画；游玩保留原规则与棋盘，只调整关卡信息和工具字体。邀请结算使用「第 N 关 · 挑战完成」，避免把邀请试玩当作普通闯关进度；正常继续按钮始终从普通存档派生。

保留邀请分享和自然间歇逻辑：结算进入选关遵守原有广告频控，关闭后只切换一次；暂停选关不会触发广告。普通进度、开发试玩和邀请挑战隔离。

执行命令：

```sh
pnpm exec turbo run build --filter=@coffeeeeffoc/game-moss-garden
pnpm --filter @coffeeeeffoc/game-moss-garden test
pnpm --filter @coffeeeeffoc/game-moss-garden test:browser
```

机器可读记录为 [browser-report.json](./actual/browser-report.json) 和 [publishing-browser.json](./actual/publishing-browser.json)。最终提交后按仓库规定对准确 base/head 执行增量候选验证，保留正常 hooks 并推送 `dev`。
