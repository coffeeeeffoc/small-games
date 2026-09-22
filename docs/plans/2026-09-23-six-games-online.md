# 六款游戏真实 PK 与全站排名实施记录

2026-09-23，基线 `646a830`，根仓库和所有子模块工作区干净。续接 `2026-09-22-six-games-95.md`，冻结五维权重与 9.5 / 每维 9.0 门槛；旧评分不表示本轮通过。用户已澄清允许验证后提交、推送，未授权正式部署或购买资源。

## 架构决定

扩展现有 Game Runtime Service 的 `/api/competition/v1`，复用 Fastify、Zod、限流、service-kit 的 PostgreSQL 池与 runtime schema。既有云存档身份保持原样；比赛身份另由服务器签发，避免改变存档授权。卡丁车保留独立权威模拟进程，通过仅本机可达且持有内部密钥的接口验证比赛身份、持久结算。管理服务、管理 schema、Workspace Agent 不经测试隧道暴露。

HTTP 承担登录、邀请、准备、动作、比赛快照、结算和榜单；非实时挑战轮询快照，动作由服务端按顺序校验。卡丁车继续 WebSocket 权威同步。比赛记录、操作去重、成绩和最佳成绩写 PostgreSQL；挑战快照也存库以便重启恢复，截止时间按服务器时间计算。卡丁车临时房间重启中断，已提交结果保留。

本地采用 PostgreSQL + runtime-api + kart-server + 只读静态页面/业务代理。临时 HTTPS 隧道只连接该代理。正式起点一台 ECS、一个主域名、一个 PostgreSQL 实例，不需要 Redis、队列或六套服务；管理进程沿既有权限边界按需部署。

## 稳定协议 v1

- `POST /sessions/guest {}` → `{ playerId, token, expiresAt }`；Bearer token 仅由服务端生成，浏览器持久保存；清除浏览器数据或更换设备产生不同游客，不按昵称合并。
- `GET /boards/:game` → 主榜规则与 Top 100、eligiblePlayers、me、previous、threshold；所有玩家参与排名，每人每榜一条最佳，按 score DESC、secondary ASC 排，完全相同成绩并列且 playerId 固定展示顺序。
- `POST /rooms {game}` → 房间；`POST /rooms/join {code}`；`GET /rooms/:code`；`POST /rooms/:code/ready {}`；`POST /rooms/:code/leave {}`；`POST /rooms/:code/rematch {}`。
- `POST /rooms/:code/actions {seq, action}`；seq 每名玩家从 1 开始，持久化去重；拒绝缺号、过期、越权和非法动作；任何客户端 score/elapsed/moves 均不是结算输入。
- 房间 `{code,game,version,status,players:[{id,ready}],you,startedAt,deadline,state,opponent,results}`；status 为 waiting/playing/finished/abandoned/expired。state 仅返回规则模块公开视图。全部玩家准备后服务器开始；结果由规则模块及服务器计时产生。
- 卡丁车内部：`POST /internal/verify {token}` → `{playerId}`；`POST /internal/kart-results {matchId,board,entries:[{playerId,elapsedMs}],startedAt,finishedAt}`，头 `x-competition-internal-key`；仅 loopback 且匹配服务端环境密钥，不对代理公开。卡丁车调用方保证合法 checkpoints、无机器人和固定规则条件。

## 当前代码现状矩阵（实现前核验）

| 游戏 | 目录与渲染 | H5 / 桌面入口 | 微信 / B站 | 全屏 | PK / 榜单 | 当前验证 |
| --- | --- | --- | --- | --- | --- | --- |
| 浪湾卡丁车 | games/local/carding-car，Cocos 3.8.8 3D | dist、Shell iframe、kart-server /play | 已有独立 Cocos 目标 | 公共控制器 | 权威 WS 临时房间；本机纪录，无全站持久榜 | 当前代码已读，实际重跑中 |
| 围捕小队 | games/local/cops-robbers，SVG/DOM | index、dist、Shell iframe | 未发现本游戏原生入口 | 公共控制器 | 未实现；本机存档 | 当前 engine/levels 调用链已读 |
| 别跑！街区围捕 | games/local/cops-robbers-realtime，Canvas2D + DOM HUD | index、dist、Shell iframe | 原实现无本游戏完整原生入口 | 公共控制器 | 原单人本地纪录 | engine/renderer 当前链路已复核 |
| 词屿 | games/local/letters-words2，DOM | index、dist、Shell iframe | 未实现 | 公共控制器 | 未实现；教材 IndexedDB 与本机完成词 | 当前规则与教材调用链已读 |
| 此时·此地 | games/local/vibeJam-myself-history-guess，Three/DOM | Vite、dist、Shell iframe | 待核验 | 公共控制器 | 待核验 | 待实现 agent |
| 象五子棋 | games/submodules/xiangqi-five | server.js、dist、Shell iframe | 待核验 | 公共控制器 | 已有 rooms 需核验 | 待实现 agent |

