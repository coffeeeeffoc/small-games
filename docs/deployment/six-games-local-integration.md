# 六款游戏本地与临时公网联调

核验日期：2026-09-23。Windows / PowerShell，仓库根目录。只用于开发测试；本轮实际后端使用隔离 `competition_test` 数据库。正式资源见 [阿里云准备清单](aliyun-preparation-checklist.md)，逐游戏验收见 [实施记录](../plans/2026-09-23-six-games-online.md)。

## 正常启动路径

要求 Node 24、pnpm 8、已启动的 Docker Desktop。沿用仓库 PostgreSQL 17 Compose；Cocos 构建需要现有 Creator 3.8.8 与 B站构建扩展，不能用空目录替代。

```powershell
pnpm install --frozen-lockfile
pnpm competition:up
pnpm competition:test-db
pnpm --filter @coffeeeeffoc/runtime-api... build
pnpm build:pages
$env:RUNTIME_DATABASE_URL = 'postgres://runtime_app:local-runtime-only@127.0.0.1:15432/competition_test'
pnpm competition:dev
```

`competition:up` 只启动数据库并执行幂等010迁移，首次数据库由既有001初始化角色。`competition:test-db` 创建隔离测试库并迁移。既有 `pnpm infra:up` 迁移列表也已包含010。游戏运行不必启动管理服务、Studio 或 Workspace Agent。

开发网关 `http://127.0.0.1:43010/`，独立游戏 `/games/<gameId>/`；HTTP API `/api/competition/v1/`，WebSocket `/kart`。网关只绑定 loopback；runtime 43002、kart 43003、数据库 15432 不经隧道公开。网关注入当前 origin 对应的 API/WSS，Shell iframe 和独立页用同一个业务入口。离线静态 Pages 没有后端时会明确报不可用，不回退为假全站榜。

开发服务器 Ctrl+C 停止三个子进程。`pnpm competition:stop` 仅停止 Compose PostgreSQL，不删除卷。检查命令：

```powershell
Invoke-RestMethod http://127.0.0.1:43010/health
Invoke-RestMethod http://127.0.0.1:43002/health
docker compose -f infra/docker/compose.yaml ps
```

本机 Docker 启动恢复后资源占用较高，本轮实际联调使用现有 WSL Ubuntu 中 PostgreSQL 12.22，端口5432，迁移到独立测试库；这是临时开发替代，**不作为正式版本建议**。WSL 启动/迁移命令是 `wsl -d Ubuntu -u root -- service postgresql start` 和 `wsl -d Ubuntu -u postgres -- psql -v ON_ERROR_STOP=1 -d <数据库名> -f /mnt/f/playground/playground-ai/small-games/infra/migrations/010-competition.sql`。新机器仍优先上述 Compose 17 路径，外部数据库先由管理员执行001与010、配置独立角色；不要复制本机测试密码到生产。

停止当前WSL测试数据库使用 `wsl -d Ubuntu -u root -- service postgresql stop`；`competition:stop` 只管理Compose，不会停止WSL服务。先结束比赛、停止业务进程和隧道，再停止数据库。

## 双客户端与可信排名检查

```powershell
$env:COMPETITION_TEST_DATABASE_URL = $env:RUNTIME_DATABASE_URL
node scripts/competition.integration.mjs
node scripts/review-competition-cops-letters.mjs
$env:REVIEW_EDGES = '1'
$env:REVIEW_LAYOUT_ASSERT = '1'
node scripts/review-competition-realtime-history.mjs
node scripts/review-competition-kart-chess.mjs
$env:KART_URL = 'http://127.0.0.1:43010/games/carding-car/'
node games/local/carding-car/tests/ranked.mjs
```

这些脚本会产生开发身份/比赛，因此只对隔离库运行。数据库脚本强制库名 `competition_test`；102人固定成绩仅写专用 `test-UUID` 榜，不进入实际游戏主榜。浏览器脚本使用两个独立 context，点真实 Canvas/DOM 操作，不靠客户端提交成绩。棋类额外脚本 `node games/submodules/xiangqi-five/online-check.mjs` 验证两轮、同对当日不重复加分。围捕小队初始直接专注，先“返回大厅”找到PK入口；词屿练习中先“暂停/返回”。

原始证据保存在忽略的 `outputs/`、`.scratch/competition/`、各游戏 `reports/` 或 `.turbo/`；仓库中的独立评审保留复现、命令和结论。生成的 token、临时域名、用户输入截图不提交。

## 临时公网隧道

本轮使用官方 cloudflared Quick Tunnel，二进制与日志保存在忽略目录。它只代理43010：

```powershell
.\.scratch\competition\tools\cloudflared.exe tunnel --url http://127.0.0.1:43010 --no-autoupdate
```

从工具输出取得本次 HTTPS 地址，放入当前 PowerShell 的 `$env:COMPETITION_ORIGINS`，停止并重新运行 `pnpm competition:dev`。不要把地址填入受版本控制文件。新入口的H5无需重新构建：网关动态注入API和`wss://<当前host>/kart`。原生制品则必须更新忽略的release配置/API与WSS环境变量后重新构建，并在开发工具刷新项目。

