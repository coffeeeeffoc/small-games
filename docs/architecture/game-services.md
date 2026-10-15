# 通用游戏服务入口

所有接口复用 Runtime API 的 `/api/competition/v1`、现有身份、来源限制、限流和 PostgreSQL。游戏只提交操作，不提交权威分数。纯玩法模块负责模拟；入口层按 `game` 注册表选择模块。

## 身份与排行榜

`GET /games/:game` 返回标题、规则版本、`capabilities`、`boards` 与 `identity`。独立的 `versions.ranked` / `versions.multiplayer` 用于双能力游戏的规则版本；房间客户端以房间响应的版本为准。身份包含 `kind`（`anonymous`、`guest`、`platform`）、`authenticated`、`provider`、`playerId`、`name`。仅经过平台官方登录交换的 `platform` 身份标为 `authenticated: true`；游客 token 不代表平台登录。它与 Shell 云存档身份相互独立。

未登录可读游戏信息与 `GET /games/:game/leaderboards/:board`；`me` 为 `null`。携带无效或过期 Bearer token 返回 401，不静默更换用户。写入使用已有 `/sessions/guest` 或 `/sessions/platform` 签发的 Bearer token，不能自报 `playerId`。平台密钥只在服务器配置。

每个榜定义 `id`、标题、说明、`guestAllowed`、`scoreUnit`、`secondaryUnit`。当前两款游戏的 `campaign` 和 `endless` 允许游客。将某个榜的 `guestAllowed` 设为 `false`，服务器就会拒绝游客创建该榜挑战。榜单按游戏、榜类型、规则版本隔离，响应含 `top`、`me`、`rank`、`score`、`secondary` 等信息。

| 游戏/榜             | score，越高越好                         | secondary，同分越小越好 |
| ------------------- | --------------------------------------- | ----------------------- |
| 两款游戏 campaign   | 最高验证通关关卡的目录序号（从 1 开始） | 该关模拟用时，毫秒      |
| cage-rescue endless | 单局累计救援人数                        | 单局模拟用时，毫秒      |
| tower-brake endless | 单局累计穿越层数                        | 单局模拟用时，毫秒      |

闯关榜不是累计星数或总通关时间，也不接受本地存档自报进度。完整失败的无尽局可入榜，未完成的闯关局不能入榜；零分不占榜位。同分且同用时并列，展示顺序由稳定玩家 ID 决定。

## 输入回放协议

1. `POST /games/:game/runs`：`{board, version, levelId?}`，返回 `{id,game,board,version,seed,stepHz:120,seq:0,status,expiresAt}`。无尽局必须采用返回的种子初始化相同核心。关卡 ID 来自游戏内容目录。
2. `POST /games/:game/runs/:id/actions`：`{seq,frames:[{ticks,input}]}`。`seq` 从 1 连续递增；每个 frame **先应用一次离散输入，再执行 ticks 次 1/120 秒模拟**。`ticks=0` 用于即时发球、转塔或刹车。暂停期间不录制 ticks。
3. `POST /games/:game/runs/:id/finish`：`{seq}`。仅当所有输入获确认后调用；重复结算返回同一回执。响应包含 `accepted`、`score`、`secondary` 与未接受原因。
4. `GET /games/:game/runs/:id`：查看所属 run 的确认序号和结算信息。服务重启保留断点和回执；当前游戏 UI 不提供跨页面继续录制。

笼子输入为 `{targetX?,launch?}`；转塔输入为 `{rotation?,brake?}`。禁止分数、复活、玩家 ID 等额外字段。前后端使用同一纯核心和固定步长；试验、开发模式、分享挑战及复活局由客户端隔离，服务端不提供复活操作。

单批最多 1200 frames / 2400 ticks，累计模拟时间不得超出服务器已经过时间加 2 秒容差。每个活跃批次续期 24 小时，没有总关数或总 ticks 上限。每次读取与写入都验证 token 主体和 URL 游戏；旧规则 run 的继续写入被拒绝。

持久化复用 `competition_matches`：`ranked-run:<uuid>` 保存带类型标记的断点；`ranked-action:<uuid>:<seq>` 保存小型 hash/回执。服务器锁定 run 行，原子保存输入回执、模拟状态和最终 `competition_results`/`competition_best`。相同 seq 和内容幂等，冲突内容拒绝；旧序号重试也保留原回执。一个 run 只写入创建时绑定的榜。

## 客户端接入

两游戏的 `competition.js` 只提供可选服务地址配置，再导入共享 `game-services.js`；不依赖旧房间客户端的登录闭包。该模块提供 `createGameServices({gameId,ruleVersion})` 和 `createRunRecorder(services,{onStatus})`。

Recorder 提供 `start({mode,levelId?,practice?})`、`record(input,ticks=1)`、`finish()`、`invalidate(reason)`。开局连接最多等待 1.5 秒，网络失败返回本地模式；迟到响应不能恢复已取消的局。输入按批次串行上传，已确认输入立即丢弃；未确认缓冲上限 4800 ticks / 2400 frames。已进入结算的至多两局允许在下一局开始后继续排空，界面状态仍按当前局隔离。关闭整个页面前未获服务器确认的成绩不保证送达。

