# 此时此地 · 挑战服务

这是独立的 Node.js 24 API 服务，使用内置 `node:sqlite`，无需安装运行时 npm 依赖。服务端负责计时、发题、判分、好友挑战和榜单；只返回评分，不返回正确年份、坐标或答案解析。默认只启动 API；配置 `HISTORY_STATIC_DIR` 后，也可在同一端口托管已构建的前端。

本目录提供后端预实现及部署配置，**不代表生产环境已经上线**。已实际验证 Docker 镜像构建、非 root 只读容器启动、健康检查及容器重启/重建后的账号与成绩恢复，见 [容器验证记录](../docs/design/mobile-pk-2026-10-09/container-verification.json)。上线仍需真实 HTTPS 域名、可信身份服务和持续更新的私有题库；公网部署和生产压测未执行。

## 本地启动

以下命令从游戏目录 `games/local/vibeJam-myself-history-guess/` 执行：

```sh
node --version
cp server/.env.example server/.env
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex') + '\n')"
```

要求 Node.js 24。将生成的随机值填入本机 `server/.env` 的 `HISTORY_IDENTITY_SECRET`；不要提交 `.env`、数据库或密钥。将 `HISTORY_ALLOWED_ORIGINS` 改成实际页面 origin；本机调试可用 `http://localhost:4175`。

```sh
node --env-file=server/.env server/index.mjs
```

使用默认的同源 API 路径 `/api/history`。独立开发前端需要将该路径反代到 `http://127.0.0.1:4185`，或在前端构建/启动时设置 `VITE_HISTORY_API_URL=http://localhost:4185/api/history`，同时允许页面的准确 origin。浏览器中的 `VITE_*` 配置都是公开值，绝不能放入身份签名密钥。

最小连通性检查：

```sh
curl --fail-with-body http://127.0.0.1:4185/api/history/health
curl --fail-with-body http://127.0.0.1:4185/api/history/sessions \
  -H 'Content-Type: application/json' \
  --data '{"nickname":"时空旅人"}'
```

健康接口返回 `ok`、`service`、`version`、`rankedAvailable`、`roundSeconds` 与 `competitionTimeZone`；其中 `rankedAvailable` 只表示已配置身份密钥，不代表真实登录接入已经验收。第二个调用创建访客会话；访客可练习、发起及接受好友 PK。没有可信身份的访客不能提交全站每日竞赛成绩。返回的会话 token 也是凭证，勿写入访问日志、截图或公开问题单。

## 配置

| 变量 | 默认值 / 配置要求 |
| --- | --- |
| `NODE_ENV` | 生产设置 `production` |
| `HOST` / `PORT` | `0.0.0.0` / `4185` |
| `HISTORY_PORT` | `PORT` 未设置时的兼容端口配置，`PORT` 优先 |
| `HISTORY_DB_PATH` | `./server/data/history.sqlite`，运行用户须可写父目录 |
| `HISTORY_QUESTION_DIR` | `./server/private/questions`，只读私有 JSON 题库目录 |
| `HISTORY_ASSET_DIR` | `./public`，私有题库图片路径的解析根目录 |
| `HISTORY_STATIC_DIR` | 可选的前端 `dist` 绝对目录；不设置则仅提供 API |
| `HISTORY_IDENTITY_SECRET` | 可信身份签名密钥，至少 32 字节的随机熵；仅身份服务及此 API 持有 |
| `HISTORY_ALLOWED_ORIGINS` | 逗号分隔的准确 origin，如 `https://history.example.com`，不带路径 |
| `HISTORY_COMPETITION_TIMEZONE` | `Asia/Shanghai`；所有节点、身份接入与产品规则保持一致 |
| `HISTORY_TRUST_PROXY` | 默认 `0`；仅在 API 只接受可信网关连接且网关覆盖 `X-Real-IP` 时设为 `1` |
| `HISTORY_PUBLIC_PORT` | Compose 的宿主绑定端口，默认 `4185`；不改变容器内端口 |

普通 Node 启动时的相对目录均相对于工作目录。Compose 将数据、题库和图片目录统一设置为容器内绝对路径，不使用 `.env` 中的本机相对目录。

## Docker 与 HTTPS 反代

先完成 `.env` 配置，并确保题库与图片文件对容器的非 root 用户可读。以下命令仍从游戏目录执行：

