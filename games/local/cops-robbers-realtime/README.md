# 街区追捕

固定警察和小偷设定，横屏、场景内直接操作的追捕游戏。[首页设计及效果图](docs/design/2026-10-05-home.md)先于代码实现。

首页提供开始游戏、好友 PK、全站榜、角色头像和玩法说明。选关页设置模式、角色、先手和指挥规则，并显示本人最佳与同配置的服务器最快。游玩页只保留场景、时间、抓获数、返回、暂停及 Web 全屏。

点场内角色选中，再点道路设置目的地；再次点击正在移动的已选角色可以停下。Web 也支持拖动，拖回起点、触摸取消或丢失捕获不会提交旧目标。小游戏使用相同的点击指挥方式，没有外置小队按钮。至少两名警察封住小偷全部退路并维持合围才算抓获。

玩法包括各 100 关的街区挑战、自由追逐、出口竞速，以及 3 关短场练习。挑战模式的参考解针对固定电脑策略；自由玩法不宣称理论平衡。轮换指挥要求连续有效移动命令使用不同角色，不改变普通指挥成绩。

警察、小偷头像在首页统一配置并在单机和好友赛中共用。Web 支持预设及本机图片；原生包提供预设头像。自定义图片仅保存在设备上，不进入房间或成绩请求。

Web 在竖屏视口旋转内容并逆变换触点，即使系统关闭自动旋转也能横向显示；原生小游戏包配置 landscape。Web 提供全屏按钮，原生入口不提供。切后台暂停单机并要求明确继续；实时好友赛仍按服务器时间推进。

## 最佳用时

本机纪录继续兼容旧存档；新纪录按版本、模式、角色、关卡、指挥规则、实际先手分开。服务器接收固定 60 Hz 的操作序列，重放确认胜利并自行计算时间，不接受客户端声明的分数。通过现有 PostgreSQL competition_results 和 competition_best 保存，无新增数据库迁移。

接口为 GET/POST /api/competition/v1/runs/cops-robbers-realtime，沿用现有登录会话。H5 发布配置和小游戏构建的 API 地址必须指向部署了此版本 runtime-api 的服务。服务器不可用时保留个人成绩并显示真实错误，结算页可重试上传；不会用本地成绩替代全站纪录。

## 开发与验证

游戏目录执行 pnpm dev、pnpm test、pnpm test:levels 和 pnpm build。

仓库根目录执行：

- node scripts/competition-build.mjs --game=cops-robbers-realtime
- node scripts/competition-build.mjs --native --game=cops-robbers-realtime
- node scripts/street-native-smoke.mjs
- node scripts/street-runs.integration.mjs

构建配置应提供实际可访问的 API 地址。游戏目录执行 pnpm test:browser，GAME_URL 指向带 competition.js 的构建和可用测试服务。

home-playtest.mjs 是新版浏览器验收入口，覆盖首页、选关、四种视口、场内触摸通关、成绩上传/查询、本地持久化、头像、暂停、取消、全屏及真实原生 bundle 的 SDK 模拟。旧版浏览器脚本保留作历史参考，其侧栏/小队 DOM 断言不适用于新版。

street-native-smoke.mjs 执行微信、B站、抖音、快手的实际构建，验证场内点击通关、服务端重放、存档、后台暂停和监听器清理。street-runs.integration.mjs 验证真实 HTTP 成绩读写、鉴权、非法输入、重试幂等和榜单隔离，也接入共享 competition 集成测试。

本次本地 HTTP 验证使用实际路由、store 和持久化 PGlite PostgreSQL；浏览器使用 Chrome 触屏模拟。它们不等同于线上 PostgreSQL、手机真机、小游戏平台登录/分享验收。
