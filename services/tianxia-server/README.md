# 天下岔路对局服务

《天下岔路》的第二个独立子应用，负责单人 PVE 权威模拟与战报。移动端 H5 位于 `games/local/tianxia-chalu`，不依赖服务也能本地游玩；服务通过其公开 `./engine` 导出复用同一套无 DOM 规则。原生 Node.js HTTP，无新增第三方运行依赖。

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
| `TIANXIA_DATA_DIR`        | 本应用 `.data/results` | 私有战报目录；部署时挂载持久卷                                       |

始终允许 HTTP(S) localhost、127.0.0.1 与 ::1 网页；不使用通配 CORS。命令行或原生客户端没有 Origin 时可访问，但仍须携带对局凭证。部署公网 H5 时显式配置完整 origin，通过 HTTPS 反向代理暴露静态页与公开 API；数据目录不在静态服务范围内。

## API v1

JSON 请求使用 `Content-Type: application/json`，错误响应为 `{ "error": { "code": "…", "message": "…" } }`。创建之外的全部对局接口必须使用 `Authorization: Bearer <token>`；凭证不放在 URL，也不写入公开战报。没有登录账户，持有随机访客凭证即拥有该场单人对局；不可作为排位身份。

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

`snapshot` 为 `{matchId,revision,serverTime,paused,lastSequence,state}`；`state` 就是共享引擎可序列化状态。玩家固定控制阵营 `0`，AI 由服务端运行。`serverTime` 为 Unix 毫秒，用于显示同步；客户端不能提交时间、随机种子、胜负或分数。难度为 `easy`、`normal` 或 `hard`。

切路指令从 `sequence:1` 连续递增；成功后才推进客户端序号。相同序号和内容的最近 128 条成功指令可安全重试，不再重复切路；旧序号、跳号和内容冲突返回 409。重连先读 `lastSequence`。省略 `routeIndex` 表示循环至下一条路。服务器校验归属、路线范围和 0.2 秒模拟时间冷却；无权操作返回 403，冷却返回 429。暂停、继续、放弃可重复调用；终局不能继续。

客户端建议每秒获取 4 次快照，收到快照后绘制，无权自行推进服务端结果。暂停时引擎不推进，恢复不会补算暂停期间时间。游戏切到后台可发送暂停，网络中断时服务仍继续模拟直到闲置到期，因此恢复时应先获取最新快照。

## 生命周期与边界

服务按 100 ms 固定步长运行，种子由系统加密随机源产生，结果与本地共享引擎一致。每个调度轮次每场最多补算 50 步，剩余时间排队，避免单次长时间阻塞。对局连续 5 分钟没有成功鉴权访问或创建满 20 分钟会以 `expired` 失败结束。正常对局上限由共享关卡规则决定。暂停也受闲置与总时长限制。

终局先写临时文件并 fsync，再原子改名、同步目录。战报保留最多 7 天、1000 条，超额移除最早战报；每分钟清理过期记录。只保存凭证的 SHA-256 摘要，不保存明文。内存终局最多保留 10 分钟，容量不足时可提前回收已持久化的终局，战报接口仍可读取磁盘恢复的记录。磁盘写入失败时明确返回 `persisted:false`，不会伪称已保存；此时结果只暂存内存，需修复磁盘，当前版本没有自动重试补交。

活跃对局只在单进程内存，进程重启即中断，无法恢复快照；已保存战报可用原 `matchId` 与凭证继续查询。访客凭证丢失后无法找回，也没有跨设备账号恢复。请勿让两个进程共享同一个目录；多实例路由、共享持久化和恢复快照尚未实现。

单请求体最多 2 KiB、请求头 8 KiB；单连接超时 5 秒，最多 256 连接。每个直连 IP 每分钟最多 600 请求、12 次建局，来源计数表最多 2048 项，不信任客户端 `X-Forwarded-For`。反向代理部署需在入口另设分用户/IP 速率限制，否则多个玩家共享代理 IP 配额。本版本没有公开匹配、好友房间、付费、账户、排行榜或反作弊身份认证。

后续 PVP 将单独增加房间与席位领域：房间负责加入、准备、断线和成员权限；对局负责固定步长模拟、指令顺序和裁定。继续复用当前引擎与指令形状，将服务端席位映射为阵营；不要把房间生命周期或网络逻辑放入游戏规则。单人暂停权限不能沿用到多人比赛。

## 验证

```sh
pnpm --filter @coffeeeeffoc/tianxia-server build
pnpm --filter @coffeeeeffoc/tianxia-server test
pnpm --filter @coffeeeeffoc/tianxia-server test:browser
pnpm --filter @coffeeeeffoc/tianxia-server smoke
```

`build`/`typecheck` 检查 JavaScript 语法及共享引擎导入，不是 TypeScript 类型检查。测试通过真实 HTTP 覆盖凭证隔离、种子/分数注入拒绝、归属/冷却/幂等、固定步长与共享引擎等价、暂停恢复、终局计算、重启读取、过期容量、来源/请求体/速率限制、静态目录约束、存储保留与写盘失败。`smoke` 在临时端口走通建局至持久化战报，不使用或留下生产数据。

`test:browser` 自动构建正式客户端，以 Chromium 390 × 844 触屏模拟访问真实临时 HTTP 服务，覆盖连接检查、建局、改道、暂停与恢复、建局/恢复期间切后台、断线后的终局恢复和暂停过期说明。结果记录到客户端 `docs/design/server-browser-report.json`；测试使用临时战报目录与可控服务时钟，结束后清理。后台事件为确定性模拟，不代表真机或操作系统挂起验证。
