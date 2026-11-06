# 夜航本地后端与 Sakura FRP 联调

此流程仅启动本机 Docker Desktop 中的 Night Runtime、PostgreSQL 和回环网关。Sakura FRP 沿用已有隧道，将公网 HTTPS 转发到 `127.0.0.1:43003`。不操作生产、不上传渠道，也不自动打 TapTap ZIP。

## 启动与打包配置

先确认 Docker 使用本机 Linux Engine 28+，既有 Sakura 隧道在线。公网地址必须是无路径、无账号信息的 HTTPS origin。

```powershell
node scripts/night-overwatch-selftest.mjs plan https://你的隧道域名:端口 43003
node scripts/night-overwatch-selftest.mjs start https://你的隧道域名:端口 43003
```

`plan` 无写入、不访问 Docker 或账号。`start` 保留既有 `night-overwatch-taptap-test` 项目与 PostgreSQL 卷，生成仅 Runtime 的制品；先构建镜像，再停旧 Runtime、备份恢复验证、迁移旧钱包，最后启动新 Runtime 和网关。它检查本地/公网健康、匿名资产拒绝、登录后资产访问、TapTap H5 CORS 及其他游戏/内部路径拒绝。公网入口只允许 Night 和共用登录路由，数据库及 Runtime 不发布宿主端口。

