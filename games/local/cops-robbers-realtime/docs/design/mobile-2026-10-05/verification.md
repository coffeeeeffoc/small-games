# 验证记录

2026-10-05，先完成两张页面效果图与六位角色素材，再实现 H5 移动端页面。截图与 [触屏测试报告](implemented/report.json) 一同保留，便于对照设计和实际界面。

## 实际界面

| 页面     | 竖屏                                                                                                                          | 横屏                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 首页     | [390×844](implemented/home-390.png)、[320×740](implemented/home-320.png)                                                      | [844×390](implemented/home-844.png)  |
| 出发准备 | [390×844](implemented/setup-390.png)                                                                                          | [844×390](implemented/setup-844.png) |
| 实时围捕 | [390×844](implemented/game-390.png)                                                                                           | [844×390](implemented/game-844.png)  |
| 角色装扮 | [六位角色与上传入口](implemented/avatars-390.png)                                                                             | —                                    |
| 榜单     | [单人通关榜](implemented/records-390.png)、[好友积分榜](implemented/friend-board-390.png)                                     | —                                    |
| 好友 PK  | [房间](implemented/friend-room-390.png)、[警察实战](implemented/friend-play-0.png)、[小偷实战](implemented/friend-play-1.png) | —                                    |

## 执行结果

以下根目录命令在仓库根执行；游戏命令在 `games/local/cops-robbers-realtime` 执行。浏览器使用 `/usr/bin/chromium`，设定 `BROWSER_EXECUTABLE_PATH`；移动端脚本另设 `GAME_URL=http://127.0.0.1:43705`。该服务使用实际 runtime API 路由、store、实时规则和持久化 PGlite，提供最终 H5 构建及 `competition.js`。

| 范围           | 命令                                                                                                                           | 结果                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 引擎单元测试   | 游戏目录 `pnpm test`                                                                                                           | 35 项通过                                                               |
| 关卡可完成性   | 游戏目录 `pnpm test:levels`                                                                                                    | 100 关可胜、100 关放置失败、198 项单警不足检查通过                      |
| 页面与真实触屏 | 游戏目录 `pnpm test:browser`                                                                                                   | 320×740、390×844、844×390 全部通过；无运行时错误                        |
| 单人服务端记录 | 根目录 `node scripts/street-runs.integration.mjs`                                                                              | HTTP 重放、鉴权、非法输入、幂等与榜单隔离通过                           |
| 原生兼容       | 根目录 `node scripts/competition-build.mjs --native --game=cops-robbers-realtime`，然后 `node scripts/street-native-smoke.mjs` | 微信、B站、抖音、快手四份构建的场内点击、重放存档、暂停及监听器清理通过 |
| 共享好友模块   | 根目录 `node scripts/test-competition-dialogs.mjs`                                                                             | 五个游戏的桌面与触屏检查通过                                            |
| 游戏配置       | 根目录 `pnpm check:games`                                                                                                      | 53 个游戏，0 个问题                                                     |
| 开发者模式     | 根目录 `pnpm check:dev-mode`、`pnpm test:dev-mode`                                                                             | 53 个游戏一致；5 项测试通过                                             |
| 头像同步       | 根目录 `node scripts/sync-role-appearance.mjs --check`                                                                         | 通过；实时游戏保留独立角色图库                                          |
| 格式           | 根目录 `pnpm format:check`、`git diff --check`                                                                                 | 通过                                                                    |

页面测试实际操作六位头像、系统上传入口、图片保存与重开、暂停及恢复、短场触屏胜利、服务端重放与成绩重新读取。检查整页导航、无水平溢出、手势取消，以及头像关闭、暂停继续、历史已结束游戏和切换模式后浏览器返回的回归场景。

好友 PK 使用两个独立浏览器身份，验证昵称持久化、创建与加入、玩法和先手选择、双方阵营交换、邀请、准备、双方实际地图指令及服务端接受的原世界坐标、退出和积分榜。延迟真实创建房间响应时，退出后旧房间会在服务端放弃；立即重新进入并创建新房间后，旧响应不会覆盖新页面、房间或存储。

最终在游戏目录执行 `BACK_ONLY=1 node scripts/mobile-pages-playtest.mjs`，[返回回归报告](implemented/navigation-report.json) 无运行时错误。等待房间顶栏返回和实战浏览器返回完成实际 `/leave` 200，服务端状态成为 `abandoned`，本机房间码清空。从单人纪录直接进入好友积分榜后，返回恢复原纪录页。该回归也保留在默认完整触屏脚本内。

独立页面与 iframe 分别验证开发者模式默认关闭、URL 开启、本地存储开启、URL 显式关闭；iframe 内实际触屏下令与取消通过。

本次完成的是浏览器触屏模拟与本地实际服务验证，尚未验证物理手机、线上数据库和小游戏平台的登录与分享。H5 使用本次完整移动端界面；原生小游戏继续使用原有入口和无 DOM / Path2D 的矢量角色回退。
