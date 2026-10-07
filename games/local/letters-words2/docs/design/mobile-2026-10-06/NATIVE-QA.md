# 词屿原生移动端核验 · 2026-10-06

本轮将原生入口从仅好友赛扩展为完整单机词岛与好友赛。微信、B站、抖音、快手制品均为 Canvas 2D；主页、主题词岛、自由拾词、每日词岛、学习入口、教材选择、自定义词单、游玩、暂停、结算、帮助与同题分享均可在原生入口使用。页面参照同目录效果图，首页与结算复用效果图中的透明小岛美术。

## 布局与交互

- 原生工程保持 `portrait`。Canvas 按 SDK 的 DPR、安全区与胶囊底界适配；截图中的顶部留白对应这些宿主区域。
- 手机竖屏保留至少 44 个逻辑像素的字母与操作区域。长棋盘独立上下滑动，长答案左右滑动；半截字母牌先完整滑入视口再拾取，防止小触区误选。
- 844 × 390 窗口使用左棋盘、右词义与答案的布局。旋转仅改变布局，保留选牌与进度。
- TouchStart、Move、End、Cancel 区分点选与滑动；多指、取消、窗口尺寸改变、前后台切换与页面切换清理未完成手势。
- 游玩采用完全露出的牌直接点选、满格自动检查、错误即时反馈；按钮提供按下深度，音效可在设置中开关，宿主支持时提供轻触反馈，没有新增独立震动设置。提示会把下一张金框牌滚入视口。
- 学习入口的教材、词单卡与效果稿使用相同书本和词单线图标。原生设置页采用效果稿的标题与音效卡；省略 H5 全屏卡，因为原生由宿主全屏承载。
- 首页进入设置后返回首页，暂停进入设置后返回暂停；继续拾词保留原选牌和棋盘。
- 暂停页底部使用两个 44 像素轻入口「拾词指南」与「设置」；帮助返回暂停，未完成的拼写保留。

## 功能与存档

复用 `engine.js`、固定主题与教材数据；`native-session.js` 保持既有 `ciyu-progress`、`ciyu-daily-v1`、`ciyu-mini-v1`、`ciyu-active-*`、`ciyu-word-list` 与 `ciyu-sound` 存档格式。普通、每日与三词小岛互相隔离，选牌与原棋盘可恢复，同题重玩使用同一初盘；教材继续、尾批、提示及易错词复习保留。

教材 JSON 随原生包发布，只在选择教材时读取所需词库，使用同一词条校验和分批规则；单机运行无需网络与平台登录。自定义词单使用 SDK 的多行键盘，也支持可用的剪贴板；可选能力失败保留可继续的玩法。进入好友赛时把 Canvas 与宿主分享交给原公共赛制，退出后返回主页并保留单机棋盘。

## 已执行验证

| 核验 | 结果与实际覆盖 |
| --- | --- |
| `node tests/native-session.test.mjs` | 真实规则三岛通关、精确重玩与轮转、每日固定种子、三存档隔离、选牌恢复、暂停计时、标点及长词、教材 6 + 1 尾批与复习、损坏存档及禁存储降级通过。 |
| `node tests/native-platform.test.mjs` | UTC+8 日期、无效邀请、公开分享字段、真实教材读取与缓存、同步 SDK 文件能力、失败可重试通过。 |
| `node tests/native.test.mjs` | 真实 SDK 触点与滑动完成三岛和 60 字母自定义词；取消、多指、Hide / Show、DPR、安全区、旋转、PK 存档、分享、键盘和迟到回调、完整资源解绑通过。 |
| `node tests/native.browser.test.mjs` | Chromium 实际 Canvas，320 × 568、390 × 844、430 × 932 竖屏与 844 × 390 横屏，使用真实触屏事件走通各页和核心流程，保留实际截图。 |
| `node tests/native-navigation.test.mjs` | 320 / 390 / 430 的首页设置、暂停设置与暂停帮助返回链、44 像素入口、音效保存、暂停计时与原选牌保持通过。 |
| `node ../../../scripts/competition-build.mjs --native --game=letters-words2` | 四平台实际制品构建通过，每份约 2.6 MB，包括教材、小岛美术与音效。 |
| `node tests/native-bundle.test.mjs` | 四平台实际 CJS 文件在移除 DOM、fetch、Intl、URL 等浏览器能力的 VM 中运行；真实触点完成小岛、每日与带标点长词，读取 dist 中的真实教材、禁存储与生命周期通过；单机网络请求为 0。 |
| `node ../../../scripts/competition-native-smoke.mjs --game=letters-words2` | 四平台实际制品的好友赛选牌、服务端规则、分享、后台、存储、旋转与解绑通过。 |

上表的游戏内命令从 `games/local/letters-words2` 执行，构建和公共 smoke 命令使用列出的仓库相对路径。

## 实际画面证据与验收边界

实际截图在 [implemented/](./implemented/)，以 `native-` 开头。可对照 [native-home-390.png](./implemented/native-home-390.png)、[native-play-390.png](./implemented/native-play-390.png)、[native-play-844.png](./implemented/native-play-844.png)、[native-learn-390.png](./implemented/native-learn-390.png) 和 [native-settings-390.png](./implemented/native-settings-390.png)。浏览器截图按 DPR 2 保存，文件像素为逻辑视口的两倍。

以上包括实际 Canvas、SDK 事件契约与原生产物 VM 核验，未将这些结果称为官方 SDK 或手机真机验收。现有配置中的各平台正式 AppID 与好友服务平台登录仍需项目方配置；官方开发工具、实际机型、分享回流与平台登录发布验收未在本环境完成。

独立 H5 与 Shell/iframe 的记录见 [H5-QA.md](./H5-QA.md)。