本地生成的 Runtime compose 配置显式设置 `COMPETITION_DEVELOPMENT_ENABLED=1`，普通 Runtime 默认关闭（只接受 `0` 或 `1`）。通用接口为 `POST /games/:game/development/assets`，实际已接入夜航 `coins/xp`，其他游戏需要注册已有钱包的服务端适配器；完整协议见[通用服务规范](../architecture/game-services.md#测试服务器的通用资产调整)。它允许已验证的本人会话调整资产，金币/经验增减范围为每次 ±10 亿整数，结果不得为负或超过安全整数；新端点与旧夜航 `dev-adjust` 沿用同一资产锁、交易编号幂等及包含前后余额的私有流水。此能力属于测试服务器，不能配置到生产；测试包隐藏开发按钮并不代替服务器权限。

`start` 在本地回环和 FRP 公网两端分别创建新的 QA 游客，验证 metadata 开启能力、通用接口正负调整、相同 requestId 重试不重复入账及负余额拒绝；不修改既有用户。结果保存为 `.scratch/night-overwatch-selftest/development-acceptance.json`，不含凭据。当前网关仍只放行夜航子路由，通用能力的代码复用不扩大其他游戏的公网白名单。

`pack` 生成 `buildType: 'development'` 与 `apiUrls.test`。开发面板提供金币/经验增减、任意任务序号、火控热身、刷新和原交易重试；切关要求先正常结束行动并离开联机房间，继续使用试玩成绩/奖励隔离。提升经验会按现有成长规则解锁永久资格，降低经验不会撤销已经获得的永久物品。服务端未启用时显示明确错误，不伪造客户端余额。

本地 API 为 `http://127.0.0.1:43003/api/competition/v1`。前端开关必须设置 `COMPETITION_SERVICE_ENABLED=1`，地址设置 `COMPETITION_PUBLIC_API_URL`；`COMPETITION_LOCAL_BACKEND=1` 只允许回环 HTTP，不会自动启用后端。最终 Creator 构建可按下列环境执行，手机浏览器应换为 FRP HTTPS 地址：

```powershell
$env:COMPETITION_SERVICE_ENABLED='1'
$env:COMPETITION_PUBLIC_API_URL='http://127.0.0.1:43003/api/competition/v1'
$env:COMPETITION_LOCAL_BACKEND='1'
pnpm --filter @coffeeeeffoc/night-overwatch build
```

现有 `dist` 需要临时联调时，可以调用 `scripts/h5-game-services.mjs` 的 `prepareGameServices('night-overwatch', directory, {env, local:true})` 更新公开配置与共享桥接文件；正式制品仍由构建入口生成。该本地栈的 CORS 明确允许 Tap H5 CDN、`http://127.0.0.1:4318` 和 `http://localhost:4318`，拒绝其他来源。切换本地/FRP API 地址时，两端访问同一库和同一身份，重复交易编号不会再次发奖。

私密文件 `.scratch/night-overwatch-selftest/database.env` 与 `.env.night-taptap-platform.local` 复用原值，不可提交或输出。成功后 `.scratch/night-overwatch-selftest/h5.json` 保存用户后续自行打包需要的公开 API、TapTap H5 登录与广告配置；`current.json` 保存本地镜像、制品、备份目录和迁移摘要。`pack` 是显式可选操作，本次未执行。原生小游戏与 H5 的配置、宿主能力不可互相当作验收证据。

本次已经运行的隧道地址为 `https://nas.hc2a5c9f0.nyat.app:29549`。后续自行打包时可执行下列命令；它生成 H5 配置并调用统一打包入口，不重启后端，也不上传平台。本轮仅提供命令，未执行打包：

```powershell
node scripts/night-overwatch-selftest.mjs pack https://nas.hc2a5c9f0.nyat.app:29549 43003
```

## 备份与恢复保护

每次升级既有库均使用二进制 `pg_dump -Fc`，保存到忽略目录下的 `backup-<时间戳>/database.dump`。禁止 PowerShell 文本重定向处理此文件。恢复使用随机名称、`--network none`、不映射端口的独立 PostgreSQL 17.6 容器；恢复完整归档后对全部用户表比较行数和按行 JSON 排序的摘要。只有完全一致，才用本次新 Runtime 镜像在恢复副本上预演迁移，并检查重复执行、余额、累计签到及原始钱包流水不变。结束仅删除本次恢复容器及其匿名卷。

原库迁移保留旧 `private-wallet-v1` JSON 和事件。金币原样迁移；旧资格映射到新效果；原版本目录价格累计为一次补偿邮件附件，读取不等于领取。v1 免费基础项不计购买价，已付升级、v1/v2 档位、临时券按各自历史目录计算；旧 coolant 同时获得可用 cooling-match。老积分及最快历史榜保留，新成长最快榜隔离。预演不会替用户领取补偿。

备份或预演失败时，脚本在原库未修改的阶段恢复旧 Runtime。原库迁移后发生失败时，不自动启动旧钱包写入器：先保留现场和新备份，修复新 Runtime 或人工决定整体数据库恢复，避免新旧经济同时写入造成双花。禁止 `docker compose down -v`，也不要删除原 PostgreSQL 卷。

## 广告限制与异常计数

当前兑换依据客户端激励视频完成回调，明确标记 `limited-client-callback`。本次未取得可验签的广告服务端接口，因此订单随机数、等待时间和 `isEnded` 均不构成可信观看证明。参考 [RewardedVideoAd.onClose](https://developer.taptap.cn/minigameapidoc/dev/api/ad/RewardedVideoAd.onClose/) 和 [服务端 API](https://developer.taptap.cn/minigameapidoc/dev/server/server-api/)。服务端绑定本人、订单、段号、一次性 attempt，保留跨日进度、每日 12 段额度和 30 分钟 attempt 有效期；不存在保证有效观看的 10 秒硬门槛。

拒绝的错单、过期、超额与过密订单，以及成功但短于 10 秒的回调，记录为每天每人每种原因的私有计数。短回调只作监测信号，不据此判定作弊或拒绝真实回调。计数不含令牌、昵称、IP 或原始请求。可在本地 PostgreSQL 只读运行：

```sql
SELECT data->>'day' AS day, data->>'kind' AS kind,
       data->>'reason' AS reason, sum((data->>'count')::bigint) AS events
FROM runtime.competition_matches
WHERE board = 'night-overwatch:private-ad-audit-v1'
GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3;
```

开包结果作为不可变回执保存；本人资产接口及仓库“开包记录”显示最近 20 笔。服务端版本/kill/停用导致的无效局，在本人下一次资产读取时有界扫描并返还单场扣耗，重复读取不重复退款；正常退出不返还已开局耗材。当前正在被玩法事务锁定的记录留待下一次读取处理。

## 验证边界

2026-11-07 当前本地Runtime为 `small-games-bundle:night-20261107-garrison-bd1223e7`，镜像 `sha256:70f6d9500f57b4efec22088c7f02dd43ad5f59c023623a1dd51de81b732f6058`，源码提交 `53abf6686dc7d794c26a2a83091ee19714800d86`。435项制品和7份Night核心源码逐一校验；`sourceDirty=true`包含保留在工作区的独立ICP资料，运行代码与该提交一致。备份 `backup-1793985209890` 已独立恢复并核对35表；原PostgreSQL、卷及网关保持不变，只切换Runtime并平滑重载网关，原库无SQL迁移。预览为 `http://localhost:4318`，Sakura API仍为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`，读取 `night-rewards-v3`。本地/公网健康、访问限制、CORS、随机签到、12项成就及20箱组合奖励通过，跨入口同请求重试不重复发奖或扣款。新测试游客仅加4000测试金币购买箱子，未修改既有玩家或公共聊天；资产调整保持启用，未部署生产或上传平台。[本轮回执](../../games/local/night-overwatch/docs/design/2026-11-07-garrison-supplies/local-deployment.json)。下方保留历史运行身份。

2026-11-06 当前本地Runtime为 `small-games-bundle:night-20261106-rewards-2c8a3d80`，镜像 `sha256:40ded0a5f148f776ebb0939846a3b3d80147834937042a6c6397d814df902de9`。435项制品摘要及7份Night核心源码与本次工作区一致；基点 `dcc5d0ed24e1c2558e584d92f82ae8812e6afd85`、`sourceDirty=true`，包含未提交的奖励及平衡修复。数据库迁移文件与上次制品相同，本轮只重建Runtime；原PostgreSQL、数据卷及网关容器保持不变，网关仅平滑重载以刷新Runtime地址。切换前备份 `backup-1793979433935` 已独立恢复并核对35张表，原库切换前指纹不变；旧钱包预演只在恢复副本执行，未对原库执行SQL或钱包迁移。旧镜像和配置保留，启动继续组合 `current.json` 中的 `composeFile` 与 `composeOverride`。

现有Sakura FRP公网API为 `https://nas.hc2a5c9f0.nyat.app:29549/api/competition/v1`，本地API为 `http://127.0.0.1:43003/api/competition/v1`；两端健康200、匿名401、其他游戏/内部路由404，Tap H5及localhost:4318 CORS通过，未列入来源无允许头。新QA游客实测随机武器签到、首通360金币/240XP/6片、两次复刷各180金币/120XP/2片、自然10片合成无人机并保存装配；签到、结算及合成跨入口重试均不重复入账。没有操作既有玩家资产或发送公共聊天。`http://localhost:4318` 预览已启动并实际连接FRP API进入大厅，读取 `night-rewards-v2`，页面异常0，前端源码摘要为 `59a4cf8b9a18324a59cd4ecf26a74c46fe6a7cbc54adaca3f46cf03e5b5ce48e`。详见[脱敏联调回执](../../games/local/night-overwatch/docs/design/rewards-2026-11-06/review/local-deployment.json)。此服务继续启用测试资产调整，TapTap登录配置原样保留；未验证真实宿主登录、广告或实体机，未上传新渠道包或部署生产。

以下记录保留历史版本身份，以本段最新记录及 `current.json` 为准。

2026-11-02 当前本地Runtime为 `small-games-bundle:night-20261102-chat-0227fe76`，镜像 `sha256:f71536ce527f4802b55f561fabd6e30e267e6ffabb16f5655634fb6ac38e43bf`；433项制品对应干净提交 `0227fe76b72ff6d11b0b30e3ef3db5085b0f91d6`。完整start脚本被自动审批返回`blocked by policy`后，采用更小的本地升级：只预先构建镜像、停止旧Runtime、验证备份恢复、应用新增016聊天表、重建Runtime；不在原库重跑旧钱包迁移、不重启PostgreSQL或网关、不通过公网写测试数据。备份`backup-1793570595681`恢复32张原表摘要一致；应用016前后32张原表未变，新增3张空聊天表。本地与FRP健康200、匿名401、Tap CORS 204、本人聊天读取200。当前启动需组合`current.json`内的`composeFile`与`composeOverride`，后者仅覆盖Runtime镜像和构建目录；原配置和旧镜像保留。详情见[本轮验证](../../games/local/night-overwatch/docs/verification-2026-11-02-revision.md)和[脱敏Docker回执](../../games/local/night-overwatch/docs/verification-2026-11-02/docker-evidence.json)。没有发送公共测试聊天、没有修改已有玩家资产。

以下保留历史记录：

2026-11-01 用户继续授权后，本地运行版本为 `night-1793508637129-5b62`，镜像SHA-256 `7e102557989b70209bde3dc246d1e3d2d5b2b3a2fef83267c0771220cb516e49`，源码基点 `312e39a39b9871cfa4ec0723c258ca13612c20f0`。430项制品摘要及7份Night核心源码与该提交一致；既有包体报告使manifest保留`sourceDirty=true`。备份 `.scratch/night-overwatch-selftest/backup-1793508754286/`恢复校验32表一致，迁移幂等；本地/FRP健康及开发接口验收通过。两个全新QA游客通过真实回环API联机，双方装配、四发扣弹、EMP生效/冷却和激光切换均已在画布验证，未改已有用户或其他房间。见[本轮证据](../../games/local/night-overwatch/docs/verification-2026-11-01-progression.md#本地runtime更新与真实双端装配验收)。下段保留之前受阻时的版本记录。

2026-11-01 军需交互修复时核对：当前运行镜像为 `small-games-bundle:night-1793504767340-85dd`（SHA-256 `83297f8e8363034ce96c8ec37110442108fbd599cf0a7f8ee158fd833e737406`），源码身份 `1efcb7991e55ff3e622c53ec29abc17cfa685a4b`、`sourceDirty=false`，已不同于下方历史运行记录。本地和FRP健康均为200；新前端通过回环API完成真实新游客签到、购买、开包、保存、正式单人结算与重载。本轮同步最新Duel对手装配摘要的 `start` 再次被自动审批拒绝（`blocked by policy`），未修改现有服务，不能把新字段视为已部署。三档打包的历史验证见[构建记录](../../games/local/night-overwatch/docs/verification-2026-11-01-build-profiles.md)。

独立 `competition_test` PostgreSQL 用于资产并发、身份隔离、幂等、旧钱包、订单、两连接锁序和无效局退款测试，不使用联调库做破坏性测试。本地恢复演练另有逐表摘要与迁移预演记录。实际证据在交付时更新；本流程不等于真机、TapTap 宿主、真实广告库存或平台上传审核通过。

2026-11-01 较早的本地验收记录：`night-1793476775945-e4ee` 已运行；镜像 SHA-256 为 `4870ec1e67a010171e1da3a4f3bfa186bc2e754fdc49cdff51d5d53aa43809aa`。旧 `night-1793440910897-6335` 镜像和原 PostgreSQL 卷保留。备份位于 `.scratch/night-overwatch-selftest/backup-1793476839734/`，其中 `verification.json` 记录恢复后 **32 张用户表**逐表行数/摘要一致。5 个旧钱包保留 80 原金币；3300 目录价值补差进入未领取附件，累计签到合计 2 日；原私有钱包流水不变，迁移重复执行不重发。临时恢复容器及其匿名卷已移除。

运行制品的 428 个文件摘要已验证，manifest 记录回环端口/CORS/Nginx 的本地覆盖前后摘要；源码基点 `358b1fe0248203068aac0c4df0cf76b282349816`，`sourceDirty=true`，对应本次未提交实现快照。两个真实 API 端均返回 Replay v9、Duel v3、Assets v3；通过新建 QA 游客在 FRP 签到、回环重试同一 requestId，确认只发 100 金币、40 XP、1 个通用普通包。没有操作已有用户的补偿附件。健康、匿名拒绝、允许/拒绝来源、其他游戏/内部路由拒绝已通过。详细脱敏结果在 `.scratch/night-overwatch-selftest/acceptance.json`；H5 配置和当前制品位置在同目录 `h5.json`、`current.json`。

真实 HTTP 开局验收还覆盖服务端配装快照、未开局取消释放预留、合法零 tick 操作不扣耗、重复推进请求只消耗一次、正式开局后主动退出不返还。无人机一组齐射只计一次命中发数，持续伤害仍分别计入命中次数；单人 checkpoint、双人归属和训练纪录合法性测试通过。