```sh
docker compose --env-file server/.env -f server/compose.yaml up --build -d
docker compose --env-file server/.env -f server/compose.yaml logs --tail=100 history-api
```

Compose 将端口只绑定到宿主 `127.0.0.1`，供同机反向代理接入；SQLite 存入 `history-data` 命名卷，题库和图片目录只读挂载。仅运行一个 API 实例，不要将 SQLite 文件放在共享网络盘上，也不要用多个副本同时争用这份数据库。需要横向扩展时先迁移数据库及身份、防重放和对局一致性控制。

镜像只包含服务端 `.mjs` 运行模块与 `.sql` schema，不包含密钥、数据库、题库或前端成品。生产私有图片可挂载独立资源目录代替 `../public`。发布容器镜像时使用不可变 tag 或 digest，并保留上一版本以便回滚。

如需 API 同端口托管前端，先运行游戏的生产构建，再启用 Compose 中注释的 `HISTORY_STATIC_DIR: /app/dist` 和 `../dist:/app/dist:ro` 挂载；HTTPS 代理可将所有路径转发到该服务。静态文件仅从该目录内读取，非 API 路径支持 SPA 入口回退。普通 Node 方式则将 `HISTORY_STATIC_DIR` 设为实际 `dist` 绝对路径。

Nginx 示例中的域名、证书和前端成品目录均需替换。保留完整 API 路径，不要在 `proxy_pass` 后增加会删除 `/api/history/` 前缀的路径：

```nginx
server {
    listen 443 ssl;
    server_name history.example.com;
    ssl_certificate /etc/letsencrypt/live/history.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/history.example.com/privkey.pem;

    root /srv/here-and-then/dist;
    location ^~ /api/history/ {
        proxy_pass http://127.0.0.1:4185;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        add_header Cache-Control "no-store" always;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

静态站点根目录只能指向前端构建产物 `dist/`，不能指向仓库、游戏源码或 `server/`。不得将 `server/private/`、SQLite 数据、环境文件或包含答案的源码场景 JSON 上传到静态 CDN。API 图片通过不含题目答案的标识访问，不应另开目录浏览或原始文件名接口。CORS 只约束浏览器请求，不替代认证、速率限制或题库保密。

采用上述可信反代时设置 `HISTORY_TRUST_PROXY=1`，并确保 API 端口不能被公网直接访问。服务仅在此显式开关打开后使用网关覆盖的 `X-Real-IP`；不会默认相信客户端提供的代理头。访客会话创建按地址限速，已验证会话按账号限速。生产网关还应设置连接、请求体和速率限制；不配置可信代理时，同一代理后面的新访客会共享该代理地址的会话额度。

## 接入可信身份

身份服务完成真实登录后，在自己的后端生成短时签名凭证，传给页面用于 `POST /api/history/sessions` 的 `identity` 字段。现有前端在创建会话时读取 `window.HISTORY_IDENTITY`，应由宿主在游戏脚本启动前提供新鲜凭证；不能把真实签名密钥或固定可重复使用的凭证写进前端构建。已建立访客会话后切换账号时，宿主还需刷新游戏会话，不能继续沿用旧访客 token。

凭证格式为 `base64url(JSON).base64url(HMAC-SHA256(secret, 第一段字符串))`，不是 JWT。载荷必须包含 `sub`、`nickname`、`exp`、`nonce`、`aud: 'here-and-then'`；`exp` 使用 Unix 秒，必须尚未过期且不超过服务端当前时间后 300 秒，`nonce` 只能兑换一次。

可信身份服务的签发示例：

```js
import { createHmac, randomUUID } from 'node:crypto';

