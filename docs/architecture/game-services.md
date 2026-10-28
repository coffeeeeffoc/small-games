# 通用游戏服务入口

所有接口复用 Runtime API、现有身份、来源限制、限流和 PostgreSQL。公网地址为 `https://api.nenggongzhiren.cn/small-games/v1`，内部兼容路径为 `/api/competition/v1`。游戏只提交操作，不提交权威分数。纯玩法模块负责模拟；入口层按 `game` 注册表选择模块。

## 身份与排行榜

`GET /games/:game` 返回标题、规则版本、`capabilities`、`boards` 与 `identity`。独立的 `versions.ranked` / `versions.multiplayer` 用于双能力游戏的规则版本；房间客户端以房间响应的版本为准。身份包含 `kind`（`anonymous`、`guest`、`platform`）、`authenticated`、`provider`、`playerId`、`name`。仅经过平台官方登录交换的 `platform` 身份标为 `authenticated: true`；游客 token 不代表平台登录。它与 Shell 云存档身份相互独立。

游戏信息、排行榜、房间和挑战接口均要求有效且绑定当前游戏的 Bearer token，缺失或过期返回 401，跨游戏凭证被拒绝。首次联网由共享客户端调用 `POST /sessions/guest`，服务端签发匿名 ID、随机昵称、内置头像和凭证；玩家无需注册或执行登录操作。匿名凭证缓存按 API、平台、AppID 和游戏隔离，各入口独立，不提供跨平台找回。访问凭证 15 分钟、刷新凭证滚动 180 天；具体恢复与失效行为见[更新说明](../operations/backend-recovery-2026-10-17.md)。TapTap 夜航渠道构建启用 `/sessions/platform` 官方换码：同一 MiniApp ID 和官方 openid 找回唯一服务端玩家，版本号、测试/正式发布状态不参与身份键；平台密钥仅在服务器配置。普通浏览器继续使用独立游客身份。首次绑定可附带本游戏现有有效游客凭据；只有官方身份尚未绑定且凭据仍属于游客时才原位绑定，保留 UUID、昵称和成绩，撤销旧游客会话。已有官方玩家优先，不自动合并其他游客。缓存已丢失且从未绑定的旧游客无法证明归属，不能凭昵称或客户端提交的 ID 认领。

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

Run 始终绑定创建时的玩家；续期只接受同一玩家和游戏，401 不会自动重放写入或创建新身份冒充旧 run。当前页存储不可用时保留内存身份；存储身份变动影响新局与读榜，不改变旧 run 主体。新连接等待期间身份被清除或损坏，会取消该次连接；下一次明确开局读取最新身份或重新建立会话。共享客户端统一管理匿名签发和续期，并发调用共用一次请求，不调用平台 SDK 登录。离线不伪装全站榜或本地模拟的在线名次。

客户端同时提供 `metadata()`、`createRoom({mode?,role?,initiative?})`、`joinRoom({code})`、`getRoom({code})` 和 `roomAction({code,operation,body?})`。操作白名单为 `ready/leave/rematch/actions/role/initiative`；已加入房间及续局邀请固定原身份，换号不会替换它的操作主体。

## 联机与扩展

现有 room 规则统一通过 `/games/:game/rooms` 创建、`/rooms/join` 加入，以及 `/rooms/:code` 查询和 `/ready`、`/leave`、`/rematch`、`/actions`、`/role`、`/initiative` 操作。每个操作均校验房间所属游戏。规则注册表中支持联机的游戏使用既有 room store 和模拟，默认榜 ID 为 `versus`；不支持联机的游戏返回 `MULTIPLAYER_UNAVAILABLE`。

旧 `/rooms`、`/boards/:game`、三块选两块的专用排位、克朗棋专用多座房间及卡丁车 WebSocket 路径保留兼容。本轮统一入口覆盖已登记的通用 room 规则和两款新增单机榜；专用服务后续可增加 adapter 接入，无须改动旧玩法模拟。

新增单机游戏：实现 `RankedRule` 的 `create/apply/result` 与 `boards`，由 `src/app.ts` 注册；复用已有游戏核心，补精确跨包依赖白名单、两套后端打包清单、纯规则与实际数据库回放测试。新榜只增加注册配置及评分策略，不增加 HTTP 路由。规则或计分不兼容时升级 `version`，旧榜数据保留且不混排。联机游戏只需登记已有 `Rule` adapter；特殊房间或 WebSocket 服务在网关层增加明确 adapter，不能让客户端指定任意上游。