## 分工与执行

并发上限含协调者 4。第一批：letters_words（词屿目录）、cops（围捕小队目录）、kart（卡丁车目录及 kart-server）；协调者独占 runtime-api、infra、共享协议、H5 控制器、集成脚本与总文档。各游戏规则模块按唯一文件授权。第二批为其余三款。实现后另启未参与对应实现的新评审 agent，先操作当前产物再看实现总结。

## 验收日志

本轮已实现共享持久化比赛后端，五款复用原规则的服务端模块，以及五款真正Canvas小游戏入口；卡丁保留权威WS及既有Cocos入口。新增数据表只在runtime schema，没有改动管理授权、原云存档身份或教材文件。原始证据保存在忽略目录，发布前按下面命令可复跑。

## 交付与验收矩阵

以下“通过”限明确环境：Windows Chrome真实浏览器、两个隔离context、真实PostgreSQL；手机视口模拟不等于实体手机。

| 游戏 / 实现者 | 运行与专注界面 | H5全屏证据 | 双身份PK / 全站持久榜 | 公网联调 | 微信 / B站 |
| --- | --- | --- | --- | --- | --- |
| 浪湾卡丁车 / kart | Cocos3D，开赛收准备面板，房间/结算与比赛互斥；结算直接显示全站个人结果 | 公共控制器及Cocos浏览器入口 | 本地及公网真实两车三圈、刷新恢复、合法完赛持久化通过；个人最佳/排名变化/目标差距直接显示 | 最终源码068623b5，房1F3C4541，两端210.358/268.796秒合法三圈、saved、全榜一致；结果HUD精确断言通过，K1/K2均关闭 | 两独立Cocos目标已构建；微信工具已实际竞速，完整平台PK仍待配置；B站见原生报告 |
| 围捕小队 / cops | SVG/DOM单人；Canvas在线；返回大厅找PK | 真Fullscreen API进退；真实iframe权限拒绝后仍可玩 | 各13次有效动作通关，两端结算一致；独立报告C1/C2均关闭 | 两隔离客户端各13步，9.569/9.052秒；结果、榜单、全屏与直接再次挑战通过 | 两独立Canvas目标已构建，缺有效AppID/登录配置的工具联调未通过 |
| 别跑！街区围捕 / realtime | 既有Canvas单人；Canvas权威120Hz重放；开赛收长说明 | 真全屏、横屏、规则覆盖层不挤游戏 | 两真实玩家封两出口并追捕；全部捕获后比分/用时一致 | HTTPS双客户端、刷新恢复、直接重赛通过 | 两Canvas目标已构建；工具/真机未通过 |
| 词屿 / letters_words | 原教材DOM练习；Canvas固定词库PK；长释义展开，320/360/390核心可用且触点≥44 | 单人/PK真全屏；权限拒绝反馈；进度保持 | 两真实身份各18词，正确量/准确率/时间与结果一致；提示由后端扣资格 | 两客户端各111次Canvas操作，18/18无提示、100%正确率、46.477/51.524秒；结果、榜单、全屏与再次挑战通过 | 两Canvas目标已构建；工具/真机未通过 |
| 此时·此地 / history | 原Three全景保留；在线Canvas真实场景/地图/年代输入；横屏左右分区 | 真全屏、横竖屏、长规则不挤场景 | 双方5幕；相同答案提示差500，结算一致 | 两身份完整5幕、榜单、刷新恢复、直接重赛通过；真实隧道暂停30秒后恢复原身份原等待房 | 两Canvas目标与5张场景资源已构建；工具/真机未通过 |
| 象五子棋 / chess | 原DOM棋盘保留；在线Canvas9×10自由部署；开始收配置 | 真API成功与真实Permissions-Policy拒绝 | 真实9手连五，服务器验证轮次/落点/胜负；两轮3/0、同对当日第二轮不计分 | HTTPS真实两轮及直接重赛、全站积分通过 | 两Canvas目标已构建；工具/真机未通过 |

H5入口为 `http://127.0.0.1:43010/games/<gameId>/`，Shell为43010根路径；对应游戏目录见前表。5款在线Canvas不是把DOM/iframe装进小游戏，而是直接绘制并发送同一规则动作；原H5丰富的教材选择、地图与单人内容继续保留。原生本轮主要模式是好友排位，不声称移植全部单人教材/自由关卡。

12个独立目标路径、真实工具状态和待填资源见 [原生验收记录](../deployment/native-target-validation.md)。所有真机、目标App内置浏览器、微信/B站正式体验版和跨平台配对尚未通过；不能凭构建或浏览器测试替代。

