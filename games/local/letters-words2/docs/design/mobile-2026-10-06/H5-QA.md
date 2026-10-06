# 词屿移动端 H5 核验

2026-10-06 在 Debian 13 / Chromium **151.0.7922.173** 完成浏览器核验。使用 Playwright 的真实 `tap`、CDP 触摸取消及滑动输入，按手机尺寸运行实际界面；这是桌面浏览器触摸模拟，不是手机真机。原生适配与 SDK 验证范围见 [NATIVE-QA.md](NATIVE-QA.md)，机器可读结果见 [qa.json](qa.json)。

## 通过的回归

| 检查 | 结果与范围 |
| --- | --- |
| `tests/browser.test.mjs` | 1280×960、390×844、320×740、305×740：遮挡牌真实露出边角点击、错误拼写、撤回/清空/换词、重复字母和符号、导入校验、完整通关及重玩、刷新恢复、长词义、原大小写、复习；全屏进入/退出/旋转及不支持/拒绝降级。 |
| `tests/focus.browser.test.mjs` | 320×568、360×640、390×844：棋盘、答案和工具可达，字母热区至少 44 CSS px；完整释义和暂停不丢选择。 |
| `tests/challenge.browser.test.mjs` | 两个独立浏览器具有相同每日初始牌局；六词清空、同题重玩、提示/重排统计、每日与普通存档隔离、邀请参数清理、复制降级和系统分享取消。 |
| `tests/mini.browser.test.mjs` | 320×568 三个主题真实触控通关，主题选择、三份收获、相同棋盘重玩及下一岛；普通/每日/三词存档隔离，部分拼写刷新、邀请参数校验、分享取消及异步过期保护。最终主操作为下一座三词小岛，同题重玩为次操作。 |
| `tests/library.browser.test.mjs` | 全部 42 册教材选项；真实触控完成新版 Welcome 的 31 词、6 批含单词尾批；刷新续练、教材原大小写、提示词复习、同册缓存断网练习。 |
| `tests/mobile.browser.test.mjs` | 320×568、360×640、390×844：首页/主题/学习/教材/设置/游玩/暂停/结果往返，44 px 控件、触摸取消、状态保存、844×390 横屏、79 字符长词独立滚动、暂停时延迟结算不抢页面、存储禁用仍可本地游玩。 |
| 根目录 `scripts/letters-words2-iframe.browser.mjs` | 320×568、390×844 最小宿主；使用真实 Shell 样式和 `exerciseStandalone` 入口适配，复用实际 iframe `allow="autoplay; fullscreen"` / `allowfullscreen`，未额外设置 sandbox。子页顶部返回可点、宿主导航随页面隐藏/恢复，完整宿主全屏及退出保持未完成拼写。此项与完整 Shell 检查分开记录。 |
| `tests/shell.browser.test.mjs` | 对实际 `apps/shell-web/dist` 在 320×568、390×844 触控核验：首页帮助/设置顶部返回未被目录按钮遮挡；真实打包的好友入口打开 PK 大厅、隐藏外层导航、顶部返回恢复目录入口；游玩/暂停/继续/首页保留选择，回目录移除 iframe。未创建房间或模拟消息补齐入口。 |
| Shell integration | `standalone-immersive`、`standalone`、`play-entry`、`game-sharing` 四文件 **71 测试通过**；入口适配 `node:test` **3 测试通过**。合并 dev 的象五子棋沉浸界面后复跑，保留其分享及导航样式和词屿导航行为，来源窗口、origin、游戏 ID 和严格三字段消息校验保持有效。 |
| 好友赛界面 | 独立负责者从仓库根运行 `node scripts/letters-words2-competition-mobile.browser.mjs`：320×568 / 844×390 完成一词，390×844 完成全部 18 词；房间准备、公开邀请、44 px Canvas 分页、取消/拖动/多触点、词义页和回首页通过，记录见 [competition-mobile-report.json](evidence/competition-mobile-report.json)。该测试身份与网络使用 fixture。 |