## 部署与验证

启用 `COMPETITION_ENABLED=true`、`RUNTIME_DATABASE_URL`、`COMPETITION_ORIGINS`，生产设置 `COMPETITION_INTERNAL_KEY`；平台登录另配置 `COMPETITION_PLATFORM_CONFIG`。初始化包含 010–014 迁移；现有生产数据库通过控制部署流程采用 014，增加游戏范围和会话续期结构，不在日常应用更新时重跑迁移。部署工具自动带上两款游戏纯规则源。两游戏构建/开发服务支持 `COMPETITION_PUBLIC_API_URL`；页面注入的配置优先。客户端 `__COMPETITION_CONFIG__.apiUrl` 指向包含版本路径的上述公网或内部服务地址；静态 Pages 单独部署不会提供数据库或比赛 API。

本地 `pnpm competition:test-db` 准备隔离库；设置 `COMPETITION_TEST_DATABASE_URL=postgres://runtime_app:local-runtime-only@127.0.0.1:15432/competition_test` 后运行 `pnpm --filter @coffeeeeffoc/runtime-api exec vitest run tests/game-services.integration.test.mjs`，会执行真实 HTTP/PostgreSQL 回放、重启、并列、身份/游戏/榜隔离及幂等结算测试。客户端：`node --test platforms/competition/tests/game-services.test.mjs`；网关：`node --test scripts/competition-gateway.test.mjs`。

## 排行榜规则版本握手

两游戏从随制品发布的 `core.mjs` / `engine.mjs` 读取 `RANKED_RULE_VERSION`，服务端 `rankedRules` 引用同一常量。修改排行模拟、关卡内容、输入协议或计分兼容性时必须递增该常量；纯美术、布局、音效和文案变化保持版本不变。不能使用整个制品 hash、包发布版本或在线 metadata 的最新版本冒充本地规则版本。

`POST /games/:game/runs` 发送 `{board,version,levelId?}`；服务端在创建状态和保存对局前检查 `version`，缺失或不匹配返回 `409 RULE_VERSION_CHANGED`。既有对局的版本隔离、输入重试回执及幂等结算保持原语义。升级前没有发送版本的客户端会被新服务端拒绝，只能继续本地挑战。

共享客户端也核对返回的 `run.version`，一致后才绑定上传身份并进入 `recording`。缺失或不匹配、以及旧服务端严格 schema 拒绝新字段的 `422 INVALID_INPUT`，使 recorder 进入 `update-required`；两游戏显示更新提示并使用本地玩法，不录制或上传此局。不能通过移除版本重试来恢复排行榜。匿名读取、房间操作和显式练习不要求排行榜规则版本。

## 夜航大厅、重连与稳定汇总（2026-10-28）

夜航通过 `Rule.lobby` 显式启用新房间流程。其他旧游戏保留原匹配策略与12位邀请协议；夜航新房号为6位数字，接口兼容旧12位十六进制。`Room.id` 是不可复用的 UUID，房号仅用于展示/邀请。创建与抢位由已有按游戏 advisory lock 和行锁串行处理，房号碰撞用 `ON CONFLICT` 有限重试，同一玩家仅有一个活动席位。公开列表只包含同游戏、同规则和有效控制版本的等候/进行中房间；私房使用随机盐和 scrypt 密码摘要，响应/列表不暴露摘要、盐或密码。

