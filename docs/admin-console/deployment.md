# 管理配置中心发布与恢复

当前入口为 `pnpm deploy:admin`，只接受下列显式模式。所有模式均不读取本地 `.env.admin.local`，不传输 OAuth 字段，不生成或轮换数据库密码。已有私有配置通过 Compose `env_file` 的 `format: raw` 原样复用；程序只核对规范路径、属主、0700 目录、0600 普通文件、单硬链接和 stat 身份，不读取其内容。

SSH、coordinator 和 database helper 必须使用同一固定部署账号及其既有 Docker 权限；私有目录和文件属于该账号的有效 UID。数据库内仍通过 `platform_owner` 执行已批准迁移，应用角色权限保持原约束。不要为 helper 单独加 sudo、切换属主或放宽权限。UID 1000 的部署账号不再被 helper 的 root 断言拒绝。

| 模式                         | 用途                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--prepare-control`          | 纯本地构建 Runtime、Kart、Management 统一候选镜像的源码包及 admin-web；不加载 SSH 配置、不查询远端、不读取 OAuth。 |
| `--adopt-control=<bundle>`   | 首次维护采用；参数为 `outputs/admin-deploy/` 下准备好的目录名。                                                    |
| `--recover-control=<bundle>` | 用当前审阅 runner 恢复该历史候选的未完成 journal；历史 release 只作为数据，不执行其中的 Python。                   |
| `--reuse-remote-config`      | schema2 已采用后的普通 Management 更新，显式保留 `ADMIN_CONTROL_ENABLED=true`。                                    |
| `--rollback`                 | 由当前审阅 runner 回退到已证明兼容 schema2 的上一 Management 镜像；不恢复数据库。                                  |

无参数、`--execute` 和 `--provision-only` 在读取配置前返回 `CONTROL_MODE_REQUIRED`。旧 `deploy.py`、001 迁移及历史 v1 manifest 保留用于审计和读取历史状态，不能从新入口触发旧安装、权限回退或重发 001。

## 准确候选与公共制品

执行端必须使用正常 hooks 推送并经过相应 CI 的准确候选；执行前后要求本地 HEAD、干净工作树及实时 origin/dev 一致。prepare 仅核对本地候选，清单如实记录 `qualityChecks: not-run`，不能冒充 push/CI 验证。恢复和回滚校验的是当前 runner 候选 SHA；receipt 分别记录 `runnerSourceSHA` 与实际应用目标 `sourceSHA`。

v2 包精确绑定 002、014 玩家会话迁移、`control-database.py`、三段 `control-fingerprint.sql`、当前 coordinator、共享 image-authority、原 Compose 上下文工具及 nonce-v1 CSP 合同。缺少任何真实数据库 helper 必须在构建或维护前失败，不能使用可执行占位。公开目录的实际文件必须恰好等于 manifest 列表及 manifest 本身，拒绝链接、未知文件和秘密扩展；tar 使用固定文件清单，上传前逐条比对归档实际文件与哈希。receipt、归档及文件清单保存在包目录之外。

Runtime/Kart/Management 统一 image 使用三个固定启动命令，不创建 PG、Studio、新服务、端口或网络。所有能力探针均复用 `infra/deployment/image-authority.py`，实际导入运行时模块验证协议；Management 的 `rbac-protocol` 同时被配置解析与每请求 DB 成员重查使用。manifest 中自报数字不能替代实际镜像能力。

## 首次采用的维护屏障

首次采用允许现役旧镜像没有控制协议，但兼容三服务候选必须先构建并通过真实模块能力探针，然后才能停精确现役 Nginx ID。Nginx 必须采用 `unless-stopped`，无自动开门或超时放行。停止 Nginx 会关闭现存 WebSocket，并使受控 API、管理 API 和 Nginx 承载的旧游戏静态路由暂时不可用；Caddy 直接挂载的 admin HTML/assets 与官网仍可能打开。未知旁路必须在执行前核实并阻断，不能把入口关闭等同于全部页面下线。

镜像检查后、创建维护 journal 和停服务前，coordinator 调用真实 helper 的完整无写入预检：同属主 0700/0600 合同、候选及 SQL 哈希、Docker/Compose 与 raw env 配置能力、精确容器身份、PG 17.6 及 dump/restore 工具、数据库 owner/应用角色/旧 schema 前提、受支持的元数据结构和备份目录剩余空间。SQL 均在 `BEGIN READ ONLY` 中执行，不创建临时对象、不做备份或迁移；预检允许原 writers 运行。空间要求为数据库当前大小三倍且至少 64 MiB，是估算而非空间预留。停机后 helper 重跑同一检查，恢复禁止其他客户端连接的要求，再进行原备份/隔离恢复/事务证明。

屏障后再次核对公共房间、ranked-run、三选二及 Kart 无活动游戏，再按 Management→Kart→Runtime 停止同一批 writer；只读确认未知 DB 客户端为 0。Street admission-v1 的持久票据不按活动对局阻塞，仍受完整数据保护。迁移调用前的活动变化、停止失败或可恢复中断，只能在 DB 仍无 schema2、原精确 ID/边界/上下文未变且新服务未激活时恢复实际记录停止的旧容器及同一 Nginx。

domain helper 负责私有备份、完整隔离恢复及旧行/schema/owner/成员/ACL 对比；只有它的已证明 `not_committed` 才允许迁移调用后的旧态恢复。尚未发送数据库命令（或仅执行上述只读预检）的失败，明确返回 `oldDataUnchanged=true`、`mutationReached=false`；已采集旧状态的后续失败仍须比对旧状态。生产事务一经发送，超时/断连仍为 `unknown`，不能因 schema 缺失或没有响应而恢复。COMMIT、unknown 或无法读 DB 时保持 Nginx 关闭，禁止启动旧 guardless 镜像。对外错误仅保留有限的 `DATABASE_PREFLIGHT_FAILED` / `DATABASE_NOT_COMMITTED` / `DATABASE_OUTCOME_UNKNOWN` 与 `CONTROL_*` 原因枚举，不透传异常正文、SQL、stderr 或秘密。

COMMIT 后按 Runtime→Kart→Management 启动，Kart 绑定新 Runtime namespace；三个服务内部健康、完整只读 DB 合同、网络/挂载/端口边界及受保护容器/指针均通过后，才开启同一 Nginx。最终 HTTPS 探针失败立即重闭入口并保留私有 journal/备份，首次采用可能延长维护。

## 崩溃恢复与普通回退

coordinator 在迁移调用前持久化固定 precommit 路径。domain 在 COMMIT 前以 O_EXCL 写入部署账号所有、0600 的 `control-precommit.json` 与 SHA256 文件，目录 0700、单链接并 fsync。该证明绑定 release、source、002 artifact、旧态/备份哈希和预期 DB 合同；coordinator 返回前崩溃仍可由当前 runner 读取固定 pair，并先把可信哈希持久化 journal 再行动。

recover 重查精确 Nginx stopped、PG 身份、未变的不透明 env、原 Compose 上下文、候选镜像能力及预期合同，不从 live 重建 baseline，不重跑迁移。缺失/不匹配的 pair、未知 DB 结果或不兼容镜像保持闭锁并需人工审阅。恢复目标是原已审候选；替换故障候选镜像的 fix-forward 需独立审阅，不能暗换目标。未实测 Docker daemon 重启后的屏障持久性；恢复前始终再次确认精确 Nginx 已停止。

2026-10-17 的首守卫事故另有一个受限、显式恢复入口：

```sh
pnpm deploy:admin --recover-control=0d7bfdfe4087-1792248271760-eb122d --root-precondition
```

此选项仅适用于[已核实事故](../operations/backend-recovery-2026-10-17.md)：固定 source `0d7bfdfe4087b85139dc525e9a75f3ab792e17f6`、旧 helper SHA256 `55168636acfa30e302489acd96eb99335cf513550e9c62fb64d13f7f7773c536`、执行/私有目录属主 UID 1000、`database-unknown` journal 已停全部旧 writers、没有 activation/Kart 移除/新 Runtime ID、precommit hash 为空且候选私有目录只有 journal。还须核对旧管理指针、同一 PG/官网/旧容器身份、env 元数据、Compose 上下文和 Nginx stopped，并只读确认 schema 不存在。这里的历史 UID 归因来自已审事故证据；不能把任意同属主目录或 schema 缺失当成 root 首守卫失败的证明。历史 Python 只校验哈希，不执行。

核验后，原 journal 内容及摘要作为 `rootPreconditionEvidence` 保留在 journal 中，先 fsync 已证明未提交状态，再恢复精确旧容器；中途启动/健康检查失败可重复 recover。成功以 `PREMIGRATION_RESTORED` 停止并记录 `phase=restored`，不伪造控制中心上线成功 receipt，不删除事故 journal，不迁移数据库。下一次采用须准备新的候选目录。缺少显式选项、任何绑定不符、出现备份/precommit 或已尝试新激活均拒绝此例外，COMMIT unknown 路径继续闭锁。

本次有限回归使用 WSL Python `-B`、实际非 root UID 1000 调用真实 helper/coordinator，Docker/数据库传输与服务生命周期为测试替身；覆盖停机前预检、停机后无数据库命令失败的旧容器恢复、COMMIT 超时闭锁、历史证据拒绝/成功和部分恢复重试。此证据不替代真实 PostgreSQL 事务演练、生产维护或公网回归。

普通更新及回滚在停服务前要求 schema2、可信 control proof、现役三服务实际能力和显式控制 flag；回退目标必须同样兼容。历史 release 只提供 image/env/site 数据，执行逻辑始终来自当前 reviewed runner。失败恢复两个原管理指针，保留控制 flag，不回滚 Runtime、Caddy 或 DB。

## HTTPS、nonce 与 GitHub 边界

首次采用的 Runtime 公开 Compose override 明确配置三个游戏来源：`http://localhost:8080`、`https://ma-h5-al.tapimg.com`、`https://coffeeeeffoc.github.io`，覆盖本地验收、TapTap H5 与独立 Pages 入口，不读取或改写既有私有 env。只允许既有 `GET,POST,OPTIONS`、`authorization,content-type`，不携带 Cookie，管理 API 策略保持不变。控制中心版本 0 使用此 fallback；发布过的控制配置继续优先。该 Tap 来源由多个游戏共享，不能按 `/h/...` 区分，也不能以 CORS 或匿名身份断言第三方客户端属于某款游戏；仍须验证服务端身份范围、对局归属、提交权限与跨游戏越权。手机实际 Origin 尚未观测，若不同需另核实。上线后单独记录精确来源的预检、真实 API 调用及未知来源拒绝结果。

