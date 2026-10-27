# 夺城令对局服务

《夺城令》的第二个独立子应用，负责 PVE 与真人双人匹配的权威模拟、战报及持久玩家成长。移动端 H5 位于 `games/local/tianxia-chalu`，不依赖服务也能本地游玩；服务通过其公开 `./engine` 导出复用同一套无 DOM 规则。原生 Node.js HTTP，无新增第三方运行依赖。

## 运行

仓库根目录执行（Node.js 24.21+）：

```sh
pnpm install
pnpm --filter @coffeeeeffoc/tianxia-chalu build
pnpm --filter @coffeeeeffoc/tianxia-server start
```

打开 `http://127.0.0.1:43004/play/`，在游戏设置中使用此服务地址开启服务端对局。也可分别运行客户端 `dev` 与服务 `dev`。服务仅在启动时定位已构建客户端，先构建再启动；没有客户端构建时 API 仍能独立工作。修改源码触发 `dev` 重启会中断尚未结束的对局。

| 环境变量                  | 默认值                 | 用途                                                                 |
| ------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `TIANXIA_SERVER_HOST`     | `127.0.0.1`            | 监听地址；容器中按需显式设为 `0.0.0.0`                               |
| `TIANXIA_SERVER_PORT`     | `43004`                | 固定端口，冲突时启动失败，不自动换端口                               |
| `TIANXIA_ALLOWED_ORIGINS` | 空                     | 额外允许的网页 origin，逗号分隔，如 `https://game.example`，不含路径 |
| `TIANXIA_MAX_MATCHES`     | `64`                   | 内存对局容量，范围 1–256                                             |
| `TIANXIA_DATA_DIR`        | 本应用 `.data/results` | 私有战报与玩家档案目录；部署时挂载持久卷                             |

始终允许 HTTP(S) localhost、127.0.0.1 与 ::1 网页；不使用通配 CORS。命令行或原生客户端没有 Origin 时可访问，但仍须携带对局凭证。部署公网 H5 时显式配置完整 origin，通过 HTTPS 反向代理暴露静态页与公开 API；数据目录不在静态服务范围内。

## API v1

JSON 请求使用 `Content-Type: application/json`，错误响应为 `{ "error": { "code": "…", "message": "…" } }`。创建之外的全部对局接口必须使用 `Authorization: Bearer <token>`；凭证不放在 URL，也不写入公开战报。玩家持久匿名凭证用于档案和匹配；各对局另发独立席位凭证。没有平台登录账户，凭证不等同于经过平台验证的身份。

| 请求                             | 内容                                                        | 响应                                                  |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| `GET /health`                    | 无                                                          | `{status:"ok", service:"tianxia-server", protocol:1}` |
| `POST /api/matches`              | `{levelId:"crossroads", difficulty:"normal"}`；字段均可省略 | 201 `{matchId,token,snapshot}`                        |
| `GET /api/matches/:id`           | 鉴权头                                                      | `{snapshot}`                                          |
| `POST /api/matches/:id/commands` | `{junctionId,sequence,routeIndex?}`                         | `{accepted:true,duplicate,sequence,snapshot}`         |
| `POST /api/matches/:id/pause`    | `{}`                                                        | `{snapshot}`                                          |
| `POST /api/matches/:id/resume`   | `{}`                                                        | `{snapshot}`                                          |
| `POST /api/matches/:id/abandon`  | `{}`                                                        | `{snapshot}`，失败结算                                |
| `GET /api/matches/:id/result`    | 鉴权头                                                      | `{matchId,result,persisted}`；未结束时 409            |

`snapshot` 为 `{matchId,revision,serverTime,paused,lastSequence,state}`；`state` 就是共享引擎可序列化状态。人机玩家控制阵营 `0`，AI 由服务端运行；真人匹配为0/1两个独立席位，关闭AI，快照按本席位投影视角。`serverTime` 为 Unix 毫秒，用于显示同步；客户端不能提交时间、胜负或分数。难度为 `easy`、`normal` 或 `hard`。创建可另传 `seed`（uint32 或1–128字符）及最多两张 `{kind,tier}` 的 `loadout`，用于同布局重试和局部卡效果；缺省 seed 由加密随机源生成。服务只校验有界单人参数，不验证本地卡库所有权，不作为竞技反作弊或付费资产凭证。