公网重复上述浏览器检查时设置 `REVIEW_BASE=<HTTPS origin>`、`KART_URL=<HTTPS origin>/games/carding-car/`。象棋脚本使用 `XIANGQI_COMPETITION_URL=<HTTPS origin>/games/xiangqi-five/`。检查首页、JS/CSS/场景图片、真实API、WSS对局；仅HTTP200不足以验收联机。不同隧道域名要同步 `COMPETITION_ORIGINS`，否则后端及kart会拒绝Origin。

隧道终端 Ctrl+C 即停止；也可查明该忽略路径对应的 cloudflared PID 后停止。Quick Tunnel 地址随机、进程退出或连接失效后可能变化，无稳定性保障；本轮实测暂停隧道传输30秒后的超时反馈和同房恢复。它不代替正式备案、HTTPS证书和各小游戏后台合法域名配置。[Cloudflare 官方说明](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)，核验2026-09-23。

## 原生配置与构建

五款Canvas目标使用 `platforms/competition/release-config.example.json`，复制到被忽略的 `.scratch/competition/release-config.local.json`，按游戏/平台填真实AppID及API地址。API可指向本地网关或当前隧道。微信/B站代码只调用各自真实SDK登录，后端没有对应密钥时明确失败，不切换为游客模拟登录。

```powershell
$env:COMPETITION_RELEASE_CONFIG = "$PWD/.scratch/competition/release-config.local.json"
pnpm competition:native
pnpm --filter @coffeeeeffoc/carding-car build:wechat
pnpm --filter @coffeeeeffoc/carding-car build:bilibili
```

前十个目标在 `apps/shell-minigame/dist/<wechat|bilibili>/<gameId>/`。卡丁使用既有 `games/local/carding-car/release-config.local.json` 的 `wechatAppId`、`bilibiliAppId`、`competitionApiUrl`、`multiplayerServerUrl`；也可用 `WECHAT_APP_ID`、`BILIBILI_APP_ID`、`COMPETITION_PUBLIC_API_URL`、`KART_SERVER_URL` 注入。输出分别为 `games/local/carding-car/build/wechatgame/` 和 `games/local/carding-car/build/biligame/`。导入各目录的 `project.config.json`，不得用合集入口替代。

服务端 `COMPETITION_PLATFORM_CONFIG` 是 `{platform,appId,secret}` 对象数组，由安全环境注入；最多12个独立应用，openid按平台和AppID隔离。AppSecret只交给服务器Secret Store，客户端release文件只含公开AppID与地址。当前没有跨平台绑定或跨设备游客恢复；同昵称不是同身份。H5已验证H5互配；原生与H5协议兼容，实际跨平台配对待有效AppID/登录密钥与开发工具验收。

开发工具本地网络可按官方能力关闭域名校验做开发连接；这不是体验版或真机正式域名验收。`localhost`在手机指手机本身；手机需要合法公网地址。12目标具体工具结果见 [原生目标记录](native-target-validation.md)。

## 备份、恢复与常见故障

迁移使用owner，运行使用runtime_app。生产用受限 `PGSERVICEFILE` / Secret Store，示例 `pg_dump --dbname=service=game_backup -Fc -f <离机备份路径>`；恢复到**新库**用 `pg_restore --exit-on-error --dbname=service=game_restore <备份文件>`。先核对目标、备份哈希和角色，再用只读查询/独立比赛验证会话、成绩和最佳；不覆盖正在服务的库。每日备份+规则/制品版本，定期恢复演练。卡丁未送达的结果在 `KART_OUTBOX_DIR` 持久队列重试，该目录也要保留；实时内存房间随kart重启中断，已经结算的成绩不丢。

本轮真实 `pg_dump -Fc` 与新库 `pg_restore` 通过，恢复包含合法卡丁纪录和HTTP游戏结果；测试备份存WSL `/tmp`，只用于演练，不具有离机可靠性。正式备份必须另存故障域并设保留期。

另于2026-09-23 02:12–02:14实际执行WSL PostgreSQL集群重启并重启三个业务/网关进程；重启前后两游客会话、已完成比赛的两条结果、个人最佳/排名、卡丁全榜逐项比较一致。数据库暂不可用时接口返回503，恢复后 `/health` 明确返回database/competition为ok。卡丁实时内存房间不恢复，已完成成绩不受影响。

- 503/健康降级：检查PostgreSQL及010迁移；没有连通时不显示虚构排名。
- 403 Origin：把实际origin加入开发 `COMPETITION_ORIGINS` 后重启，两端API/WS用同host。
- 平台登录未配置：核对游戏、平台、AppID三项及服务端密钥；不要把secret发到聊天。
- 卡丁“联机尚未配置”：检查实际页面注入的WSS/原生release配置与最新build-info sourceHash，确认访问当前构建。
- 房间错误游戏/已满/过期：服务端拒绝且不占新座；生成新的邀请。断线后原浏览器会恢复已保存身份/房间，超过比赛时限按服务端结束。
- 单独游戏build会重写dist：随后运行 `pnpm competition:build`，或统一 `pnpm build:pages` 自动接入共享PK。
- Windows原生工具占用输出目录：沿卡丁已有clearOutput保留目录；不要递归删除整个工作区或已打开项目根。