// authenticatedUser 来自已经验证的登录态，不接受客户端自报账号 ID。
function issueHistoryIdentity(authenticatedUser, secret) {
  const payload = Buffer.from(JSON.stringify({
    sub: String(authenticatedUser.id),
    nickname: authenticatedUser.nickname,
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: randomUUID(),
    aud: 'here-and-then',
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
```

身份服务与 API 应同步系统时钟。一次性身份凭证兑换为游戏会话后，后续 API 使用会话 token。每次重新兑换都须签发新的凭证；前端不应自动重用已经消费的 `nonce`。更换共享密钥时协调两个服务，短时凭证会随旧密钥失效。

## 竞赛规则与题库运营

每日正式赛每个可信账号限一场，每场 5 题，每题 25 秒，由服务器收到完整请求体的时间决定是否接受提交，切后台或断线不暂停。整局最多保留 30 分钟；正式赛还须在竞赛日结束前完成，接受好友邀请的对局也不能超过邀请截止时间。到期后未完成题目全部记零，已经提交的评分保留；排行榜查询统一结算到期正式场，不能跨日补作答或重抽。周榜以配置时区的周一为起点，按本周最高 5 个每日成绩相加，同分同名次；长期成长和练习关卡最佳分不叠加到正式周榜，避免时间投入直接决定排名。好友挑战必须由发起者完成 5 题后生成邀请，邀请有效期为 24 小时，双方面对同一冻结题组。

好友邀请每个游戏身份只保留一次对局，重复接受返回同一进度。访客身份由会话维持，清除存储或换设备会成为新访客，因此访客 PK 不能承担奖品、正式胜场榜或成长积分的可信依据；如需这些用途，应要求双方使用可信账号。

`server/private/questions/*.json` 是服务端题库，字段包括 `id`、`year`、`lat`、`lng`、`tolerance`、`clue`、`image`、`view`、`region`、`difficulty`，可用 `categories` 描述类别。`region` 为 `china` 或 `world`，难度为 `1` 至 `3`；每组按 `1, 1, 2, 2, 3` 难度蓝图选题，因此每个启用范围应至少有 2 道难度 1、2 道难度 2 和 1 道难度 3 的可用题。图片路径相对于 `HISTORY_ASSET_DIR`，不能引用目录外的文件。

新建对局时重新读取、校验题库，已有对局使用冻结内容；图片按内容哈希冻结到 SQLite BLOB，资源更新不会改变已经发起的好友挑战。运营换题应先在临时目录校验整批 JSON 及图片，再以完整版本切换；不要让在线服务读到写入一半的 JSON。容器使用目录绑定挂载时替换目录后应重建容器，使其重新挂载新版本。图片快照也占用数据库空间，应计入容量监控及备份大小。

初始 28 道种子题仅适合开发与试运营，图片和背景知识可被识别，有限时及隐藏答案也无法阻止玩家记忆或协作。正式运营应使用独立的新美术题、扩大不同地区及难度的题池、定期换题，并观察异常重复高分。不要把公开练习素材当作长期保密题库；分享只带邀请和成绩，不附正确时间、地点或原始题目 ID。

种子题的难度是人工初分，不是经过用户样本校准的统计难度。正式开放排行榜前应观察每题得分分布与曝光次数，校准相同难度槽位；图像自身应去除 EXIF/XMP、文本元数据、水印及答案文件名，并从私有素材目录提供。当前 28 张 WebP 已检查，无 EXIF/XMP 文本块。

## HTTP 契约

前缀为 `/api/history`。除健康检查、建立会话、读取邀请和公开榜单外，请求都需要 `Authorization: Bearer <token>`。写请求使用 `Content-Type: application/json`。所有响应禁止缓存。

| 方法与路径 | 请求体 / 返回 |
| --- | --- |
| `GET /health` | 配置与服务状态，不包含环境变量或密钥 |
| `POST /sessions` | `{nickname?, identity?}` → `{token, player, expiresAt}` |
| `GET /me` | `{player, activeRun: run 或 null, daily:{date,played,runId}, serverNow}` |
| `PATCH /me` | `{nickname}` → `{player, serverNow}` |
| `POST /runs` | `{mode:'practice'或'daily'或'duel', chapter?, level?}` → `{run}`；练习带 `level` 为 3 题，其他为 5 题；`chapter` 可按 `china`/`world` 筛选练习 |
| `GET /runs/:id` | 自己的 `{run}`；恢复时立即应用超时规则 |
| `POST /runs/:id/answers` | `{roundId, year, point:{lat,lng}, requestId}` → `{run}`；`requestId` 为 8–100 位字母、数字、`_`、`-`；只接受当前题，已提交题重试返回现有结果 |
| `POST /runs/:id/next` | `{roundId}` → `{run}`；必须传上一题编号，重复请求不会跳过下一题 |
| `POST /runs/:id/invite` | `{}` → `{invite,serverNow}`；仅自己发起且完成的 5 题好友局可生成邀请 |
| `GET /invites/:code` | `{invite,serverNow}`；可带认证获得自己的参赛状态 |
| `POST /invites/:code/join` | `{}` → `{run,invite}`；题组由邀请冻结内容决定，重复请求恢复同一局 |
| `GET /leaderboard?period=week` | `period` 为 `week` 或 `day`；返回 `{period,startsAt,endsAt,timeZone,entries,self,serverNow}` |

`player` 为 `{id,nickname,rankedEligible}`。`run` 为 `{id,mode,phase,index,total,score,expiresAt,round,results,opponent,serverNow}`，`index` 从 0 开始，`phase` 为 `guessing`、`revealed` 或 `finished`。受邀好友局的 `opponent` 为发起者的 `{nickname,score}`，其他对局为 `null`，刷新和续局仍保留对手比较信息。最后一题提交后直接 `finished`，不再调用下一题。`round` 只有 `{id,image,clue,view,expiresAt}`；完成后为 `null`，从不返回未来题目。图片地址是相对于 API 源站的匿名随机短时 ticket，不含题库 ID 或素材文件名；跨域部署时按 API origin 解析。

`results` 仅有 `{roundId,score,timeScore,placeScore,timedOut}`，不回显猜测、标准答案或误差；每题总分 5000，年代和地点各 2500，评分按 50 分离散。`invite` 为 `{code,expiresAt,host:{nickname,score},total,ownRunId,ownScore,challengers}`；只有带发起者会话时才返回最近 100 条 `{nickname,score,finishedAt}` 挑战结果，其他人看到的 `challengers` 为空数组。榜单 `entries` 最多 100 条，行格式 `{rank,playerId,nickname,score,days}`，`self` 为当前账号的同格式数据或 `null`，空榜单保持空数组。`startsAt`、`endsAt` 是竞赛时区中的日期，结束日期不包含在内；其他时间均为 Unix 毫秒。

失败响应为 `{error:{code,message,details?}}`。主要错误包括 `AUTH_REQUIRED` (401)、`INVALID_IDENTITY`/`IDENTITY_REPLAYED` (401)、`IDENTITY_REQUIRED` (403)、`DAILY_USED` (409，`details.runId` 指向当天已开局)、`ROUND_NOT_ACTIVE` (409)、`REQUEST_ID_REUSED` (409)、`INVITE_NOT_READY` (409)、`OWN_INVITE` (409)、`INVITE_EXPIRED` (410)、`RATE_LIMITED` (429) 和 `IDENTITY_UNAVAILABLE` (503)。出错不自动降级成正式比赛成功。

## 数据备份与恢复

SQLite 必须存储在持久卷中。`docker compose down` 会保留命名卷；`down -v` 会删除成绩、账号、邀请和对局数据，不能当作普通重启命令。部署前记录实际卷名及数据库位置；换版本前先备份，保留题库和图片版本，恢复时使用相匹配的代码版本。

在线备份可用 Node.js 24 的 `DatabaseSync` 打开当前数据库后执行 `VACUUM INTO`，目标必须是不存在的新文件。例如下面的命令在容器持久卷内生成快照：

```sh
docker compose --env-file server/.env -f server/compose.yaml exec -T history-api \
  node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(process.env.HISTORY_DB_PATH); const out = "/app/server/data/backup-" + Date.now() + ".sqlite"; db.prepare("VACUUM INTO ?").run(out); db.close(); console.log(out);'
```

用 `docker compose cp history-api:/app/server/data/<输出文件名> <备份目录>/` 复制快照到卷外，并定期保存到另一存储位置；使用 Compose 时继续带上相同的 `--env-file` 和 `-f` 参数。不要把备份公开下载。也可停机后复制完整数据库目录；不要在服务写入时仅复制 `.sqlite` 而遗漏 WAL 文件。

恢复时停止服务，保留损坏现场，将已验证的完整快照置入数据卷，并确保运行用户有读写权限。恢复独立快照时移走旧的同名 `-wal`、`-shm` 文件，避免把旧日志与新数据库混用。先在隔离环境执行 `PRAGMA integrity_check`、会话及榜单抽查，再重启实际服务。备份只有完成恢复演练后才算验证。

## 上线验收范围

部署者需验证实际 HTTPS 页面到 API 的调用、可信账号每日限次、跨日及跨周时区边界、好友邀请过期、25 秒超时、只返回评分、图片与题库不能越权访问，以及数据库备份恢复。还需配置进程及磁盘监控、网关速率限制、定期数据保留策略与数据库容量预警。此文档不替代生产压测、真实身份接入或公网部署验收。