切路指令从 `sequence:1` 连续递增；成功后才推进客户端序号。相同序号和内容的最近 128 条成功指令可安全重试，不再重复切路；旧序号、跳号和内容冲突返回 409。重连先读 `lastSequence`。省略 `routeIndex` 表示循环下一军令，`-1` 为屯兵，非负为邻城出口。服务器校验归属、路线范围和 0.2 秒模拟时间冷却；无权操作返回 403，冷却返回 429。暂停、继续、放弃可重复调用；终局不能继续。

客户端建议每秒获取 4 次快照，收到快照后绘制，无权自行推进服务端结果。暂停时引擎不推进，恢复不会补算暂停期间时间。游戏切到后台可发送暂停，网络中断时服务仍继续模拟直到闲置到期，因此恢复时应先获取最新快照。

## 生命周期与边界

服务按 100 ms 固定步长运行，默认种子由系统加密随机源产生，结果与本地共享引擎一致。每个调度轮次每场最多补算 50 步，剩余时间排队，避免单次长时间阻塞。对局连续 5 分钟没有成功鉴权访问或创建满 20 分钟会以 `expired` 失败结束。正常对局上限由共享关卡规则决定。暂停也受闲置与总时长限制。

终局先写临时文件并 fsync，再原子改名；非 Windows 系统另同步目录，Windows 因目录 fsync 不受支持而仅保留文件同步与原子改名。战报保留最多 7 天、1000 条，超额移除最早战报；每分钟清理过期记录。只保存凭证的 SHA-256 摘要，不保存明文。内存终局最多保留 10 分钟，容量不足时可提前回收已持久化的终局，战报接口仍可读取磁盘恢复的记录。磁盘写入失败时明确返回 `persisted:false`，不会伪称已保存；失败终局保留内存并每秒重试。战报落盘后再原子更新双方档案及结算收据，启动时重放未应用战报。

活跃对局只在单进程内存，进程重启即中断，无法恢复快照；已保存战报可用原 `matchId` 与凭证继续查询。访客凭证丢失后无法找回，也没有跨设备账号恢复。请勿让两个进程共享同一个目录；多实例路由、共享持久化和恢复快照尚未实现。

单请求体最多 2 KiB、请求头 8 KiB；单连接超时 5 秒，最多 256 连接。每个直连 IP 每分钟最多 600 请求、12 次建局，来源计数表最多 2048 项，不信任客户端 `X-Forwarded-For`。反向代理部署需在入口另设分用户/IP 速率限制，否则多个玩家共享代理 IP 配额。本版本提供真人随机匹配和持久匿名玩家档案，尚无好友房间、付费、平台账户、排行榜或完整竞技反作弊身份认证。

真人匹配由独立匹配队列管理，服务端席位映射为阵营；每席位拥有自己的凭证、序号、历史与断线心跳。队列和网络逻辑不进入游戏规则。真人比赛拒绝暂停；单人人机 pause/resume 仅保留为旧生命周期兼容，游戏不展示暂停按钮。

## 验证

```sh
pnpm --filter @coffeeeeffoc/tianxia-server build
pnpm --filter @coffeeeeffoc/tianxia-server test
pnpm --filter @coffeeeeffoc/tianxia-server test:browser
pnpm --filter @coffeeeeffoc/tianxia-server smoke
```

`build`/`typecheck` 检查 JavaScript 语法及共享引擎导入，不是 TypeScript 类型检查。测试通过真实 HTTP 覆盖凭证隔离、种子/卡牌参数边界、分数注入拒绝、归属/冷却/幂等、固定步长与共享引擎等价、暂停恢复、终局计算、重启读取、过期容量、来源/请求体/速率限制、静态目录约束、存储保留与写盘失败。`smoke` 在临时端口走通建局至持久化战报，不使用或留下生产数据。

`test:browser` 自动构建正式客户端，以 Chromium 390 × 844 触屏模拟访问真实临时 HTTP 服务，覆盖连接检查、建局、改道、暂停与恢复、建局/恢复期间切后台、断线后的终局恢复和暂停过期说明。结果记录到客户端 `docs/design/server-browser-report.json`；测试使用临时战报目录与可控服务时钟，结束后清理。后台事件为确定性模拟，不代表真机或操作系统挂起验证。

## 真人匹配与成长（2026-10-28）

