# 本轮验证

环境：Node 24.21.0、Chromium 触屏模拟（320×568、360×640、390×844），不是实体手机验收。

已通过：

- `pnpm --filter ciyu-word-tiles build` 与 `check`。
- `pnpm --filter ciyu-word-tiles test`：320 局完整拼词、教材 42 册/26 册复核内容、比赛规则、每日/三词同题、原生会话/平台/Canvas/导航；新增个人连对规则校验，旧档/坏档有界降级。
- `GAME_URL=http://127.0.0.1:4375/ pnpm --filter ciyu-word-tiles test:challenge:browser`：每日同题、原局存档隔离、六词通关、精确重玩、提示/重排计数、分享去敏和取消。
- `GAME_URL=http://127.0.0.1:4375/ pnpm --filter ciyu-word-tiles test:mobile:browser`：320/360/390 页面导航、44 px 热区、取消、存档恢复、旋转、79 字符棋盘滚动、存储禁用与延迟结算暂停。
- `node games/local/letters-words2/tests/word-flow.browser.mjs`（仓库根，生产构建）：真实触屏连对 2 词反馈；提示及刷新不补成独立连对；自由/每日/三词分别恢复自己的成绩；三词完成显示最佳连续 3 词；重玩归零；320 宽返回主页。

[主页](actual/home.png)、[连对游玩](actual/flow-playing.png)、[暂停](actual/pause.png)、[结算](actual/result.png)、[320 宽返回](actual/return-small.png)。对照局部方案，连对反馈占用原有状态区，不增加挡住棋盘的浮层。

本轮连对属于 H5/Shell 单人反馈，不修改既有原生竞技排行榜或比赛服务器协议；新增能力不作为真实渠道真机验收。