主要玩法、教材和页面流程从可见入口完成，没有强点隐藏 DOM。通用浏览器用例保留原有规则与存档断言，按新首页/学习/暂停路径调整导航。独立竞态与跨端存档测试使用明确的存档 fixture，其中末词暂停检查预置已完成一词的有效存档，再真实点击最后一词与暂停按钮。

## 发现并修复的界面问题

- 320×568 首页主题与学习入口超出首屏：压缩短屏标题、插画及卡片间距，两个入口均可首屏点击。
- 字母牌沿用按钮按下位移后，露出边角的触点在松手时落到牌外：字母按下改为亮度与阴影反馈，保持热区位置。
- 844×390 横屏的最低 520 px 页面把答案和工具推到视口外：改为棋盘左侧、词义/答案/工具右侧两列，保持 44 px 热区。
- Shell 首页目录按钮遮住设置和 PK 子页的顶部返回：宿主状态覆盖打开的子页和好友赛，只有真正首页显示目录入口。真实构建 Shell 已回归顶部返回按钮。

## 实际画面对照

效果图见 [README.md](README.md) 与 [contact-sheet.png](contact-sheet.png)。以下图片来自运行界面，按真实词表和状态绘制；生成过程等待字体和绘制帧，不使用概念图替代运行截图。

| 页面 | 390×844 实际画面 |
| --- | --- |
| 首页 / 主题 | [首页](implemented/h5-home-390x844.png) · [主题词岛](implemented/h5-islands-390x844.png) |
| 学习 / 教材 / 自定义 | [学习入口](implemented/h5-learning-390x844.png) · [教材](implemented/h5-book-390x844.png) · [我的词单](implemented/h5-custom-390x844.png) |
| 游玩 / 暂停 / 结算 | [游玩](implemented/h5-play-390x844.png) · [暂停](implemented/h5-pause-390x844.png) · [收获](implemented/h5-result-390x844.png) |
| 设置 / 帮助 / 分享 | [设置](implemented/h5-settings-390x844.png) · [帮助](implemented/h5-help-390x844.png) · [分享](implemented/h5-share-390x844.png) |
| 小屏 / 横屏 / 长词 | [320×568 首页](implemented/h5-home-320x568.png) · [320×568 游玩](implemented/h5-play-320x568.png) · [844×390 游玩](implemented/h5-play-844x390.png) · [79 字符长词](implemented/h5-long-word-390x844.png) |
| 真实构建 Shell | [320×568 游玩](implemented/h5-shell-play-320x568.png) · [320×568 首页](implemented/h5-shell-home-320x568.png) · [好友入口](implemented/h5-shell-friend-390x844.png) |

主色、圆角、厚底按钮、岛屿插画和页面层级沿用效果稿；真实词长决定答案格换行与棋盘内容高度。长棋盘独立滚动，上下控制保持可见。暂停按钮目视为两根分离且等高的实心竖条，有明确“暂停”无障碍名称。

## 复跑与边界

独立入口使用 `GAME_URL=http://127.0.0.1:4175`。脚本接受 `PLAYWRIGHT_MODULE`、`PLAYWRIGHT_EXECUTABLE`；本轮使用 `/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs` 与 `/usr/bin/chromium`。在游戏目录执行对应 `node tests/*.mjs`。`tests/capture-mobile.mjs` 可重新保存上述十一页 390×844 运行截图。

最小 iframe 回归位于仓库根目录 `scripts/letters-words2-iframe.browser.mjs`，在根目录执行 `node scripts/letters-words2-iframe.browser.mjs`，或在游戏目录执行 `npm run test:iframe:browser`。

真实 Shell 检查需要先生成 `apps/shell-web/dist`，静态服务后设置 `SHELL_URL` 执行 `tests/shell.browser.test.mjs`。本轮使用 `http://127.0.0.1:4196/`，词屿文件通过成功的 `prepare-standalone-games` 更新，核对服务中 `app.js` 与当前源码字节一致。

浏览器全屏不支持和拒绝为模拟能力分支。好友赛完整玩法检查的网络/身份是 fixture，真实构建 Shell 仅验证大厅打开与返回，不将其称为真实双人联机。手机真机、宿主开发工具、原生发布和设备安全区验收仍按 [NATIVE-QA.md](NATIVE-QA.md) 的边界记录。