## 每款主榜与好友PK规则

| 游戏 | 固定可比条件与服务端判定 | 主榜排序 / 辅助规则 |
| --- | --- | --- |
| 卡丁车 | `carding-car-seaside-v1`，海湾3圈、固定车辆/车手/种子、2真人0机器人；复用服务端物理、合法有序checkpoint | 完赛更快优先；DNF不上榜；客户端只交驾驶输入，内部鉴权进程提交合法成绩，持久outbox断线补交 |
| 围捕小队 | `cooperation-map17-v1`，第17图相同初态；服务端复算每一步小偷响应；全部捕获才有效；5分钟/200步上限 | 更少步数优先，同步数再比服务端用时；只取各玩家最佳；单人提示/离线纪录不上榜 |
| 街区围捕 | `street1-physics120-v1`，第1图固定规则，服务器按120Hz物理推进、只接收合法移动/留守命令；120秒 | 全捕获才有效，先完成情况/捕获数，再比权威用时；未过关不进入本主榜 |
| 词屿 | `basic-18-v1`，固定18词、每房同seed同题/盘序、120秒；服务器验证遮挡、选字与答案 | 无提示正确词量优先，其次无提示正确词/全部提交次数，再比服务端用时。每词只计一次；提示词不计正确量，错提交进入分母，重排/撤回免费；不提供排位看完整答案，拼出不等于背会。自选教材仍为练习，不混入基础榜 |
| 此时·此地 | `five-scenes-v1-<内容hash>`，固定5幕450秒；服务端验证经纬度/年代并复算距离/年代分 | 五幕都提交才有效；总分最高25000，同分比服务器用时；每幕提示扣500；答案提交后才公开，内容变更带hash隔离 |
| 象五子棋 | `xiangqi9x10-duel-v1`，9×10、象棋走法/抽子部署、同色连五胜；服务器控制轮次和抽取 | 累计胜3/和1/负0，积分高优先，同分并列；不是越快越强。每对身份每天UTC仅首场有效对局计分；15分钟/600手和棋，少于10手超时/认输不计分；正常连五可少于10手。机器人、单机、旧休闲房不上榜 |

榜单保存全部参赛者所需数据，Top100只是查询窗口；每个玩家每榜一条最佳（棋类一条累计积分），完全相同主/次成绩并列，按playerId稳定展示。返回全部合格人数、榜外真实名次、上一更高成绩、100名门槛和可比较差距；第一名没有伪造的负差距。成绩唯一约束、行锁/榜单锁及事务防止重复或并发结算。空榜、无有效成绩、服务不可用显示真实原因。

## 共享实现及剩余防护边界

- 身份：随机Bearer会话，数据库只存token hash；游客180天持久会话。平台按真实code2Session验证，`platform + appId + openid`唯一；不按昵称合并，不擅自绑定跨平台账号。原生AppSecret仅在服务器环境。
- 房间：创建、12位邀请码、满房/重复/错误游戏检查、双方准备、服务端起止时间、断线快照恢复、幂等seq、结果/再赛。邀请默认15分钟；非卡丁快照/动作存在PG，重启后按原截止时间恢复。卡丁房间为实时内存状态，进程重启中断；已持久结果及本地outbox保留。
- 边界：不接受客户端score/elapsed/moves；规则模块验证棋步、字母、地图命令和提交范围，公开视图隐藏未揭晓答案。内部卡丁接口同时验证loopback和随机密钥，网关直接404拒绝；没有公开管理后台、DB或工作目录。
- 当前上限：单机查询样本不代表大规模并发；采用每榜结算锁、PG房间快照、实时围捕250ms轮询。合法操作自动化、离线研究固定题目及多游客协作仍可能刷成绩；同对限分阻止直接重复刷棋分，但不是完整反Sybil系统。后续依据真实滥用/负载再加强，不承诺绝对防作弊。
- 原生入口已接登录/请求/分享query/冷启动和onShow/存储/触摸/键盘/前后台/安全区/资源；缺少完整平台工具回归时不保证各SDK版本行为。音频及所有平台生命周期需结合真实工具继续验收，见逐目标记录。

## 实际验证与独立评审

实现分两批、独立验收第三批，活跃并发始终不超过含总负责人4。独立评审：`review_cops_letters`（围捕/词屿）、`review_realtime_history`（实时/历史）、`review_kart_chess_backend`（卡丁/象棋/后端），均先真实操作再读总结。`native_acceptance`另做真实开发工具检查。各自发现与通过条件保留在游戏 `INDEPENDENT-REVIEW.md`，后端另有 `services/runtime-api/COMPETITION-REVIEW.md`。