Run 始终使用创建时的 credential 快照，401 不触发新游客冒充旧 run。当前页存储不可用时保留内存身份；可读存储里的账号变动影响新局与读榜，不改变旧 run 主体。新连接等待期间身份被清除或损坏，会取消该次连接；下一次明确开局读取最新身份或重新建立会话。共享客户端独立管理同一官方会话协议，不调用旧客户端缓存的登录闭包。并发入口共用一次登录请求；原生登录失败不会降级为游客。离线不伪装全站榜或本地模拟的在线名次。

客户端同时提供 `metadata()`、`createRoom({mode?,role?,initiative?})`、`joinRoom({code})`、`getRoom({code})` 和 `roomAction({code,operation,body?})`。操作白名单为 `ready/leave/rematch/actions/role/initiative`；已加入房间及续局邀请固定原身份，换号不会替换它的操作主体。

## 联机与扩展

现有 room 规则统一通过 `/games/:game/rooms` 创建、`/rooms/join` 加入，以及 `/rooms/:code` 查询和 `/ready`、`/leave`、`/rematch`、`/actions`、`/role`、`/initiative` 操作。每个操作均校验房间所属游戏。规则注册表中支持联机的游戏使用既有 room store 和模拟，默认榜 ID 为 `versus`；不支持联机的游戏返回 `MULTIPLAYER_UNAVAILABLE`。

旧 `/rooms`、`/boards/:game`、三块选两块的专用排位、克朗棋专用多座房间及卡丁车 WebSocket 路径保留兼容。本轮统一入口覆盖已登记的通用 room 规则和两款新增单机榜；专用服务后续可增加 adapter 接入，无须改动旧玩法模拟。

新增单机游戏：实现 `RankedRule` 的 `create/apply/result` 与 `boards`，由 `src/app.ts` 注册；复用已有游戏核心，补精确跨包依赖白名单、两套后端打包清单、纯规则与实际数据库回放测试。新榜只增加注册配置及评分策略，不增加 HTTP 路由。规则或计分不兼容时升级 `version`，旧榜数据保留且不混排。联机游戏只需登记已有 `Rule` adapter；特殊房间或 WebSocket 服务在网关层增加明确 adapter，不能让客户端指定任意上游。

## 部署与验证

启用 `COMPETITION_ENABLED=true`、`RUNTIME_DATABASE_URL`、`COMPETITION_ORIGINS`，生产设置 `COMPETITION_INTERNAL_KEY`；平台登录另配置 `COMPETITION_PLATFORM_CONFIG`。沿用 010/011/012 迁移，无新增表。部署工具自动带上两款游戏纯规则源。两游戏构建/开发服务支持 `COMPETITION_PUBLIC_API_URL`；页面注入的配置优先。客户端 `__COMPETITION_CONFIG__.apiUrl` 指向包含 `/api/competition/v1` 的服务地址；静态 Pages 单独部署不会提供数据库或比赛 API。

本地 `pnpm competition:test-db` 准备隔离库；设置 `COMPETITION_TEST_DATABASE_URL=postgres://runtime_app:local-runtime-only@127.0.0.1:15432/competition_test` 后运行 `pnpm --filter @coffeeeeffoc/runtime-api exec vitest run tests/game-services.integration.test.mjs`，会执行真实 HTTP/PostgreSQL 回放、重启、并列、身份/游戏/榜隔离及幂等结算测试。客户端：`node --test platforms/competition/tests/game-services.test.mjs`；网关：`node --test scripts/competition-gateway.test.mjs`。

## 排行榜规则版本握手

两游戏从随制品发布的 `core.mjs` / `engine.mjs` 读取 `RANKED_RULE_VERSION`，服务端 `rankedRules` 引用同一常量。修改排行模拟、关卡内容、输入协议或计分兼容性时必须递增该常量；纯美术、布局、音效和文案变化保持版本不变。不能使用整个制品 hash、包发布版本或在线 metadata 的最新版本冒充本地规则版本。

`POST /games/:game/runs` 发送 `{board,version,levelId?}`；服务端在创建状态和保存对局前检查 `version`，缺失或不匹配返回 `409 RULE_VERSION_CHANGED`。既有对局的版本隔离、输入重试回执及幂等结算保持原语义。升级前没有发送版本的客户端会被新服务端拒绝，只能继续本地挑战。

共享客户端也核对返回的 `run.version`，一致后才绑定上传身份并进入 `recording`。缺失或不匹配、以及旧服务端严格 schema 拒绝新字段的 `422 INVALID_INPUT`，使 recorder 进入 `update-required`；两游戏显示更新提示并使用本地玩法，不录制或上传此局。不能通过移除版本重试来恢复排行榜。匿名读取、房间操作和显式练习不要求排行榜规则版本。