唯一管理站点为 `https://admin.nenggongzhiren.cn`，唯一 callback 为 `https://admin.nenggongzhiren.cn/api/auth/github/callback`。nonce-v1 逐页核对受信模板、Caddy 的 `<!---->\n` 前缀、canonical 32-byte Base64 nonce、精确 CSP 和 no-store；缺 CSP 不得降级静态验证。历史 v1 仅接受明确无模板的静态 HTML 合同。

公共探针仅验证页面、匿名 `/api/session` 401 和 GitHub 起始 302 的公共结构，不跟随授权、不输出 client ID/state/challenge/cookie/完整 Location，不读取旧 OAuth 值。receipt 固定 `realGithubLoginVerified=false`。真实 GitHub 登录仍由用户亲自执行。

用户创建 OAuth App 可参考 [GitHub 官方创建说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)，只需 [user:email](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)；平台支持多个 callback，本项目只用上述唯一入口且 callback 不使用通配符。无需 repo 权限或 GitHub 密码。真实秘密不应进入聊天、Issue、Git、日志、前端或公开制品。

## 代理单独交付

`pnpm deploy:caddy --proxy-only`（也可与 `--prepare` 合用）要求已有 managed ingress，继续保留 source guard、归档哈希、真实配置语法/健康/受保护状态及回滚检查，只跳过最后的 `backupInstall`，不重装既有 systemd 备份服务。远端 `backup.py --preflight` 仍强制执行，会创建/处理私有备份并沿用现有 30 天轮换策略。执行前维护者须核实现有备份目录 0700、timer 健康；不符时停止，不能自动修权限、端口、网络或 CORS。