- `GET /games/:game/rooms` 返回 `{rooms,serverNow}`，条目含人数、昵称、容量及 `canJoin/canSpectate`。
- `POST /games/:game/rooms` 接受 `{mode?,visibility?:public|private,password?}`；私房密码4–64字符。`/rooms/join` 接受 `{code,password?}`。匹配仅找真人，找不到保留公开等待房；人机显式创建 `mode:bot` 后 ready。
- `POST /games/:game/rooms/:code/spectate` 接受 `{password?}`，返回 `you:-1,spectator:true`，后续GET按身份授权并续约30秒；观战不能ready、输入、退出成员或领取结算。观众自己的leave返回 `{code,spectator:true,left:true}` 并立即释放席位；无续约的观众由有界扫尾/房间访问清除，256限制仅计活跃观众。授权过期GET返回 `NOT_A_MEMBER`，重新spectate即可（私房需密码）。
- ready 接受 `{leaseId?,ready?:boolean}`，省略 ready 保持旧客户端的准备行为；显式 false 取消准备，重复目标状态幂等。双方ready后 `startsAt=startedAt=serverNow+1200`；前端播放入场，不显示数字倒计时。单人/对战无计时判负；房间保留期限不作为玩法胜负。
- 新成员响应提供私有 `leaseId`，GET用查询参数、actions/ready/leave用body续约。`connect`为原成员轮换租约，旧租约返回 `STALE_LEASE`。发射输入的1秒防粘连租约与连接租约独立。
- 2.5秒无联系显示 `players[].disconnected`，`reconnectUntil`为最后联系后30秒；真人开赛后的显式leave进入30秒恢复窗。等待或入场未完成时退出仅移除本人，剩余玩家保留房号、取消准备并回到等待，无人时删除；不记战绩。已开赛的人机退出立即结束且不发积分，后续随机匹配不会恢复这局人机。超时才 `takenOver:true`，服务器机器人可接管任意席位，原玩家不能恢复操作。
- Runtime每5秒最多扫描10个逾期房间/启用大厅的游戏，沿用游戏锁防多实例重复，关闭服务等待当轮完成。读房、列表和本人history也结算逾期房；停机时在重启或下一次读取补结算。

真人开局记录保存在 `competition_matches`，独立UUID同时命名空间隔离积分事件，事务内幂等。自然结局真人胜/负/平120/40/60分；一人超时立即记退出者负40、留下者胜120，后续机器人自然结束不重复计分。结算界面逐方优先采用 settlement.outcome，不能用接管后的模拟结果覆盖既定胜负；双方弃局允许同时为负。两人均超时各记一负、0分；初始人机仅40/10/20分，不写真人历史/胜率。`settlement`含本局points、累计totalPoints、wins/games/outcome/reason。`GET /games/:game/history?cursor=`只返回本人，summary包括wins/losses/draws/games/winRate，每页20项，按finishedAt+不可复用id稳定分页，单项含对手、结果、原因、开始/结束/时长/积分。

排行榜IDs为 `clears`、`points`、`win-rate` 与120个 `level-<mission>`。存储版本固定 `night-records-v1`，独立于输入协议 `night-input-replay-v8`/对战 `night-duel-v2`。旧已验证关卡回填最高通过关卡序号和个人最快，不补发积分。`clears` 保留兼容接口名，值改为最高通过关卡序号（1–120），由稳定任务ID中的序号计算，排除热身。新成功关卡每次100分，积分事件插入成功才累计。胜率使用double precision，按真人历史实时重算，失败后允许下降，返回wins/games真实分子分母。

旧关卡回填与 `night-migration:highest-clear-v2` 完成标记在同一事务、同一ledger锁下提交；并发实例只执行一次，失败回滚后可重试。之后读榜只检查标记，新通关仅重算本人clears。首次迁移前应停止旧版成绩写入，完成标记之后导入的旧历史不会自动再次回填。活动房查询限定当前对战规则版本，未知旧房不被新规则推进或补造战绩，也不会阻塞新建/匹配。

辅助通关完整回放后 `cleared:true`，可更新最高通关/累计积分；`assisted:true,fastestEligible:false` 不写关卡最快榜。`grantBuff/grantAmmoSupply/grantHomingAmmo`均在允许的输入操作中；追踪弹是正安全整数增量，累计不得超出存档的MAX_SAFE_INTEGER。正常已存奖励可跨局领取。当前广告完成资格由客户端Host/SDK维护，Runtime没有平台服务端广告receipt，输入回放证明游戏结果而不能证明广告观看，不能宣称防伪造领取。开发模式和纯本地练习仍由接入端隔离。

共享SDK增加 `listRooms/history/updateProfile/spectateRoom/connectRoom`，自动保存与携带房间租约；`updateProfile({nickname})`复用POST `/me`并更新身份缓存。夜航pollMs为100；每个token默认1200请求/分钟，10Hz动作已含快照，不再并行运行10Hz GET。

密码摘要使用Node异步scrypt。通用create/join/spectate路由分别限制每token每分钟20次（未提供格式有效token时按IP），在身份查询和密码计算前拒绝超限；actions和GET仍沿用原限额。此限流使用现有进程内计数，多实例没有共享额度。

本轮后端采用既有dist整体打包，新night-ledger模块自动包含，无新增部署源清单或数据库表。验证为隔离 `competition_test` 中的真实HTTP/PG定向集成、共享SDK/网关/输入协议及确定种子机器人；发布、Creator制品、浏览器和真机由主会话整合后验证。