新增接口均严格拒绝未知字段，客户端不能提交经验、等级、胜率或结果。玩家凭证和席位凭证必须保存在服务 origin 对应的私有存档中，不放 URL；服务只持久保存 SHA-256 摘要。

| 请求                      | 凭证 / 内容           | 响应                           |
| ------------------------- | --------------------- | ------------------------------ |
| `POST /api/players`       | 无；`{}`              | `{playerId,token,profile}`     |
| `GET /api/players/me`     | 玩家 bearer           | `{profile}`                    |
| `POST /api/matchmaking`   | 玩家 bearer；`{}`     | 等待或已匹配状态               |
| `GET /api/matchmaking`    | 玩家 bearer           | 等待心跳或已匹配对局           |
| `DELETE /api/matchmaking` | 玩家 bearer；无请求体 | 取消等待；已配对返回 `matched` |

`profile`为 `{playerId,name,career,rank,winRate}`；career包含经验、人机和匹配各自的场数/胜负/平局与最近战报。winRate为匹配胜率，零场时null。客户端本机练兵成长与联机档案分开，本地经验不导入可信匹配档案。

等待为 `{status:'waiting',waitedSeconds}`，未排队为 `{status:'idle'}`；配对为 `{status:'matched',matchId,token,snapshot}`。这里token是本席位独立对局凭证，与玩家凭证不同。重复加入不会产生多个队列项或让玩家匹配自己；已配对后的取消返回该局，不偷偷投降。

匹配首先限制等级差2级、平滑胜率差0.15；每等待15秒扩大等级范围2级、胜率范围0.1，兼容候选中随机选择。平滑胜率采用 `(wins+2)/(games+4)`。队列容量256，30秒无心跳清理。无人时持续等待，绝不补AI。双方使用同一双阵营对称地图、随机出生朝向、无卡牌且 `aiEnabled:false`。

军衔为新卒、伍长、什长、百夫长、校尉、都尉、将军、统帅、传说，各5级；升级成本从100开始，每级增加30。正常人机胜/败/和为20/8/12经验，匹配为100/35/50。投降或掉线的一方记负、0经验，对手胜利100经验；双方同时失效不奖励。所有奖励来自服务权威模拟。

`POST /api/matches`可携带玩家bearer关联人机练兵，返回独立席位token后使用它调用对局API；同一已登录玩家只能进行一局，等待匹配时须先取消才能开始人机。原无身份人机API保持兼容。

军令新增可选 `enabled` 布尔字段：`true`建立路线、`false`撤销单条路线，需提供合法非负routeIndex；省略保持旧switchRoute语义，`routeIndex:-1`停止该城全部后续派兵。取消不召回在途士兵。每席位独立维护sequence及最近128条指令指纹，不能操作对方城池。

快照额外包含 `mode:'pve'|'matched'`、自己的profile及仅含阵营/昵称的players；state.playerFactionId及result.outcome/score/stars按调用者席位投影，不改写共享权威状态。战报额外返回profile和experienceGained。真人结果不发人机卡牌、不推进战役关卡。

真人对局不暂停，返回确认或切后台不影响权威计时。每席位45秒未鉴权访问判掉线，宽限期内原凭证可续连；只有一方掉线时对方获胜，两方均掉线无奖励失效。正常比赛由引擎按时间上限及城池/兵力排名裁定。

玩家存储在 `TIANXIA_DATA_DIR/players/players.json`，最多10000个持久匿名档案。写入使用临时文件、fsync、原子rename；双方经验与永久matchId收据一次性提交，不依赖客户端仅保留最近512条的收据。战报先落盘后提交档案，启动重放补齐进程中断窗口。写盘失败明确 `persisted:false`、保留并重试；损坏v2战报安全跳过，损坏玩家档案拒绝启动而不静默重置身份。

比赛和身份创建共享每直连IP每分钟12次创建限额；其余请求仍为600次。仅单进程运行；活跃比赛/队列不跨进程重启恢复，持久档案和已完成战报可恢复。匿名身份丢失凭证无法找回，没有跨设备平台账户恢复。数据目录必须位于公开静态目录之外。

新增Node HTTP测试覆盖双人席位权限及独立序号、多路线撤销、匹配扩圈、无人不补AI、取消配对竞态、180秒真实固定步长胜败奖励、军衔晋升、投降与掉线、档案重启、写盘失败重放与幂等、损坏v2战报，以及旧PVE兼容。浏览器或真机验证以本次实际运行记录为准。