独立 `control-database.py` 已实现并完成本地缓存 PostgreSQL 17.6 的完整备份/隔离恢复、002 两次执行、实际正负权限和受保护事务验收，见 [数据库验收记录](qa/control-deployment-current.md) 与 [机器记录](qa/control-deployment-current.json)。测试注入服务生命周期清单；真实 Nginx、三应用停启、统一镜像激活、代理切换、首次生产维护、daemon 重启和 GitHub 登录不属于该数据库验收。

helper 只复核既有资源身份与停止状态，不启动或停止服务，不读取私有 env 值，不重放 001。完整备份与隔离克隆预期、10 字段 precommit pair 均在生产事务 COMMIT 前写入受保护目录并 fsync；旧数据/结构/owner/角色/ACL 等投影与克隆预期不一致就回滚。后续 `verify_control_database` 只在实际 `BEGIN READ ONLY` 内比较受信 metadata contract，允许成员、发布和观察业务行正常变化，不从 live 重建基线。002 保持原始字节 SHA256，精确 `.gitattributes` 固定其 LF。

本地通过不代表准确发布候选、CI 或公网验收通过。本次服务器恢复和重新部署已由维护者明确授权，按既定入口屏障及兼容镜像规则执行；后续超出授权范围的维护另行确认。

## 玩家会话迁移与日常命令

首次采用先核对 014 文件及清单摘要，再停止服务。002 完成后，014 单独备份完整数据库、隔离恢复并验证迁移幂等性；实际迁移在同一事务内检查前后状态、禁止额外写入者并锁定表。提交结果未知时保留屏障，重试根据受保护证明与实际数据库状态继续。完成标记必须核对 runtime 结构和权限指纹，不能替代数据库验证；正常业务数据变化允许继续。

014 为匿名身份增加绑定游戏的短期访问凭证、可轮换刷新凭证、会话族和玩家游戏授权。清除旧无范围会话，保留玩家资料与成绩。无密码、注册或额外账号表。详见 [恢复与更新命令](../operations/backend-recovery-2026-10-17.md)。