| 验证 | 实际结果 / 命令 |
| --- | --- |
| PostgreSQL + HTTP | `node scripts/competition.integration.mjs`通过：真实双身份完整围捕、伪造/非法/越权拒绝、重复ready、并发重复提交只2条结果、服务重启身份和纪录保留、过期邀请拒绝；02:23新增同身份再赛验证，更快合法成绩更新最佳、后续较慢合法成绩不覆盖最佳。测试首次误用旧房code导致MATCH_CLOSED，按实际rematch字段进入新房后通过，未改产品协议 |
| Top100边界 | 同脚本102名隔离SQL测试玩家，Top100/第101名/准确人数/并列1,1,3/榜首gap=null/空榜/无成绩/版本隔离通过；固定虚构成绩仅专用测试榜，不混实际游戏主榜 |
| 本地查询测量 | 102玩家20次串行查询，2026-09-23 02:23复跑p50≈1.14ms，p95≈2.95ms；非公网端到端、非容量压测 |
| 备份恢复 | 实际pg_dump自competition_test，pg_restore到新库；恢复查询46条成绩、26场比赛、119会话及真实卡丁-183797/-184379ms纪录，保留测试备份及库；未覆盖原库 |
| 数据库与进程重启 | 02:12–02:14实际重启PostgreSQL12集群及runtime/kart/gateway；两身份、已完成围捕D24811557914的结果/PB/排名、卡丁全榜重启前后deepEqual。中断期间API真实503，恢复后health的database/competition均ok；证据 `.scratch/competition/restart-evidence.json` |
| 已有规则/功能 | 卡丁原81项及新增结算摘要1项（7分支断言）、kart-server7项、runtime原5项及lint通过；游戏实现报告分别记录60图/48关、320随机词盘、48教材hash、原28历史资源、棋类旧规则及移动输入回归 |
| H5公共全屏 | `pnpm test:h5-fullscreen`7份同步检查通过；真实浏览器独立页/iframe进退保进度；不支持分支另有模拟能力测试。独立评审还用真实Permissions-Policy禁止全屏，失败中文反馈且仍可玩 |
| 根构建与登记 | `pnpm check:games`、`pnpm test:game-config`19项通过；`pnpm build:pages`38任务通过；`pnpm test:pages`以本机Chrome执行25个目录/21个嵌入与独立游戏、返回导航/移动宽度/Runtime隔离通过。默认Playwright Chromium启动spawn UNKNOWN，改用已安装Chrome，不记失败启动为通过；不把浏览器结果当原生/真机通过 |
| 临时公网 | cloudflared只代理43010，实际HTTPS页面/资源/业务API和WSS；六款均完成双客户端PK与榜单。卡丁最终房1F3C4541合法三圈210.358/268.796秒、刷新恢复、持久结算saved；结果HUD显示个人最佳/第3和第7名/7人/首次纪录/距上一名25.979和29.488秒，页面errors为空；证据 `games/local/carding-car/reports/ranked/validation.json`。其余证据 `outputs/independent-cops-letters-public/`、`outputs/independent-realtime-history-public/`、象棋reports。隧道传输暂停30秒，等待页出现网络不可用且恢复后同房同身份；不等于断流期间实时比赛持续可玩 |

启动、迁移、停止、API/WSS配置、备份、双客户端和隧道命令见 [本地联调手册](../deployment/six-games-local-integration.md)。临时公网域名只存忽略日志和本轮消息，变更需更新允许Origin，原生再构建。阿里云资源数量、报价/备案/12应用资料和安全交付见 [已保存的准备清单](../deployment/aliyun-preparation-checklist.md)。

## 质量门槛与未完成项

继续冻结30%核心玩法、20%首局理解、20%移动操作反馈、15%重玩学习、15%完整稳定，目标≥9.5且每维≥9.0。专项功能通过不自动提高没有新增用户证据的维度。当前独立保留/更新的专家分：卡丁8.685、围捕8.84、实时8.57、词屿8.65、历史8.59、象棋8.75；维度依据在各独立报告。**六款均未达到冻结总门槛，不宣布整体完成或全面可发布。**

剩余硬门槛：12原生目标逐工具完整登录→玩法→好友PK→结算→榜单，平台体验版、实体双手机、跨平台实配、目标App内置浏览器、真实新玩家/跨日复玩与学习效果；生产PG17/云容量与离机恢复演练。已完成不依赖这些资源的代码、构建和真实本地/公网检查；有权限的AppID、Secret安全注入、体验成员、设备与玩家需按清单集中准备，后续从具体未通过项续接，不重建现有能力。

代码提交到根仓库与象棋子模块的 `codex/six-games-online` 分支。根仓库 `.github/workflows/pages.yml` 在main推送时自动正式部署；本轮未授权正式部署，因此不推main、不触发Pages发布。代码分支供检查和后续平台资源到位后续接。
